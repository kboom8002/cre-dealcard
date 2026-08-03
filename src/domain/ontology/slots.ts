/**
 * slots.ts — 온톨로지 v0.2 슬롯 카탈로그
 * Spec: ONTOLOGY_V0.2_SPEC.md §2
 * 
 * v0.1의 70 표준 슬롯에서 v0.2의 122 슬롯으로 확장.
 * 핵심 변경: 스칼라 → 배열 (parcels[], buildings[])
 * 필지가 1개여도 배열입니다.
 */

import type { ProvenanceTier } from './provenance';
import type { Parcel, BuildingUnit } from './rules/parcel';

// ── 슬롯 정의 ────────────────────────────────────────────────────

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
  | 'derived';       // 계산 파생

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
  /** 배열화된 슬롯 여부 */
  isArrayified?: boolean;
  /** enum 계열명 (type='enum'일 때) */
  enumFamily?: string;
}

// ── v0.2 확장 슬롯 카탈로그 ──────────────────────────────────────

export const SLOT_CATALOG: SlotDefinition[] = [
  // ── Identity (5) ──
  { key: 'address', label: '주소', type: 'string', category: 'identity', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'pnu', label: 'PNU', type: 'string', category: 'identity', required: false, source: '토지이용계획', defaultProvenance: 'public' },
  { key: 'region', label: '권역', type: 'string', category: 'identity', required: true, source: '행정구역', defaultProvenance: 'public' },
  { key: 'submarket', label: '상권', type: 'string', category: 'identity', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'assetType', label: '자산유형', type: 'enum', category: 'identity', required: true, source: 'broker', defaultProvenance: 'broker' },

  // ── Land (Parcels — v0.2 배열화) (12) ──
  { key: 'parcels', label: '필지 목록', type: 'array', category: 'land', required: true, source: '토지대장', defaultProvenance: 'public', isArrayified: true, isNew: true },
  { key: 'effectiveLandAreaM2', label: '유효 대지면적(㎡)', type: 'number', category: 'land', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'jimok', label: '지목', type: 'enum', category: 'land', required: false, source: '토지대장', defaultProvenance: 'public', enumFamily: 'jimok', isNew: true },
  { key: 'useArea', label: '용도지역', type: 'enum', category: 'zoning', required: true, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_area', isNew: true },
  { key: 'useDistricts', label: '용도지구', type: 'array', category: 'zoning', required: false, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_district', isNew: true },
  { key: 'useZones', label: '용도구역', type: 'array', category: 'zoning', required: false, source: '토지이용계획', defaultProvenance: 'public', enumFamily: 'use_zone', isNew: true },
  { key: 'officialLandPrice', label: '공시지가(원/㎡)', type: 'number', category: 'land', required: false, source: '공시지가', defaultProvenance: 'public', isNew: true },
  { key: 'landExclusions', label: '제척 사유', type: 'array', category: 'land', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'exclusionImpactRatio', label: '제척 영향도', type: 'number', category: 'land', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'landOwnershipRatio', label: '지분율', type: 'number', category: 'land', required: false, source: '등기부', defaultProvenance: 'public', isNew: true },
  { key: 'landShape', label: '토지 형상', type: 'string', category: 'land', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'roadContactType', label: '도로 접면', type: 'string', category: 'land', required: false, source: '토지대장', defaultProvenance: 'public' },

  // ── Building (v0.2 배열화) (15) ──
  { key: 'buildings', label: '건축물 목록', type: 'array', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public', isArrayified: true, isNew: true },
  { key: 'totalFloorAreaM2', label: '연면적(㎡)', type: 'number', category: 'building', required: true, source: '건축물대장', defaultProvenance: 'public' },
  { key: 'totalFloorAreaPyung', label: '연면적(평)', type: 'number', category: 'building', required: true, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'farCountedAreaM2', label: '용적률 산정 연면적(㎡)', type: 'number', category: 'building', required: false, source: '건축물대장', defaultProvenance: 'public', isNew: true },
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

  // ── Lease (18) ──
  { key: 'leaseUnits', label: '임대차 단위', type: 'array', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'grossAnnualIncomeKrw', label: '연간 총수입(원)', type: 'number', category: 'financial', required: true, source: 'broker', defaultProvenance: 'broker' },
  { key: 'monthlyRentKrw', label: '월 임대료(원)', type: 'number', category: 'financial', required: true, source: 'broker', defaultProvenance: 'broker' },
  { key: 'totalDepositKrw', label: '총 보증금(원)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'vacancyRatePct', label: '공실률(%)', type: 'number', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker' },
  { key: 'handoverCondition', label: '명도 조건', type: 'enum', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'handover_condition', isNew: true },
  { key: 'mgmtFeeType', label: '관리비 유형', type: 'enum', category: 'lease', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'management_fee_type', isNew: true },
  { key: 'leaseActApplication', label: '상임법 적용 범위', type: 'enum', category: 'legal', required: false, source: 'derived', defaultProvenance: 'assumed', enumFamily: 'lease_act_application', isNew: true },

  // ── Financial (15) ──
  { key: 'askingPriceKrw', label: '매각 희망가(원)', type: 'number', category: 'financial', required: true, source: 'seller', defaultProvenance: 'seller' },
  { key: 'loanAmountKrw', label: '선순위 대출금(원)', type: 'number', category: 'financial', required: false, source: 'seller', defaultProvenance: 'seller' },
  { key: 'noiKrw', label: 'NOI(원)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'capRatePct', label: 'Cap Rate(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed' },
  { key: 'capRateBasis', label: 'Cap Rate 기준', type: 'enum', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'cap_rate_basis', isNew: true },
  { key: 'opexRatioPct', label: '운영비율(%)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'assumed' },
  { key: 'ancillaryIncomeKrw', label: '부가수입(원/연)', type: 'number', category: 'financial', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },

  // ── Acquisition Cost (v0.2 신규) (6) ──
  { key: 'acquisitionTaxKrw', label: '취득세(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'registrationTaxKrw', label: '등록면허세(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'brokerFeeKrw', label: '중개보수(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'dueDiligenceCostKrw', label: '실사비(원)', type: 'number', category: 'acquisition', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'vatRefundKrw', label: '부가세 환급(원)', type: 'number', category: 'acquisition', required: false, source: 'expert', defaultProvenance: 'expert', isNew: true },
  { key: 'totalAcquisitionCostKrw', label: '총 취득비용(원)', type: 'number', category: 'acquisition', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },

  // ── Value Growth (v0.2 신규) (5) ──
  { key: 'landValueRatio', label: '토지 비중', type: 'number', category: 'value_growth', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'landPriceScenarios', label: '지가 시나리오 3종', type: 'object', category: 'value_growth', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'totalReturnPct', label: '총수익률(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'npvKrw', label: 'NPV(원)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },
  { key: 'irrPct', label: 'IRR(%)', type: 'number', category: 'derived', required: false, source: 'derived', defaultProvenance: 'assumed', isNew: true },

  // ── Disclosure Policy (v0.2 신규) (4) ──
  { key: 'showDcf', label: 'DCF 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'showIrr', label: 'IRR 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'showSensitivity', label: '민감도 공개', type: 'boolean', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', isNew: true },
  { key: 'capRateBasisDisplay', label: 'Cap Rate 기준 노출', type: 'enum', category: 'disclosure', required: false, source: 'broker', defaultProvenance: 'broker', enumFamily: 'cap_rate_basis', isNew: true },
];

// ── 유틸리티 ────────────────────────────────────────────────────

/** 카테고리별 슬롯 조회 */
export function getSlotsByCategory(category: SlotCategory): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.category === category);
}

/** v0.2 신규 슬롯만 조회 */
export function getNewSlots(): SlotDefinition[] {
  return SLOT_CATALOG.filter(s => s.isNew);
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
export function getSlotCount(): { total: number; new: number; required: number } {
  return {
    total: SLOT_CATALOG.length,
    new: SLOT_CATALOG.filter(s => s.isNew).length,
    required: SLOT_CATALOG.filter(s => s.required).length,
  };
}

// ── v0.2 Asset 문서 타입 ─────────────────────────────────────────

export interface AssetDocV2 {
  ontologyVersion: 'v0.2.0';
  parcels: Parcel[];
  buildings: BuildingUnit[];
  slots: Record<string, unknown>;
  provenance: Record<string, ProvenanceTier>;
  dataGrade: string;
  archetypes: string[];
}

/** 발행 이력 보호를 위한 Pin 레코드 */
export interface PublishRecord {
  ontologyVersion: string;     // 'v0.1.0' or 'v0.2.0'
  engineVersion: string;
  snapshot: unknown;           // 발행 시점 IR 전문
  publishedAt: string;
}
