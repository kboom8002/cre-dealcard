/**
 * POST /api/broker/im-lite/generate
 *
 * 딜카드 SSoT Lite 데이터를 기반으로 Mobile IM Lite (7섹션)를 자동 생성합니다.
 *
 * v2 — 딜카드에서 직접 데이터를 전달받아 무마찰 생성
 *
 * Flow:
 *   1. 브로커 인증 확인
 *   2. building_ssot_lite에서 데이터 로드 (PK = id)
 *   3. Readiness 체크 (40점 이상)
 *   4. 주소 있으면 → 공공API 호출 (fault-tolerant)
 *   5. 7섹션 AI 서사 생성 (GPT-4o + 프리미엄 템플릿 폴백)
 *   6. Risk Boundary + Disclosure Guard 적용
 *   7. document_objects 테이블에 저장
 *   8. 공개 URL 반환
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { computeMobileIMReadiness, MOBILE_IM_READINESS_THRESHOLD } from "@/domain/building/mobile-im/readiness";
import { generateMobileIM } from "@/domain/building/mobile-im/writer";
import { enrichBuildingData } from "@/lib/external/external-data-orchestrator";
import { enrichBuildingDataByPNU } from "@/lib/external/enrich-by-pnu";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  // ─── 요청 파싱 ─────────────────────────────────────────────────────────────
  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;
  let directData: Record<string, unknown> | null = null;

  try {
    const body = await req.json();
    buildingId = body.building_id;
    skipApproval = body.skip_approval === true;
    directData = body.direct_data ?? null;
    supplemental = {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      vacancy_pct: body.vacancy_pct,
      resolved_address: body.resolved_address,
      resolved_pnu: body.resolved_pnu,
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

  // ─── SSoT Lite 로드 (PK = id) ──────────────────────────────────────────────
  const { data: ssotRow, error: ssotError } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, size_signal, current_use_signal, vacancy_signal, fit_summary, caution_summary, hidden_fields, layers, raw_input, status")
    .eq("id", buildingId)
    .maybeSingle();

  if (ssotError || !ssotRow) {
    return NextResponse.json(
      { error: "SSoT 데이터를 찾을 수 없습니다. 딜카드를 먼저 생성해 주세요." },
      { status: 404 }
    );
  }

  // DB 컬럼을 readiness가 이해하는 flat 구조로 매핑
  const bssotFlat: Record<string, unknown> = {
    area_signal: ssotRow.area_signal,
    asset_type: ssotRow.asset_type,
    price_band: ssotRow.price_band,
    size_signal: ssotRow.size_signal,
    current_use_signal: ssotRow.current_use_signal,
    vacancy_signal: ssotRow.vacancy_signal,
    fit_summary: ssotRow.fit_summary,
    caution_summary: ssotRow.caution_summary,
    raw_input: ssotRow.raw_input,
    layers: ssotRow.layers,
    // direct_data가 있으면 병합 (딜카드에서 직접 전달된 보강 데이터)
    ...(directData ?? {}),
  };

  // vacancy를 supplemental에 자동 채움
  if (!supplemental.vacancy_status && ssotRow.vacancy_signal) {
    supplemental.vacancy_status = ssotRow.vacancy_signal;
  }

  // ─── Readiness 체크 (v2: flat 구조 기반) ──────────────────────────────────
  const readiness = computeMobileIMReadiness(bssotFlat, supplemental);
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

  if (supplemental.resolved_pnu) {
    try {
      externalData = await enrichBuildingDataByPNU(
        supplemental.resolved_pnu,
        supplemental.resolved_address || "",
        ssotRow.id
      );
    } catch (err) {
      console.error("[im-lite/generate] External data enrichment by PNU failed:", err);
    }
  } else if (supplemental.resolved_address) {
    try {
      externalData = await enrichBuildingData(supplemental.resolved_address, ssotRow.id);
    } catch (err) {
      console.error("[im-lite/generate] External data enrichment by Address failed:", err);
    }
  } else {
    // 주소 추출 다중 경로:
    // 1순위: layers.location.address (구조화된 주소)
    // 2순위: layers.location.neighborhood (행정동)
    // 3순위: raw_input 텍스트에서 주소 패턴 추출
    const layers = (ssotRow.layers ?? {}) as Record<string, any>;
    let rawAddress: string | null =
      layers?.location?.address ??
      layers?.location?.neighborhood ??
      null;

    if (!rawAddress && ssotRow.raw_input) {
      // raw_input에서 "서울시 X구 Y동" 또는 "XX동" 패턴 추출
      const addrMatch = String(ssotRow.raw_input).match(
        /([가-힣]{2,4}[시도]\s*[가-힣]{2,4}[시군구]\s*[가-힣]{2,6}[읍면동](?:\s*\d+[가-힣]?)?)/
      ) ?? String(ssotRow.raw_input).match(/([가-힣]{2,6}[동로길]\s*\d+)/);
      if (addrMatch) rawAddress = addrMatch[1];
    }

    // 권역 신호도 폴백으로 활용 (예: "성수동" → 공공데이터 조회 시도)
    if (!rawAddress && ssotRow.area_signal) {
      rawAddress = `서울시 ${ssotRow.area_signal}`;
    }

    if (rawAddress && rawAddress.length > 3) {
      try {
        externalData = await enrichBuildingData(rawAddress, ssotRow.id);
      } catch (err) {
        console.error("[im-lite/generate] External data enrichment failed:", err);
      }
    }
  }

  // ─── 7섹션 AI 생성 ──────────────────────────────────────────────────────────
  const writerResult = await generateMobileIM({
    building_ssot_lite: bssotFlat,
    supplemental,
    readiness,
    external_data: externalData,
  });

  // ─── document_objects 저장 (기존 스키마 호환) ──────────────────────────────
  const title = `${ssotRow.area_signal || "핵심 입지"} ${ssotRow.asset_type || "상업용 자산"} — Mobile IM`;

  const imDocPayload = {
    owner_id: user!.id,
    source_type: "building_ssot_lite" as const,
    source_id: buildingId,
    building_id: buildingId,
    document_type: "blind_teaser" as const, // mobile_im enum 미등록 → blind_teaser로 저장
    visibility: "public_blind" as const,
    status: skipApproval ? "broker_reviewed" as const : "draft" as const,
    title,
    body: {
      im_type: "mobile_im_lite",
      sections: writerResult.sections,
      boundary_note: writerResult.boundary_note,
      generated_at: writerResult.generated_at,
      ai_used: writerResult.ai_used,
      readiness_score: readiness.score,
      ssot_summary: {
        area_signal: ssotRow.area_signal,
        asset_type: ssotRow.asset_type,
        price_band: ssotRow.price_band,
        size_signal: ssotRow.size_signal,
        vacancy_signal: ssotRow.vacancy_signal,
        fit_summary: ssotRow.fit_summary,
        caution_summary: ssotRow.caution_summary,
      },
      external_data: externalData
        ? {
            enrichedAt: externalData.enrichedAt,
            hasPublicData: !!(externalData.buildingRegister || externalData.landUsePlan),
            errors: externalData.errors,
          }
        : null,
    },
  };

  let savedDocId = null;
  try {
    const { data: savedDoc, error: saveError } = await supabase
      .from("document_objects")
      .insert([imDocPayload])
      .select("id")
      .single();

    if (saveError) {
      console.error("[im-lite/generate] Save warning (non-fatal):", saveError);
    } else {
      savedDocId = savedDoc?.id;
    }
  } catch (err) {
    console.error("[im-lite/generate] Save failed (non-fatal):", err);
  }

  // ─── 응답 반환 (저장 실패해도 IM URL은 반환) ─────────────────────────────
  const imUrl = `/im-lite/${buildingId}${savedDocId ? `?doc=${savedDocId}` : ""}`;

  return NextResponse.json({
    ok: true,
    im_lite_id: savedDocId,
    url: imUrl,
    readiness_score: readiness.score,
    ai_used: writerResult.ai_used,
    sections_count: writerResult.sections.length,
    external_data_loaded: !!externalData,
    message: `Mobile IM 생성 완료 (${writerResult.sections.length}섹션${writerResult.ai_used ? ", AI 서사" : ", 템플릿"})`,
  });
}
