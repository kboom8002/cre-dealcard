/**
 * @module DataGradeEngine
 * @description Computes asset data grade (A, B, C, D) based on ontology slot coverage and provenance.
 * Grade A is required for DCF sensitivity matrix eligibility (Rule S0-T6).
 * @see SDD §6 S1-T7
 */

import { getGradeWeights, type AssetType } from '../building/asset-ontology';
import { isFeatureEnabled } from '../building/feature-flags';
import { lintProvenance } from '../building/provenance-lint';
import { gradeProfile, effectiveWeights, type InvestmentPosture, type AssetType as OntologyAssetType } from '@/domain/ontology';

// E-4: L×P 2축 등급 해상도
export type PropertyResolution = 'P0' | 'P1' | 'P2' | 'P3';
export type LeadResolution = 'R0' | 'R1' | 'R2' | 'R3';

// P축 공통 슬롯 (전 포스처 공통 — 물건 해상도)
const P_AXIS_SLOTS = ['land_parcel', 'building_basic', 'zoning', 'road_access', 'title_encumbrance'];

// L축 슬롯 (포스처별 — 리드 해상도)
const L_AXIS_SLOTS: Record<string, string[]> = {
  income: ['lease_roll', 'financial_input'],
  operating: ['operating_performance', 'hospitality_spec', 'financial_input'],
  development: ['development_plan', 'vacate_plan', 'permit_risk'],
  owner_occupied: ['occupancy_plan', 'physical_spec'],
  trading: ['market_comp', 'holding_history'],
};

// D29 M-1: 속성 키 → 슬롯 그룹 매핑
// 실제 attrs 키를 L/P 슬롯 그룹명으로 매핑하여 해상도 산출
const ATTR_TO_SLOT: Record<string, string> = {
  // P축 매핑
  pnu: 'land_parcel', landAreaPyung: 'land_parcel',
  totalFloorAreaPyung: 'building_basic', buildingAge: 'building_basic', approvalDate: 'building_basic',
  zoningRegion: 'zoning', farHeadroomPp: 'zoning',
  roadContactType: 'road_access',
  titleEncumbrance: 'title_encumbrance',
  // L축 매핑 — income
  leaseUnits: 'lease_roll', rentRoll: 'lease_roll',
  grossAnnualIncomeKrw: 'financial_input', loanAmountKrw: 'financial_input', askingPriceKrw: 'financial_input',
  // L축 매핑 — operating
  gopMarginPct: 'pack', adr: 'pack', occRate: 'pack', revpar: 'pack',
  hospitalitySpec: 'hospitality_spec',
  // L축 매핑 — development
  developmentPlan: 'development_plan', vacatePlan: 'vacate_plan', permitRisk: 'permit_risk',
  // L축 매핑 — owner_occupied
  occupancyPlan: 'occupancy_plan', physicalSpec: 'physical_spec',
  // L축 매핑 — trading
  marketCompPerPyung: 'market_comp', holdingHistory: 'holding_history',
  // 추가 공통
  officialLandPricePerSqm: 'land_parcel', evictionStatus: 'land_parcel',
  address: 'land_parcel',
};

/**
 * Data grade for an asset based on slot coverage.
 * A is highest, D is lowest.
 */
export type DataGrade = 'A' | 'B' | 'C' | 'D';

export interface NextStep {
  slot: string;
  slotLabel: string;
  unlocks: string[];
  gradeAfter: DataGrade;
  axis: 'L' | 'P';
  effortMinutes: number;
}

export interface GradeAdvice {
  current: { score: number; grade: DataGrade };
  nextGrade: DataGrade;
  actions: Array<{
    slotGroup: string;
    label: string;
    scoreGain: number;
    effortMinutes: number;
    unlocks: string[];
  }>;
}

/**
 * Result of the data grade computation.
 */
