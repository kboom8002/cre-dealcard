/**
 * CREDEAL v3 Explainable 3-Tier Buyer Matcher (S3-T10)
 * 
 * Pairs buyer intents with deal cards using 3 tiers:
 * Tier 1: Hard Filters (Budget, Region, Usage)
 * Tier 2: Archetype Alignment (STABLE_INCOME, VALUE_ADD, etc.)
 * Tier 3: Soft Similarity Scoring
 * 
 * Returns overall Match Score (0-100), Tier (S/A/B/C), and explicit Mismatch Reasons.
 */

export interface BuyerIntentData {
  maxBudgetKrw: number;
  minYieldPct?: number;
  targetRegions: string[];
  preferredArchetypes?: string[];
}

export interface DealMatchInput {
  dealId: string;
  askingPriceKrw: number;
  capRatePct?: number;
  regionName: string;
  archetype: string;
}

export interface ExplainableMatchResult {
  dealId: string;
  matchScore: number; // 0 to 100
  matchTier: 'S' | 'A' | 'B' | 'C' | 'DISQUALIFIED';
  isHardFilterPassed: boolean;
  mismatchReasons: string[];
  matchHighlights: string[];
}

export function matchBuyerWithDeal(
  buyer: BuyerIntentData,
  deal: DealMatchInput
): ExplainableMatchResult {
  const mismatchReasons: string[] = [];
  const matchHighlights: string[] = [];

  // Tier 1: Hard Filter Checks
  let hardFilterPassed = true;

  // 1a. Budget Check (allow 5% flexibility)
  if (deal.askingPriceKrw > buyer.maxBudgetKrw * 1.05) {
    hardFilterPassed = false;
    const overPct = Math.round(((deal.askingPriceKrw - buyer.maxBudgetKrw) / buyer.maxBudgetKrw) * 100);
    mismatchReasons.push(`예산 초과: 희망 예산 대비 ${overPct}% 높음`);
  } else {
    matchHighlights.push('예산 범위 부합');
  }

  // 1b. Region Check
  const regionMatched = buyer.targetRegions.some(
    (r) => deal.regionName.includes(r) || r.includes(deal.regionName)
  );
  if (!regionMatched && buyer.targetRegions.length > 0) {
    hardFilterPassed = false;
    mismatchReasons.push(`지역 불일치: 희망 지역(${buyer.targetRegions.join(', ')}) 미포함`);
  } else if (regionMatched) {
    matchHighlights.push(`희망 권역(${deal.regionName}) 부합`);
  }

  if (!hardFilterPassed) {
    return {
      dealId: deal.dealId,
      matchScore: 30,
      matchTier: 'DISQUALIFIED',
      isHardFilterPassed: false,
      mismatchReasons,
      matchHighlights,
    };
  }

  // Tier 2: Archetype Alignment (Weight 40%)
  let archetypeScore = 70;
  if (buyer.preferredArchetypes?.includes(deal.archetype)) {
    archetypeScore = 100;
    matchHighlights.push(`선호 아키타입(${deal.archetype}) 일치`);
  }

  // Tier 3: Yield / Soft Metrics (Weight 30%)
  let yieldScore = 80;
  if (buyer.minYieldPct && deal.capRatePct) {
    if (deal.capRatePct >= buyer.minYieldPct) {
      yieldScore = 100;
      matchHighlights.push(`목표 수익률(${buyer.minYieldPct}%) 달성 (현재 ${deal.capRatePct}%)`);
    } else {
      yieldScore = 50;
      mismatchReasons.push(`목표 수익률 미달 (목표 ${buyer.minYieldPct}% vs 현재 ${deal.capRatePct}%)`);
    }
  }

  const finalScore = Math.round(0.3 * 100 + 0.4 * archetypeScore + 0.3 * yieldScore);

  let matchTier: 'S' | 'A' | 'B' | 'C' = 'C';
  if (finalScore >= 90) matchTier = 'S';
  else if (finalScore >= 80) matchTier = 'A';
  else if (finalScore >= 70) matchTier = 'B';

  return {
    dealId: deal.dealId,
    matchScore: finalScore,
    matchTier,
    isHardFilterPassed: true,
    mismatchReasons,
    matchHighlights,
  };
}
