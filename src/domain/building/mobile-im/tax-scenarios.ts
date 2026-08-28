/**
 * tax-scenarios.ts
 * 
 * Pro 전용 세금 시나리오 비교 모듈.
 * 개인/법인/매도자 및 포스처별(개발부담금, 단기양도세 중과 등) 세금 시나리오 비교.
 * 
 * @see SDD §8 Phase M4.5
 */

import type { InvestmentPosture } from '@/domain/ontology';
import { ACQUISITION_COSTS } from '@/domain/ontology/market-defaults';

export interface TaxScenarioInput {
  /** 투자 포스처 */
  posture?: InvestmentPosture;
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

  // ── 추가 세무 옵션 ──
  /** 법인 취득 여부 */
  isCorporate?: boolean;
  /** 조정대상지역 여부 */
  isRegulatedArea?: boolean;
  /** 과밀억제권역 여부 (법인 중과세 판정용) */
  isMetropolitanArea?: boolean;
  /** 주거용 여부 */
  isResidential?: boolean;
  /** 보유 주택수 (개인 취득세/양도세 중과용) */
  houseCount?: number;

  // ── Development 전용 ──
  /** 농지 면적 (㎡, 농지전용부담금 산정용) */
  farmlandAreaSqm?: number;
  /** 예상 신축 공사비 (만원) */
  constructionCostManwon?: number;
}

export interface TaxScenarioResult {
  type: '개인' | '법인' | '매도자' | '개발부담금';
  acquisitionTaxManwon: number;
  acquisitionTaxRatePct: number;
  annualPropertyTaxManwon: number;
  incomeTaxManwon: number; // 연간 소득세/법인세/양도세
  totalTax5YearManwon: number;
  netYieldAfterTaxPct: number;
  notes: string[];
}

export interface TaxComparisonOutput {
  scenarios: TaxScenarioResult[];
  markdownTable: string;
  recommendation: string;
}

const BASE_ACQUISITION_TAX_RATE = ACQUISITION_COSTS.taxRatePct / 100;