export interface DataGradeResult {
  /** Computed overall data grade */
  grade: DataGrade;
  /** Overall score percentage */
  scorePct: number;
  /** Coverage percentage of required slots */
  requiredCoveragePct: number;
  /** Coverage percentage of enhanced slots */
  enhancedCoveragePct: number;
  /** List of missing required slots */
  missingRequiredSlots: string[];
  /** List of missing enhanced slots */
  missingEnhancedSlots: string[];
  /** Whether the asset is eligible for DCF analysis (requires Grade A) */
  dcfEligible: boolean;
  /** Top 3 effort-efficient actions */
  advice: GradeAdvice;
  /** S5-1: 다음 한 단계 단일 추천 (One-Step Guidance) */
  nextStep?: NextStep | null;
  /** 잠긴 지표 및 누락 슬롯 목록 */
  lockedMetrics?: Array<{ key: string; missing: string[] }>;
  /** Gate: D < 40 blocks publish */
  blockPublish?: boolean;
  /** Gate: C 40-65 suppresses total return */
  suppressTotalReturn?: boolean;
  /** Gate: B 65-85 suppresses DCF */
  suppressDcf?: boolean;
  // E-4: 2축 등급 필드
  L?: LeadResolution;
  P?: PropertyResolution;
  lFillRate?: number;
  pFillRate?: number;
}

/**
 * Returns required slots dynamically based on posture.
 */
function getRequiredSlots(posture?: string): string[] {
  const baseSlots = ['pnu', 'address', 'landAreaPyung', 'totalFloorAreaPyung', 'askingPriceKrw', 'zoningRegion'];
  if (posture === 'income') return [...baseSlots, 'grossAnnualIncomeKrw'];
  if (posture === 'development') return [...baseSlots, 'farPct'];
  return baseSlots;
}

/**
 * List of enhanced slots for higher data grades.
 */
const ENHANCED_SLOTS = [
  'approvalDate',
  'farHeadroomPp',
  'evictionStatus',
  'rentRoll',
  'officialLandPricePerSqm',
  'roadContactType',
  'parkingCapacity',
];

// D29 M-4: Pack 등급 기여 추가 (운영형 GOP/ADR/OCC 기여)
const NEW_WEIGHTS: Record<string, number> = {
  lease_roll: 25,
  building_basic: 15,
  land_parcel: 15,
  financial_input: 15,
  zoning: 10,
  title_encumbrance: 10,
  road_access: 5,
  market_comp: 5,
  pack: 10,        // D29 M-4: 운영형 실적 Pack (GOP, ADR, OCC 등)
};

// D30 M-1: 정본 출처 계수 (ONTOLOGY_V0.5_SPEC §6.2)
// D30 M-2: derived는 고정값 아닌 최약 고리 승계 (C21·C22 준수)
// D30 M-3: ai_inferred 제거 (assumed와 중복 — D27 개명 지시)
const PROVENANCE_COEFF: Record<string, number> = {
  registry: 1.0,
  public_api: 0.95,
  broker_aug: 0.80,    // D30 M-1: 0.90 → 0.80 (정본)
  expert: 0.95,        // D30 M-1: 0.90 → 0.95 (정본)
  ledger: 0.70,        // D30 M-1: 0.90 → 0.70 (정본)
  seller: 0.65,
  broker: 0.60,
  // derived: 최약 고리 승계 — getDerivedCoeff() 사용 (D30 M-2)
  assumed: 0.30,
  // 레거시 호환
  public_data: 1.0,
  expert_verified: 0.95,
  seller_declared: 0.65,
  broker_input: 0.60,
};

/**
 * D30 M-2: derived 출처 계수 — 입력 출처 중 최약 고리를 승계
 * 자기 신뢰도 없음 (C21·C22 준수)
 * @param inputProvenances 파생 계산에 사용된 입력 출처들
 */
export function getDerivedCoeff(inputProvenances: string[]): number {
  if (inputProvenances.length === 0) return 0.30; // 입력 없으면 assumed 수준
  const coeffs = inputProvenances.map(p => PROVENANCE_COEFF[p] ?? 0.30);
  return Math.min(...coeffs);
}

