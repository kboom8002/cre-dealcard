/**
 * @file src/domain/building/im-core/facts/valuation.ts
 * @description Pure domain facts extraction for Financial Valuation & Yields.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export interface PureValuationFacts {
  grossYieldPct: number;
  netYieldPct: number;
  capRatePct: number;
  cashOnCashPct?: number;
  netAnnualOperatingIncomeKrw: number;
}

export function extractValuationFacts(
  askingPriceKrw: number,
  depositKrw: number,
  monthlyRentKrw: number,
  maintenanceFeeKrw: number = 0,
  expectedLoanKrw?: number,
  loanInterestRatePct: number = 4.5
): PureValuationFacts {
  const annualRentKrw = monthlyRentKrw * 12;
  const annualMaintenanceKrw = maintenanceFeeKrw * 12;
  const annualRevenueKrw = annualRentKrw + annualMaintenanceKrw;

  // 표준 관리비/운영비 (OPEX) 추정: 관리비 실비 + 총임대료의 5%
  const annualOpexKrw = annualMaintenanceKrw + Math.round(annualRentKrw * 0.05);
  const netAnnualOperatingIncomeKrw = Math.max(0, annualRevenueKrw - annualOpexKrw);

  // V04 단일 수익률 정의:
  // 총수익률 (Gross Yield) = 연간 총임대료 / (매매가 - 보증금)
  // (만약 보증금이 없거나 매매가보다 크면 매매가 단독 분모)
  const hasValidDeposit = depositKrw > 0 && depositKrw < askingPriceKrw;
  const netInvestmentKrw = hasValidDeposit ? askingPriceKrw - depositKrw : askingPriceKrw;

  const grossYieldPct = netInvestmentKrw > 0 && annualRentKrw > 0
    ? Math.round(((annualRentKrw / netInvestmentKrw) * 100) * 100) / 100
    : 0;

  // Cap Rate (자본환원율) = NOI / 매매가
  const capRatePct = askingPriceKrw > 0 && netAnnualOperatingIncomeKrw > 0
    ? Math.round(((netAnnualOperatingIncomeKrw / askingPriceKrw) * 100) * 100) / 100
    : grossYieldPct;

  // 순수익률 (Net Yield) = NOI / 실투자금
  const netYieldPct = netInvestmentKrw > 0 && netAnnualOperatingIncomeKrw > 0
    ? Math.round(((netAnnualOperatingIncomeKrw / netInvestmentKrw) * 100) * 100) / 100
    : grossYieldPct;

  // Cash on Cash Yield (대출 레버리지 감안 자기자본 수익률)
  let cashOnCashPct: number | undefined;
  if (expectedLoanKrw && expectedLoanKrw > 0) {
    const annualInterestKrw = Math.round(expectedLoanKrw * (loanInterestRatePct / 100));
    const cashFlowAfterDebt = netAnnualOperatingIncomeKrw - annualInterestKrw;
    const equityKrw = Math.max(0, netInvestmentKrw - expectedLoanKrw);
    if (equityKrw > 0) {
      cashOnCashPct = Math.round(((cashFlowAfterDebt / equityKrw) * 100) * 100) / 100;
    }
  }

  return {
    grossYieldPct,
    netYieldPct,
    capRatePct,
    cashOnCashPct,
    netAnnualOperatingIncomeKrw,
  };
}
