/**
 * tax-scenarios.ts
 * 
 * Pro 전용 세금 시나리오 비교 모듈.
 * 개인/법인/매도자 3가지 시나리오를 비교합니다.
 * 
 * @see SDD §8 Phase M4.5
 */

export interface TaxScenarioInput {
  /** 매각가 (만원) */
  askingPriceManwon: number;
  /** 연간 NOI (원) */
  annualNoiKrw: number;
  /** 공시지가 (원/㎡, 선택) */
  officialLandPricePerSqm?: number;
  /** 대지면적 (㎡) */
  platAreaSqm?: number;
  /** 보유 예정 기간 (년, 기본값 5) */
  holdingPeriodYears?: number;
  /** 예상 매각가 상승률 (연 %, 기본값 2) */
  annualAppreciationPct?: number;
}

export interface TaxScenarioResult {
  type: '개인' | '법인' | '매도자';
  acquisitionTaxManwon: number;
  acquisitionTaxRatePct: number;
  annualPropertyTaxManwon: number;
  incomeTaxManwon: number; // 연간 소득세/법인세
  totalTax5YearManwon: number;
  netYieldAfterTaxPct: number;
  notes: string[];
}

export interface TaxComparisonOutput {
  scenarios: TaxScenarioResult[];
  markdownTable: string;
  recommendation: string;
}

import { ACQUISITION_COSTS } from '@/domain/ontology/market-defaults';

const BASE_ACQUISITION_TAX_RATE = ACQUISITION_COSTS.taxRatePct / 100;

// 세율 상수 (간이 계산용)
const TAX_RATES = {
  // 취득세
  acquisition: {
    individual: BASE_ACQUISITION_TAX_RATE, // 4.6%
    corporate: BASE_ACQUISITION_TAX_RATE,  // 4.6%
    corporateHeavy: BASE_ACQUISITION_TAX_RATE * 2, // 중과세율 (9.2%)
  },
  // 재산세 (간이)
  propertyTax: {
    rate: 0.004, // 공시지가 대비 0.4%
  },
  // 종합소득세 구간 (간이 평균)
  incomeTax: {
    individual: [
      { limit: 1400, rate: 0.06 },
      { limit: 5000, rate: 0.15 },
      { limit: 8800, rate: 0.24 },
      { limit: 15000, rate: 0.35 },
      { limit: 30000, rate: 0.38 },
      { limit: 50000, rate: 0.40 },
      { limit: 100000, rate: 0.42 },
      { limit: Infinity, rate: 0.45 },
    ],
    corporate: [
      { limit: 20000, rate: 0.09 },
      { limit: 200000, rate: 0.19 },
      { limit: 3000000, rate: 0.21 },
      { limit: Infinity, rate: 0.24 },
    ],
  },
};

function calculateProgressiveTax(incomeManwon: number, brackets: { limit: number; rate: number }[]): number {
  let tax = 0;
  let remaining = incomeManwon;
  let prevLimit = 0;
  for (const bracket of brackets) {
    const taxable = Math.min(remaining, bracket.limit - prevLimit);
    if (taxable <= 0) break;
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prevLimit = bracket.limit;
  }
  return Math.round(tax);
}

