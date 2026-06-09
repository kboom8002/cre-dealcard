/**
 * POST /api/broker/im-lite/generate
 *
 * 딜카드 SSoT Lite 데이터를 기반으로 Mobile IM Lite (7섹션)를 자동 생성합니다.
 *
 * Flow:
 *   1. 브로커 인증 확인
 *   2. building_ssot_lite 데이터 로드
 *   3. Readiness 체크 (40점 이상)
 *   4. 주소 있으면 → 5개 공공API 병렬 호출 (fault-tolerant)
 *   5. 7섹션 AI 서사 생성 (GPT-4o + 프리미엄 템플릿 폴백)
 *   6. Risk Boundary + Disclosure Guard 적용
 *   7. document_objects 테이블에 저장
 *   8. 공개 URL 반환
 *
 * 에러 정책:
 *   - 공공데이터 API 실패 → 그대로 진행 (외부 데이터 없이 생성)
 *   - AI 생성 실패 → 프리미엄 템플릿 폴백
 *   - Readiness 40점 미달 → 400 반환 + missing 항목 안내
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { computeMobileIMReadiness, MOBILE_IM_READINESS_THRESHOLD } from "@/domain/building/mobile-im/readiness";
import { generateMobileIM } from "@/domain/building/mobile-im/writer";
import { enrichBuildingData } from "@/lib/external/external-data-orchestrator";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  // ─── 요청 파싱 ─────────────────────────────────────────────────────────────
  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;

  try {
    const body = await req.json();
    buildingId = body.building_id;
    skipApproval = body.skip_approval === true;
    supplemental = {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      photo_urls: body.photo_urls,
      broker_highlight: body.broker_highlight,
      estimated_yield_pct: body.estimated_yield_pct,
    };

    if (!buildingId) {
      return NextResponse.json({ error: "building_id is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ─── SSoT Lite 로드 ─────────────────────────────────────────────────────────
  const { data: ssotRow, error: ssotError } = await supabase
    .from("building_ssot_lite")
    .select("id, building_id, ssot_data, raw_address")
    .eq("building_id", buildingId)
    .maybeSingle();

  if (ssotError || !ssotRow) {
    return NextResponse.json(
      { error: "SSoT 데이터를 찾을 수 없습니다. 딜카드를 먼저 생성해 주세요." },
      { status: 404 }
    );
  }

  const bssotLite = (ssotRow.ssot_data ?? {}) as Record<string, unknown>;

  // ─── Readiness 체크 ─────────────────────────────────────────────────────────
  const readiness = computeMobileIMReadiness(bssotLite, supplemental);
  if (!readiness.can_generate) {
    return NextResponse.json(
      {
        error: "Readiness 점수가 부족합니다.",
        score: readiness.score,
        threshold: MOBILE_IM_READINESS_THRESHOLD,
        missing: readiness.missing,
        hint: "부족한 항목을 추가 입력하거나, 딜카드를 먼저 완성해 주세요.",
      },
      { status: 400 }
    );
  }

  // ─── 공공데이터 수집 (fault-tolerant) ──────────────────────────────────────
  let externalData = null;
  const rawAddress = ssotRow.raw_address as string | undefined;
  if (rawAddress && rawAddress.length > 4) {
    try {
      externalData = await enrichBuildingData(rawAddress, ssotRow.id);
    } catch (err) {
      // 공공데이터 실패는 치명적 에러가 아님 — 로그만 남기고 계속
      console.error("[im-lite/generate] External data enrichment failed:", err);
    }
  }

  // ─── 7섹션 AI 생성 ──────────────────────────────────────────────────────────
  const writerResult = await generateMobileIM({
    building_ssot_lite: bssotLite,
    supplemental,
    readiness,
    external_data: externalData,
  });

  // ─── document_objects 저장 ──────────────────────────────────────────────────
  const slug = `im-lite-${buildingId}-${Date.now()}`;
  const assetIdentity = (bssotLite.asset_identity ?? {}) as Record<string, any>;
  const title = `${assetIdentity.area_signal || "핵심 입지"} ${assetIdentity.asset_type || "상업용 자산"} — Mobile IM`;

  const imDocPayload = {
    building_id: buildingId,
    broker_id: user!.id,
    type: "mobile_im",
    slug,
    title,
    content: {
      sections: writerResult.sections,
      boundary_note: writerResult.boundary_note,
      generated_at: writerResult.generated_at,
      ai_used: writerResult.ai_used,
      readiness_score: readiness.score,
      external_data: externalData
        ? {
            enrichedAt: externalData.enrichedAt,
            hasPublicData: !!(externalData.buildingRegister || externalData.landUsePlan),
            errors: externalData.errors,
          }
        : null,
    },
    status: skipApproval ? "published" : "pending_approval",
    visibility: "public_blind",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: savedDoc, error: saveError } = await supabase
    .from("document_objects")
    .insert([imDocPayload])
    .select("id, slug")
    .single();

  if (saveError || !savedDoc) {
    console.error("[im-lite/generate] Failed to save document:", saveError);
    return NextResponse.json(
      { error: "IM 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  // ─── 응답 반환 ───────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    im_lite_id: savedDoc.id,
    slug: savedDoc.slug,
    url: `/im-lite/${buildingId}?doc=${savedDoc.id}`,
    readiness_score: readiness.score,
    ai_used: writerResult.ai_used,
    sections_count: writerResult.sections.length,
    external_data_loaded: !!externalData,
    message: `Mobile IM 생성 완료 (${writerResult.sections.length}섹션${writerResult.ai_used ? ", AI 서사" : ", 템플릿"})`,
  });
}
