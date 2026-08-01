/**
 * @module PriceOpinion
 * @description Generates Broker Price Opinion (BPO) and pricing insights for deals.
 */

export interface PriceOpinionInput {
  askingPriceKrw: number;
  marketAverageKrw: number;
  recentTransactionsKrw: number[];
  yieldRate: number;
}

export interface PriceOpinionResult {
  recommendedPriceKrw: number;
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
}

export function calculatePriceOpinion(input: PriceOpinionInput): PriceOpinionResult {
  const avgRecent = input.recentTransactionsKrw.length > 0 
    ? input.recentTransactionsKrw.reduce((a, b) => a + b, 0) / input.recentTransactionsKrw.length 
    : input.marketAverageKrw;

  const baseline = (input.askingPriceKrw + input.marketAverageKrw + avgRecent) / 3;

  let recommended = baseline;
  if (input.yieldRate > 5) {
    recommended = baseline * 1.05; // Premium for high yield
  } else if (input.yieldRate < 3) {
    recommended = baseline * 0.95; // Discount for low yield
  }

  return {
    recommendedPriceKrw: Math.round(recommended / 1000000) * 1000000,
    confidence: input.recentTransactionsKrw.length >= 3 ? 'High' : 'Medium',
    reasoning: `Based on asking price, market average, and ${input.recentTransactionsKrw.length} recent transactions, adjusted by a yield rate of ${input.yieldRate}%.`,
  };
}
