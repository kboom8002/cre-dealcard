/**
 * @file archetype-registry.ts
 * @description 아키타입(서사 유형) 레지스트리 및 자동 제안
 * 정본: CATALOG_RULES.md §1.1~§1.5
 * D29 BL-5: 정본 코드로 재배정 (OO-01→R-OWN-01, DEV-01→R-DEV-01 등)
 * D29 BL-5: R-INC-02~06 정의를 정본과 일치시킴
 * D29 BL-5: 라벨 금지어 교정 (초안정→임대 안정, 밸류애드→가치 상승 여력)
 */

// ── 수익형 R-INC (9종, 정본 §1.1) ──────────────────────────────────────
export type IncomeArchetypeCode =
  | 'R-INC-01' | 'R-INC-02' | 'R-INC-03'
  | 'R-INC-04' | 'R-INC-05' | 'R-INC-06'
  | 'R-INC-07' | 'R-INC-08' | 'R-INC-09';

// ── 사옥형 R-OWN (4종, 정본 §1.2) ──────────────────────────────────────
export type OwnerOccArchetypeCode = 'R-OWN-01' | 'R-OWN-02' | 'R-OWN-03' | 'R-OWN-04';

// ── 개발형 R-DEV (4종, 정본 §1.3) ──────────────────────────────────────
export type DevArchetypeCode = 'R-DEV-01' | 'R-DEV-02' | 'R-DEV-03' | 'R-DEV-04';

// ── 운영형 R-OPR (4종, 정본 §1.4) ──────────────────────────────────────
export type OperatingArchetypeCode = 'R-OPR-01' | 'R-OPR-02' | 'R-OPR-03' | 'R-OPR-04';

// ── 단기매매형 R-TRD (4종, 정본 §1.5) ──────────────────────────────────
export type TradingArchetypeCode = 'R-TRD-01' | 'R-TRD-02' | 'R-TRD-03' | 'R-TRD-04';

export type ArchetypeCode =
  | IncomeArchetypeCode
  | OwnerOccArchetypeCode
  | DevArchetypeCode
  | OperatingArchetypeCode
  | TradingArchetypeCode;

export interface ArchetypeDefinition {
  code: ArchetypeCode;
  label: string;
  tone: string;
  narrative: string;
  triggerConditions: string;
}

// ── 수익형 아키타입 (정본 CATALOG_RULES §1.1) ────────────────────────────
export const INCOME_ARCHETYPES: Record<IncomeArchetypeCode, ArchetypeDefinition> = {
  'R-INC-01': {
    code: 'R-INC-01',
    label: '임대 안정형',  // D29 BL-5: '초안정' → '임대 안정' (금지어 교정)
    tone: 'predictability',
    narrative: '예측 가능한 현금흐름 — WALT ≥ 3년, 공실률 ≤ 5%',
    triggerConditions: 'WALT ≥ 3년 ∧ 공실률 ≤ 5% ∧ 수익률 ≥ 권역 평균',
  },
  'R-INC-02': {
    code: 'R-INC-02',
    label: '가치 상승 여력형',  // D29 BL-5: '밸류애드' → '가치 상승 여력' + 정본 정의
    tone: 'value-add',
    narrative: '노후 건물의 유효 용적률 여유를 활용한 가치 상승',
    triggerConditions: '건물연령 ≥ 20년 ∧ 유효 용적률 여유 ≥ 50%p',
  },
  'R-INC-03': {
    code: 'R-INC-03',
    label: '개발 준비형',  // D29 BL-5: '공실 해소' → '개발 준비' (정본 재배정)
    tone: 'development-ready',
    narrative: '명도 완료 또는 임대차 0건 상태의 개발 가능 물건',
    triggerConditions: '명도 완료 ∨ 임대차 0건 ∧ 개발 가능',
  },
  'R-INC-04': {
    code: 'R-INC-04',
    label: '임대료 정상화형',  // D29 BL-5: '리모델링' → '임대료 정상화' (정본 재배정)
    tone: 'rent-normalization',
    narrative: '시세 대비 저렴한 임대료의 갱신 시 정상화 기회',
    triggerConditions: '평균 임대료 ≤ 권역 시세 × 0.85 ∧ 12개월 내 갱신 도래 ≥ 1건',
  },
  'R-INC-05': {
    code: 'R-INC-05',
    label: '공실 해소형',  // D29 BL-5: 신규 (정본 §1.1)
    tone: 'turnaround',
    narrative: '공실 해소 시 수익률 상승 시나리오',
    triggerConditions: '공실률 > 15%',
  },
  'R-INC-06': {
    code: 'R-INC-06',
    label: '리모델링형',  // D29 BL-5: 신규 (정본 §1.1)
    tone: 'renovation',
    narrative: '노후 건물 리모델링 통한 가치 재창출',
    triggerConditions: '건물연령 > 20년 ∧ 용적률 여유 < 50%p ∧ 자본 투입 여지',
  },
  'R-INC-07': {
    code: 'R-INC-07',
    label: '저평가 코너',
    tone: 'undervalued-corner',
    narrative: '각지 접면의 입지 프리미엄 미반영',
    triggerConditions: '각지 접면 ∧ 평단가 ≤ 권역 중앙값',
  },
  'R-INC-08': {
    code: 'R-INC-08',
    label: '자주식 주차 사옥',
    tone: 'self-parking-hq',
    narrative: '자주식 주차 편의성 기반 사옥 수요',
    triggerConditions: '자주식 주차 ∧ 단일·소수 임차',
  },
  'R-INC-09': {
    code: 'R-INC-09',
    label: '복합 수익 전환형',
    tone: 'mixed-income',
    narrative: '용도 전환을 통한 수익 구조 다각화',
    triggerConditions: '현 용도와 허용 용도 간 수익률 차이 ≥ 2%p',
  },
};

