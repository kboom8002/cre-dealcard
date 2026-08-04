/**
 * @file archetype-registry.ts
 * @description 아키타입(서사 유형) 레지스트리 및 자동 제안
 * AUTH-05.2: R-INC-01~04 수익형 아키타입
 */

export type IncomeArchetypeCode = 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04';
export type ArchetypeCode = IncomeArchetypeCode | 'OO-01' | 'DEV-01' | 'OP-01' | 'TR-01';

export interface ArchetypeDefinition {
  code: ArchetypeCode;
  label: string;
  tone: string;
  narrative: string;
  triggerConditions: string;
}

export const INCOME_ARCHETYPES: Record<IncomeArchetypeCode, ArchetypeDefinition> = {
  'R-INC-01': {
    code: 'R-INC-01',
    label: '안정형',
    tone: 'predictability',
    narrative: '예측 가능한 현금흐름',
    triggerConditions: '증축 여지 없음 ∧ 신축(10년 이내) ∧ 임대료 인상 상한',
  },
  'R-INC-02': {
    code: 'R-INC-02',
    label: '갭 투자형',
    tone: 'opportunity',
    narrative: '시세 대비 저렴한 임대료 → 인상 여지',
    triggerConditions: '현 임대료가 시세 대비 15% 이상 저렴',
  },
  'R-INC-03': {
    code: 'R-INC-03',
    label: '공실 해소형',
    tone: 'turnaround',
    narrative: '공실 해소 시 수익률 상승 시나리오',
    triggerConditions: '공실률 15% 초과',
  },
  'R-INC-04': {
    code: 'R-INC-04',
    label: '리모델링형',
    tone: 'renovation',
    narrative: '노후 건물 리모델링 통한 가치 재창출',
    triggerConditions: '건물연령 20년 초과',
  },
};

export const ALL_ARCHETYPES: Record<ArchetypeCode, ArchetypeDefinition> = {
  ...INCOME_ARCHETYPES,
  'OO-01': { code: 'OO-01', label: '사옥 이전형', tone: 'corporate-fit', narrative: '기업 본사 이전 최적 후보', triggerConditions: 'owner_occupied 포스처' },
  'DEV-01': { code: 'DEV-01', label: '개발 사업형', tone: 'development-upside', narrative: '용적률 여유 기반 개발 사업', triggerConditions: 'development 포스처 ∧ 용적률 여유 30% 초과' },
  'OP-01': { code: 'OP-01', label: '운영 수익형', tone: 'operational-excellence', narrative: 'GOP 최적화 통한 운영 수익', triggerConditions: 'operating 포스처' },
  'TR-01': { code: 'TR-01', label: '시세 차익형', tone: 'capital-appreciation', narrative: '권역 시세 대비 저평가 매입 후 단기 매각', triggerConditions: 'trading 포스처' },
};

export interface ArchetypeSuggestion {
  primary: ArchetypeCode;
  secondary: ArchetypeCode[];
  reasoning: string;
}

/** 딜 팩트 기반 아키타입 자동 제안 */
export function suggestArchetype(dealFacts: {
  vacancyPct: number;
  buildingAge: number;
  rentGapPct?: number;    // 시세 대비 현 임대료 갭 (%)
  farRemainder?: number;  // 용적률 여유 (%)
  posture?: string;
}): ArchetypeSuggestion {
  const { vacancyPct, buildingAge, rentGapPct, farRemainder, posture } = dealFacts;

  // posture별 기본 아키타입
  if (posture === 'owner_occupied') return { primary: 'OO-01', secondary: [], reasoning: '사옥형 포스처' };
  if (posture === 'development') return { primary: 'DEV-01', secondary: [], reasoning: '개발형 포스처' };
  if (posture === 'operating') return { primary: 'OP-01', secondary: [], reasoning: '운영형 포스처' };
  if (posture === 'trading') return { primary: 'TR-01', secondary: [], reasoning: '매매형 포스처' };

  // income posture: R-INC-01~04 자동 판별
  const secondaries: ArchetypeCode[] = [];

  if (vacancyPct >= 15) {
    secondaries.push('R-INC-03');
  }
  if (buildingAge >= 20) {
    secondaries.push('R-INC-04');
  }
  if (rentGapPct && rentGapPct >= 15) {
    secondaries.push('R-INC-02');
  }

  // 기본: 안정형 (조건 없으면)
  let primary: ArchetypeCode = 'R-INC-01';
  if (vacancyPct >= 15) primary = 'R-INC-03';
  else if (buildingAge >= 20) primary = 'R-INC-04';
  else if (rentGapPct && rentGapPct >= 15) primary = 'R-INC-02';

  return {
    primary,
    secondary: secondaries.filter(s => s !== primary),
    reasoning: `공실률 ${vacancyPct}%, 건물연령 ${buildingAge}년, 임대료갭 ${rentGapPct ?? 0}%`,
  };
}

/** posture 변경 시 영향도 분석 */
export interface PostureChangeImpact {
  /** 재계산 필요 슬롯 수 */
  slotsAffected: number;
  /** 변경 심각도 */
  severity: 'low' | 'medium' | 'high';
  /** 안내 메시지 */
  message: string;
}

export function postureChangeImpact(
  from: string,
  to: string,
  filledSlots: string[],
): PostureChangeImpact {
  // income ↔ trading: 낮음 (대부분 슬롯 공유)
  // income → owner_occupied: 중간 (임대 관련 슬롯 불필요)
  // income → development: 높음 (대부분 슬롯 재편)
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
