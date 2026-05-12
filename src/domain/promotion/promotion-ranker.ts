/**
 * Promotion Ranker — Phase 1 ③
 * 6-factor promotion score for deal card listing
 *
 * Score = Σ weight_i × factor_i  (0-1 each)
 * Result stored in building_ssot_lite.promotion_score
 */

export interface PromotionInput {
  dealCuriosityScore: number;   // 0-100 from DealCuriosityWriter
  matchedBuyerCount: number;    // match_results count (grade S or A)
  inquiryCount: number;         // leasing_inquiries count (from aipage)
  vacancyDemandVerified: boolean;
  createdAt: string;            // building_ssot_lite.created_at
  isUrgent?: boolean;           // seller urgency flag
  marketHeat?: number;          // 0-1, placeholder for real market data
  iotFootfall?: number | null;
  iotEfficiency?: number | null;
}

export interface PromotionResult {
  score: number;           // 0-1
  breakdown: {
    curiosityFactor: number;
    demandFactor: number;
    inquiryFactor: number;
    recencyBoost: number;
    vacancyBoost: number;
    marketHeat: number;
  };
}

const WEIGHTS = {
  curiosity:  0.25,   // DealCuriosity score
  demand:     0.20,   // matched buyer count
  inquiry:    0.15,   // leasing inquiry count
  recency:    0.10,   // recency
  vacancy:    0.10,   // vacancy demand verified
  market:     0.20,   // market heat (placeholder)
};

export function computePromotionScore(input: PromotionInput): PromotionResult {
  const {
    dealCuriosityScore,
    matchedBuyerCount,
    inquiryCount,
    vacancyDemandVerified,
    createdAt,
    isUrgent = false,
    marketHeat = 0.5,
    iotFootfall,
    iotEfficiency,
  } = input;

  const daysSince = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;

  // Each factor: 0-1
  const curiosityFactor = dealCuriosityScore / 100;
  const demandFactor    = Math.min(matchedBuyerCount / 10, 1);
  const inquiryFactor   = Math.min(inquiryCount / 5, 1);
  const recencyBoost    = daysSince <= 7 ? 1.0 : Math.max(0, 1 - (daysSince - 7) / 90);
  const vacancyBoost    = vacancyDemandVerified ? 1.0 : (inquiryCount > 0 ? 0.6 : 0.2);
  const urgencyMult     = isUrgent ? 1.3 : 1.0;

  const hasIot = !!iotFootfall;

  const weights = hasIot ? {
    curiosity: 0.20, demand: 0.15, inquiry: 0.10,
    recency:   0.05, vacancy: 0.10, market: 0.10,
    iotFootfall:   0.15,
    iotEfficiency: 0.15,
  } : WEIGHTS;

  const iotFootfallFactor   = Math.min((iotFootfall ?? 0) / 500, 1);
  const iotEfficiencyFactor = iotEfficiency ?? 0.5;

  const raw = hasIot
    ? weights.curiosity * curiosityFactor + weights.demand * demandFactor +
      weights.inquiry * inquiryFactor     + weights.recency * recencyBoost +
      weights.vacancy * vacancyBoost      + weights.market * marketHeat +
      (weights as any).iotFootfall * iotFootfallFactor +
      (weights as any).iotEfficiency * iotEfficiencyFactor
    : weights.curiosity * curiosityFactor + weights.demand * demandFactor +
      weights.inquiry * inquiryFactor     + weights.recency * recencyBoost +
      weights.vacancy * vacancyBoost      + weights.market * marketHeat;

  const score = Math.min(raw * urgencyMult, 1);

  return {
    score: Math.round(score * 10000) / 10000,
    breakdown: {
      curiosityFactor,
      demandFactor,
      inquiryFactor,
      recencyBoost,
      vacancyBoost,
      marketHeat,
    },
  };
}

export function promotionScoreLabel(score: number): string {
  if (score >= 0.80) return '🔥 지금 밀 매물';
  if (score >= 0.60) return '⭐ 추천 매물';
  if (score >= 0.40) return '📋 일반';
  return '📌 보조';
}
