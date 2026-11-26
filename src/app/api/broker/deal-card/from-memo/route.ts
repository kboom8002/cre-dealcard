/**
 * POST /api/broker/deal-card/from-memo
 *
 * Create Building Mini Truth, Building Signal Card, and Blind Teaser from broker memo.
 * Auth: Required (broker or admin).
 *
 * Source: docs/08-api-contracts.md section 7
 */
import { z } from "zod/v4";
import { brokerDealCardFromMemo, checkDuplicateBeforeCreation } from "@/domain/building/broker-deal-card";
import { toApiError } from "@/lib/api-error";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, after } from "next/server";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";
import { sanitizeComplianceText, validateColdModePitchGuard } from '@/domain/building/guardrails';
import { classifyDealArchetype } from '@/domain/deal/archetype-classifier';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { parseKoreanPriceKrw } from '@/lib/deal-card/price-band';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
import {
  isMissingRelationOrColumnError,
  upsertWorkspaceItem,
} from '@/lib/workspace/workspace-repository';
import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import {
  buildAiUnavailable503Response,
  enforceBrokerAiQuota,
  enforceFeatureQuota,
  isLLMMockNotAllowedError,
} from '@/lib/ai-quota-guard';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const maxDuration = 120;

async function persistFromMemoDraftWorkspace(params: {
  supabase: ReturnType<typeof createServiceClient>;
  buildingId: string;
  userId: string;
  isAdmin: boolean;
  card4?: Card4Data;
  fallbackBuilding?: Record<string, unknown> | null;
}): Promise<void> {
  const { supabase, buildingId, userId, isAdmin, card4, fallbackBuilding } = params;
  const fallbackRegion =
    cleanBlindPoints([String(fallbackBuilding?.area_signal || '서울 주요권역')])[0] || '서울 주요권역';
  const fallbackUse =
    cleanBlindPoints([String(fallbackBuilding?.asset_type || '근린생활시설')])[0] || '근린생활시설';
  const fallbackPriceBand = String(fallbackBuilding?.price_band || '가격 협의');
  const fallbackPoints = cleanBlindPoints([
    `${fallbackRegion} 입지 검토`,
    `${fallbackUse} 매물 검토`,
    '상세 조건 협의 가능',
  ]) as [string, string, string];
  const draftCard4: Card4Data = card4 ?? {
    headline: `${fallbackRegion} ${fallbackUse}`.trim(),
    posture: 'income',
    region: fallbackRegion,
    use: fallbackUse,
    priceBand: fallbackPriceBand,
    points: fallbackPoints,
    provenance: { points: ['ai', 'ai', 'ai'] },
    generationSource: 'ai_memo',
    card4_version: 1,
    card4_hash: computeCard4Hash({
      region: fallbackRegion,
      use: fallbackUse,
      priceBand: fallbackPriceBand,
      points: fallbackPoints,
      headline: `${fallbackRegion} ${fallbackUse}`.trim(),
    }),
  };

  try {
    await upsertWorkspaceItem(supabase, {
      buildingId,
      ownerId: userId,
      isAdmin,
      kind: 'dealcard',
      status: 'draft',
      title: draftCard4.headline || `${draftCard4.region} ${draftCard4.use}`.trim(),
      address: draftCard4.region,
      priceBand: draftCard4.priceBand,
      draftPayload: {
        card4: draftCard4,
        generationSource: 'ai_memo',
      },
      publishedSnapshot: null,
      docHash: draftCard4.card4_hash ?? null,
      version: draftCard4.card4_version ?? 1,
    });
  } catch (wsErr) {
    if (!isMissingRelationOrColumnError(wsErr)) {
      throw wsErr;
    }
  }

  try {
    await supabase.from('activity_events').insert({
      actor_id: userId,
      event_type: 'dealcard_upserted',
      entity_type: 'building',
      entity_id: buildingId,
      metadata: {
        building_id: buildingId,
        status: 'draft',
        card4: draftCard4,
        generation_source: 'ai_memo',
      },
    });
  } catch (evErr) {
    log.warn('[deal-card/from-memo] Non-blocking dealcard_upserted log failed:', evErr);
  }
}