// ── 사옥형 아키타입 (정본 CATALOG_RULES §1.2) ────────────────────────────
export const OWNER_OCC_ARCHETYPES: Record<OwnerOccArchetypeCode, ArchetypeDefinition> = {
  'R-OWN-01': {
    code: 'R-OWN-01',
    label: '본사 이전형',
    tone: 'corporate-fit',
    narrative: '기업 본사 이전 최적 후보',
    triggerConditions: 'owner_occupied ∧ 인원수 대비 면적 적합',
  },
  'R-OWN-02': {
    code: 'R-OWN-02',
    label: '통합 이전형',
    tone: 'consolidation',
    narrative: '분산된 사업장을 단일 건물로 통합',
    triggerConditions: '다층 가용 ∧ 주차 충분',
  },
  'R-OWN-03': {
    code: 'R-OWN-03',
    label: '브랜딩 랜드마크형',
    tone: 'landmark',
    narrative: '기업 단독 브랜딩이 가능한 단독 건물',
    triggerConditions: '단독 건물 ∧ 대로변 접면',
  },
  'R-OWN-04': {
    code: 'R-OWN-04',
    label: '임대 겸용 사옥형',
    tone: 'owner-plus-lease',
    narrative: '일부 층 자가사용 + 나머지 임대 수익',
    triggerConditions: '자가사용 비율 < 70%',
  },
};

// ── 개발형 아키타입 (정본 CATALOG_RULES §1.3) ────────────────────────────
export const DEV_ARCHETYPES: Record<DevArchetypeCode, ArchetypeDefinition> = {
  'R-DEV-01': {
    code: 'R-DEV-01',
    label: '용적률 활용 개발형',
    tone: 'far-upside',
    narrative: '현 용적률 대비 법적 용적률 여유를 활용한 증축·신축',
    triggerConditions: '유효 용적률 여유 ≥ 50%p',
  },
  'R-DEV-02': {
    code: 'R-DEV-02',
    label: '합필 개발형',
    tone: 'land-assembly',
    narrative: '인접 필지 합필을 통한 대형 개발',
    triggerConditions: '다필지 ∧ 합필 가능',
  },
  'R-DEV-03': {
    code: 'R-DEV-03',
    label: '용도 전환형',
    tone: 'use-conversion',
    narrative: '현 용도에서 더 높은 수익성 용도로 전환',
    triggerConditions: '용도지역 허용 범위 내 상위 용도 전환 가능',
  },
  'R-DEV-04': {
    code: 'R-DEV-04',
    label: '철거 신축형',
    tone: 'demolish-rebuild',
    narrative: '기존 건물 철거 후 신축',
    triggerConditions: '건물연령 ≥ 30년 ∧ 토지 가치 > 건물 가치',
  },
};

