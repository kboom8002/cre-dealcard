/**
 * data-absence.ts
 *
 * 미기입 데이터 처리 프로토콜.
 * null(미확인)과 0(명시적 0)을 구분하고,
 * 미확인 필드에 대한 경고 및 시나리오 분석을 제공합니다.
 */

/** 데이터 존재 상태를 명시적으로 구분 */
export type DataPresence<T> =
  | { status: 'confirmed'; value: T }                         // 확인된 값
  | { status: 'estimated'; value: T; basis: string }          // 추정값 + 근거
  | { status: 'unknown'; reason: string }                     // 미확인
  | { status: 'not_applicable' };                             // 해당없음

/** 미확인 필드 처리 정책 */
export interface AbsencePolicy {
  fieldKey: string;
  label: string;
  useDefault: boolean;
  defaultValue?: number;
  warningLevel: 'info' | 'caution' | 'critical';
  displayText: string;
  /** 미확인 시 IM에 표시할 면책 문구 */
  disclaimerMarkdown?: string;
}

/** 정책 레지스트리 */
export const ABSENCE_POLICIES: AbsencePolicy[] = [
  {
    fieldKey: 'loan_amount',
    label: '대출 현황',
    useDefault: false,
    warningLevel: 'critical',
    displayText: '⚠️ 대출 현황 미확인 — 등기부등본으로 근저당 확인 필요',
    disclaimerMarkdown: '> ⚠️ **대출(근저당) 정보가 미확인**입니다. 자기자본 및 레버리지 수익률은 등기부등본 확인 후 정확하게 산출됩니다.',
  },
  {
    fieldKey: 'vacancy_pct',
    label: '공실률',
    useDefault: true,
    defaultValue: 5,
    warningLevel: 'caution',
    displayText: '공실률 미확인 — 보수적 5% 가정 적용',
    disclaimerMarkdown: '> 공실률이 미확인되어 보수적 5% 가정을 적용했습니다.',
  },
  {
    fieldKey: 'opex_ratio',
    label: '운영비 비율',
    useDefault: true,
    defaultValue: 10,
    warningLevel: 'info',
    displayText: '운영비 비율 미확인 — 업계 표준 10% 적용',
  },
  {
    fieldKey: 'asking_price',
    label: '매각 희망가',
    useDefault: false,
    warningLevel: 'critical',
    displayText: '⚠️ 매각가 미기입 — 수익률 산출 불가',
    disclaimerMarkdown: '> ⚠️ **매각 희망가가 미기입**되어 Cap Rate 및 수익률을 산출할 수 없습니다.',
  },
  {
    fieldKey: 'total_deposit',
    label: '총 보증금',
    useDefault: true,
    defaultValue: 0,
    warningLevel: 'caution',
    displayText: '보증금 미확인 — 0원 가정 (자기자본 과대 산출 가능)',
  },
  {
    fieldKey: 'building_age',
    label: '건물 연식',
    useDefault: false,
    warningLevel: 'info',
    displayText: '건물 연식 미확인 — 건축물대장 확인 권장',
  },
  {
    fieldKey: 'rent_roll',
    label: '층별 임대차 현황',
    useDefault: false,
    warningLevel: 'caution',
    displayText: '층별 임대차 현황 미확인 — 세부 수익 분석 제한',
  },
];

/** 주어진 supplemental 데이터에서 미확인 필드를 검출합니다 */
export interface FieldCheckInput {
  asking_price_manwon?: number | null;
  total_deposit_manwon?: number | null;
  loan_amount_manwon?: number | null;
  loan_status?: 'confirmed' | 'no_loan' | 'unknown';
  vacancy_pct?: number | null;
  vacancy_confirmed?: boolean;
  floor_leases?: unknown[] | null;
  building_age_years?: number | null;
}

export interface AbsenceCheckResult {
  /** 미확인 필드 목록 */
  missingFields: AbsencePolicy[];
  /** critical 경고 수 */
  criticalCount: number;
  /** caution 경고 수 */
  cautionCount: number;
  /** 전체 면책 마크다운 */
  disclaimerMarkdown: string;
  /** 데이터 신뢰도 점수 (0-100) */
  dataReliabilityScore: number;
}

import type { InvestmentPosture } from '@/domain/ontology';