export function compareTaxScenarios(input: TaxScenarioInput): TaxComparisonOutput {
  const {
    askingPriceManwon,
    annualNoiKrw,
    officialLandPricePerSqm,
    platAreaSqm,
    holdingPeriodYears = 5,
    annualAppreciationPct = 2,
  } = input;

  const annualNoiManwon = annualNoiKrw / 10000;
  
  // 공시지가 기반 재산세 (공시지가 없으면 매각가의 60% 추정)
  const assessedValue = (officialLandPricePerSqm && platAreaSqm)
    ? Math.round(officialLandPricePerSqm * platAreaSqm / 10000) // 만원 변환
    : Math.round(askingPriceManwon * 0.6);

  const annualPropertyTax = Math.round(assessedValue * TAX_RATES.propertyTax.rate);

  // 개인 시나리오
  const individualAcquisition = Math.round(askingPriceManwon * TAX_RATES.acquisition.individual);
  const individualIncomeTax = calculateProgressiveTax(annualNoiManwon, TAX_RATES.incomeTax.individual);
  const individualTotal5Y = individualAcquisition + (annualPropertyTax + individualIncomeTax) * holdingPeriodYears;
  const individualNetYield = annualNoiManwon > 0
    ? parseFloat(((annualNoiManwon - individualIncomeTax - annualPropertyTax) / askingPriceManwon * 100).toFixed(1))
    : 0;

  // 법인 시나리오
  const corporateAcquisition = Math.round(askingPriceManwon * TAX_RATES.acquisition.corporate);
  const corporateIncomeTax = calculateProgressiveTax(annualNoiManwon, TAX_RATES.incomeTax.corporate);
  const corporateTotal5Y = corporateAcquisition + (annualPropertyTax + corporateIncomeTax) * holdingPeriodYears;
  const corporateNetYield = annualNoiManwon > 0
    ? parseFloat(((annualNoiManwon - corporateIncomeTax - annualPropertyTax) / askingPriceManwon * 100).toFixed(1))
    : 0;

  // 매도자 양도세 시나리오 (예상 양도차익 기준)
  const futurePrice = Math.round(askingPriceManwon * Math.pow(1 + annualAppreciationPct / 100, holdingPeriodYears));
  const capitalGain = futurePrice - askingPriceManwon;
  const sellerCapitalGainsTax = calculateProgressiveTax(capitalGain, TAX_RATES.incomeTax.individual);

  const scenarios: TaxScenarioResult[] = [
    {
      type: '개인',
      acquisitionTaxManwon: individualAcquisition,
      acquisitionTaxRatePct: TAX_RATES.acquisition.individual * 100,
      annualPropertyTaxManwon: annualPropertyTax,
      incomeTaxManwon: individualIncomeTax,
      totalTax5YearManwon: individualTotal5Y,
      netYieldAfterTaxPct: individualNetYield,
      notes: ['종합소득세 적용 (누진세율 6~45%)', '개인사업자 필요적 경비 공제 가능'],
    },
    {
      type: '법인',
      acquisitionTaxManwon: corporateAcquisition,
      acquisitionTaxRatePct: TAX_RATES.acquisition.corporate * 100,
      annualPropertyTaxManwon: annualPropertyTax,
      incomeTaxManwon: corporateIncomeTax,
      totalTax5YearManwon: corporateTotal5Y,
      netYieldAfterTaxPct: corporateNetYield,
      notes: ['법인세 적용 (9~24%)', '감가상각비 추가 공제', '법인 운영비 인정 범위 확대'],
    },
    {
      type: '매도자',
      acquisitionTaxManwon: 0,
      acquisitionTaxRatePct: 0,
      annualPropertyTaxManwon: 0,
      incomeTaxManwon: sellerCapitalGainsTax,
      totalTax5YearManwon: sellerCapitalGainsTax,
      netYieldAfterTaxPct: 0,
      notes: [
        `${holdingPeriodYears}년 보유 후 매각 가정 (연 ${annualAppreciationPct}% 상승)`,
        `예상 양도차익: ${(capitalGain / 10000).toFixed(1)}억원`,
        `양도소득세: ${(sellerCapitalGainsTax / 10000).toFixed(1)}억원`,
      ],
    },
  ];

  const markdownTable = [
    '### 💰 세금 시나리오 비교',
    '',
    '| 항목 | 개인 취득 | 법인 취득 | 매도자 |',
    '|:---|---:|---:|---:|',
    `| 취득세 | ${(individualAcquisition / 10000).toFixed(1)}억 | ${(corporateAcquisition / 10000).toFixed(1)}억 | - |`,
    `| 연간 재산세 | ${annualPropertyTax.toLocaleString()}만 | ${annualPropertyTax.toLocaleString()}만 | - |`,
    `| 연간 소득세/법인세 | ${individualIncomeTax.toLocaleString()}만 | ${corporateIncomeTax.toLocaleString()}만 | - |`,
    `| **${holdingPeriodYears}년 총 세금** | **${(individualTotal5Y / 10000).toFixed(1)}억** | **${(corporateTotal5Y / 10000).toFixed(1)}억** | **${(sellerCapitalGainsTax / 10000).toFixed(1)}억** |`,
    `| 세후 수익률 | ${individualNetYield}% | ${corporateNetYield}% | - |`,
    '',
    `> ⚠️ 간이 계산으로 실제 세금과 다를 수 있습니다. 정확한 세무 상담을 권장합니다.`,
  ].join('\n');

  // 추천
  const recommendation = corporateNetYield > individualNetYield
    ? `법인 취득이 세후 수익률 ${corporateNetYield}%로 개인(${individualNetYield}%) 대비 유리합니다. 감가상각비 추가 공제 효과를 고려하면 법인 취득을 검토하시기 바랍니다.`
    : `개인 취득 세후 수익률 ${individualNetYield}%로 법인(${corporateNetYield}%) 대비 동등하거나 유리합니다. 단, 재산 규모 확대 시 법인 전환을 검토하시기 바랍니다.`;

  return { scenarios, markdownTable, recommendation };
}
