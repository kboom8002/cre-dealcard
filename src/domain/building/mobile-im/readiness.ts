// src/domain/building/mobile-im/readiness.ts
// Mobile IM 생성 가능 여부를 판단하는 Readiness 체커.
// 7개 데이터포인트에 가중 점수를 부여하여 합산 40점 이상이면 생성 가능.
// (Full IM은 80점 필요 — Mobile IM의 기준이 훨씬 낮음)

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

  const assetIdentity = (bssotLite.asset_identity ?? {}) as Record<string, unknown>;
  const marketLocation = (bssotLite.market_location ?? {}) as Record<string, unknown>;
  const physicalFact = (bssotLite.physical_fact ?? {}) as Record<string, unknown>;

  // 권역 정보
  if (assetIdentity.area_signal) score += 15;
  else missing.push("권역 정보");

  // 가격대
  if (assetIdentity.price_band) score += 15;
  else missing.push("가격대");

  // 자산 유형
  if (assetIdentity.asset_type) score += 15;
  else missing.push("자산 유형");

  // 월세 총액 (supplemental 우선, SSoT Lite 차선)
  if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0) score += 20;
  else if (bssotLite.monthly_rent_total && Number(bssotLite.monthly_rent_total) > 0) score += 20;
  else missing.push("월세 총액");

  // 공실 현황
  if (supplemental.vacancy_status || physicalFact.vacancy_signal) score += 10;
  else missing.push("공실 현황");

  // 건물 사진
  if (supplemental.photo_urls && supplemental.photo_urls.length > 0) score += 15;
  else missing.push("건물 사진");

  // 입지 정보 (공공데이터 주소 해석 또는 SSoT 입지분석 텍스트)
  if (externalData?.resolvedAddress || marketLocation.location_analysis || bssotLite.address) score += 10;
  else missing.push("상세 위치/입지");

  // 공공데이터 보너스 (+10) — 건축물대장 또는 토지이용계획 있을 때
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
