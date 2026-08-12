/**
 * loan-simulation.ts
 * 
 * Pro 전용 대출 시뮬레이션 모듈.
 * BudgetSlider의 딜카드 인터랙션 데이터를 시드로 활용.
 * 포스처별 대출 시나리오(상업용 담보대출 및 개발형 PF 브릿지론/본PF) 지원.
 * 
 * @see SDD §8 Phase M4.5
 */

import type { InvestmentPosture } from '@/domain/ontology';
import { COMMERCIAL_MORTGAGE, DEVELOPMENT_PF } from '@/domain/ontology/market-defaults';

export interface LoanSimulationInput {
  /** 투자 포스처 */
  posture?: InvestmentPosture;
  /** 매각 희망가 (만원) */
  askingPriceManwon: number;
  /** NOI (연간, 원) */
  annualNoiKrw: number;
  /** 기존 대출 잔액 (만원, 선택) */
  existingLoanManwon?: number;
  /** 보증금 총액 (만원) */
  totalDepositManwon?: number;
  /** 대출 금리 (%, 기본값 5.2) */
  interestRatePct?: number;
  /** 대출 기간 (년, 기본값 20) */
  loanTermYears?: number;
  /** 원금 거치 기간 (년, 기본값 3) */
  gracePeriodYears?: number;

  // ── Development 전용 파라미터 ──
  /** 총 개발 사업비 (만원) */
  totalProjectCostManwon?: number;
  /** 브릿지론 금리 (%) */
  bridgeLoanRatePct?: number;
  /** 본PF 금리 (%) */
  mainPfRatePct?: number;
}

export interface LoanScenario {
  ltvPct: number;
  loanAmountManwon: number;
  equityRequiredManwon: number;
  monthlyPaymentManwon: number; // 원리금 균등
  monthlyInterestOnlyManwon: number; // 이자만
  annualDebtServiceManwon: number; // 연간 원리금
  dscr: number; // Debt Service Coverage Ratio
  rti: number; // Rent to Interest ratio
  leveragedYieldPct: number; // 레버리지 수익률
  cashOnCashPct: number; // Cash-on-Cash Return
  stageName?: string;
}

export interface LoanSimulationOutput {
  scenarios: LoanScenario[];
  markdownTable: string;
  recommendedLtv: number;
  warnings: string[];
}

/**
 * 포스처별 대출 시나리오를 생성합니다.
 */
export function simulateLoanScenarios(input: LoanSimulationInput): LoanSimulationOutput {
  const posture = input.posture ?? 'income';

  if (posture === 'development') {
    return simulateDevelopmentPF(input);
  }

  return simulateMortgageScenarios(input);
}

/**
 * 일반 상업용 담보대출 시뮬레이션
 */
function simulateMortgageScenarios(input: LoanSimulationInput): LoanSimulationOutput {
  const {
    askingPriceManwon,
    annualNoiKrw,
    totalDepositManwon = 0,
    interestRatePct = COMMERCIAL_MORTGAGE.interestRatePct,
    loanTermYears = 20,
    gracePeriodYears = 3,
  } = input;

  const annualNoiManwon = annualNoiKrw / 10000;
  const monthlyRate = interestRatePct / 100 / 12;
  const totalPayments = loanTermYears * 12;
  const warnings: string[] = [];

  const ltvRange = [30, 40, 50, 60, 70];
  const scenarios: LoanScenario[] = ltvRange.map(ltvPct => {
    const loanAmountManwon = Math.round(askingPriceManwon * ltvPct / 100);
    const equityRequiredManwon = Math.max(0, askingPriceManwon - loanAmountManwon - totalDepositManwon);
    
    // 월 이자 (이자만)
    const monthlyInterestOnlyManwon = Math.round(loanAmountManwon * monthlyRate);
    
    // 월 원리금 균등 (PMT 공식)
    let monthlyPaymentManwon: number;
    if (monthlyRate === 0) {
      monthlyPaymentManwon = Math.round(loanAmountManwon / totalPayments);
    } else {
      monthlyPaymentManwon = Math.round(
        loanAmountManwon * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)
        / (Math.pow(1 + monthlyRate, totalPayments) - 1)
      );
    }
    
    const annualDebtServiceManwon = monthlyPaymentManwon * 12;
    
    // DSCR = NOI / Annual Debt Service
    const dscr = annualDebtServiceManwon > 0 
      ? parseFloat((annualNoiManwon / annualDebtServiceManwon).toFixed(2))
      : 0;
    
    // RTI = Annual Rent Income / Annual Interest
    const annualInterest = monthlyInterestOnlyManwon * 12;
    const rti = annualInterest > 0
      ? parseFloat((annualNoiManwon / annualInterest).toFixed(2))
      : 0;
    
    // Leveraged Yield = (NOI - Debt Service) / Equity
    const leveragedYieldPct = equityRequiredManwon > 0
      ? parseFloat(((annualNoiManwon - annualDebtServiceManwon) / equityRequiredManwon * 100).toFixed(1))
      : 0;
    
    const cashOnCashPct = leveragedYieldPct;
    
    return {
      ltvPct,
      loanAmountManwon,
      equityRequiredManwon,
      monthlyPaymentManwon,
      monthlyInterestOnlyManwon,
      annualDebtServiceManwon,
      dscr,
      rti,
      leveragedYieldPct,
      cashOnCashPct,
    };
  });

  // 경고 생성
  for (const s of scenarios) {
    if (s.loanAmountManwon > 0 && s.dscr < 1.2) {
      warnings.push(`LTV ${s.ltvPct}%: DSCR ${s.dscr}로 대출 부적격 위험 (기준: 1.2x 이상)`);
    }
    if (s.loanAmountManwon > 0 && s.rti < 1.5) {
      warnings.push(`LTV ${s.ltvPct}%: RTI ${s.rti}로 상환능력 연약 (기준: 1.5x 이상)`);
    }
  }

  const eligible = scenarios.filter(s => s.dscr >= 1.3 && s.rti >= 1.5);
  const recommendedLtv = eligible.length > 0 
    ? eligible[eligible.length - 1].ltvPct 
    : 30;

  const markdownTable = [
    '### 🏦 대출 시나리오 비교',
    '',
    `> 금리 ${interestRatePct}% / ${loanTermYears}년 상환 / 거치기간 ${gracePeriodYears}년 기준`,
    '',
    '| LTV | 대출액 | 자기자본 | 월 상환액 | DSCR | CoC |',
    '|:---:|---:|---:|---:|:---:|:---:|',
    ...scenarios.map(s => 
      `| ${s.ltvPct}% ${s.ltvPct === recommendedLtv ? '✅' : ''} | ${(s.loanAmountManwon / 10000).toFixed(1)}억 | ${(s.equityRequiredManwon / 10000).toFixed(1)}억 | ${s.monthlyPaymentManwon.toLocaleString()}만 | ${s.dscr}x | ${s.cashOnCashPct}% |`
    ),
  ].join('\n');

  return { scenarios, markdownTable, recommendedLtv, warnings };
}

