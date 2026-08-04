/**
 * value-metrics.ts — 온톨로지 v0.4 다형 가치 지표
 * Spec: ONTOLOGY_V0.4_SPEC.md §3
 * 
 * investmentPosture가 주 가치 지표를 결정합니다.
 * Cap Rate를 보편 지표에서 수익형 Pack의 지표로 강등합니다.
 */

import type { InvestmentPosture, MetricDisclosure, CapRateBasis } from './enums';

export interface ValueMetricStrategy {
  /** 지표 고유 ID */
  id: string;
  /** 표시명 */
  label: string;
  /** 적용 투자 관점 */
  applies: InvestmentPosture[];
  /** 공개 수준 */
  disclosure: MetricDisclosure;
  /** 시나리오 강제 여부 — true면 단일 값 제시가 게이트에서 차단됨 */
  requiresScenarios: boolean;
  /** 설명 */
  description: string;
}

export const VALUE_METRICS: ValueMetricStrategy[] = [
  // income
  {
    id: 'cap_rate_standard',
    label: 'Cap Rate (표준)',
    applies: ['income'],
    disclosure: 'primary',
    requiresScenarios: false,
    description: 'NOI ÷ 매각가. 4~7기준 병기.',
  },
  {
    id: 'total_return',
    label: '총수익률',
    applies: ['income'],
    disclosure: 'primary',
    requiresScenarios: true,
    description: '임대 현금흐름 + 자산가치 변동. 시나리오 3종 필수.',
  },
  // owner_occupied
  {
    id: 'own_vs_lease',
    label: '자가 vs 임차 연간 비교',
    applies: ['owner_occupied'],
    disclosure: 'primary',
    requiresScenarios: true,
    description: '보유 비용과 현 임차료의 연간 비교. 지가 가정에 지배됨.',
  },
  // development
  {
    id: 'land_cost_burden',
    label: '토지비 부담 (원/연면적평)',
    applies: ['development'],
    disclosure: 'primary',
    requiresScenarios: true,
    description: '총 토지비 ÷ 개발 가능 연면적.',
  },
  {
    id: 'project_feasibility',
    label: '사업수지',
    applies: ['development'],
    disclosure: 'primary',
    requiresScenarios: true,
    description: '매출 − 토지비 − 공사비 − 부대비용.',
  },
  // operating
  {
    id: 'gop_cap_rate',
    label: 'Cap Rate (GOP 기준)',
    applies: ['operating'],
    disclosure: 'primary',
    requiresScenarios: true,
    description: 'GOP ÷ 매각가. NOI 기준과 나란히 비교하면 안 됨.',
  },
  // trading
  {
    id: 'unit_price',
    label: '평단가',
    applies: ['trading'],
    disclosure: 'primary',
    requiresScenarios: false,
    description: '매각가 ÷ 연면적(평).',
  },
  {
    id: 'area_turnover',
    label: '권역 회전율',
    applies: ['trading'],
    disclosure: 'secondary',
    requiresScenarios: false,
    description: '동일 권역 · 유형의 최근 거래 빈도.',
  },
];

/** 투자 관점별 적용 가치 지표를 반환합니다. */
export function getValueMetrics(posture: InvestmentPosture): ValueMetricStrategy[] {
  return VALUE_METRICS.filter(m => m.applies.includes(posture));
}

/** 시나리오 강제 지표만 반환합니다. */
export function getScenarioRequiredMetrics(posture: InvestmentPosture): ValueMetricStrategy[] {
  return VALUE_METRICS.filter(m => m.applies.includes(posture) && m.requiresScenarios);
}

/** IM 표기용 Cap Rate basis → 사용자 언어 매핑 */
export const CAP_RATE_DISPLAY_LABELS: Record<CapRateBasis, string> = {
  gross_price: '임대수익률 (매매가 기준)',
  gross_price_deposit: '임대수익률 (실투자금 기준)',
  noi_price: 'Cap Rate (표준)',
  noi_price_deposit: 'Cap Rate (보증금 차감)',
  noi_equity: 'Cap Rate (자기자본 기준)',
  noi_total_cost: 'Cap Rate (총취득원가 기준)',
  gop_price: 'Cap Rate (GOP 기준)',
};
