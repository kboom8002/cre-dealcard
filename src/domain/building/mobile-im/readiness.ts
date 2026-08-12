import type { MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";
import type { InvestmentPosture } from "@/domain/ontology";

export const MOBILE_IM_READINESS_THRESHOLD = 40;

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
  externalData?: ExternalDataSnapshot | null,
  posture: InvestmentPosture = "income"
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

  // 2. 가격대 / 매각가 (10점~20점)
  if (bssotLite.price_band || assetIdentity.price_band || supplemental.asking_price_manwon || bssotLite.asking_price_manwon) {
    score += (posture === "owner_occupied" || posture === "trading") ? 20 : 10;
  } else {
    missing.push("가격대 / 매각 희망가");
  }

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

  // 5. Posture별 특화 데이터 점수
  if (posture === "development") {
    // 개발형: 대지면적 / 용도지역 (공공데이터 또는 bssot/physicalFact)
    const hasLand = physicalFact.land_area_m2 || bssotLite.land_area_m2 || externalData?.landUsePlan;
    if (hasLand) score += 20;
    else missing.push("대지면적");

    const hasZoning = physicalFact.zoning || bssotLite.zoning || externalData?.landUsePlan;
    if (hasZoning) score += 15;
    else missing.push("용도지역");
  } else if (posture === "owner_occupied") {
    // 사옥형: 건물 연면적 (건축물대장 또는 bssot)
    const hasArea = physicalFact.total_gross_area_m2 || bssotLite.total_gross_area_m2 || externalData?.buildingRegister;
    if (hasArea) score += 15;
    else missing.push("건축 연면적");
  } else if (posture === "operating") {
    // operating: 월 매출 (20점) -> monthly_revenue_manwon
    if (supplemental.monthly_revenue_manwon && supplemental.monthly_revenue_manwon > 0) score += 20;
    else if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0) score += 20;
    else if (bssotLite.monthly_rent_total && Number(bssotLite.monthly_rent_total) > 0) score += 20;
    else missing.push("월 매출/임대료");

    // 공실률/가동률 (10점)
    if (supplemental.vacancy_pct !== undefined || supplemental.vacancy_status || bssotLite.vacancy_signal || physicalFact.vacancy_signal) {
      score += 10;
    } else {
      missing.push("공실/가동률");
    }
  } else if (posture === "trading") {
    // trading: 매각 희망가 (20점)
    if (supplemental.asking_price_manwon && supplemental.asking_price_manwon > 0) score += 20;
    else if (bssotLite.asking_price_manwon && Number(bssotLite.asking_price_manwon) > 0) score += 20;
    else missing.push("매각 희망가");

    // 비교사례 (10점)
    if (externalData?.comparableTransactions) {
      score += 10;
    } else {
      missing.push("비교사례");
    }
  } else {
    // income, operating, trading: 월세 총액 (20점)
    if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0) score += 20;
    else if (bssotLite.monthly_rent_total && Number(bssotLite.monthly_rent_total) > 0) score += 20;
    else {
      const useSignal = String(bssotLite.current_use_signal ?? "");
      if (/월세|임차|렌트|임대/.test(useSignal)) score += 10;
      else missing.push("월세 총액");
    }

    // 공실률 (10점)
    if (supplemental.vacancy_pct !== undefined || supplemental.vacancy_status || bssotLite.vacancy_signal || physicalFact.vacancy_signal) {
      score += 10;
    } else {
      missing.push("공실률");
    }
  }

  // 6. 건물 사진 (10점)
  if (supplemental.photo_urls && supplemental.photo_urls.length > 0) score += 10;
  else if (bssotLite.raw_input && String(bssotLite.raw_input).length > 100) score += 5;
  else missing.push("건물 사진");

  // 7. 브로커 코멘트 (5점)
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

