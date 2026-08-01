/**
 * income-scenario-engine.ts
 *
 * 매출연동 임대료 포함 시 보수적/기본/낙관적 3개 시나리오로 NOI를 산출합니다.
 * 고정 임대료 + 변동 임대료 + 부가수입을 통합하여 시나리오별 수익 분석을 제공합니다.
 *
 * @see SDD §5 S0-T2 (모든 재무 계산은 financials.ts 경유)
 */

import type { FloorLeaseInput, AncillaryIncomeItem } from './types';

export interface IncomeScenario {
  label: '보수적' | '기본' | '낙관적';
  /** 월간 고정 임대료 합계 (만원) */
  fixedMonthlyManwon: number;
  /** 월간 변동 임대료 추정 (만원) */
  variableMonthlyManwon: number;
  /** 월간 총 임대 수입 (만원) */
  totalMonthlyManwon: number;
  /** 연간 총 임대 수입 (원) */
  annualRentKrw: number;
  /** 연간 부가수입 (원) */
  ancillaryKrw: number;
  /** 연간 총수입 GI (원) - 임대 + 부가 */
  grossIncomeKrw: number;
  /** NOI (원) */
  noiKrw: number;
  /** Cap Rate (%) */
  capRatePct: number;
  /** 변동 임대 층 목록 */
  variableFloors: string[];
}

export interface ScenarioAnalysisInput {
  floorLeases: FloorLeaseInput[];
  ancillaryIncomes?: AncillaryIncomeItem[];
  askingPriceManwon: number;
  opexRatioPct?: number;     // default 10
  vacancyPct?: number;       // default 0 for known, 5 for unknown
}

export interface ScenarioAnalysisOutput {
  scenarios: IncomeScenario[];
  hasVariableRent: boolean;
  variableFloorSummary: string;
  markdownTable: string;
  disclaimer: string;
}

/**
 * 층별 임대 데이터에서 고정/변동 임대료를 분리하고
 * 3개 시나리오(보수적/기본/낙관적)로 NOI를 산출합니다.
 */
export function buildIncomeScenarios(input: ScenarioAnalysisInput): ScenarioAnalysisOutput {
  const {
    floorLeases,
    ancillaryIncomes = [],
    askingPriceManwon,
    opexRatioPct = 10,
    vacancyPct = 0,
  } = input;

  const askingPriceKrw = askingPriceManwon * 10000;
  const ancillaryKrw = ancillaryIncomes.reduce((sum, a) => sum + a.annualAmountKrw, 0);

  // 고정 임대료 합산
  const fixedLeases = floorLeases.filter(l => !l.rent_type || l.rent_type === 'fixed');
  const variableLeases = floorLeases.filter(l => l.rent_type && l.rent_type !== 'fixed');

  const fixedMonthly = fixedLeases.reduce((sum, l) => sum + (l.rent_manwon || 0), 0);

  const hasVariableRent = variableLeases.length > 0;
  const variableFloors = variableLeases.map(l => l.floor);

  // 변동 임대료 시나리오 계산
  const scenarioKeys: Array<'low' | 'mid' | 'high'> = ['low', 'mid', 'high'];
  const scenarioLabels: Record<string, '보수적' | '기본' | '낙관적'> = {
    low: '보수적', mid: '기본', high: '낙관적'
  };

  const scenarios: IncomeScenario[] = scenarioKeys.map(key => {
    let variableMonthly = 0;
    for (const lease of variableLeases) {
      if (lease.estimated_rent_range) {
        variableMonthly += lease.estimated_rent_range[key];
      } else if (lease.rent_type === 'base_plus_percentage') {
        variableMonthly += lease.base_rent_manwon || 0;
      }
      // revenue_linked with no estimate: 0 (conservative)
    }

    const totalMonthly = fixedMonthly + variableMonthly;
    const annualRentKrw = totalMonthly * 10000 * 12;
    const egiFromRent = annualRentKrw * (1 - vacancyPct / 100);
    const grossIncomeKrw = egiFromRent + ancillaryKrw;
    const opex = grossIncomeKrw * (opexRatioPct / 100);
    const noiKrw = grossIncomeKrw - opex;
    const capRatePct = askingPriceKrw > 0
      ? parseFloat((noiKrw / askingPriceKrw * 100).toFixed(2))
      : 0;

    return {
      label: scenarioLabels[key],
      fixedMonthlyManwon: fixedMonthly,
      variableMonthlyManwon: variableMonthly,
      totalMonthlyManwon: totalMonthly,
      annualRentKrw,
      ancillaryKrw,
      grossIncomeKrw,
      noiKrw,
      capRatePct,
      variableFloors,
    };
  });

  // 변동 임대 요약
  const variableFloorSummary = variableLeases.map(l => {
    const pct = l.revenue_linked_pct ? `매출 ${l.revenue_linked_pct}%` : '변동';
    return `${l.floor}(${l.tenant_type || '미상'}, ${pct})`;
  }).join(', ');

  // 마크다운 테이블
  const markdownTable = [
    '### 📊 수익 시나리오 비교',
    '',
    hasVariableRent
      ? `> 변동 임대: ${variableFloorSummary}`
      : '> 전 층 고정 임대료',
    ancillaryKrw > 0
      ? `> 부가수입: 연 ${(ancillaryKrw / 10000).toLocaleString()}만원 포함`
      : '',
    '',
    '| 시나리오 | 고정 임대 | 변동 임대 | 부가수입 | NOI | Cap Rate |',
    '|:---|---:|---:|---:|---:|:---:|',
    ...scenarios.map(s =>
      `| ${s.label} | ${s.fixedMonthlyManwon.toLocaleString()}만/월 | ${s.variableMonthlyManwon > 0 ? s.variableMonthlyManwon.toLocaleString() + '만/월' : '-'} | ${s.ancillaryKrw > 0 ? (s.ancillaryKrw / 1e8).toFixed(2) + '억/연' : '-'} | ${(s.noiKrw / 1e8).toFixed(2)}억 | ${s.capRatePct}% |`
    ),
  ].filter(Boolean).join('\n');

  const disclaimer = hasVariableRent
    ? `※ ${variableFloors.join(', ')}의 임대료는 매출연동형으로, 실제 수입은 임대차계약서 및 최근 매출자료 확인이 필요합니다.`
    : '';

  return { scenarios, hasVariableRent, variableFloorSummary, markdownTable, disclaimer };
}