/** E-4: P축 해상도 산정 */
export function resolveP(filled: Record<string, boolean>): PropertyResolution {
  const count = P_AXIS_SLOTS.filter(s => filled[s]).length;
  const rate = count / P_AXIS_SLOTS.length;
  if (rate >= 0.8) return 'P3';
  if (rate >= 0.6) return 'P2';
  if (rate >= 0.3) return 'P1';
  return 'P0';
}

/** E-4: L축 해상도 산정 */
export function resolveL(filled: Record<string, boolean>, posture: string): LeadResolution {
  const slots = L_AXIS_SLOTS[posture] ?? L_AXIS_SLOTS['income'];
  const count = slots.filter(s => filled[s]).length;
  const rate = count / slots.length;
  if (rate >= 0.8) return 'R3';
  if (rate >= 0.5) return 'R2';
  if (rate >= 0.2) return 'R1';
  return 'R0';
}

/** E-4: L×P 등급 매트릭스 */
export function gradeMatrix(l: LeadResolution, p: PropertyResolution): DataGrade {
  if (l === 'R0' || p === 'P0') return 'D';
  if (l >= 'R2' && p >= 'P2') return 'A';
  if (l >= 'R1' && p >= 'P2') return 'B';
  if (l >= 'R1' && p === 'P1') return 'C';
  return 'D';
}

/**
 * Computes the data grade for an asset based on provided attributes.
 * 
 * @param attrsOrSlots - Key-value map of asset attributes or slots with filled/provenance
 * @param identityOrProvenance - Optional map of attribute provenances or identity object
 * @returns Data grade result containing the grade and missing slots
 * @see SDD §6 S1-T7
 */
