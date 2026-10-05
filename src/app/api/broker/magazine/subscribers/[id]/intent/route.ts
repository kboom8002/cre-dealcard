import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateAutoIntents, type InterestProfile } from "@/domain/magazine/subscriber-profile";
import { requireBrokerContext, assertOwnsRow, notFoundResponse } from "@/lib/magazine/authz";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { sanitizeTagStrings } from "@/lib/magazine/tags";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

/**
 * 이 라우트의 오류 응답은 `error`를 문자열로 준다 — 현재 클라이언트(EditorOutreachTab AutoIntent)가
 * `json.error`를 그대로 문자열 보간하기 때문(Wave 2 에디터 수정 후 jsonError 형식으로 통일 가능).
 */
function fail(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, success: false, code, error: message }, { status });
}

interface SubscriberRow {
  id: string;
  client_id: string | null;
  interest_profile: unknown;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 구독자가 직접 입력한 예산 범위(원 단위)만 근거로 인정. 없거나 비정상이면 null — 기본 예산을 지어내지 않는다(D2-13). */
function declaredBudget(profile: Record<string, unknown>): { min: number; max: number } | null {
  const b = asRecord(profile.budgetRange);
  const min = Number(b.min);
  const max = Number(b.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  return { min, max };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: subscriberId } = await params;

    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) return authError ?? fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    const serviceClient = createServiceClient();

    // 1. 소유 구독자 조회 — 타 브로커/없음 모두 404 (S2-04)
    const sub = await assertOwnsRow<SubscriberRow>(serviceClient, "magazine_subscribers", subscriberId, ctx, {
      select: "id, client_id, interest_profile",
    });
    if (!sub) return notFoundResponse();

    // 2. 근거 확인: 구독자가 직접 선택한 관심 태그(권역·자산) + 직접 입력한 예산 범위가 모두 있어야 한다.
    const rawProfile = asRecord(sub.interest_profile);
    const rawTags = asRecord(rawProfile.tags);
    const assetTypes = sanitizeTagStrings(rawTags.assetTypes ?? rawProfile.assetTypes);
    const regions = sanitizeTagStrings(rawTags.regions ?? rawProfile.regions);
    const budget = declaredBudget(rawProfile);

    if (assetTypes.length === 0 || regions.length === 0 || !budget) {
      return NextResponse.json({
        ok: true,
        success: true,
        count: 0,
        created: 0, // 임시 병기: 현 클라이언트가 json.created 를 읽음 (Wave 2 에디터 수정 후 제거)
        intents: [],
        reason: "NO_EVIDENCE",
        message: "관심 권역·자산·예산 근거가 없어 매수 의향서를 만들지 않았습니다.",
      });
    }

    const profile: Partial<InterestProfile> = {
      assetTypes,
      regions,
      budgetRange: budget,
      topics: sanitizeTagStrings(rawTags.topics),
      hobbies: sanitizeTagStrings(rawTags.hobbies),
    };

    // 3. AutoIntent 생성 (이미 만든 (자산,권역) 조합은 건너뜀 — 반복 클릭 중복 방지)
    const marker = `auto-generated from magazine subscription (${sub.id})`;
    const { data: existingRows, error: exErr } = await serviceClient
      .from("buyer_intent_lite")
      .select("preferred_regions, asset_types")
      .eq("owner_id", ctx.userId)
      .eq("raw_input", marker);
    if (exErr) {
      log.error("[Intent POST] existing intents lookup error:", exErr.message);
      return fail("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    const existingKeys = new Set(
      (existingRows ?? []).map((r: { preferred_regions?: string[] | null; asset_types?: string[] | null }) =>
        `${r.asset_types?.[0] ?? ""}|${r.preferred_regions?.[0] ?? ""}`,
      ),
    );

    const autoIntents = generateAutoIntents(profile);
    const insertedIntents: any[] = [];
    let failedCount = 0;
    let duplicateCount = 0;

    for (const intent of autoIntents) {
      if (existingKeys.has(`${intent.assetType}|${intent.region}`)) {
        duplicateCount += 1;
        continue;
      }
      const budgetMinManwon = Math.round((intent.budgetKrw * 0.8) / 10000);
      const budgetMaxManwon = Math.round((intent.budgetKrw * 1.2) / 10000);
      const budgetDisplay = `${Math.round(budgetMinManwon / 10000)}억 ~ ${Math.round(budgetMaxManwon / 10000)}억`;

      const { data: intentRow, error: insertError } = await serviceClient
        .from("buyer_intent_lite")
        .insert({
          owner_id: ctx.userId,
          buyer_type: "investor",
          preferred_regions: [intent.region],
          asset_types: [intent.assetType],
          budget_min: budgetMinManwon,
          budget_max: budgetMaxManwon,
          budget_display: budgetDisplay,
          purchase_purpose: "구독자 입력 관심사 기반 (매거진)",
          raw_input: marker,
        })
        .select()
        .single();

      if (insertError || !intentRow) {
        failedCount += 1;
        log.error("[Intent POST] insert error:", insertError?.message);
        continue;
      }
      insertedIntents.push(intentRow);
    }

    if (failedCount > 0 && insertedIntents.length === 0) {
      return fail("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    // 4. client_id가 있으면 본인 고객 레코드의 linked_buyer_intent_ids 갱신 (broker_id = 로그인 user.id 일치 시에만, S2-04)
    //    broker_clients.broker_id 는 uuid 컬럼이므로 slug 가 섞인 assertOwnsRow(brokerKeys) 대신 userId 로 직접 조회한다.
    let clientLinked = false;
    if (sub.client_id && insertedIntents.length > 0) {
      const { data: client, error: clientErr } = await serviceClient
        .from("broker_clients")
        .select("id, linked_buyer_intent_ids")
        .eq("id", sub.client_id)
        .eq("broker_id", ctx.userId)
        .maybeSingle<{ id: string; linked_buyer_intent_ids: string[] | null }>();
      if (clientErr) log.error("[Intent POST] client lookup error:", clientErr.message);
      if (client) {
        const newIntentIds = insertedIntents.map((i) => i.id);
        const mergedIds = [...new Set([...(client.linked_buyer_intent_ids || []), ...newIntentIds])];
        const { error: linkErr } = await serviceClient
          .from("broker_clients")
          .update({ linked_buyer_intent_ids: mergedIds })
          .eq("id", client.id)
          .eq("broker_id", ctx.userId);
        if (linkErr) log.error("[Intent POST] client link error:", linkErr.message);
        else clientLinked = true;
      } else {
        log.warn("[Intent POST] subscriber.client_id is not owned by caller — skipped linking");
      }
    }

    if (insertedIntents.length > 0) {
      after(async () => {
        try {
          const { runAutoMatchForBuyer } = await import("@/domain/matching/auto-matcher");
          for (const intent of insertedIntents) {
            await runAutoMatchForBuyer(intent.id, ctx.userId);
          }
        } catch (matchErr) {
          log.error("[AutoIntent POST] Background auto-match failed:", matchErr);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      count: insertedIntents.length,
      created: insertedIntents.length, // 임시 병기: 현 클라이언트가 json.created 를 읽음 (Wave 2 에디터 수정 후 제거)
      failed: failedCount,
      skippedDuplicates: duplicateCount,
      clientLinked,
      intents: insertedIntents,
    });
  } catch (err: any) {
    log.error("[AutoIntent POST] Unexpected error:", err?.message ?? String(err));
    return fail("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
