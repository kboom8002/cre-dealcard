// src/domain/building/mobile-im/types.ts
// Mobile IM Lite 7섹션 타입 정의
// Full IM 18섹션에서 꼬마빌딩 매수자가 실제로 묻는 7가지만 추출

import type { BuildingUse, AssetType, InvestmentPosture, PhotoCategory } from '@/domain/ontology';
import type { ArchetypeCode } from './archetype-registry';
import type { BuildingSSoTLite } from '../building-ssot-lite.types';

/** 개별 사진 메타데이터 (v0.6.0) */
export interface PhotoMeta {
  url: string;
  category: PhotoCategory;               // 사진 분류 (17종 SSoT)
  caption?: string;                      // 캡션 텍스트
  isHero?: boolean;                      // 대표 사진 여부 (최대 1장)
  autoClassified?: boolean;              // AI/규칙 자동 분류 여부 (vs 브로커 수동)
  width?: number;                        // 원본 이미지 너비 (px)
  height?: number;                       // 원본 이미지 높이 (px)
  aspectRatio?: number;                  // width / height
  order?: number;                        // 정렬 순서
}

/** 3축 자산 식별자 (v0.4) */
export interface AssetIdentity {
  buildingUse?: BuildingUse;
  assetType?: AssetType;
  investmentPosture?: InvestmentPosture;
}

export const MOBILE_IM_SECTIONS_7 = [
  "property_overview",        // Full IM: property_fact_sheet
  "location_access",          // Full IM: location_access
  "lease_status",             // Full IM: rent_roll_lease_quality
  "income_analysis",          // Full IM: income_noi_yield_analysis
  "risk_check",               // Full IM: risk_factors_dd_checklist
  "investment_thesis",        // Full IM: investment_thesis_buyer_fit
  "next_steps",               // Full IM: deal_process_next_steps
] as const;

export const MOBILE_IM_SECTIONS_NON_INCOME = [
  // owner_occupied
  "occupancy_fit",
  "cost_comparison",
  // development
  "site_analysis",
  "development_feasibility",
  // operating
  "operation_overview",
  "gop_analysis",
  // trading
  "market_position",
  "comparable_analysis",
] as const;

export type MobileIMSectionType =
  | (typeof MOBILE_IM_SECTIONS_7)[number]
  | (typeof MOBILE_IM_SECTIONS_NON_INCOME)[number];

export interface MobileIMProject {
  id: string;
  building_id: string;
  source_type: "dealcard_handoff" | "direct_create";
  source_handoff_token?: string;
  source_building_ssot_lite_id?: string;
  building_ssot_lite: BuildingSSoTLite;
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

/** 층별 임대차 입력 데이터 */
export interface FloorLeaseInput {
  floor: string;              // "B1", "1F", "2F", ... 또는 "3F~4F" (병합)
  tenant_type?: string;       // 업종/업체명 (e.g. "약국", "이비인후과")
  area_pyeong?: number;       // 전용면적 (평)
  deposit_manwon?: number;    // 보증금 (만원)
  rent_manwon?: number;       // 월 임대료 (만원)
  mgmt_fee_manwon?: number;   // 관리비 (만원)
  lease_start?: string;       // 계약 시작일 (YYYY-MM-DD)
  lease_end?: string;         // 계약 종료일 (YYYY-MM-DD)
  note?: string;              // 참고 (임대료 인상 조건 등)
  is_vacant?: boolean;        // 공실 여부

  /** 임대료 유형 */
  rent_type?: 'fixed'            // 고정 임대료 (기본)
    | 'revenue_linked'           // 매출연동 (매출의 N%)
    | 'stepped'                  // 단계적 인상
    | 'base_plus_percentage';    // 기본+매출연동

  /** 매출연동 비율 (%) — rent_type이 revenue_linked/base_plus_percentage일 때 */
  revenue_linked_pct?: number;

  /** 기본 임대료 (만원) — rent_type이 base_plus_percentage일 때 */
  base_rent_manwon?: number;