export function computeDataGrade(
  attrsOrSlots: Record<string, any>,
  identityOrProvenance?: any,
  legacyAssetType?: AssetType
): DataGradeResult {
  let attrs: Record<string, any> = {};
  let identity: { assetType?: string; investmentPosture?: string } | undefined;
  let provenanceMap: Record<string, { tier: string }> | undefined;
  let assetType: AssetType | undefined = legacyAssetType;

  // Determine if arg1 is slots or attrs
  const isSlots = Object.values(attrsOrSlots).some(v => v && typeof v === 'object' && 'filled' in v);
  if (isSlots) {
    for (const [k, v] of Object.entries(attrsOrSlots)) {
      attrs[k] = v.filled ? 'filled' : '';
    }
  } else {
    attrs = attrsOrSlots;
  }

  // Determine arg2
  if (identityOrProvenance) {
    if ('assetType' in identityOrProvenance || 'investmentPosture' in identityOrProvenance) {
      identity = identityOrProvenance;
      assetType = identity?.assetType as AssetType;
    } else {
      provenanceMap = identityOrProvenance;
    }
  }

  let weights = (assetType && isFeatureEnabled('ff_s1_ontology_loader')) ? getGradeWeights(assetType) : null;
  
  if (identity && identity.assetType && identity.investmentPosture) {
    const profile = gradeProfile(identity.assetType as OntologyAssetType, identity.investmentPosture as InvestmentPosture);
    const notApplicableGroups: string[] = [];
    weights = effectiveWeights(profile, notApplicableGroups);
  }

  // v3: Run provenance lint (S1-T4)
  if (provenanceMap) {
    const lintResult = lintProvenance(attrs, provenanceMap);
    if (lintResult.overallHealth === 'major_conflicts') {
      console.warn('[grade-engine] Major provenance conflicts detected:', lintResult.conflicts.length);
    }
  }

  const missingRequired: string[] = [];
  let requiredCount = 0;
  let requiredWeightSum = 0;
  let totalRequiredWeight = 0;

  const reqSlots = getRequiredSlots(identity?.investmentPosture);
  for (const slot of reqSlots) {
    const w = weights ? (weights[slot] ?? 1) : 1;
    totalRequiredWeight += w;
    if (attrs[slot] != null && attrs[slot] !== '') {
      requiredCount++;
      requiredWeightSum += w;
    } else {
      missingRequired.push(slot);
    }
  }

  const missingEnhanced: string[] = [];
  let enhancedCount = 0;
  let enhancedWeightSum = 0;
  let totalEnhancedWeight = 0;

  for (const slot of ENHANCED_SLOTS) {
    const w = weights ? (weights[slot] ?? 1) : 1;
    totalEnhancedWeight += w;
    if (attrs[slot] != null && attrs[slot] !== '') {
      enhancedCount++;
      enhancedWeightSum += w;
    } else {
      missingEnhanced.push(slot);
    }
  }

  const requiredCoveragePct = weights 
    ? Math.round((requiredWeightSum / totalRequiredWeight) * 100) 
    : Math.round((requiredCount / reqSlots.length) * 100);
  const enhancedCoveragePct = weights 
    ? Math.round((enhancedWeightSum / totalEnhancedWeight) * 100) 
    : Math.round((enhancedCount / ENHANCED_SLOTS.length) * 100);

  // Use new weights for scorePct
  let totalNewWeight = 0;
  let earnedNewWeight = 0;
  const missingCategories: Array<{category: string, weight: number}> = [];

  const baseWeights = weights || NEW_WEIGHTS;

  // 슬롯 중복 제거: 각 슬롯은 주 카테고리에만 배정
  const CATEGORY_SLOTS: Record<string, string[]> = {
    lease_roll: ['rentRoll', 'grossAnnualIncomeKrw'],
    building_basic: ['totalFloorAreaPyung', 'approvalDate', 'evictionStatus'],
    land_parcel: ['pnu', 'address', 'landAreaPyung', 'officialLandPricePerSqm'],
    financial_input: ['askingPriceKrw', 'loanAmountKrw'],
    zoning: ['zoningRegion', 'farHeadroomPp'],
    title_encumbrance: ['titleEncumbrance'],
    road_access: ['roadContactType'],
    market_comp: ['marketCompPerPyung']
  };

  // D30 M-12: not_applicable — 포스처별 해당 없는 카테고리를 분모에서 제외
  // 운영형은 렌트롤(25점)이 구조적으로 불필요 → 분모에서 빠져야 A등급 도달 가능
  const NOT_APPLICABLE: Record<string, string[]> = {
    operating: ['lease_roll'],        // 운영형: 렌트롤 없음 (GOP/OCC로 대체)
    owner_occupied: ['lease_roll'],   // 사옥형: 자가사용이므로 렌트롤 불필요
    trading: ['lease_roll'],          // 매매형: 임대차보다 시세·출구가 중심
  };
  const posture = identity?.investmentPosture ?? '';
  const excludedCategories = NOT_APPLICABLE[posture] ?? [];

  for (const [category, w] of Object.entries(baseWeights)) {
    // D30 M-12: not_applicable 카테고리는 분모(totalNewWeight)에서 제외
    if (excludedCategories.includes(category)) continue;
    totalNewWeight += w;
    const directData = isSlots ? (attrsOrSlots[category]?.filled) : (attrs[category] != null && attrs[category] !== '' && attrs[category] !== false);
    
    if (directData) {
      let provCoeff = 1.0;
      if (isSlots && attrsOrSlots[category]?.provenance) {
        const prov = attrsOrSlots[category].provenance;
        // D30 M-2: derived는 최약 고리 승계, M-3: ai_inferred→assumed 호환
        if (prov === 'derived') {
          provCoeff = getDerivedCoeff([]); // 입력 출처 미지정 시 assumed 수준
        } else if (prov === 'ai_inferred') {
          provCoeff = PROVENANCE_COEFF['assumed'] ?? 0.30;
        } else {
          provCoeff = PROVENANCE_COEFF[prov] ?? 1.0;
        }
      }
      earnedNewWeight += (w * provCoeff);
    } else if (CATEGORY_SLOTS[category]) {
      // 비례 점수: 카테고리 내 채워진 슬롯 비율 × 가중치
      const slots = CATEGORY_SLOTS[category];
      const filledCount = slots.filter(slot => attrs[slot] != null && attrs[slot] !== '' && attrs[slot] !== false).length;
      const ratio = filledCount / slots.length;
      earnedNewWeight += (w * ratio);
      if (ratio === 0) {
        missingCategories.push({ category, weight: w });
      }
    } else {
      missingCategories.push({ category, weight: w });
    }
  }

  const scorePct = totalNewWeight > 0 ? Math.round((earnedNewWeight / totalNewWeight) * 100) : 0;

  // D29 M-1: L×P 매트릭스 기반 등급 산정 (ONTOLOGY_V0.5_SPEC §6.3)
  // D29 M-2: L축 = Lease Resolution (R0~R3), P축 = Property Resolution (P0~P3)
  const lpPosture = identity?.investmentPosture || 'income';
  const isIncomePosture = lpPosture === 'income' || lpPosture === 'operating';
  const hasStructuredRentRoll =
    (Array.isArray(attrs.leaseUnits) && attrs.leaseUnits.length > 0) ||
    (Array.isArray(attrs.rentRoll) && attrs.rentRoll.length > 0);

  // D29 M-1: 속성 키 → 슬롯 그룹으로 변환하여 L×P 해상도 산출
  const filledMap: Record<string, boolean> = {};
  for (const key of Object.keys(attrs)) {
    const val = attrs[key];
    const isFilled = val !== undefined && val !== null && val !== '' &&
      !(Array.isArray(val) && val.length === 0);
    if (isFilled) {
      // 슬롯 그룹으로 매핑 (매핑 없으면 키 그대로 사용)
      const slotGroup = ATTR_TO_SLOT[key] ?? key;
      filledMap[slotGroup] = true;
    }
  }

  // L×P 해상도 산출
  const pAxis = resolveP(filledMap);
  const lAxis = resolveL(filledMap, posture);
  let grade: DataGrade = gradeMatrix(lAxis, pAxis);

  // income/operating 포스처: 렌트롤 미제출 시 A등급 승격 차단
  if (grade === 'A' && isIncomePosture && !hasStructuredRentRoll) {
    grade = 'B';
  }

  // Next grade logic
  let nextGrade: DataGrade = 'A';
  if (grade === 'A') nextGrade = 'A';
  else if (grade === 'B') nextGrade = 'A';
  else if (grade === 'C') nextGrade = 'B';
  else nextGrade = 'C';

  // S5-1: 단일 다음 단계 (NextStep) 산출
  let nextStep: NextStep | null = null;
  const lockedMetrics: Array<{ key: string; missing: string[] }> = [];

  const slotUnlocksMap: Record<string, { label: string; unlocks: string[]; axis: 'L' | 'P'; effort: number }> = {
    lease_roll: { label: '임대차 원장/월세', unlocks: ['연 수익률(Cap Rate, 기준: NOI)', '공실률'], axis: 'L', effort: 5 },
    financial_input: { label: '매각 희망가/대출', unlocks: ['실투자금', '자기자본수익률', '총취득원가'], axis: 'L', effort: 3 },
    building_basic: { label: '건물 연면적/준공일', unlocks: ['평당 매매가', '건물 스펙 분석'], axis: 'P', effort: 3 },
    land_parcel: { label: '토지 대장/공시지가', unlocks: ['대지가치 비중', '원금 안전판'], axis: 'P', effort: 2 },
    zoning: { label: '용도지역/용적률 여유', unlocks: ['개발 여력', '용적률 분석'], axis: 'P', effort: 2 },
    operating_performance: { label: '운영 실적/매출', unlocks: ['실질 영업이익 (GOP)', 'RevPAR'], axis: 'L', effort: 5 },
    occupancy_plan: { label: '사옥 사용 계획', unlocks: ['임차료 절감액', '손익분기 기간'], axis: 'L', effort: 5 },
    vacate_plan: { label: '명도 계획', unlocks: ['명도 타임라인', '사업수지'], axis: 'L', effort: 10 },
    market_comp: { label: '인근 비교사례', unlocks: ['시세 대비 갭 분석', '목표 시세차익'], axis: 'L', effort: 5 },
  };

  if (grade !== 'A') {
    const targetGrade: DataGrade = grade === 'C' ? 'B' : 'A';
    // F-4: 풀 재시뮬레이션 — 모든 미충족 카테고리에 대해 채움 시뮬레이션
    const candidates: Array<NextStep & { roi: number }> = [];
    for (const item of missingCategories) {
      const meta = slotUnlocksMap[item.category];
      if (meta) {
        // 해당 슬롯을 채웠을 때의 점수 시뮬레이션
        const simulatedEarned = earnedNewWeight + item.weight;
        const simulatedPct = totalNewWeight > 0 ? Math.round((simulatedEarned / totalNewWeight) * 100) : 0;
        let simulatedGrade: DataGrade = 'C';
        if (simulatedPct >= 75) simulatedGrade = 'A';
        else if (simulatedPct >= 40) simulatedGrade = 'B';
        
        const scoreGain = simulatedPct - scorePct;
        const roi = scoreGain / Math.max(1, meta.effort);

        candidates.push({
          slot: item.category,
          slotLabel: meta.label,
          unlocks: meta.unlocks,
          gradeAfter: simulatedGrade >= targetGrade ? targetGrade : simulatedGrade,
          axis: meta.axis,
          effortMinutes: meta.effort,
          roi,
        });
      }
    }
    // ROI 최적 항목 선택
    candidates.sort((a, b) => b.roi - a.roi);
    if (candidates.length > 0) {
      const { roi: _, ...best } = candidates[0];
      nextStep = best;
    }
  }

  // 잠긴 지표 기록
  for (const item of missingCategories) {
    const meta = slotUnlocksMap[item.category];
    if (meta) {
      for (const unlocked of meta.unlocks) {
        lockedMetrics.push({
          key: unlocked,
          missing: [meta.label],
        });
      }
    }
  }

  // Compute actions for GradeAdvice
  const actions = missingCategories
    .map(c => ({
      slotGroup: c.category,
      label: `Provide data for ${c.category}`,
      scoreGain: c.weight,
      effortMinutes: 5,
      unlocks: [],
    }))
    .sort((a, b) => (b.scoreGain / b.effortMinutes) - (a.scoreGain / a.effortMinutes))
    .slice(0, 3);

  const adviceObj: GradeAdvice = {
    current: { score: scorePct, grade },
    nextGrade,
    actions,
  };

  // D29 M-1: L×P 매트릭스 활성화 — D등급 발행 차단
  const blockPublish = grade === 'D';
  const suppressTotalReturn = grade === 'C' || grade === 'D';
  const suppressDcf = grade !== 'A';

  return {
    grade,
    scorePct,
    requiredCoveragePct,
    enhancedCoveragePct,
    missingRequiredSlots: missingRequired,
    missingEnhancedSlots: missingEnhanced,
    dcfEligible: grade === 'A',
    advice: adviceObj,
    nextStep,
    lockedMetrics,
    blockPublish,
    suppressTotalReturn,
    suppressDcf,
    // D29 M-1: L×P 축 정보 추가
    L: lAxis,
    P: pAxis,
    lFillRate: (() => {
      const slots = L_AXIS_SLOTS[posture] ?? L_AXIS_SLOTS['income'];
      return slots.length > 0 ? slots.filter(s => filledMap[s]).length / slots.length : 0;
    })(),
    pFillRate: P_AXIS_SLOTS.length > 0 ? P_AXIS_SLOTS.filter(s => filledMap[s]).length / P_AXIS_SLOTS.length : 0,
  };
}

export function computeGradeAdvice(unfilledSlots: Array<{key: string, weight: number}>) {
  // Sort unfilled slots by weight descending, return top 3
  const advice = unfilledSlots
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(slot => ({
      slotKey: slot.key,
      scoreGain: slot.weight * 100,
      effortMinutes: slot.key.includes('lease') ? 30 : slot.key.includes('photo') ? 10 : 15,
      action: `'${slot.key}' 데이터를 입력하면 등급이 약 ${(slot.weight * 100).toFixed(0)}점 상승합니다.`,
    }));
  return advice;
}
