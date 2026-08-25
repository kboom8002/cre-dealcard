/**
 * slots.ts — 온톨로지 v0.5 슬롯 카탈로그
 * Spec: CATALOG_SLOTS.md · ONTOLOGY_V0.4_SPEC.md
 *
 * v0.2의 86 Core 슬롯 + v0.4 Pack 슬롯군8종 + v0.5 리스크·입지 슬롯 2종 = 165+ 슬롯.
 * Pack 슬롯은 pack_slots JSONB에 저장됩니다. Core 스키마를 건드리지 않습니다.
 */

import type { ProvenanceTier } from './provenance';
import type { Parcel, BuildingUnit } from './rules/parcel';
import type {
  AssetType, InvestmentPosture, BuildingUse,
  RampType, TemperatureZone, PermitKind,
  ExclusionKind, HandoverCondition, BuyerPurpose,
  VacateResponsibility,
  RiskCategory, RiskSeverityLevel, LocationCategory, FallbackStrategy,
} from './enums';

// ══════════════════════════════════════════════════════════════════════
// §1. 슬롯 정의 타입
// ══════════════════════════════════════════════════════════════════════

export type SlotType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array' | 'object';
export type SlotCategory =
  | 'identity'       // 소재지·PNU
  | 'land'           // 토지
  | 'building'       // 건축물
  | 'lease'          // 임대차
  | 'financial'      // 재무
  | 'acquisition'    // 취득비용
  | 'value_growth'   // 자산가치 변동
  | 'legal'          // 법적 지위
  | 'disclosure'     // 공시 설정
  | 'zoning'         // 용도지역·지구
  | 'road_access'    // 접면·입지
  | 'title_encumbrance' // 권리·등기
  | 'market_comp'    // 비교사례
  | 'pack'           // Pack 슬롯군
  | 'derived';       // 계산 파생

/** 슬롯 종류 (v0.4: 세는 방식 명확화) */
export type SlotKind = 'scalar' | 'array' | 'array_item';

export interface SlotDefinition {
  key: string;
  label: string;
  type: SlotType;
  category: SlotCategory;
  required: boolean;
  /** 수집 출처 */
  source: string;
  /** 기본 provenance tier */
  defaultProvenance: ProvenanceTier;
  /** v0.2 신규 여부 */
  isNew?: boolean;
  /** v0.4 신규 여부 */
  isV4New?: boolean;
  /** 배열화된 슬롯 여부 */
  isArrayified?: boolean;
  /** enum 계열명 (type='enum'일 때) */
  enumFamily?: string;
  /** 슬롯 종류 */
  kind?: SlotKind;
  /** 특정 포스처에서만 필수 여부 */
  requiredForPosture?: string[];
}

// ══════════════════════════════════════════════════════════════════════
// §2. Core 슬롯 카탈로그 (v0.2 기반 + v0.4 확장)
// ══════════════════════════════════════════════════════════════════════