  /** 매출연동 추정 월 수입 범위 (만원) */
  estimated_rent_range?: {
    low: number;     // 보수적 추정
    mid: number;     // 중간 추정
    high: number;    // 낙관적 추정
  };
}

/** 비임대 부가수입 항목 */
export interface AncillaryIncomeItem {
  type: 'telecom_antenna'   // 통신장비 임대
    | 'telecom_electric'    // 통신장비 전기료
    | 'parking'             // 주차 수입
    | 'signage'             // 간판/옥외광고
    | 'vending'             // 자판기
    | 'rooftop_solar'       // 태양광
    | 'ev_charging'         // 전기차 충전
    | 'other';              // 기타
  label: string;            // 표시명 (예: "통신장비 임대료")
  annualAmountKrw: number;  // 연간 수입 (원)
  provenance: 'broker_input' | 'document_verified' | 'ai_estimated';
  note?: string;            // 참고 (계약 조건 등)
}

export interface HospitalitySpec {
  monthly_revenue_manwon?: number;
}

export interface DevelopmentSpec {
  monthly_revenue_manwon?: number;
}

export interface VacateSpec {
  monthly_revenue_manwon?: number;
}

export interface PermitSpec {
  monthly_revenue_manwon?: number;
}

export interface OccupancySpec {
  monthly_revenue_manwon?: number;
}

export interface SectionalSpec {
  monthly_revenue_manwon?: number;
}

export interface ResidentialSpec {
  monthly_revenue_manwon?: number;
}

/** 브로커가 딜카드 이후 추가로 입력하는 보강 정보 */
export interface MobileIMSupplementalInput {
  monthly_rent_total_krw?: number;   // 월세 총액
  vacancy_status?: string;           // 공실 현황 간단 입력
  vacancy_pct?: number;              // 정확한 공실률 (%)
  photo_urls?: string[];             // 대표 사진 최대 12장 (v1 레거시)
  photo_captions?: Record<number, string>; // 사진별 캡션 (인덱스→설명) (v1 레거시)
  photos_v2?: PhotoMeta[];           // 구조화 사진 메타데이터 (v2 SSoT)
  broker_highlight?: string;         // 브로커 한줄 코멘트
  estimated_yield_pct?: number;      // 예상 수익률
  resolved_address?: string;         // 확정 주소 (지번)
  resolved_pnu?: string;             // 확정 PNU
  total_floor_count?: number;        // 총 층수 (브로커 수동)
  building_age_years?: number;       // 건물 연식 (브로커 수동)

  // ── 층별 임대 데이터 ──
  floor_leases?: FloorLeaseInput[];

  // ── 추가 금액 정보 ──
  total_deposit_manwon?: number;    // 보증금 합계 (만원)
  mgmt_fee_total_manwon?: number;   // 관리비 합계 (만원)
  loan_amount_manwon?: number;      // 융자(채권최고액) (만원)
  opex_total_krw?: number;          // 연간 실측 운영비 (원)
  loan_bank?: string;               // 융자 은행
  asking_price_manwon?: number;     // 매매가 (만원)
  monthly_revenue_manwon?: number;

  /** 비임대 부가수입 항목 */
  ancillary_incomes?: AncillaryIncomeItem[];

  hospitalitySpec?: HospitalitySpec;
  developmentSpec?: DevelopmentSpec;
  vacateSpec?: VacateSpec;
  permitSpec?: PermitSpec;
  occupancySpec?: OccupancySpec;
  sectionalSpec?: SectionalSpec;
  residentialSpec?: ResidentialSpec;

  // ── v0.4: posture / archetype ──
  /** 투자 관점 (5 posture) */
  investmentPosture?: InvestmentPosture;
  /** 중개인 아키타입 오버라이드 */
  archetype_override?: ArchetypeCode;

  // ── 물류센터 전용 필드 ──
  logistics?: {
    ceiling_height_m?: number;           // 천장고 (m)
    dock_count?: number;                 // 도크(접안구) 수
    dock_leveler_count?: number;         // 도크 레벨러 수
    max_vehicle_ton?: number;            // 접안 가능 최대 차량 (톤)
    floor_load_ton_m2?: number;          // 바닥 하중 (톤/㎡)
    cold_storage_area_pyeong?: number;   // 냉동/냉장 면적 (평)
    cold_storage_type?: 'frozen' | 'chilled' | 'both' | 'none';
    loading_area_pyeong?: number;        // 하역장 면적 (평)
    vehicle_access_type?: 'ramp' | 'dock' | 'both';    // 차량 접근 방식
    fire_rating?: string;                // 내화등급
    sprinkler?: boolean;                 // 스프링클러 유무
    column_span_m?: string;              // 기둥 간격 (예: "10x12")
    power_capacity_kw?: number;          // 전기 용량 (kW)
    has_office_space?: boolean;          // 사무공간 유무
    office_area_pyeong?: number;         // 사무공간 면적 (평)
    distance_to_ic_km?: number;          // 최근접 IC 거리 (km)
    ic_name?: string;                    // IC명
  };

