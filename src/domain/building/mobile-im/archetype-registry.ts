/**
 * @file archetype-registry.ts
 * @description 아키타입(서사 유형) 레지스트리 및 자동 제안
 * 정본: CATALOG_RULES.md §1.1~§1.5
 * D29 BL-5: 정본 코드로 재배정 (OO-01→R-OWN-01, DEV-01→R-DEV-01 등)
 * D29 BL-5: R-INC-02~06 정의를 정본과 일치시킴
 * D29 BL-5: 라벨 금지어 교정 (초안정→임대 안정, 밸류애드→가치 상승 여력)
 * D30 BL-1: 비수익 16종 라벨·조건 정본 §1.1~§1.5 전량 치환
 * D30 BL-2: R-OPR-04(용도 리스크형)·R-TRD-04(출구 제약형) 경고 유형 복원
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
    label: '분산 임차형',  // D30 BL-1: 정본 §1.1 치환
    tone: 'diversified-tenant',
    narrative: '다수 소규모 임차인 분산으로 공실 리스크 완화',
    triggerConditions: '호실 ≥ 6 ∧ 최대 임차인 비중 ≤ 25%',
  },
};

// ── 사옥형 아키타입 (정본 CATALOG_RULES §1.2) ────────────────────────────
export const OWNER_OCC_ARCHETYPES: Record<OwnerOccArchetypeCode, ArchetypeDefinition> = {
  'R-OWN-01': {
    code: 'R-OWN-01',
    label: '자가 우위형',  // D30 BL-1: 정본 §1.2 치환
    tone: 'owner-advantage',
    narrative: '자가 사용이 임차 대비 비용 우위인 물건',
    triggerConditions: '자가 우위액 > 0 (기준 시나리오) ∧ 회수기간 ≤ 5년',
  },
  'R-OWN-02': {
    code: 'R-OWN-02',
    label: '확장 여력형',  // D30 BL-1: 정본 §1.2 치환
    tone: 'expansion-capacity',
    narrative: '현 인원 대비 여유 면적으로 향후 증원 대응 가능',
    triggerConditions: '증원 여력 ≥ 현 인원 30%',
  },
  'R-OWN-03': {
    code: 'R-OWN-03',
    label: '통근 우수형',  // D30 BL-1: 정본 §1.2 치환 + 금지어 '랜드마크' 제거
    tone: 'commute-excellence',
    narrative: '역세권 도보 접근성과 복수 노선 환승 편의',
    triggerConditions: '역세권 도보 ≤ 5분 ∧ 노선 2개 이상',
  },
  'R-OWN-04': {
    code: 'R-OWN-04',
    label: '사세 표현형',  // D30 BL-1: 정본 §1.2 치환
    tone: 'corporate-prestige',
    narrative: '사옥 단독 명칭 표기(간판 설치권) 및 단독 사용',
    triggerConditions: '네이밍 권리 ∧ 단독 사용',
  },
};

// ── 개발형 아키타입 (정본 CATALOG_RULES §1.3) ────────────────────────────
export const DEV_ARCHETYPES: Record<DevArchetypeCode, ArchetypeDefinition> = {
  'R-DEV-01': {
    code: 'R-DEV-01',
    label: '즉시 착공형',  // D30 BL-1: 정본 §1.3 치환
    tone: 'immediate-start',
    narrative: '명도 완료 및 인허가 해소로 즉시 착공 가능',
    triggerConditions: '명도 완료 ∧ 인허가 clear',
  },
  'R-DEV-02': {
    code: 'R-DEV-02',
    label: '명도 선행형',  // D30 BL-1: 정본 §1.3 치환
    tone: 'vacancy-first',
    narrative: '장기 임차인 명도가 개발 착수의 선결 조건',
    triggerConditions: '명도 미완 ∧ 갱신권 잔여 ≥ 5년 임차인 존재',
  },
  'R-DEV-03': {
    code: 'R-DEV-03',
    label: '인허가 리스크형',  // D30 BL-1: 정본 §1.3 치환
    tone: 'permit-risk',
    narrative: '인허가 과정에서 제약 또는 불확실성 존재',
    triggerConditions: 'permit_risk 중 constraint 이상 1건 이상',
  },
  'R-DEV-04': {
    code: 'R-DEV-04',
    label: '용적률 여유형',  // D30 BL-1: 정본 §1.3 치환
    tone: 'far-surplus',
    narrative: '법적 용적률 대비 현 용적률의 개발 여유',
    triggerConditions: '유효 기준 신축 용적률 ≤ 상한 − 20%p',
  },
};

// ── 운영형 아키타입 (정본 CATALOG_RULES §1.4) ────────────────────────────
export const OPERATING_ARCHETYPES: Record<OperatingArchetypeCode, ArchetypeDefinition> = {
  'R-OPR-01': {
    code: 'R-OPR-01',
    label: '실적 안정형',  // D30 BL-1: 정본 §1.4 치환
    tone: 'operational-stability',
    narrative: '3개년 OCC 편차 안정, GOP 마진 권역 중앙값 이상',
    triggerConditions: '3개년 OCC 편차 ≤ 10%p ∧ GOP 마진 ≥ 권역 중앙값',
  },
  'R-OPR-02': {
    code: 'R-OPR-02',
    label: '운영 개선형',  // D30 BL-1: 정본 §1.4 치환
    tone: 'operational-improvement',
    narrative: 'OCC 저조하나 시설 양호 — 운영 개선으로 수익 상승 여지',
    triggerConditions: 'OCC < 권역 중앙값 − 10%p ∧ 시설 노후 없음',
  },
  'R-OPR-03': {
    code: 'R-OPR-03',
    label: '운영사 의존형',  // D30 BL-1: 정본 §1.4 치환
    tone: 'operator-dependent',
    narrative: '위탁운영 계약 잔여 기간 짧아 운영사 교체 리스크',
    triggerConditions: '위탁운영 ∧ 계약 잔여 ≤ 2년',
  },
  'R-OPR-04': {
    code: 'R-OPR-04',
    label: '용도 리스크형',  // D30 BL-1+BL-2: 정본 §1.4 치환 — ⚠️ 경고 유형
    tone: 'land-use-risk',
    narrative: '용도 적법성 미확인 — 생활형숙박시설 주거 사용 등 이행강제금 리스크',
    triggerConditions: 'landUseLegality ≠ clear',
  },
};

// ── 단기매매형 아키타입 (정본 CATALOG_RULES §1.5) ────────────────────────
export const TRADING_ARCHETYPES: Record<TradingArchetypeCode, ArchetypeDefinition> = {
  'R-TRD-01': {
    code: 'R-TRD-01',
    label: '시세 하회형',  // D30 BL-1: 정본 §1.5 치환
    tone: 'below-market',
    narrative: '권역 중앙값 대비 저평가된 매입 기회',
    triggerConditions: '평단가 ≤ 권역 중앙값 × 0.9 ∧ 비교사례 ≥ 6건',
  },
  'R-TRD-02': {
    code: 'R-TRD-02',
    label: '회전 활발형',  // D30 BL-1: 정본 §1.5 치환
    tone: 'high-turnover',
    narrative: '권역 내 거래 회전이 활발하여 출구 전략 다양',
    triggerConditions: '권역 12개월 거래 회전율 ≥ 권역 중앙값',
  },
  'R-TRD-03': {
    code: 'R-TRD-03',
    label: '분할 매각 가능형',  // D30 BL-1: 정본 §1.5 치환
    tone: 'partial-sale',
    narrative: '호실·층별 분할 매각이 가능한 구조',
    triggerConditions: 'sectional_spec.partialSaleFeasible ∧ 소유자 단독',
  },
  'R-TRD-04': {
    code: 'R-TRD-04',
    label: '출구 제약형',  // D30 BL-1+BL-2: 정본 §1.5 치환 — ⚠️ 경고 유형 (되팔기 어려움)
    tone: 'exit-constrained',
    narrative: '전 소유자 동의 또는 인허가 승계 제약으로 매각 난이도 높음',
    triggerConditions: '전 소유자 동의 필요 ∨ 인허가 승계 제약',
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