/**
 * supplemental 데이터에서 미확인 필드를 검출하고
 * 경고 목록 및 면책 문구를 생성합니다.
 */
export function checkDataAbsence(
  input: FieldCheckInput,
  posture: InvestmentPosture = 'income'
): AbsenceCheckResult {
  const missingFields: AbsencePolicy[] = [];

  // 대출 현황 (owner_occupied, development는 대출 미확인이 critical이 아님)
  if (input.loan_status === 'unknown' || (input.loan_amount_manwon === undefined && input.loan_status !== 'no_loan')) {
    if (posture === 'income' || posture === 'trading') {
      const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'loan_amount')!;
      missingFields.push(policy);
    }
  }

  // 매각가 (development에서는 매각가가 critical이 아님)
  if (input.asking_price_manwon === undefined || input.asking_price_manwon === null) {
    const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'asking_price')!;
    if (posture === 'development') {
      missingFields.push({
        ...policy,
        warningLevel: 'info',
        displayText: '매각가 미기입 — 사업성 검토 기반 정보 제공',
        disclaimerMarkdown: '> 매각가 결정 전 단계로, 대지/건물 스펙 기반 개발 가치를 분석합니다.',
      });
    } else {
      missingFields.push(policy);
    }
  }

  // 공실률 (owner_occupied, development는 해당 없음)
  if ((input.vacancy_pct === undefined || input.vacancy_pct === null) && !input.vacancy_confirmed) {
    if (posture !== 'owner_occupied' && posture !== 'development') {
      const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'vacancy_pct')!;
      missingFields.push(policy);
    }
  }

  // 보증금 (owner_occupied, development, trading는 해당 없음)
  if (input.total_deposit_manwon === undefined || input.total_deposit_manwon === null) {
    if (posture !== 'owner_occupied' && posture !== 'development' && posture !== 'trading') {
      const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'total_deposit')!;
      missingFields.push(policy);
    }
  }

  // 층별 임대차 (owner_occupied, development, trading는 해당 없음)
  if (!input.floor_leases || input.floor_leases.length === 0) {
    if (posture !== 'owner_occupied' && posture !== 'development' && posture !== 'trading') {
      const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'rent_roll')!;
      missingFields.push(policy);
    }
  }

  // 건물 연식
  if (input.building_age_years === undefined || input.building_age_years === null) {
    const policy = ABSENCE_POLICIES.find(p => p.fieldKey === 'building_age')!;
    missingFields.push(policy);
  }

  const criticalCount = missingFields.filter(f => f.warningLevel === 'critical').length;
  const cautionCount = missingFields.filter(f => f.warningLevel === 'caution').length;

  // 면책 마크다운 합성
  const disclaimers = missingFields
    .filter(f => f.disclaimerMarkdown)
    .map(f => f.disclaimerMarkdown!);
  const disclaimerMarkdown = disclaimers.length > 0
    ? '### ⚠️ 데이터 미확인 안내\n\n' + disclaimers.join('\n\n')
    : '';

  // 신뢰도 점수: 전체 필드 중 미확인 제외 비율
  const totalFields = ABSENCE_POLICIES.length;
  const confirmedFields = Math.max(0, totalFields - missingFields.length);
  const dataReliabilityScore = Math.round((confirmedFields / totalFields) * 100);

  return {
    missingFields,
    criticalCount,
    cautionCount,
    disclaimerMarkdown,
    dataReliabilityScore,
  };
}

// ─── 유틸리티 ───

/** DataPresence에서 값을 추출합니다 (unknown이면 defaultValue 반환) */
export function resolvePresence<T>(presence: DataPresence<T>, defaultValue: T): T {
  switch (presence.status) {
    case 'confirmed':
    case 'estimated':
      return presence.value;
    case 'unknown':
    case 'not_applicable':
      return defaultValue;
  }
}

/** DataPresence에서 provenance badge를 생성합니다 */
export function presenceToBadge<T>(presence: DataPresence<T>): string {
  switch (presence.status) {
    case 'confirmed': return '공부 확인';
    case 'estimated': return `AI 추정 (${presence.basis})`;
    case 'unknown': return '⚠️ 미확인';
    case 'not_applicable': return '해당없음';
  }
}