// ── 운영형 아키타입 (정본 CATALOG_RULES §1.4) ────────────────────────────
export const OPERATING_ARCHETYPES: Record<OperatingArchetypeCode, ArchetypeDefinition> = {
  'R-OPR-01': {
    code: 'R-OPR-01',
    label: '운영 수익 안정형',
    tone: 'operational-stability',
    narrative: 'GOP 마진 안정적, 운영사 장기 계약',
    triggerConditions: 'operating ∧ GOP 마진 ≥ 30% ∧ 운영 계약 잔여 ≥ 3년',
  },
  'R-OPR-02': {
    code: 'R-OPR-02',
    label: '운영사 교체 기회형',
    tone: 'operator-change',
    narrative: '운영사 교체를 통한 수익 개선 여지',
    triggerConditions: 'operating ∧ 운영 계약 만료 임박',
  },
  'R-OPR-03': {
    code: 'R-OPR-03',
    label: '시설 리노베이션형',
    tone: 'facility-renovation',
    narrative: '시설 투자 대비 ADR/OCC 상승 시나리오',
    triggerConditions: 'operating ∧ 시설 연식 ≥ 15년 ∧ ADR < 권역 평균',
  },
  'R-OPR-04': {
    code: 'R-OPR-04',
    label: '라이선스 인수형',
    tone: 'licence-acquisition',
    narrative: '사업 허가·면허 포함 인수',
    triggerConditions: 'operating ∧ 면허 양도 가능',
  },
};

// ── 단기매매형 아키타입 (정본 CATALOG_RULES §1.5) ────────────────────────
export const TRADING_ARCHETYPES: Record<TradingArchetypeCode, ArchetypeDefinition> = {
  'R-TRD-01': {
    code: 'R-TRD-01',
    label: '시세 차익형',
    tone: 'capital-appreciation',
    narrative: '권역 시세 대비 저평가 매입 후 단기 매각',
    triggerConditions: 'trading ∧ 매입가 ≤ 권역 중앙값 × 0.85',
  },
  'R-TRD-02': {
    code: 'R-TRD-02',
    label: '급매물 선취형',
    tone: 'distressed-acquisition',
    narrative: '매도인 급매 사유 활용한 저가 매입',
    triggerConditions: 'trading ∧ 매도 사유 = debt_pressure 또는 estate_settlement',
  },
  'R-TRD-03': {
    code: 'R-TRD-03',
    label: '갭투자 전매형',
    tone: 'gap-flip',
    narrative: '보증금 레버리지 활용한 전매',
    triggerConditions: 'trading ∧ 보증금/매매가 ≥ 50%',
  },
  'R-TRD-04': {
    code: 'R-TRD-04',
    label: '환금성 우선형',
    tone: 'liquidity-focused',
    narrative: '거래 빈도가 높은 권역의 높은 환금성',
    triggerConditions: 'trading ∧ 권역 거래 회전율 상위 20%',
  },
};

// ── 전체 아키타입 통합 ──────────────────────────────────────────────────
export const ALL_ARCHETYPES: Record<ArchetypeCode, ArchetypeDefinition> = {
  ...INCOME_ARCHETYPES,
  ...OWNER_OCC_ARCHETYPES,
  ...DEV_ARCHETYPES,
  ...OPERATING_ARCHETYPES,
  ...TRADING_ARCHETYPES,
};

// ── 레거시 코드 매핑 (호환성) ───────────────────────────────────────────
/** @deprecated D29 BL-5: 비정본 코드 → 정본 코드 매핑 */
export const LEGACY_ARCHETYPE_MAP: Record<string, ArchetypeCode> = {
  'OO-01': 'R-OWN-01',
  'DEV-01': 'R-DEV-01',
  'OP-01': 'R-OPR-01',
  'TR-01': 'R-TRD-01',
};

export interface ArchetypeSuggestion {
  primary: ArchetypeCode;
  secondary: ArchetypeCode[];
  reasoning: string;
}

