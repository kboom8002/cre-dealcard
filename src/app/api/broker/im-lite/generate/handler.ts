/**
 * Mobile IM Lite 생성 핸들러 — 순수 비즈니스 로직
 *
 * route.ts (HTTP) 와 actions.ts (Server Action) 양쪽에서 호출 가능하도록
 * HTTP 레이어를 분리한 핵심 함수.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { computeMobileIMReadiness, MOBILE_IM_READINESS_THRESHOLD } from "@/domain/building/mobile-im/readiness";
import { generateMobileIM } from "@/domain/building/mobile-im/writer";
import { enrichBuildingData } from "@/lib/external/external-data-orchestrator";
import { enrichBuildingDataByPNU } from "@/lib/external/enrich-by-pnu";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

export interface GenerateMobileIMInput {
  buildingId: string;
  userId: string;
  supplemental: MobileIMSupplementalInput;
  skipApproval?: boolean;
  directData?: Record<string, unknown> | null;
}

export interface GenerateMobileIMResult {
  ok: boolean;
  im_lite_id?: string | null;
  url?: string;
  readiness_score?: number;
  ai_used?: boolean;
  sections_count?: number;
  external_data_loaded?: boolean;
  message?: string;
  // Error cases
  error?: string;
  score?: number;
  threshold?: number;
  missing?: string[];
  hint?: string;
  statusCode?: number;
}

export async function generateMobileIMHandler(
  input: GenerateMobileIMInput
): Promise<GenerateMobileIMResult> {
  const { buildingId, userId, supplemental, skipApproval = false, directData = null } = input;
  const supabase = createServiceClient();

  // ─── SSoT Lite 로드 (PK = id)
  const { data: ssotRow, error: ssotError } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, size_signal, current_use_signal, vacancy_signal, fit_summary, caution_summary, hidden_fields, layers, raw_input, lease_summary, status")
    .eq("id", buildingId)
    .maybeSingle();

  if (ssotError || !ssotRow) {
    return {
      ok: false,
      error: "SSoT 데이터를 찾을 수 없습니다. 딜카드를 먼저 생성해 주세요.",
      statusCode: 404,
    };
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
    lease_summary: ssotRow.lease_summary,
    ...(directData ?? {}),
  };

  // vacancy를 supplemental에 자동 채움
  if (!supplemental.vacancy_status && ssotRow.vacancy_signal) {
    supplemental.vacancy_status = ssotRow.vacancy_signal;
  }

  // ─── Readiness 체크
  const readiness = computeMobileIMReadiness(bssotFlat, supplemental);
  if (!readiness.can_generate) {
    return {
      ok: false,
      error: "Readiness 점수가 부족합니다.",
      score: readiness.score,
      threshold: MOBILE_IM_READINESS_THRESHOLD,
      missing: readiness.missing,
      hint: "부족한 항목을 추가 입력하거나, 딜카드를 먼저 완성해 주세요.",
      statusCode: 400,
    };
  }

  // ─── 공공데이터 수집 (fault-tolerant)
  let externalData = null;

  if (supplemental.resolved_pnu) {
    try {
      externalData = await enrichBuildingDataByPNU(
        supplemental.resolved_pnu,
        supplemental.resolved_address || "",
        ssotRow.id
      );
    } catch (err) {
      console.error("[im-handler] External data enrichment by PNU failed:", err);
    }
  } else if (supplemental.resolved_address) {
    try {
      externalData = await enrichBuildingData(supplemental.resolved_address, ssotRow.id);
    } catch (err) {
      console.error("[im-handler] External data enrichment by Address failed:", err);
    }
  } else {
    const layers = (ssotRow.layers ?? {}) as Record<string, any>;
    let rawAddress: string | null =
      layers?.location?.address ??
      layers?.location?.neighborhood ??
      null;

    if (!rawAddress && ssotRow.raw_input) {
      const addrMatch = String(ssotRow.raw_input).match(
        /([가-힣]{2,4}[시도]\s*[가-힣]{2,4}[시군구]\s*[가-힣]{2,6}[읍면동](?:\s*\d+[가-힣]?)?)/
      ) ?? String(ssotRow.raw_input).match(/([가-힣]{2,6}[동로길]\s*\d+)/);
      if (addrMatch) rawAddress = addrMatch[1];
    }

    if (!rawAddress && ssotRow.area_signal) {
      rawAddress = `서울시 ${ssotRow.area_signal}`;
    }

    if (rawAddress && rawAddress.length > 3) {
      try {
        externalData = await enrichBuildingData(rawAddress, ssotRow.id);
      } catch (err) {
        console.error("[im-handler] External data enrichment failed:", err);
      }
    }
  }

  // ─── 7섹션 AI 생성
  const writerResult = await generateMobileIM({
    building_ssot_lite: bssotFlat,
    supplemental,
    readiness,
    external_data: externalData,
  });

  // ─── document_objects 저장
  const title = `${ssotRow.area_signal || "핵심 입지"} ${ssotRow.asset_type || "상업용 자산"} — Mobile IM`;

  const imDocPayload = {
    owner_id: userId,
    source_type: "building_ssot_lite" as const,
    source_id: buildingId,
    building_id: buildingId,
    document_type: "blind_teaser" as const,
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
            fallbackStatus: {
              buildingRegister: externalData.buildingRegister?._isFallback ?? null,
              landPrice: externalData.landPrice?._isFallback ?? null,
              landUsePlan: externalData.landUsePlan?._isFallback ?? null,
              locationPoi: externalData.locationPoi?._isFallback ?? null,
            },
          }
        : null,
      coordinates: externalData?.resolvedAddress
        ? { lat: externalData.resolvedAddress.lat, lng: externalData.resolvedAddress.lng }
        : null,
      photo_urls: supplemental.photo_urls ?? [],
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
      console.error("[im-handler] Save error:", saveError);
      return {
        ok: false,
        error: `문서 저장에 실패했습니다: ${saveError.message}`,
        statusCode: 500,
      };
    } else {
      savedDocId = savedDoc?.id;
    }
  } catch (err: any) {
    console.error("[im-handler] Save failed:", err);
    return {
      ok: false,
      error: `문서 저장 중 오류가 발생했습니다: ${err.message}`,
      statusCode: 500,
    };
  }

  const imUrl = `/im-lite/${buildingId}${savedDocId ? `?doc=${savedDocId}` : ""}`;

  return {
    ok: true,
    im_lite_id: savedDocId,
    url: imUrl,
    readiness_score: readiness.score,
    ai_used: writerResult.ai_used,
    sections_count: writerResult.sections.length,
    external_data_loaded: !!externalData,
    message: `Mobile IM 생성 완료 (${writerResult.sections.length}섹션${writerResult.ai_used ? ", AI 서사" : ", 템플릿"})`,
  };
}
