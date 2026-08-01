/**
 * loan-simulation.ts
 * 
 * Pro 전용 대출 시뮬레이션 모듈.
 * BudgetSlider의 딜카드 인터랙션 데이터를 시드로 활용.
 * 
 * @see SDD §8 Phase M4.5
 */

export interface LoanSimulationInput {
  /** 매각 희망가 (만원) */
  askingPriceManwon: number;
  /** NOI (연간, 원) */
  annualNoiKrw: number;
  /** 기존 대출 잔액 (만원, 선택) */
  existingLoanManwon?: number;
  /** 보증금 총액 (만원) */
  totalDepositManwon?: number;
  /** 대출 금리 (%, 기본값 5.0) */
  interestRatePct?: number;
  /** 대출 기간 (년, 기본값 20) */
  loanTermYears?: number;
  /** 원금 거치 기간 (년, 기본값 3) */
  gracePeriodYears?: number;
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
}

export interface LoanSimulationOutput {
  scenarios: LoanScenario[];
  markdownTable: string;
  recommendedLtv: number;
  warnings: string[];
}

/**
 * LTV 30%~70% 범위에서 10%p 간격으로 대출 시나리오를 생성합니다.
 */
export function simulateLoanScenarios(input: LoanSimulationInput): LoanSimulationOutput {
  const {
    askingPriceManwon,
    annualNoiKrw,
    existingLoanManwon = 0,
    totalDepositManwon = 0,
    interestRatePct = 5.0,
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
    
    // Cash-on-Cash = (NOI - Debt Service) / Equity
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
    if (s.dscr < 1.2 && s.dscr > 0) {
      warnings.push(`LTV ${s.ltvPct}%: DSCR ${s.dscr}로 대출 부적격 위험 (기준: 1.2x 이상)`);
    }
    if (s.rti < 1.5 && s.rti > 0) {
      warnings.push(`LTV ${s.ltvPct}%: RTI ${s.rti}로 상환능력 연약 (기준: 1.5x 이상)`);
    }
  }

  // 추천 LTV: DSCR >= 1.3 && RTI >= 1.5 중 최대 LTV
  const eligible = scenarios.filter(s => s.dscr >= 1.3 && s.rti >= 1.5);
  const recommendedLtv = eligible.length > 0 
    ? eligible[eligible.length - 1].ltvPct 
    : 30;

  // 마크다운 테이블
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
