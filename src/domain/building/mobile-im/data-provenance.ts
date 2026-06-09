// src/domain/building/mobile-im/data-provenance.ts
// 8개 데이터 포인트의 출처를 추적하여 뷰어에서 ✓공공데이터 / 👤브로커 / ⚙AI 배지를 표시.
// public_data > broker_input > ai_inferred 순서로 신뢰도가 높음.

import type { MobileIMSupplementalInput, DataPointProvenance, ExternalDataSnapshot } from "./types";

export function buildProvenanceMap(
  bssotLite: Record<string, any>,
  externalData: ExternalDataSnapshot | null,
  supplemental: MobileIMSupplementalInput
): DataPointProvenance[] {
  const provenanceMap: DataPointProvenance[] = [];
  const nowStr = new Date().toISOString();
  const extAt = externalData?.enrichedAt ?? nowStr;

  // 1. 연면적 (total_area)
  if (externalData?.buildingRegister?.totalArea) {
    provenanceMap.push({ fieldKey: "total_area", value: externalData.buildingRegister.totalArea, source: "public_data", sourceDetail: "국토교통부 건축물대장 API", confidence: "confirmed", lastVerifiedAt: extAt });
  } else if (bssotLite.total_area) {
    provenanceMap.push({ fieldKey: "total_area", value: Number(bssotLite.total_area), source: "broker_input", sourceDetail: "브로커 직접 등록 정보 (SSoT)", confidence: "inferred", lastVerifiedAt: nowStr });
  }

  // 2. 대지면적 (plat_area)
  if (externalData?.buildingRegister?.platArea) {
    provenanceMap.push({ fieldKey: "plat_area", value: externalData.buildingRegister.platArea, source: "public_data", sourceDetail: "국토교통부 건축물대장 API", confidence: "confirmed", lastVerifiedAt: extAt });
  } else if (bssotLite.plat_area) {
    provenanceMap.push({ fieldKey: "plat_area", value: Number(bssotLite.plat_area), source: "broker_input", sourceDetail: "브로커 직접 등록 정보 (SSoT)", confidence: "inferred", lastVerifiedAt: nowStr });
  }

  // 3. 사용승인일 (use_approval_date)
  if (externalData?.buildingRegister?.useAprDay) {
    provenanceMap.push({ fieldKey: "use_approval_date", value: externalData.buildingRegister.useAprDay, source: "public_data", sourceDetail: "국토교통부 건축물대장 API", confidence: "confirmed", lastVerifiedAt: extAt });
  } else if (bssotLite.use_approval_date) {
    provenanceMap.push({ fieldKey: "use_approval_date", value: String(bssotLite.use_approval_date), source: "broker_input", sourceDetail: "브로커 직접 등록 정보 (SSoT)", confidence: "inferred", lastVerifiedAt: nowStr });
  }

  // 4. 용도지역 (zoning)
  if (externalData?.landUsePlan?.zoningDistrict) {
    provenanceMap.push({ fieldKey: "zoning", value: externalData.landUsePlan.zoningDistrict, source: "public_data", sourceDetail: "토지이용규제정보서비스(LURIS) API", confidence: "confirmed", lastVerifiedAt: extAt });
  }

  // 5. 개별공시지가 (official_land_price)
  if (externalData?.landPrice?.pricePerSqm) {
    provenanceMap.push({ fieldKey: "official_land_price", value: externalData.landPrice.pricePerSqm, source: "public_data", sourceDetail: `국토교통부 개별공시지가 API (${externalData.landPrice.baseYear ?? "2025"})`, confidence: "confirmed", lastVerifiedAt: extAt });
  }

  // 6. 월임대료 총액 (monthly_rent_total)
  if (supplemental.monthly_rent_total_krw) {
    provenanceMap.push({ fieldKey: "monthly_rent_total", value: supplemental.monthly_rent_total_krw, source: "broker_input", sourceDetail: "브로커 제공 실제 임대 정보", confidence: "confirmed", lastVerifiedAt: nowStr });
  } else if (bssotLite.monthly_rent_total) {
    provenanceMap.push({ fieldKey: "monthly_rent_total", value: Number(bssotLite.monthly_rent_total), source: "broker_input", sourceDetail: "브로커 직접 등록 정보 (SSoT)", confidence: "inferred", lastVerifiedAt: nowStr });
  }

  // 7. 공실률 (vacancy_rate)
  if (supplemental.vacancy_status) {
    provenanceMap.push({ fieldKey: "vacancy_rate", value: supplemental.vacancy_status, source: "broker_input", sourceDetail: "브로커 제공 실시간 수치", confidence: "confirmed", lastVerifiedAt: nowStr });
  } else {
    provenanceMap.push({ fieldKey: "vacancy_rate", value: "정보 없음", source: "ai_inferred", sourceDetail: "기본값 추론", confidence: "needs_check", lastVerifiedAt: nowStr });
  }

  // 8. 예상 수익률 (estimated_yield)
  if (supplemental.estimated_yield_pct) {
    provenanceMap.push({ fieldKey: "estimated_yield", value: supplemental.estimated_yield_pct, source: "broker_input", sourceDetail: "브로커 제시 목표 수익률", confidence: "confirmed", lastVerifiedAt: nowStr });
  } else if (bssotLite.estimated_yield) {
    provenanceMap.push({ fieldKey: "estimated_yield", value: Number(bssotLite.estimated_yield), source: "broker_input", sourceDetail: "브로커 직접 등록 정보 (SSoT)", confidence: "confirmed", lastVerifiedAt: nowStr });
  } else {
    // 임대료 / 매매가 기반 자동 계산
    const purchasePrice = Number(bssotLite.purchase_price || bssotLite.deal_amount || 0);
    const monthlyRent = Number(supplemental.monthly_rent_total_krw || bssotLite.monthly_rent_total || 0);
    if (purchasePrice > 0 && monthlyRent > 0) {
      const computedYield = ((monthlyRent * 12) / purchasePrice) * 100;
      provenanceMap.push({ fieldKey: "estimated_yield", value: parseFloat(computedYield.toFixed(2)), source: "ai_inferred", sourceDetail: "월세/매매가 기반 계산 수치", confidence: "inferred", lastVerifiedAt: nowStr });
    }
  }

  return provenanceMap;
}

/** 출처 배지 시각화 정보 */
export function formatProvenanceBadge(provenance: DataPointProvenance): {
  icon: string; label: string; color: string;
} {
  switch (provenance.source) {
    case "public_data":     return { icon: "✓", label: "공공데이터", color: "emerald" };
    case "expert_verified": return { icon: "★", label: "전문가 검증", color: "blue" };
    case "broker_input":    return { icon: "👤", label: "브로커 등록", color: "amber" };
    case "ai_inferred":
    default:
      if (provenance.confidence === "needs_check") return { icon: "⚠", label: "확인 필요", color: "red" };
      return { icon: "⚙", label: "AI 계산", color: "indigo" };
  }
}

/** 섹션 유형별로 관련 출처 포인트 필터링 */
export function getSectionProvenance(sectionType: string, allProvenance: DataPointProvenance[]): DataPointProvenance[] {
  const mapping: Record<string, string[]> = {
    property_overview: ["total_area", "plat_area", "use_approval_date"],
    location_access: [],
    lease_status: ["monthly_rent_total", "vacancy_rate"],
    income_analysis: ["official_land_price", "estimated_yield"],
    risk_check: ["zoning"],
    investment_thesis: ["estimated_yield"],
    next_steps: [],
  };
  const keys = mapping[sectionType] || [];
  return allProvenance.filter((p) => keys.includes(p.fieldKey));
}
