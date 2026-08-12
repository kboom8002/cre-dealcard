/**
 * POST /api/broker/deal-card/from-memo
 *
 * Create Building Mini Truth, Building Signal Card, and Blind Teaser from broker memo.
 * Auth: Required (broker or admin).
 *
 * Source: docs/08-api-contracts.md section 7
 */
import { z } from "zod/v4";
import { brokerDealCardFromMemo } from "@/domain/building/broker-deal-card";
import { toApiError } from "@/lib/api-error";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, after } from "next/server";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";
import { sanitizeComplianceText, validateColdModePitchGuard } from '@/domain/building/guardrails';
import { classifyDealArchetype } from '@/domain/deal/archetype-classifier';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { createServiceClient } from '@/lib/supabase/service';
import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';

export const maxDuration = 120;

/** 한국어 가격 텍스트를 원화 숫자로 변환 (예: '120억' → 12_000_000_000) */
function parsePriceKrw(priceText: string | null | undefined): number | null {
  if (!priceText) return null;
  const cleaned = priceText.replace(/[^0-9.억만원\s]/g, '');
  let total = 0;
  const eokMatch = cleaned.match(/([\d.]+)\s*억/);
  const manMatch = cleaned.match(/([\d.]+)\s*만/);
  if (eokMatch) total += parseFloat(eokMatch[1]) * 100_000_000;
  if (manMatch) total += parseFloat(manMatch[1]) * 10_000;
  return total > 0 ? total : null;
}

const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().min(5),
  visibilityPreference: z.enum(["blind", "internal"]).default("blind"),
  photoUrls: z.array(z.string().url()).optional(),
});

export async function POST(req: NextRequest) {
  // Require broker or admin role
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = BrokerDealCardFromMemoRequest.parse(json);

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
    console.info(`[memo-mapper] Extracted ${memoSlots.slots.length} slots (${memoSlots.extractionRate}% coverage)`);

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

    const result = await brokerDealCardFromMemo(
      {
        memo: sanitizedMemo,
        visibilityPreference: input.visibilityPreference,
        photoUrls: input.photoUrls,
      },
      user!.id,
    );

    // ─── v3 Post-processing: Archetype Classification & Constraint Validation ───
    const res = await readWithMigration(result.buildingId);
    const createdBuilding = res.data as any;

    let archetypes: string[] = [];
    let constraintWarnings: any[] = [];
    if (createdBuilding && Object.keys(createdBuilding).length > 0) {
      const attrs = buildAttrsFromSsotLite(createdBuilding);

      // Archetype classification
      const archetypeResult = classifyDealArchetype(attrs);
      archetypes = [archetypeResult.primaryArchetype, ...archetypeResult.secondaryArchetypes];

      // Constraint validation
      const constraintResult = validateAssetConstraints(attrs);
      constraintWarnings = constraintResult.violations || [];
    }

    // 이벤트 트리거 매칭: 백그라운드에서 매칭 엔진 실행 (응답 차단 안함)
    after(async () => {
      try {
        const { runAutoMatch } = await import("@/domain/matching/auto-matcher");
        await runAutoMatch(result.buildingId, user!.id);
      } catch (err) {
        console.error("Background auto-match failed:", err);
      }
    });

    // ─── v4 Price extraction from SSoT ───
    const priceBand = createdBuilding?.price_band || createdBuilding?.layers?.price_band || null;
    const askingPriceKrw = parsePriceKrw(priceBand);

    return Response.json({
      ok: true,
      data: { ...result, askingPriceKrw },
      archetypes,
      constraintWarnings,
    });
  } catch (error) {
    console.error("Deal Card Route Error:", error);
    return toApiError(error);
  }
}
