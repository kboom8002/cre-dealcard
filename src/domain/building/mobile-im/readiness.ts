// src/domain/building/mobile-im/readiness.ts
// Mobile IM 생성 가능 여부를 판단하는 Readiness 체커.
// 7개 데이터포인트에 가중 점수를 부여하여 합산 55점 이상이면 생성 가능.
// v2 — flat 구조 (DB 컬럼명 직접 사용) + 중첩 구조 양쪽 모두 지원 + 55점 게이팅 강화

import type { MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";

export const MOBILE_IM_READINESS_THRESHOLD = 55;

export const MOBILE_IM_DATA_POINTS = [
  { key: "address",      points: 25, label: "정확한 주소 (지번)", tier: "critical" },
  { key: "monthly_rent", points: 20, label: "월세 총액",         tier: "critical" },
  { key: "asset_type",   points: 10, label: "자산 유형",         tier: "basic" },
  { key: "price_band",   points: 10, label: "가격대",           tier: "basic" },
  { key: "area_signal",  points: 10, label: "권역 정보",         tier: "basic" },
  { key: "vacancy_pct",  points: 10, label: "공실률",           tier: "enhanced" },
  { key: "photos",       points: 10, label: "건물 사진",         tier: "enhanced" },
  { key: "highlight",    points: 5,  label: "브로커 코멘트",     tier: "enhanced" },
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
  const physicalFact = (bssotLite.physical_fact ?? {}) as Record<string, unknown>;

  // 1. 권역 정보 (10점)
  if (bssotLite.area_signal || assetIdentity.area_signal) score += 10;
  else missing.push("권역 정보");

  // 2. 가격대 (10점)
  if (bssotLite.price_band || assetIdentity.price_band) score += 10;
  else missing.push("가격대");

  // 3. 자산 유형 (10점)
  if (bssotLite.asset_type || assetIdentity.asset_type) score += 10;
  else missing.push("자산 유형");

  // 4. 주소 (25점)
  if (supplemental.resolved_address || supplemental.resolved_pnu || externalData?.resolvedAddress) {
    score += 25;
  } else if (bssotLite.address || bssotLite.raw_address) {
    score += 10; // 지번 미확정 부분 점수
    missing.push("정확한 주소 (지번)");
  } else {
    missing.push("정확한 주소 (지번)");
  }

  // 5. 월세 총액 (20점)
  if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0) score += 20;
  else if (bssotLite.monthly_rent_total && Number(bssotLite.monthly_rent_total) > 0) score += 20;
  else {
    const useSignal = String(bssotLite.current_use_signal ?? "");
    if (/월세|임차|렌트|임대/.test(useSignal)) score += 10; // 금액 미정 부분 점수
    else missing.push("월세 총액");
  }

  // 6. 공실률 (10점)
  if (supplemental.vacancy_pct !== undefined || supplemental.vacancy_status || bssotLite.vacancy_signal || physicalFact.vacancy_signal) {
    score += 10;
  } else {
    missing.push("공실률");
  }

  // 7. 건물 사진 (10점)
  if (supplemental.photo_urls && supplemental.photo_urls.length > 0) score += 10;
  else if (bssotLite.raw_input && String(bssotLite.raw_input).length > 100) score += 5; // 정보량 풍부할 때 부분 허용
  else missing.push("건물 사진");

  // 8. 브로커 코멘트 (5점)
  if (supplemental.broker_highlight) score += 5;

  let hasExternal = false;
  if (externalData?.buildingRegister || externalData?.landUsePlan) {
    score += 10; // 공공데이터 보너스
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