/** 한국어 가격 텍스트를 원화 숫자로 변환 (price-band SSOT 위임, 조·억·만 지원) */
function parsePriceKrw(priceText: string | null | undefined): number | null {
  return parseKoreanPriceKrw(priceText);
}

function sanitizePhotoUrls(urls?: string[]): string[] | undefined {
  if (!Array.isArray(urls)) return undefined;
  const filtered = urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(
      (u) =>
        u.length > 0 &&
        !u.startsWith("blob:") &&
        !u.startsWith("/test-images/") &&
        (u.startsWith("http://") ||
          u.startsWith("https://") ||
          u.startsWith("/") ||
          u.startsWith("data:"))
    );
  return filtered.length > 0 ? filtered : undefined;
}

const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().trim().min(5).max(6000),
  visibilityPreference: z.enum(["blind", "internal"]).default("blind"),
  photoUrls: z.array(z.string().max(2000)).max(20).optional(),
  /** 중복 감지 무시하고 새 물건으로 강제 생성 */
  forceNew: z.boolean().optional(),
  /** 기존 물건 업데이트 시 해당 building ID */
  existingBuildingId: z.string().uuid().optional(),
  /** 비동기 큐 패턴으로 실행할지 여부 */
  isAsync: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  // Require broker or admin role
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = BrokerDealCardFromMemoRequest.parse(json);

    // P0-SEC: 기존 물건 업데이트 모드는 해당 매물 소유자만 (brokerDealCardFromMemo 가 building_ssot_lite 를 덮어쓴다)
    if (input.existingBuildingId) {
      const ownership = await assertBuildingOwner(createServiceClient(), input.existingBuildingId, user!.id, {
        allowAdmin: true,
        role: guard.role,
      });
      if (!ownership.ok) return ownership.response;
    }

    // Memo Quality Gate validation
    const quality = validateMemoQuality(input.memo);
    if (!quality.pass) {
      return Response.json(
        {
          ok: false,
          code: "MEMO_QUALITY_INSUFFICIENT",
          message: quality.suggestion,
          details: quality,
        },
        { status: 422 }
      );
    }

    // ─── v3 Guardrails: Sanitize compliance text ───
    const sanitizedMemo = sanitizeComplianceText(input.memo);

    // S2-T3: Extract structured slots from broker memo
    const memoSlots = extractSlotsFromMemo(sanitizedMemo || '');
    log.info(`[memo-mapper] Extracted ${memoSlots.slots.length} slots (${memoSlots.extractionRate}% coverage)`);

    // Cold Mode pitch guard (blind visibility = no mandate)
    if (input.visibilityPreference === 'blind') {
      const pitchGuard = validateColdModePitchGuard({
        mode: 'cold',
        hasOwnerMandate: false,
        promptOrText: sanitizedMemo,
      });
      if (!pitchGuard.passed) {
        return Response.json(
          { ok: false, code: 'GUARDRAIL_VIOLATION', message: pitchGuard.violations.join('; '), violations: pitchGuard.violations },
          { status: 422 }
        );
      }
    }

    // ─── P0: 동일 물건 중복 감지 (AI 파이프라인 전) ───
    if (!input.forceNew && !input.existingBuildingId) {
      const dedupResult = await checkDuplicateBeforeCreation(sanitizedMemo, user!.id);
      if (dedupResult.hasDuplicate) {
        return Response.json(
          {
            ok: false,
            code: "DUPLICATE_BUILDING_DETECTED",
            message: "동일한 물건이 이미 등록되어 있습니다.",
            duplicates: dedupResult.candidates,
          },
          { status: 409 }
        );
      }
    }

    const cleanPhotoUrls = sanitizePhotoUrls(input.photoUrls);

    if (!input.existingBuildingId) {
      const featureQuotaErr = await enforceFeatureQuota(user!.id, "deal_card_creation");
      if (featureQuotaErr) return featureQuotaErr;
    }

    const aiQuotaErr = await enforceBrokerAiQuota(req, user!.id, "deal_card_from_memo");
    if (aiQuotaErr) return aiQuotaErr;

    if (input.isAsync) {
      const jobId = crypto.randomUUID();
      const supabase = createServiceClient();
      
      // Create job record
      await supabase.from("ai_runs").insert({
        id: jobId,
        user_id: user!.id,
        run_type: "deal_card_async_job",
        input_ref: { 
          memo: sanitizedMemo, 
          visibilityPreference: input.visibilityPreference,
          photoUrls: cleanPhotoUrls,
          existingBuildingId: input.existingBuildingId,
          forceNew: input.forceNew
        },
        status: "started"
      });

      after(async () => {
        try {
          const result = await brokerDealCardFromMemo(
            {
              memo: sanitizedMemo,
              visibilityPreference: input.visibilityPreference,
              photoUrls: cleanPhotoUrls,
              existingBuildingId: input.existingBuildingId,
            },
            user!.id,
          );

          await persistFromMemoDraftWorkspace({
            supabase,
            buildingId: result.buildingId,
            userId: user!.id,
            isAdmin: guard.role === 'admin',
            card4: result.card4,
          });

          // Update job as completed
          await supabase.from("ai_runs").update({
            status: "completed",
            output_ref: { buildingId: result.buildingId }
          }).eq("id", jobId);

          // Background auto-match
          const { runAutoMatch } = await import("@/domain/matching/auto-matcher");
          await runAutoMatch(result.buildingId, user!.id);
        } catch (err: unknown) {
          log.error("Async deal card creation failed:", err);
          await supabase.from("ai_runs").update({
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error"
          }).eq("id", jobId);
        }
      });

      return Response.json({ ok: true, jobId, isAsync: true });
    }

    const result = await brokerDealCardFromMemo(
      {
        memo: sanitizedMemo,
        visibilityPreference: input.visibilityPreference,
        photoUrls: cleanPhotoUrls,
        existingBuildingId: input.existingBuildingId,
      },
      user!.id,
    );

    // 🚨 v3 Post-processing: Archetype Classification & Constraint Validation 🚨
    const res = await readWithMigration(result.buildingId);
    const createdBuilding = (res.data && typeof res.data === 'object'
      ? (res.data as Record<string, unknown>)
      : null);

    await persistFromMemoDraftWorkspace({
      supabase: createServiceClient(),
      buildingId: result.buildingId,
      userId: user!.id,
      isAdmin: guard.role === 'admin',
      card4: result.card4,
      fallbackBuilding: createdBuilding,
    });

    let archetypes: string[] = [];
    let constraintWarnings: unknown[] = [];
    if (createdBuilding && Object.keys(createdBuilding).length > 0) {
      const attrs = buildAttrsFromSsotLite(createdBuilding);

      // Archetype classification
      const archetypeResult = classifyDealArchetype(attrs);
      archetypes = [archetypeResult.primaryArchetype, ...archetypeResult.secondaryArchetypes];

      // Constraint validation
      const constraintResult = validateAssetConstraints(attrs);
      constraintWarnings = constraintResult.violations || [];
    }

    // 이벤트 드리븐 매칭: 백그라운드에서 매칭 엔진 실행 (응답 차단 안함)
    after(async () => {
      try {
        const { runAutoMatch } = await import("@/domain/matching/auto-matcher");
        await runAutoMatch(result.buildingId, user!.id);
      } catch (err) {
        log.error("Background auto-match failed:", err);
      }
    });

    // 🚨 v4 Price extraction from SSoT 🚨
    const createdLayers =
      createdBuilding?.layers && typeof createdBuilding.layers === 'object'
        ? (createdBuilding.layers as Record<string, unknown>)
        : null;
    const rawPriceBand = createdBuilding?.price_band ?? createdLayers?.price_band;
    const priceBand = typeof rawPriceBand === 'string' ? rawPriceBand : null;
    const askingPriceKrw = parsePriceKrw(priceBand);

    return Response.json({
      ok: true,
      ...result,
      askingPriceKrw,
      data: { ...result, askingPriceKrw },
      archetypes,
      constraintWarnings,
    });
  } catch (error) {
    if (isLLMMockNotAllowedError(error)) {
      log.warn("[deal-card/from-memo] Mock 응답 거부 (Zero-Mock Production):", error);
      return buildAiUnavailable503Response();
    }
    log.error("Deal Card Route Error:", error);
    return toApiError(error);
  }
}