/** 딜 팩트 기반 아키타입 자동 제안 (정본 CATALOG_RULES §1 판정 조건) */
export function suggestArchetype(dealFacts: {
  vacancyPct: number;
  buildingAge: number;
  rentGapPct?: number;
  farRemainder?: number;
  posture?: string;
  gopMarginPct?: number;
  operatorContractYears?: number;
  depositToPrice?: number;
  sellerMotive?: string;
}): ArchetypeSuggestion {
  const {
    vacancyPct, buildingAge, rentGapPct, farRemainder, posture,
    gopMarginPct, operatorContractYears, depositToPrice, sellerMotive,
  } = dealFacts;

  // 사옥형
  if (posture === 'owner_occupied') {
    return { primary: 'R-OWN-01', secondary: ['R-OWN-02', 'R-OWN-03', 'R-OWN-04'], reasoning: '사옥형 포스처' };
  }
  // 개발형
  if (posture === 'development') {
    const primary: ArchetypeCode = farRemainder !== undefined && farRemainder >= 50 ? 'R-DEV-01' : (farRemainder !== undefined ? 'R-DEV-04' : 'R-DEV-01');
    return { primary, secondary: ['R-DEV-01', 'R-DEV-02', 'R-DEV-03', 'R-DEV-04'].filter(c => c !== primary) as ArchetypeCode[], reasoning: '개발형 포스처' };
  }
  // 운영형
  if (posture === 'operating') {
    let primary: ArchetypeCode = 'R-OPR-01';
    if (gopMarginPct !== undefined && gopMarginPct < 30) primary = 'R-OPR-03';
    if ((operatorContractYears ?? 99) <= 1) primary = 'R-OPR-02';
    return { primary, secondary: ['R-OPR-01', 'R-OPR-02', 'R-OPR-03', 'R-OPR-04'].filter(c => c !== primary) as ArchetypeCode[], reasoning: '운영형 포스처' };
  }
  // 단기매매형
  if (posture === 'trading') {
    let primary: ArchetypeCode = 'R-TRD-01';
    if (sellerMotive === 'debt_pressure' || sellerMotive === 'estate_settlement') primary = 'R-TRD-02';
    if ((depositToPrice ?? 0) >= 0.5) primary = 'R-TRD-03';
    return { primary, secondary: ['R-TRD-01', 'R-TRD-02', 'R-TRD-03', 'R-TRD-04'].filter(c => c !== primary) as ArchetypeCode[], reasoning: '단기매매형 포스처' };
  }

  // income posture: R-INC-01~09 자동 판별 (정본 CATALOG_RULES §1.1)
  const secondaries: ArchetypeCode[] = [];

  if (buildingAge >= 20 && (farRemainder ?? 0) >= 50) {
    secondaries.push('R-INC-02'); // 가치 상승 여력형
  }
  if (vacancyPct > 15) {
    secondaries.push('R-INC-05'); // 공실 해소형
  }
  if (buildingAge > 20 && (farRemainder ?? 100) < 50) {
    secondaries.push('R-INC-06'); // 리모델링형
  }
  if (rentGapPct && rentGapPct >= 15) {
    secondaries.push('R-INC-04'); // 임대료 정상화형
  }

  // 기본: 임대 안정형
  let primary: ArchetypeCode = 'R-INC-01';
  if (buildingAge >= 20 && (farRemainder ?? 0) >= 50) primary = 'R-INC-02';
  else if (vacancyPct > 15) primary = 'R-INC-05';
  else if (buildingAge > 20) primary = 'R-INC-06';
  else if (rentGapPct && rentGapPct >= 15) primary = 'R-INC-04';

  return {
    primary,
    secondary: secondaries.filter(s => s !== primary),
    reasoning: `공실률 ${vacancyPct}%, 건물연령 ${buildingAge}년, 임대료갭 ${rentGapPct ?? 0}%`,
  };
}

/** posture 변경 시 영향도 분석 */
export interface PostureChangeImpact {
  slotsAffected: number;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export function postureChangeImpact(
  from: string,
  to: string,
  filledSlots: string[],
): PostureChangeImpact {
  const HIGH_IMPACT_PAIRS = new Set([
    'income→development', 'development→income',
    'income→operating', 'operating→income',
    'development→operating', 'operating→development',
  ]);
  const MED_IMPACT_PAIRS = new Set([
    'income→owner_occupied', 'owner_occupied→income',
    'trading→development', 'development→trading',
  ]);

  const pairKey = `${from}→${to}`;
  if (HIGH_IMPACT_PAIRS.has(pairKey)) {
    return {
      slotsAffected: Math.ceil(filledSlots.length * 0.6),
      severity: 'high',
      message: `${from} → ${to} 전환 시 슬롯의 60% 이상이 재편됩니다. 섹션 편성이 크게 변경됩니다.`,
    };
  }
  if (MED_IMPACT_PAIRS.has(pairKey)) {
    return {
      slotsAffected: Math.ceil(filledSlots.length * 0.3),
      severity: 'medium',
      message: `${from} → ${to} 전환 시 일부 섹션이 변경됩니다.`,
    };
  }
  return {
    slotsAffected: Math.ceil(filledSlots.length * 0.1),
    severity: 'low',
    message: `${from} → ${to} 전환은 대부분의 데이터를 유지합니다.`,
  };
}
