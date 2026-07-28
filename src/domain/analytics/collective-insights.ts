/**
 * CREDEAL v3 Give-to-Get Collective Insights Pool (Stage 4 - Track K)
 * 
 * Implements Give-to-Get model (K1): Access to collective CRE market insights (closing price gaps,
 * regional fallout reasons) is gated to brokers who have contributed active deal data.
 * All statistics enforce N >= 5 privacy gating to protect individual broker deal confidentiality.
 */

export interface BrokerContributionStatus {
  brokerId: string;
  contributedDealsCount: number;
  hasAccessToInsights: boolean;
  tier: 'visitor' | 'contributor' | 'pro_contributor';
}

export interface CollectiveInsightSummary {
  regionName: string;
  sampleSize: number; // N count
  isGatedByNThreshold: boolean;
  avgAskingVsClosingGapPct: number | null;
  topFalloutReasons: { reasonCode: string; count: number }[];
}

export function evaluateBrokerGiveToGetAccess(contributedDealsCount: number): BrokerContributionStatus {
  const hasAccessToInsights = contributedDealsCount >= 1;

  let tier: 'visitor' | 'contributor' | 'pro_contributor' = 'visitor';
  if (contributedDealsCount >= 5) {
    tier = 'pro_contributor';
  } else if (contributedDealsCount >= 1) {
    tier = 'contributor';
  }

  return {
    brokerId: 'current-broker',
    contributedDealsCount,
    hasAccessToInsights,
    tier,
  };
}

export function generateCollectiveInsightSummary(
  regionName: string,
  sampleDeals: { askingVsClosingGapPct: number; falloutReason?: string }[]
): CollectiveInsightSummary {
  const sampleSize = sampleDeals.length;

  // Enforce N >= 5 privacy gating
  if (sampleSize < 5) {
    return {
      regionName,
      sampleSize,
      isGatedByNThreshold: true,
      avgAskingVsClosingGapPct: null,
      topFalloutReasons: [],
    };
  }

  const avgGap = Math.round(
    (sampleDeals.reduce((sum, d) => sum + d.askingVsClosingGapPct, 0) / sampleSize) * 10
  ) / 10;

  const reasonCounts: Record<string, number> = {};
  for (const d of sampleDeals) {
    if (d.falloutReason) {
      reasonCounts[d.falloutReason] = (reasonCounts[d.falloutReason] || 0) + 1;
    }
  }

  const topFalloutReasons = Object.entries(reasonCounts)
    .map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort((a, b) => b.count - a.count);

  return {
    regionName,
    sampleSize,
    isGatedByNThreshold: false,
    avgAskingVsClosingGapPct: avgGap,
    topFalloutReasons,
  };
}