export const SLOT_CATALOG: SlotDefinition[] = [
  // ── Identity (5) ──
  { key: 'address', label: '주소', type: 'string', category: 'identity', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'pnu', label: 'PNU', type: 'string', category: 'identity', required: false, source: '토지이용계획', defaultProvenance: 'public' },
  { key: 'region', label: '권역', type: 'string', category: 'identity', required: true, source: '행정구역', defaultProvenance: 'public' },
  { key: 'submarket', label: '상권', type: 'string', category: 'identity', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'assetType', label: '자산유형', type: 'enum', category: 'identity', required: true, source: 'broker', defaultProvenance: 'broker' },

  // ── Land (Parcels — v0.2 배열화) (12) ──
  { key: 'parcels', label: '필지 목록', type: 'array', category: 'land', required: true, source: '토지대장', defaultProvenance: 'public', isArrayified: true, isNew: true, kind: 'array' },
  { key: 'effectiveLandAreaM2', label: '유효 대지면적(㎡)', type: 'number', category: 'land', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'jimok', label: '지목', type: 'enum', category: 'land', required: false, source: '토지대장', defaultProvenance: 'public', enumFamily: 'jimok', isNew: true },
  { key: 'useArea', label: '용도지역', type: 'enum', category: 'zoning', required: true, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_area', isNew: true },
  { key: 'useDistricts', label: '용도지구', type: 'array', category: 'zoning', required: false, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_district', isNew: true, kind: 'array' },
  { key: 'useZones', label: '용도구역', type: 'array', category: 'zoning', required: false, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_zone', isNew: true, kind: 'array' },
  { key: 'officialLandPrice', label: '공시지가(원/㎡)', type: 'number', category: 'land', required: false, source: '공시지가', defaultProvenance: 'public', isNew: true },
  { key: 'landExclusions', label: '제척 사유', type: 'array', category: 'land', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true, kind: 'array' },
  { key: 'exclusionImpactRatio', label: '제척 영향도', type: 'number', category: 'land', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'landOwnershipRatio', label: '지분율', type: 'number', category: 'land', required: false, source: '등기부', defaultProvenance: 'public', isNew: true },
  { key: 'landShape', label: '토지 형상', type: 'string', category: 'land', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'roadContactType', label: '도로 접면', type: 'string', category: 'road_access', required: false, source: '토지대장', defaultProvenance: 'public' },

  // ── Building (v0.2 배열화 + v0.4 aboveGroundArea) (16) ──
  { key: 'buildings', label: '건축물 목록', type: 'array', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public', isArrayified: true, isNew: true, kind: 'array' },
  { key: 'totalFloorAreaM2', label: '연면적(㎡)', type: 'number', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'totalFloorAreaPyung', label: '연면적(평)', type: 'number', category: 'building', required: true, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'farCountedAreaM2', label: '용적률 산정 연면적(㎡)', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public', isNew: true },
  { key: 'aboveGroundAreaM2', label: '지상 연면적(㎡)', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public', isV4New: true },
  { key: 'farPct', label: '대장 용적률(%)', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'effectiveFARPct', label: '유효 용적률(%)', type: 'number', category: 'building', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'bcrPct', label: '건폐율(%)', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'buildYear', label: '건축년도', type: 'number', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'floorsAboveGround', label: '지상층수', type: 'number', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'floorsBelow', label: '지하층수', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'structure', label: '구조', type: 'string', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'primaryUse', label: '주용도', type: 'string', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'elevator', label: '승강기', type: 'boolean', category: 'building', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'parking', label: '주차대수', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'farHeadroomPp', label: '용적률 여유(%p)', type: 'number', category: 'building', required: false, source: 'derived', defaultProvenance: 'assumed' },

  // ── Lease (8) ──
  { key: 'leaseUnits', label: '임대차 단위', type: 'array', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker', kind: 'array' },
  { key: 'grossAnnualIncomeKrw', label: '연간 총수입(원)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', requiredForPosture: ['income'] },
  { key: 'monthlyRentKrw', label: '월 임대료(원)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', requiredForPosture: ['income', 'operating'] },
  { key: 'totalDepositKrw', label: '총 보증금(원)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'vacancyRatePct', label: '공실률(%)', type: 'number', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'handoverCondition', label: '명도 조건', type: 'enum', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'handover_condition', isNew: true },
  { key: 'mgmtFeeType', label: '관리비 유형', type: 'enum', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'management_fee_type', isNew: true },
  { key: 'leaseActApplication', label: '상임법 적용 범위', type: 'enum', category: 'legal', required: false, source: 'derived', defaultProvenance: 'assumed', enumFamily: 'lease_act_application', isNew: true },

  // ── Financial (7) ──
  { key: 'askingPriceKrw', label: '매각 희망가(원)', type: 'number', category: 'financial', required: true, source: 'seller', defaultProvenance: 'seller' },
  { key: 'loanAmountKrw', label: '선순위 대출금(원)', type: 'number', category: 'financial', required: false, source: 'seller', defaultProvenance: 'seller' },
  { key: 'noiKrw', label: 'NOI(원)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'capRatePct', label: 'Cap Rate(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'capRateBasis', label: 'Cap Rate 기준', type: 'enum', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'cap_rate_basis', isNew: true },
  { key: 'opexRatioPct', label: '운영비율(%)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'assumed' },
  { key: 'ancillaryIncomeKrw', label: '부가수입(원/연)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },

  // ── Acquisition Cost (6) ──
  { key: 'acquisitionTaxKrw', label: '취득세(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'registrationTaxKrw', label: '등록면허세(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'brokerFeeKrw', label: '중개보수(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'dueDiligenceCostKrw', label: '실사비(원)', type: 'number', category: 'acquisition', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'vatRefundKrw', label: '부가세 환급(원)', type: 'number', category: 'acquisition', required: false, source: 'expert', defaultProvenance: 'expert', isNew: true },
  { key: 'totalAcquisitionCostKrw', label: '총 취득비용(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },

  // ── Value Growth (5) ──
  { key: 'landValueRatio', label: '토지 비중', type: 'number', category: 'value_growth', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'landPriceScenarios', label: '지가 시나리오 3종', type: 'object', category: 'value_growth', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'totalReturnPct', label: '총수익률(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'npvKrw', label: 'NPV(원)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'irrPct', label: 'IRR(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },

  // ── Disclosure Policy (4) ──
  { key: 'showDcf', label: 'DCF 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'showIrr', label: 'IRR 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'showSensitivity', label: '민감도 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'capRateBasisDisplay', label: 'Cap Rate 기준 노출', type: 'enum', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'cap_rate_basis', isNew: true },

  // ── v0.5: Risk Items (1) ──
  { key: 'riskItems', label: '리스크 항목', type: 'array', category: 'legal', required: false, source: 'derived', defaultProvenance: 'assumed', isV4New: true, kind: 'array' },

  // ── v0.5: Location Aspects (1) ──
  { key: 'locationAspects', label: '입지 분석 항목', type: 'array', category: 'road_access', required: false, source: 'derived', defaultProvenance: 'assumed', isV4New: true, kind: 'array' },
];

// ══════════════════════════════════════════════════════════════════════
// §2.5 v0.5 구조화 타입 — 리스크 항목 · 입지 분석 항목
// ══════════════════════════════════════════════════════════════════════

/** 리스크 항목 (v0.5 1급 객체) */
export interface RiskItem {
  category: RiskCategory;
  title: string;
  description: string;
  severity: RiskSeverityLevel;
  /** 실사/대응 방안 (선택적) */
  mitigationAction?: string;
  /** 출처 확인 방법 */
  verificationSource?: string;
}

/** 입지 분석 항목 (v0.5 구조화 슬롯) */
export interface LocationAspectItem {
  category: LocationCategory;
  label: string;
  value: string;
  /** 세부 설명 (선택적) */
  detail?: string;
  /** 프리미엄 등급 항목 여부 */
  isPremium?: boolean;
}

/** 데이터 부재 시 폴백 메타데이터 (v0.5) */
export interface SlotFallbackMeta {
  strategy: FallbackStrategy;
  /** 안내 카드 제목 */
  title: string;
  /** 안내 카드 본문 (불릿 포함 가능) */
  body: string;
}

// ══════════════════════════════════════════════════════════════════════
// §3. Pack 슬롯군 인터페이스 (8종 — Core 스키마 건드리지 않음)
// ══════════════════════════════════════════════════════════════════════

/** 3.1 물리 스펙 (사옥 · 물류 · 공장) — CATALOG_SLOTS.md §3.1 */
export interface PhysicalSpec {
  // 공통
  standardFloorArea: number | null;    // 기준층 면적
  exclusiveRatio: number | null;       // 전용률
  ceilingHeight: number | null;        // 천장고 (m)
  parkingCount: number;
  columnSpacing: number | null;        // 기둥 간격 (m)
  // 물류 전용
  clearHeight: number | null;          // 유효 층고 (m)
  floorLoad: number | null;            // 바닥하중 (t/㎡)
  dockCount: number | null;
  dockLeveler: boolean | null;
  rampType: RampType | null;
  truckTurningRadius: number | null;
  powerCapacity: number | null;        // kW
  temperatureZone: TemperatureZone | null;
  // 사옥 전용
  namingRights: boolean | null;
  commuteAccessScore: number | null;
  floorPlanFlexibility: string | null; // 평면 유연성 설명
}

/** 3.2 개발 계획 (개발 · 대지) — CATALOG_SLOTS.md §3.2 */
export interface DevelopmentPlan {
  targetUse: string;
  scale: string;
  structure: string;
  farCountedArea: number;
  grossArea: number;
  buildingCoverage: number;
  far: number;
  parking: number;
  constructionCostPerPyeong: number;   // 원/평
  contingency: number;                 // 원
  targetDate: string;
  stackingPlan: StackingPlanUnit[];
}

export interface StackingPlanUnit {
  level: string;
  area: number;
  use: string;
  rentPerPyeong: number;
  monthlyRent: number;
  deposit: number;
  managementFee: number;
}

/** 3.2.1 한국 실정 임대차 세부 스펙 (LeaseTermsSpec) 🆕 */
export interface LeaseTermsSpec {
  depositTotal: number;                // 임대보증금 (원)
  monthlyRentTotal: number;            // 월차임 합계 (원)
  managementFeeTotal: number;          // 관리비 합계 (원)
  exclusiveAreaRatio: number;          // 전용률 (%)
  keyMoney: number | null;             // 권리금 (원)
  rentFreeMonths: number;              // 렌트프리 (개월/년)
  noc: number | null;                  // NOC (Net Occupancy Cost, 원/전용평)
  nlaArea: number | null;              // NLA (Net Leasable Area, 전용면적 평)
}

/** 3.2.2 한국 세제 · 규제 세부 스펙 (TaxRegulationSpec) 🆕 */
export interface TaxRegulationSpec {
  acquisitionTaxRate: number;         // 취득세율 (%)
  propertyTaxAnnual: number | null;    // 연간 재산세 (원)
  comprehensiveRealEstateTax: number | null; // 종합부동산세 (원)
  taxIncentives: string[];             // 세제 혜택/감면 항목 목록
  landTaxCategory: 'general' | 'separate' | 'exempt'; // 종합합산 / 별도합산 / 비과세
}

/** 3.3 명도 계획 (개발형 필수) — CATALOG_SLOTS.md §3.3 */
export interface VacatePlan {
  responsibility: VacateResponsibility;
  costIncludedInPrice: boolean;
  estimatedCost: number;               // 원
  byDifficulty: { high: number; medium: number; low: number };
  criticalUnits: VacateCriticalUnit[];
  sellerClaimedMonths: number;
  brokerJudgmentMonths: number;        // ★ 격차를 감추지 않는다
}

export interface VacateCriticalUnit {
  unit: string;
  use: string;
  renewalRightRemainingYears: number;
  keyMoneyRisk: 'high' | 'medium' | 'low';
  reason: string;
}

/** 3.4 자가 사용 계획 (사옥형) — CATALOG_SLOTS.md §3.4 */
export interface OccupancyPlan {
  headcount: number;
  areaPerHead: number;                 // 평/인
  floorAllocation: Array<{ level: string; use: string; area: number }>;
  currentLeaseCost: number | null;     // 현 임차료 — 비교 기준
  currentLeaseExpiry: string | null;
  expansionHeadroom: number | null;    // 증원 여력 (인)
}

/** 3.5 인허가 리스크 (개발 · 대지) — CATALOG_SLOTS.md §3.5 */
export interface PermitRisk {
  items: PermitRiskItem[];
  totalEstimatedMonths: number;
}

export interface PermitRiskItem {
  kind: PermitKind;
  status: 'clear' | 'check_required' | 'constraint' | 'blocking';
  note: string;
  estimatedMonths: number | null;
}

/** 3.6 주거 스펙 (다가구·다세대·오피스텔) — ONTOLOGY_V0.4_SPEC.md §5.1 🆕 */
export interface ResidentialSpec {
  unitCount: number;
  unitMix: Array<{ type: string; count: number; exclusiveArea: number }>;
  jeonseCount: number;                 // 전세 호실 수
  monthlyCount: number;                // 월세 호실 수
  jeonseDepositTotal: number;          // 원
  parkingPerUnit: number;
  separateMeter: boolean;              // 개별 계량기
  illegalExtension: boolean;           // 옥탑·베란다 확장 등 — 위반건축물 대출 제약
  totalExclusiveArea: number | null;
  avgExclusiveArea: number | null;
}

/** 3.7 구분소유 스펙 (지식산업센터·집합상가·구분등기) — ONTOLOGY_V0.4_SPEC.md §5.2 🆕 */
export interface SectionalSpec {
  isSectional: boolean;
  units: SectionalUnit[];
  ownerCount: number;
  requiresAllOwnersConsent: boolean;
  partialSaleFeasible: boolean;
  landShareSum: number;                // 1.0 검증
  managementBody: boolean;             // 관리단 존재 (지식산업센터)
  jointCollateralGroups: string[];     // 공동담보 그룹 목록
  strata: boolean;                     // 층별 용도 분리 여부
  masterLeaseExists: boolean;          // 마스터리스 존재
  vacantUnitCount: number;             // 공실 호수
}

export interface SectionalUnit {
  unitNo: string;
  level: string;
  exclusiveArea: number;
  landShareRatio: string;
  owner: string;
  mortgageMax: number | null;          // 채권최고액
  jointCollateralGroup: string | null; // 공동담보 그룹
}

/** 3.8 호스피탈리티 스펙 (호텔·생활형숙박시설) — 갭 #9 해소 🆕 */
export interface HospitalitySpec {
  totalRoomCount: number;
  roomTypes: Array<{
    type: string;
    count: number;
    avgSize: number;                   // ㎡
    rackRate: number;                  // 원/박
  }>;
  averageDailyRate: number | null;     // ADR
  occupancyRate: number | null;        // OCC
  revPar: number | null;               // RevPAR
  gopMargin: number | null;            // GOP 마진
  operatingEntity: string | null;      // 운영사
  operatingModel: 'self' | 'franchise' | 'management_contract' | 'lease' | null;
  brandAffiliation: string | null;     // 브랜드
  starRating: number | null;           // 성급
}

// ── Pack: HoldingHistory (단기매매형 L축) ── (B-1)
export type SellerMotive =
  | 'debt_pressure' | 'portfolio_rebalance' | 'estate_settlement'
  | 'business_closure' | 'relocation' | 'profit_taking' | 'other';

export interface HoldingHistory {
  acquisitionDate: string | null;       // ISO 8601
  acquisitionPriceKrw: number;
  holdingMonths: number;
  transferCountIn10Y: number;           // 10년 내 이전 횟수
  sellerMotive: SellerMotive | null;    // 7종 — 대외문서 노출 금지 (페르소나 격리)
  askingPriceHistory: Array<{
    date: string;
    priceKrw: number;
    note?: string;
  }>;
}

// ── Pack: OperatingPerformance (운영형 L축) ── (B-1)
export interface OperatingPerformance {
  unitKind: 'room' | 'bed' | 'parking' | 'tee' | 'seat' | 'other';
  unitCount: number;
  yearlyPerformance: Array<{
    year: number;
    occupancyPct: number;
    revenueKrw: number;
    gopKrw: number;
    verificationLevel: 'verified' | 'partial' | 'unverified';
    source: string;
  }>;
  licenceTransferable: boolean | null;
  operationModel: 'direct' | 'lease' | 'management' | 'franchise';
}

// ══════════════════════════════════════════════════════════════════════
// §4. 유틸리티
// ══════════════════════════════════════════════════════════════════════

/** 카테고리별 슬롯 조회 */
export function getSlotsByCategory(category: SlotCategory): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.category === category);
}

/** v0.2 신규 슬롯만 조회 */
export function getNewSlots(): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.isNew);
}

/** v0.4 신규 슬롯만 조회 */
export function getV4NewSlots(): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.isV4New);
}

/** 배열화된 슬롯 조회 */
export function getArrayifiedSlots(): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.isArrayified);
}

/** 필수 슬롯 조회 */
export function getRequiredSlots(): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.required);
}

/** 슬롯 총 수 */
export function getSlotCount(): { total: number; new: number; v4New: number; required: number } {
  return {
    total: SLOT_CATALOG.length,
    new: SLOT_CATALOG.filter(s => s.isNew).length,
    v4New: SLOT_CATALOG.filter(s => s.isV4New).length,
    required: SLOT_CATALOG.filter(s => s.required).length,
  };
}

// ══════════════════════════════════════════════════════════════════════
// §5. 자산 문서 타입 (v0.2 호환 + v0.4 신규)
// ══════════════════════════════════════════════════════════════════════

/** v0.2 호환 — 기존 코드 하위 호환 */
export interface AssetDocV2 {
  ontologyVersion: 'v0.2.0';
  parcels: Parcel[];
  buildings: BuildingUnit[];
  slots: Record<string, unknown>;
  provenance: Record<string, ProvenanceTier>;
  dataGrade: string;
  archetypes: string[];
}

/** v0.4 자산 문서 — 3축 식별자 + Pack 슬롯 */
export interface AssetDocV4 {
  ontologyVersion: 'v0.4.0';
  identity: {
    buildingUse: BuildingUse | null;
    assetType: AssetType;
    investmentPosture: InvestmentPosture;
  };
  parcels: Parcel[];
  buildings: BuildingUnit[];
  slots: Record<string, unknown>;
  packSlots: Record<string, unknown>;     // Pack JSONB
  packVersion: string | null;
  provenance: Record<string, ProvenanceTier>;
  dataGrade: string;
  archetypes: string[];
}

/** 발행 이력 보호를 위한 Pin 레코드 (v0.2~v0.4 호환) */
export interface PublishRecord {
  ontologyVersion: string;                // 'v0.2.0' | 'v0.4.0'
  /** @deprecated v0.3 호환용 — v0.4에서는 identity 사용 */
  assetClass?: string;
  /** v0.4: 3축 식별자 */
  identity?: {
    buildingUse: BuildingUse | null;
    assetType: AssetType;
    investmentPosture: InvestmentPosture;
  };
  packVersion: string | null;
  engineVersion: string;
  snapshot: unknown;                      // 발행 시점 IR 전문
  publishedAt: string;
}
