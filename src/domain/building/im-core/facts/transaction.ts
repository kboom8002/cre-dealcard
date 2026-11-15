/**
 * @file src/domain/building/im-core/facts/transaction.ts
 * @description Pure domain facts extraction for Transaction & Deal Terms.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export interface PureTransactionFacts {
  askingPriceKrw: number;
  askingPriceManwon: number;
  pricePerPyeongLandWon: number;
  pricePerPyeongGfaWon: number;
  expectedLoanKrw?: number;
  estimatedEquityKrw?: number;
  acquisitionTaxEstimateKrw?: number;
}

function finiteOrNull(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function extractTransactionFacts(
  raw: Record<string, any>,
  landAreaPyeong: number,
  gfaPyeong: number,
  depositKrw: number = 0
): PureTransactionFacts {
  const ssot = raw?.ssot_summary || raw?.layers?.financial || raw || {};
  const fin = raw?.financials && typeof raw.financials === 'object' ? raw.financials : null;
  const hero = raw?.heroCard && typeof raw.heroCard === 'object' ? raw.heroCard : null;

  const rawAsking =
    raw?.asking_price_krw ??
    (raw?.asking_price_manwon != null ? Number(raw.asking_price_manwon) * 10000 : null) ??
    raw?.asking_price;
  const ssotAsking =
    ssot?.asking_price_manwon != null
      ? Number(ssot.asking_price_manwon) * 10000
      : (ssot?.asking_price ?? ssot?.price ?? 0);
  const askingPriceKrw = Number(rawAsking ?? ssotAsking) || 0;

  const askingPriceManwon = Math.round(askingPriceKrw / 10000);

  const pricePerPyeongLandWon = landAreaPyeong > 0 && askingPriceKrw > 0
    ? Math.round(askingPriceKrw / landAreaPyeong)
    : 0;

  const pricePerPyeongGfaWon = gfaPyeong > 0 && askingPriceKrw > 0
    ? Math.round(askingPriceKrw / gfaPyeong)
    : 0;

  const explicitLoanKrw =
    finiteOrNull(raw?.expected_loan_krw) ??
    (finiteOrNull(raw?.loan_amount_manwon ?? ssot?.loan_amount_manwon) != null
      ? Math.round(Number(raw?.loan_amount_manwon ?? ssot?.loan_amount_manwon) * 10000)
      : null) ??
    (finiteOrNull(fin?.loanAmountBil) != null
      ? Math.round(Number(fin.loanAmountBil) * 1e8)
      : null);

  const loanRatio = Number(raw?.expected_loan_ratio ?? ssot?.loan_ratio ?? 0.6); // default 60%
  const expectedLoanKrw =
    explicitLoanKrw != null && explicitLoanKrw >= 0
      ? explicitLoanKrw
      : askingPriceKrw > 0
      ? Math.round(askingPriceKrw * loanRatio)
      : undefined;

  const explicitEquityKrw =
    finiteOrNull(raw?.estimated_equity_krw) ??
    (finiteOrNull(fin?.equityRequired) != null
      ? Math.round(Number(fin.equityRequired) * 1e8)
      : null) ??
    (finiteOrNull(hero?.equityRequiredBil) != null
      ? Math.round(Number(hero.equityRequiredBil) * 1e8)
      : null);

  // 실투자금 = 매매가 - 보증금 - 대출금 (FinancialCalculator SSoT 우선)
  const estimatedEquityKrw =
    explicitEquityKrw != null && explicitEquityKrw >= 0
      ? explicitEquityKrw
      : askingPriceKrw > 0 && expectedLoanKrw !== undefined
      ? Math.max(0, askingPriceKrw - depositKrw - expectedLoanKrw)
      : undefined;

  const explicitAcquisitionTaxKrw =
    finiteOrNull(raw?.acquisition_tax_estimate_krw) ??
    (finiteOrNull(fin?.acquisitionTaxBil) != null
      ? Math.round(Number(fin.acquisitionTaxBil) * 1e8)
      : null);

  // 취득세 4.6% (상업용 표준, FinancialCalculator SSoT 우선)
  const acquisitionTaxEstimateKrw =
    explicitAcquisitionTaxKrw != null && explicitAcquisitionTaxKrw >= 0
      ? explicitAcquisitionTaxKrw
      : askingPriceKrw > 0
      ? Math.round(askingPriceKrw * 0.046)
      : undefined;

  return {
    askingPriceKrw,
    askingPriceManwon,
    pricePerPyeongLandWon,
    pricePerPyeongGfaWon,
    expectedLoanKrw,
    estimatedEquityKrw,
    acquisitionTaxEstimateKrw,
  };
}
