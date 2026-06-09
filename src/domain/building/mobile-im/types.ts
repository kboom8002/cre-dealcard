// src/domain/building/mobile-im/types.ts
// Mobile IM Lite 7섹션 타입 정의
// Full IM 18섹션에서 꼬마빌딩 매수자가 실제로 묻는 7가지만 추출

export const MOBILE_IM_SECTIONS_7 = [
  "property_overview",        // Full IM: property_fact_sheet
  "location_access",          // Full IM: location_access
  "lease_status",             // Full IM: rent_roll_lease_quality
  "income_analysis",          // Full IM: income_noi_yield_analysis
  "risk_check",               // Full IM: risk_factors_dd_checklist
  "investment_thesis",        // Full IM: investment_thesis_buyer_fit
  "next_steps",               // Full IM: deal_process_next_steps
] as const;

export type MobileIMSectionType = (typeof MOBILE_IM_SECTIONS_7)[number];

export interface MobileIMProject {
  id: string;
  building_id: string;
  source_type: "dealcard_handoff" | "direct_create";
  source_handoff_token?: string;
  source_building_ssot_lite_id?: string;
  building_ssot_lite: Record<string, unknown>;
  supplemental_input: MobileIMSupplementalInput;
  readiness_score: number;
  status: "draft" | "generating" | "generated" | "pending_approval" | "published" | "revision_needed" | "archived";
  slug: string;
  title: string;
  key_metrics: Record<string, unknown>;
  sections: MobileIMSection[];
  gate_result: MobileIMLiteGateResult;
  kakao_copy?: string;
  boundary_note?: string;
  full_im_readiness_score?: number;
  full_im_missing_data?: string[];
  external_data?: ExternalDataSnapshot | null;
  created_at: string;
  published_at?: string;
}

/** 브로커가 딜카드 이후 추가로 입력하는 보강 정보 */
export interface MobileIMSupplementalInput {
  monthly_rent_total_krw?: number;   // 월세 총액
  vacancy_status?: string;           // 공실 현황 간단 입력
  photo_urls?: string[];             // 대표 사진 3~5장
  broker_highlight?: string;         // 브로커 한줄 코멘트
  estimated_yield_pct?: number;      // 예상 수익률
}

export interface MobileIMSection {
  section_type: MobileIMSectionType;
  section_order: number;
  title: string;
  markdown: string;
  confidence: "confirmed" | "inferred" | "needs_check";
  boundary_note: string;
  provenance?: DataPointProvenance[];
}

export interface MobileIMLiteGateResult {
  disclosure_status: "pass" | "redacted" | "blocked";
  risk_status: "pass" | "revise" | "blocked";
  redacted_fields: string[];
  risk_issues: { severity: string; message: string }[];
  boundary_note?: string;
}

/** 외부 공공데이터 스냅샷 (타입 간소화 버전) */
export interface ExternalDataSnapshot {
  resolvedAddress?: { pnu?: string; lat?: number; lng?: number; roadAddress?: string };
  buildingRegister?: {
    totalArea?: number; platArea?: number; useAprDay?: string;
    mainPurpose?: string; structure?: string; floorsAbove?: number;
    floorsBelow?: number; bcRat?: number; vlRat?: number; buildingName?: string;
  } | null;
  landPrice?: { pricePerSqm?: number; baseYear?: string } | null;
  landUsePlan?: {
    zoningDistrict?: string; zoningOverlap?: string[];
    buildingCoverageMax?: number; floorAreaRatioMax?: number;
  } | null;
  comparableTransactions?: Array<{
    pricePerPyeong: number; address: string; dealYear: number;
    dealMonth: number; area: number;
  }>;
  locationPoi?: {
    nearestStation?: { name: string; distanceM: number; walkMinutes: number } | null;
    poiCounts?: { subway: number; busStop: number; cafe: number; parking: number; restaurant: number; convenience: number };
  } | null;
  enrichedAt?: string;
  errors?: { api: string; message: string }[];
  /** 카카오 Static Map 이미지 URL */
  mapImageUrl?: string | null;
  /** 등기정보광장 API 결과 */
  registryData?: import('../../../lib/external/registry-api').RegistryData | null;
}

/** 데이터 출처 포인트 (section 내 출처 배지 표시용) */
export interface DataPointProvenance {
  fieldKey: string;
  value: string | number;
  source: "public_data" | "broker_input" | "ai_inferred" | "expert_verified";
  sourceDetail: string;
  confidence: "confirmed" | "inferred" | "needs_check";
  lastVerifiedAt: string;
}