// 세율 상수 (간이 계산용)
const TAX_RATES = {
  acquisition: {
    individual: BASE_ACQUISITION_TAX_RATE, // 4.6%
    corporate: BASE_ACQUISITION_TAX_RATE,  // 4.6%
    corporateHeavy: 0.094,                  // 과밀억제권역 중과세율 (9.4% - 지방세법 제13조 제2항)
  },
  propertyTax: {
    rate: 0.004, // 공시지가 대비 0.4%
  },
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
    isMetropolitanArea = false,
    isRegulatedArea = false,
    posture = 'income',
    farmlandAreaSqm = 0,
  } = input;

  const annualNoiManwon = annualNoiKrw / 10000;
  
  // 공시지가 기반 재산세 (공시지가 없으면 매각가의 60% 추정)
  const assessedValue = (officialLandPricePerSqm && platAreaSqm)
    ? Math.round(officialLandPricePerSqm * platAreaSqm / 10000)
    : Math.round(askingPriceManwon * 0.6);

  const annualPropertyTax = Math.round(assessedValue * TAX_RATES.propertyTax.rate);

  // 개인 취득 세율
  const individualAcquisitionRate = TAX_RATES.acquisition.individual;
  const individualAcquisition = Math.round(askingPriceManwon * individualAcquisitionRate);
  const individualIncomeTax = calculateProgressiveTax(annualNoiManwon, TAX_RATES.incomeTax.individual);
  const individualTotal5Y = individualAcquisition + (annualPropertyTax + individualIncomeTax) * holdingPeriodYears;
  const individualNetYield = annualNoiManwon > 0
    ? parseFloat(((annualNoiManwon - individualIncomeTax - annualPropertyTax) / askingPriceManwon * 100).toFixed(1))
    : 0;

  // 법인 취득 세율 (과밀억제권역 5년 이내 법인 중과세 적용)
  const corporateAcquisitionRate = isMetropolitanArea
    ? TAX_RATES.acquisition.corporateHeavy
    : TAX_RATES.acquisition.corporate;
  const corporateAcquisition = Math.round(askingPriceManwon * corporateAcquisitionRate);
  const corporateIncomeTax = calculateProgressiveTax(annualNoiManwon, TAX_RATES.incomeTax.corporate);
  const corporateTotal5Y = corporateAcquisition + (annualPropertyTax + corporateIncomeTax) * holdingPeriodYears;
  const corporateNetYield = annualNoiManwon > 0
    ? parseFloat(((annualNoiManwon - corporateIncomeTax - annualPropertyTax) / askingPriceManwon * 100).toFixed(1))
    : 0;

  // 매도자 양도세 시나리오 (Trading 포스처 / 단기 보유 시 중과세율 반영)
  const futurePrice = Math.round(askingPriceManwon * Math.pow(1 + annualAppreciationPct / 100, holdingPeriodYears));
  const capitalGain = futurePrice - askingPriceManwon;
  
  let sellerCapitalGainsTax = 0;
  let capitalGainsTaxNote = `${holdingPeriodYears}년 보유 후 매각 (연 ${annualAppreciationPct}% 상승)`;

  if (holdingPeriodYears < 1) {
    // 1년 미만 단기 양도세 70% (조정) 또는 50%
    const shortRate = isRegulatedArea ? 0.70 : 0.50;
    sellerCapitalGainsTax = Math.round(capitalGain * shortRate);
    capitalGainsTaxNote = `1년 미만 단기 양도 중과세율 ${shortRate * 100}% 적용`;
  } else if (holdingPeriodYears < 2) {
    // 2년 미만 단기 양도세 60% 또는 40%
    const shortRate = isRegulatedArea ? 0.60 : 0.40;
    sellerCapitalGainsTax = Math.round(capitalGain * shortRate);
    capitalGainsTaxNote = `2년 미만 단기 양도 중과세율 ${shortRate * 100}% 적용`;
  } else {
    sellerCapitalGainsTax = calculateProgressiveTax(capitalGain, TAX_RATES.incomeTax.individual);
  }

  // 개발형(development) 전용 부담금 (농지전용부담금 + 개발부담금)
  let devChargesManwon = 0;
  const devChargeNotes: string[] = [];
  if (posture === 'development') {
    if (farmlandAreaSqm > 0 && officialLandPricePerSqm) {
      // 농지전용부담금: 공시지가 30% (㎡당 5만원 한도)
      const farmChargePerSqm = Math.min(officialLandPricePerSqm * 0.30, 50000);
      const farmCharge = Math.round((farmChargePerSqm * farmlandAreaSqm) / 10000);
      devChargesManwon += farmCharge;
      devChargeNotes.push(`농지전용부담금: 약 ${(farmCharge / 10000).toFixed(1)}억원`);
    }
    // 개발부담금 (개발이익의 25% 추정)
    const estimatedLandValueIncrease = Math.round(askingPriceManwon * 0.20);
    const devCharge = Math.round(estimatedLandValueIncrease * 0.25);
    devChargesManwon += devCharge;
    devChargeNotes.push(`개발부담금 (지가 상승분 25%): 약 ${(devCharge / 10000).toFixed(1)}억원`);
  }

  const scenarios: TaxScenarioResult[] = [
    {
      type: '개인',
      acquisitionTaxManwon: individualAcquisition,
      acquisitionTaxRatePct: individualAcquisitionRate * 100,
      annualPropertyTaxManwon: annualPropertyTax,
      incomeTaxManwon: individualIncomeTax,
      totalTax5YearManwon: individualTotal5Y,
      netYieldAfterTaxPct: individualNetYield,
      notes: ['종합소득세 적용 (누진세율 6~45%)', '개인사업자 필요경비 공제 가능'],
    },
    {
      type: '법인',
      acquisitionTaxManwon: corporateAcquisition,
      acquisitionTaxRatePct: corporateAcquisitionRate * 100,
      annualPropertyTaxManwon: annualPropertyTax,
      incomeTaxManwon: corporateIncomeTax,
      totalTax5YearManwon: corporateTotal5Y,
      netYieldAfterTaxPct: corporateNetYield,
      notes: [
        `법인세 적용 (9~24%)`,
        isMetropolitanArea ? '⚠️ 과밀억제권역 취득세 중과 (9.4%) 적용' : '표준 취득세율 (4.6%) 적용',
        '감가상각비 및 이자비용 손산 반영 가능',
      ],
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
        capitalGainsTaxNote,
        `예상 양도차익: ${(capitalGain / 10000).toFixed(1)}억원`,
        `양도소득세: ${(sellerCapitalGainsTax / 10000).toFixed(1)}억원`,
      ],
    },
  ];

  if (posture === 'development' && devChargesManwon > 0) {
    scenarios.push({
      type: '개발부담금',
      acquisitionTaxManwon: 0,
      acquisitionTaxRatePct: 0,
      annualPropertyTaxManwon: 0,
      incomeTaxManwon: devChargesManwon,
      totalTax5YearManwon: devChargesManwon,
      netYieldAfterTaxPct: 0,
      notes: devChargeNotes,
    });
  }

  const markdownTable = [
    '### 💰 세금 시나리오 비교',
    '',
    '| 항목 | 개인 취득 | 법인 취득 | 매도자 (양도세) |',
    '|:---|---:|---:|---:|',
    `| 취득세 | ${(individualAcquisition / 10000).toFixed(1)}억 (${individualAcquisitionRate * 100}%) | ${(corporateAcquisition / 10000).toFixed(1)}억 (${corporateAcquisitionRate * 100}%) | - |`,
    `| 연간 재산세 | ${annualPropertyTax.toLocaleString()}만 | ${annualPropertyTax.toLocaleString()}만 | - |`,
    `| 연간 소득세/법인세 | ${individualIncomeTax.toLocaleString()}만 | ${corporateIncomeTax.toLocaleString()}만 | - |`,
    `| **${holdingPeriodYears}년 총 세금** | **${(individualTotal5Y / 10000).toFixed(1)}억** | **${(corporateTotal5Y / 10000).toFixed(1)}억** | **${(sellerCapitalGainsTax / 10000).toFixed(1)}억** |`,
    `| 세후 수익률 | ${individualNetYield}% | ${corporateNetYield}% | - |`,
    devChargesManwon > 0 ? `| **개발 관련 부담금** | - | - | **${(devChargesManwon / 10000).toFixed(1)}억** |` : '',
    '',
    `> ⚠️ 간이 계산으로 실제 세금과 다를 수 있습니다. 정확한 세무 상담을 권장합니다.`,
  ].filter(Boolean).join('\n');

  const recommendation = corporateNetYield > individualNetYield
    ? `법인 취득이 세후 수익률 ${corporateNetYield}%로 개인(${individualNetYield}%) 대비 유리합니다. ${isMetropolitanArea ? '단, 과밀억제권역 취득세 중과에 주의하세요.' : '감가상각비 추가 공제 효과를 활용할 수 있습니다.'}`
    : `개인 취득 세후 수익률 ${individualNetYield}%로 법인(${corporateNetYield}%) 대비 동등하거나 유리합니다.`;

  return { scenarios, markdownTable, recommendation };
}