  /** Pro IM용 브로커 직접입력 유사 건물 실거래가 */
  manual_comps?: ManualComparableInput[];
}

/** 브로커가 직접 입력한 유사 건물 실거래가 */
export interface ManualComparableInput {
  address: string;           // "서교동 395-12"
  dealAmount: number;        // 거래금액 (만원 단위)
  area: number;              // 연면적 (㎡)
  dealYear: number;          // 거래년도
  dealMonth: number;         // 거래월
  buildingUse?: string;      // "근린생활시설" 등
  floors?: number;           // 층수
  memo?: string;             // 비고
}

export interface MobileIMSection {
  section_type: MobileIMSectionType;
  section_order: number;
  title: string;
  markdown: string;
  confidence: "confirmed" | "inferred" | "needs_check";
  boundary_note: string;
  provenance?: DataPointProvenance[];
  judge_score?: number;
  min_tier?: 'public' | 'premium' | 'grade_a';
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
    // 총괄표제부 데이터
    archArea?: number;          // 건축면적
    elevatorCount?: number;     // 승강기 수 (승용+비상)
    parkingCount?: number;      // 주차 대수 (옥내+옥외)
    heatMethod?: string;        // 난방 방식
    _isFallback?: boolean;
  } | null;
  landPrice?: { pricePerSqm?: number; baseYear?: string; _isFallback?: boolean } | null;
  landUsePlan?: {
    zoningDistrict?: string; zoningOverlap?: string[];
    buildingCoverageMax?: number; floorAreaRatioMax?: number;
    _isFallback?: boolean;
  } | null;
  comparableTransactions?: Array<{
    pricePerPyeong: number; address: string; dealYear: number;
    dealMonth: number; area: number;
  }>;
  locationPoi?: {
    nearestStation?: { name: string; distanceM: number; walkMinutes: number } | null;
    poiCounts?: { subway: number; busStop: number; cafe: number; parking: number; restaurant: number; convenience: number };
    _isFallback?: boolean;
  } | null;
  enrichedAt?: string;
  errors?: { api: string; message: string }[];
  /** 카카오 Static Map 이미지 URL */
  mapImageUrl?: string | null;
  /** 등기정보광장 API 결과 */
  registryData?: import('../../../lib/external/registry-api').RegistryData | null;
  /** 상권 분석 API (SEMAS) 결과 */
  commercialDistrict?: import('../../../lib/external/semas-commercial-api').CommercialDistrictAnalysis | null;
}

/** Hero Card: 핵심 투자 지표 요약 (IM 상단 표시용) */
export interface HeroCardData {
  assetType: string;
  areaSignal: string;
  askingPriceDisplay: string;   // e.g. "120억 원"
  capRateBase: number | null;   // % (e.g. 4.2)
  noiBaseBil: number | null;    // 억원
  keyInvestmentPoint: string;   // 핵심 투자 포인트 1줄
  keyPoints?: string[];         // 3대 핵심 투자 포인트 불릿 목록
  keyRisk: string;              // 핵심 리스크 1줄
  equityRequiredBil: number | null; // 자기자본 소요 (억원)
  leveragedYieldPct: number | null; // 레버리지 수익률 (%)
  readinessScore: number;       // SSoT 완성도 (0-100)
  dcf10YearNpvBil: number | null; // 10년 DCF NPV (억원)
  posture?: string;
  landAreaM2?: number | null;
  totalGrossAreaM2?: number | null;
  zoning?: string | null;
  // ── development 전용 ──
  /** 토지 평당가 (만원/평) */
  landPricePerPyeong?: number | null;
  /** 용적률 여유 (%) — 법정 상한 대비 현재 사용 비율 */
  farHeadroom?: number | null;
  /** 예상 개발이익률 (%) */
  devProfitMarginPct?: number | null;
  // ── operating 전용 ──
  /** 객단가/ADR (만원) */
  adr?: number | null;
  /** 가동률/OCC (%) */
  occPct?: number | null;
  /** RevPAR (만원) */
  revpar?: number | null;
  /** GOP 마진 (%) */
  gopMarginPct?: number | null;
  // ── owner_occupied 전용 ──
  /** 임차 대비 자가소유 연 절감액 (억원) */
  ownVsLeaseSavingsBil?: number | null;
  /** 손익분기 기간 (년) */
  breakevenYears?: number | null;
  // ── trading 전용 ──
  /** 평당 매매가 (만원/평) */
  pricePerPyeong?: number | null;
  /** 시세 대비 할인율 (%) */
  marketDiscountPct?: number | null;
  /** 목표 보유기간 수익률 HPR (%) */
  targetHprPct?: number | null;
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

/** Mobile IM Writer 입력 (writer.ts에서 이동 — 순환 참조 방지) */
export interface MobileIMWriterInput {
  building_ssot_lite: BuildingSSoTLite;
  /** v0.4: 3축 자산 식별 */
  identity?: AssetIdentity;
  supplemental: MobileIMSupplementalInput;
  readiness: { score: number; missing: string[] };
  external_data?: ExternalDataSnapshot | null;
  onProgress?: (section: MobileIMSection) => void;
  dcfEligible?: boolean;
  /** 데이터 품질 등급 (A/B/C/D) — handler에서 전달 */
  dataGrade?: 'A' | 'B' | 'C' | 'D';
}

/** Mobile IM Writer 출력 */
export interface MobileIMWriterOutput {
  sections: MobileIMSection[];
  boundary_note: string;
  generated_at: string;
  ai_used: boolean;
  heroCard?: HeroCardData;
  photos?: Array<{ url: string; caption?: string; width?: number; height?: number }>;
  dcf10Year?: Record<string, unknown>;
  financials?: {
    equityRequired: number | null;
    totalDepositBil: number | null;
    loanAmountBil: number | null;
    leveragedYield: number | null;
    wacc: number | null;
  };
  /** Publish gate 차단 여부 */
  publishBlocked?: boolean;
  /** 차단 사유 목록 */
  publishBlockReasons?: string[];
}
