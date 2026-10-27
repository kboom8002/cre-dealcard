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

export function extractTransactionFacts(
  raw: Record<string, any>,
  landAreaPyeong: number,
  gfaPyeong: number,
  depositKrw: number = 0
): PureTransactionFacts {
  const ssot = raw?.ssot_summary || raw?.layers?.financial || raw || {};

  const rawAsking = raw?.asking_price_krw ?? (raw?.asking_price_manwon ? Number(raw.asking_price_manwon) * 10000 : null) ?? raw?.asking_price;
  const ssotAsking = ssot?.asking_price_manwon ? Number(ssot.asking_price_manwon) * 10000 : (ssot?.asking_price ?? ssot?.price ?? 0);
  const askingPriceKrw = Number(rawAsking ?? ssotAsking);

  const askingPriceManwon = Math.round(askingPriceKrw / 10000);

  const pricePerPyeongLandWon = landAreaPyeong > 0 && askingPriceKrw > 0
    ? Math.round(askingPriceKrw / landAreaPyeong)
    : 0;

  const pricePerPyeongGfaWon = gfaPyeong > 0 && askingPriceKrw > 0
    ? Math.round(askingPriceKrw / gfaPyeong)
    : 0;

  const loanRatio = Number(raw?.expected_loan_ratio ?? ssot?.loan_ratio ?? 0.6); // default 60%
  const expectedLoanKrw = askingPriceKrw > 0
    ? Math.round(askingPriceKrw * loanRatio)
    : undefined;

  // 실투자금 = 매매가 - 보증금 - 대출금
  const estimatedEquityKrw = askingPriceKrw > 0 && expectedLoanKrw !== undefined
    ? Math.max(0, askingPriceKrw - depositKrw - expectedLoanKrw)
    : undefined;

  // 취득세 4.6% (상업용 표준)
  const acquisitionTaxEstimateKrw = askingPriceKrw > 0
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
