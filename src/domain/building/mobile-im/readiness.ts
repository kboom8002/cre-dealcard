// src/domain/building/mobile-im/readiness.ts
// Mobile IM 생성 가능 여부를 판단하는 Readiness 체커.
// 7개 데이터포인트에 가중 점수를 부여하여 합산 40점 이상이면 생성 가능.
// v2 — flat 구조 (DB 컬럼명 직접 사용) + 중첩 구조 양쪽 모두 지원

import type { MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";

export const MOBILE_IM_READINESS_THRESHOLD = 40;

export const MOBILE_IM_DATA_POINTS = [
  { key: "area_signal",  points: 15, label: "권역 정보" },
  { key: "price_band",   points: 15, label: "가격대" },
  { key: "asset_type",   points: 15, label: "자산 유형" },
  { key: "monthly_rent", points: 20, label: "월세 총액" },
  { key: "vacancy",      points: 10, label: "공실 현황" },
  { key: "photos",       points: 15, label: "건물 사진" },
  { key: "location",     points: 10, label: "상세 위치/입지" },
] as const;

export function computeMobileIMReadiness(
  bssotLite: Record<string, unknown>,
  supplemental: MobileIMSupplementalInput,
  externalData?: ExternalDataSnapshot | null
): {
  score: number;
  can_generate: boolean;
  missing: string[];
  has_external_data: boolean;
} {
  let score = 0;
  const missing: string[] = [];

  // v2: flat 구조 (DB 컬럼 직접) + legacy 중첩 구조 양쪽 지원
  const assetIdentity = (bssotLite.asset_identity ?? {}) as Record<string, unknown>;
  const marketLocation = (bssotLite.market_location ?? {}) as Record<string, unknown>;
  const physicalFact = (bssotLite.physical_fact ?? {}) as Record<string, unknown>;
  const layers = (bssotLite.layers ?? {}) as Record<string, any>;

  // 권역 정보 — flat 우선, 중첩 차선
  if (bssotLite.area_signal || assetIdentity.area_signal) score += 15;
  else missing.push("권역 정보");

  // 가격대
  if (bssotLite.price_band || assetIdentity.price_band) score += 15;
  else missing.push("가격대");

  // 자산 유형
  if (bssotLite.asset_type || assetIdentity.asset_type) score += 15;
  else missing.push("자산 유형");

  // 월세 총액 (supplemental 우선, SSoT Lite 차선)
  if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0) score += 20;
  else if (bssotLite.monthly_rent_total && Number(bssotLite.monthly_rent_total) > 0) score += 20;
  else {
    // 월세 정보가 없어도 임차 현황 텍스트에 월세가 포함되어 있으면 통과
    const useSignal = String(bssotLite.current_use_signal ?? "");
    if (/월세|임차|렌트|임대/.test(useSignal)) score += 15; // 정확한 숫자 없으면 15점만
    else missing.push("월세 총액");
  }

  // 공실 현황
  if (supplemental.vacancy_status || bssotLite.vacancy_signal || physicalFact.vacancy_signal) score += 10;
  else missing.push("공실 현황");

  // 건물 사진 — 사진이 없어도 딜카드 내용이 풍부하면 5점 부분 허용
  if (supplemental.photo_urls && supplemental.photo_urls.length > 0) score += 15;
  else if (bssotLite.raw_input && String(bssotLite.raw_input).length > 100) score += 5;
  else missing.push("건물 사진");

  // 입지 정보
  if (
    externalData?.resolvedAddress ||
    marketLocation.location_analysis ||
    bssotLite.address ||
    layers?.location?.address ||
    layers?.location?.neighborhood
  ) {
    score += 10;
  } else if (bssotLite.area_signal) {
    score += 5; // 권역만 있어도 부분 점수
  } else {
    missing.push("상세 위치/입지");
  }

  // 공공데이터 보너스 (+10)
  let hasExternal = false;
  if (externalData?.buildingRegister || externalData?.landUsePlan) {
    score += 10;
    hasExternal = true;
  }

  score = Math.min(score, 100);

  return {
    score,
    can_generate: score >= MOBILE_IM_READINESS_THRESHOLD,
    missing,
    has_external_data: hasExternal,
  };
}