/**
 * 개발형 (Development) 2단계 PF 대출 시뮬레이션
 */
function simulateDevelopmentPF(input: LoanSimulationInput): LoanSimulationOutput {
  const {
    askingPriceManwon,
    totalProjectCostManwon = Math.round(askingPriceManwon * 1.8),
    bridgeLoanRatePct = DEVELOPMENT_PF.bridge.interestRatePct,
    mainPfRatePct = DEVELOPMENT_PF.mainPF.interestRatePct,
  } = input;

  const warnings: string[] = [];

  // 1단계: 브릿지론 (토지 매입가 LTV 40%)
  const bridgeLtv = DEVELOPMENT_PF.bridge.ltvPct;
  const bridgeLoanManwon = Math.round(askingPriceManwon * bridgeLtv / 100);
  const bridgeEquityManwon = askingPriceManwon - bridgeLoanManwon;
  const bridgeMonthlyInterest = Math.round(bridgeLoanManwon * (bridgeLoanRatePct / 100 / 12));
  const bridgeAnnualDebtService = bridgeMonthlyInterest * 12;

  const bridgeScenario: LoanScenario = {
    stageName: '브릿지론 (토지매입)',
    ltvPct: bridgeLtv,
    loanAmountManwon: bridgeLoanManwon,
    equityRequiredManwon: bridgeEquityManwon,
    monthlyPaymentManwon: bridgeMonthlyInterest,
    monthlyInterestOnlyManwon: bridgeMonthlyInterest,
    annualDebtServiceManwon: bridgeAnnualDebtService,
    dscr: 0,
    rti: 0,
    leveragedYieldPct: 0,
    cashOnCashPct: 0,
  };

  // 2단계: 본 PF (총 사업비 LTC 55%)
  const mainPfLtc = DEVELOPMENT_PF.mainPF.ltcPct;
  const mainPfLoanManwon = Math.round(totalProjectCostManwon * mainPfLtc / 100);
  const mainPfEquityManwon = totalProjectCostManwon - mainPfLoanManwon;
  const mainPfMonthlyInterest = Math.round(mainPfLoanManwon * (mainPfRatePct / 100 / 12));
  const mainPfAnnualDebtService = mainPfMonthlyInterest * 12;

  const mainPfScenario: LoanScenario = {
    stageName: '본 PF (착공~준공)',
    ltvPct: mainPfLtc,
    loanAmountManwon: mainPfLoanManwon,
    equityRequiredManwon: mainPfEquityManwon,
    monthlyPaymentManwon: mainPfMonthlyInterest,
    monthlyInterestOnlyManwon: mainPfMonthlyInterest,
    annualDebtServiceManwon: mainPfAnnualDebtService,
    dscr: 0,
    rti: 0,
    leveragedYieldPct: 0,
    cashOnCashPct: 0,
  };

  warnings.push('개발형 자산: 브릿지론 만기(1.5년) 내 본PF 전환 및 인허가 리스크 관리가 필수적입니다.');

  const markdownTable = [
    '### 🏗️ 신축 개발 PF (Project Finance) 자금 조달 시나리오',
    '',
    `> **브릿지론**: 금리 ${bridgeLoanRatePct}%, 토지비 LTV ${bridgeLtv}% 기준 / **본 PF**: 금리 ${mainPfRatePct}%, 총사업비 LTC ${mainPfLtc}% 기준`,
    '',
    '| 구분 | 목표 비율 | 대출 조달액 | 필요 자기자본 | 월 금융 비용 (이자) |',
    '|:---|:---:|---:|---:|---:|',
    `| **1단계 브릿지론** | LTV ${bridgeLtv}% | ${(bridgeLoanManwon / 10000).toFixed(1)}억 원 | ${(bridgeEquityManwon / 10000).toFixed(1)}억 원 | 월 ${bridgeMonthlyInterest.toLocaleString()}만 원 |`,
    `| **2단계 본 PF** | LTC ${mainPfLtc}% | ${(mainPfLoanManwon / 10000).toFixed(1)}억 원 | ${(mainPfEquityManwon / 10000).toFixed(1)}억 원 | 월 ${mainPfMonthlyInterest.toLocaleString()}만 원 |`,
  ].join('\n');

  return {
    scenarios: [bridgeScenario, mainPfScenario],
    markdownTable,
    recommendedLtv: bridgeLtv,
    warnings,
  };
}
