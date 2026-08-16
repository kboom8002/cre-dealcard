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

// ══════════════════════════════════════════════════════════════════════
// v0.5: 인스티튜셔널 폴백 전략 메타데이터 레지스트리
// ══════════════════════════════════════════════════════════════════════

import type { FallbackStrategy } from '@/domain/ontology/enums';
import type { SlotFallbackMeta } from '@/domain/ontology/slots';

/** 섹션별 데이터 부재 시 폴백 전략 정의 */
export type SectionFallbackKey =
  | 'rent_roll'         // 임대차 현황
  | 'building_ledger'   // 건축물대장
  | 'land_use_plan'     // 토지이용계획
  | 'risk_assessment'   // 리스크 분석
  | 'location_analysis' // 입지 분석
  | 'financial_summary'; // 재무 요약

/** 인스티튜셔널 실사 체크리스트 레지스트리 */
export const INSTITUTIONAL_FALLBACK_REGISTRY: Record<SectionFallbackKey, SlotFallbackMeta[]> = {
  rent_roll: [
    {
      strategy: 'institutional_checklist',
      title: '임대차 실사 점검 항목',
      body: '• 층별/호실별 임대차 계약서 및 사업자등록 현황\n• 보증금 총액 및 월 임대료 입금 내역(최근 6개월)\n• 렌트프리, 핏아웃 등 특약 조건 존재 여부',
    },
    {
      strategy: 'institutional_checklist',
      title: '수익률 분석 유의사항',
      body: '• 상가임대차보호법상 10년 계약갱신요구권 적용 여부\n• 주변 시세 대비 적정 임대료(Market Rent) 갭 분석\n• 향후 명도 가능 여부 및 리모델링/신축 타당성',
    },
  ],
  building_ledger: [
    {
      strategy: 'institutional_checklist',
      title: '건축물 개요 데이터 준비 중',
      body: '건축물대장 공적 장부 조회 완료 후 층별 세부 용도, 연면적, 건폐율/용적률이 자동 반영됩니다.',
    },
    {
      strategy: 'institutional_checklist',
      title: '필수 확인 공적 서류',
      body: '• 일반건축물대장 (갑/을구 — 위반건축물 등재 여부 확인)\n• 토지이용계획확인서 (용도지역, 지구단위계획, 저촉 여부)\n• 토지 및 건물 등기사항전부증명서 (근저당, 압류 등 권리관계)',
    },
  ],
  land_use_plan: [
    {
      strategy: 'institutional_checklist',
      title: '토지/용도 분석 포인트',
      body: '• 용도지역/지구별 법정 건폐율 및 용적률 상한\n• 도로 접면 조건(너비 및 코너 여부)과 건축선 후퇴\n• 지구단위계획구역 여부 및 층수/업종 제한 사항',
    },
    {
      strategy: 'institutional_checklist',
      title: '물건 실사 및 권리 점검',
      body: '• 근저당·신탁·가압류 등 권리제한 사항 정밀 실사\n• 현황 도로와 지적도상 도로 일치 여부 확인\n• 크리딜 전문 자문팀을 통한 공부 정밀 검토 가능',
    },
  ],
  risk_assessment: [
    {
      strategy: 'institutional_checklist',
      title: '건축/시설 리스크 점검',
      body: '• 건축법 위반 사항 및 이행강제금 부과 이력\n• 소방·전기·승강기·방수·배관 핵심 설비 노후도\n• 석면 등 유해물질 해당 여부 확인 필요',
    },
    {
      strategy: 'institutional_checklist',
      title: '법률/권리 리스크 점검',
      body: '• 등기부등본 갑/을구 권리관계 정밀 확인\n• 토지이용계획상 저촉 여부 및 개발 행위 제한\n• 임대차보호법 적용 범위 및 명도 소송 가능성',
    },
  ],
  location_analysis: [
    {
      strategy: 'skeleton_guide',
      title: '입지 분석 데이터 수집 중',
      body: '대중교통 접근성, 배후 수요, 상권 분석 데이터가 수집되면 자동으로 업데이트됩니다.',
    },
  ],
  financial_summary: [
    {
      strategy: 'skeleton_guide',
      title: '재무 분석 데이터 수집 중',
      body: '매각 희망가, 임대료, 대출 현황 등 핵심 재무 데이터가 입력되면 수익률 분석이 자동 생성됩니다.',
    },
  ],
};

/** 특정 섹션의 폴백 카드 메타데이터를 반환합니다 */
export function getFallbackCards(section: SectionFallbackKey): SlotFallbackMeta[] {
  return INSTITUTIONAL_FALLBACK_REGISTRY[section] ?? [];
}

/** 특정 섹션에 대한 데이터 존재 여부를 판정하고, 부재 시 폴백 카드를 반환합니다 */
export function resolveAbsenceWithFallback<T>(
  value: T | null | undefined,
  section: SectionFallbackKey,
): { hasData: true; value: T } | { hasData: false; fallbacks: SlotFallbackMeta[] } {
  if (value != null && (typeof value !== 'object' || (Array.isArray(value) && value.length > 0))) {
    return { hasData: true, value: value as T };
  }
  return { hasData: false, fallbacks: getFallbackCards(section) };
}
