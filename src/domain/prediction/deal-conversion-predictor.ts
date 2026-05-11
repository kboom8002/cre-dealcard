/**
 * Deal Conversion Predictor — P-X
 * Logistic Regression inference (in-process, no Python needed).
 * Model coefficients are stored in DB and updated offline.
 * Falls back to heuristic scoring when < 80 training samples.
 */
import { createClient } from '@supabase/supabase-js';
import type { DealFeatureVector } from './deal-feature-extractor';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface ConversionPrediction {
  probability:      number;       // 0-1
  probabilityLabel: string;       // "72%"
  confidence:       'high' | 'medium' | 'low';
  topFactors:       Array<{ factor: string; impact: string }>;
  recommendedAction: string;
  mode:             'model' | 'heuristic';
  boundaryNote:     string;
}

// ─── Heuristic scoring (cold start < 80 samples) ──────────────────────

function heuristicScore(f: DealFeatureVector): number {
  let score = 0.35; // baseline

  // Match quality
  if (f.bestMatchGrade >= 4)       score += 0.18; // S
  else if (f.bestMatchGrade >= 3)  score += 0.10; // A
  else if (f.bestMatchGrade >= 2)  score += 0.04; // B

  // Pipeline momentum
  if (f.currentStageOrd >= 4)      score += 0.12; // buyer_meeting+
  else if (f.currentStageOrd >= 2) score += 0.06; // gate_requested+

  // Demand signals
  if (f.vacancyDemandVerified)     score += 0.08;
  if (f.promotionScore >= 0.7)     score += 0.06;
  if (f.sGradeCount >= 2)          score += 0.05;

  // Risk signals (negative)
  if (f.totalHoldDays >= 30)       score -= 0.08;
  if (f.totalHoldDays >= 60)       score -= 0.08;
  if (f.missingDataCount >= 5)     score -= 0.05;
  if (f.curiosityScore < 40)       score -= 0.06;

  // IM / Space AI presence
  if (f.hasIm)                     score += 0.05;
  if (f.hasSpaceAi)                score += 0.03;

  return Math.max(0.05, Math.min(0.97, score));
}

// ─── Logistic Regression inference (coefficients from DB) ─────────────

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

async function modelScore(f: DealFeatureVector): Promise<number | null> {
  const supabase = getClient();
  const { data: coeffs } = await supabase
    .from('prediction_model_coefficients')
    .select('feature_name, coefficient')
    .eq('model_name', 'deal_conversion_lr_v1');

  if (!coeffs?.length) return null;

  const featureVec: Record<string, number> = {
    curiosity_score:          f.curiosityScore,
    best_match_grade:         f.bestMatchGrade,
    avg_match_score:          f.avgMatchScore,
    matched_buyer_count:      f.matchedBuyerCount,
    s_grade_count:            f.sGradeCount,
    current_stage_ord:        f.currentStageOrd,
    total_hold_days:          f.totalHoldDays,
    promotion_score:          f.promotionScore,
    vacancy_demand_verified:  f.vacancyDemandVerified,
    event_count_7d:           f.eventCount7d,
    gate_request_count:       f.gateRequestCount,
    casepacks_count:          f.casepacksCount,
    missing_data_count:       f.missingDataCount,
    has_im:                   f.hasIm,
    has_space_ai:             f.hasSpaceAi,
    buyer_cluster_id:         f.buyerClusterId,
    days_since_creation:      f.daysSinceCreation,
    im_readiness_score:       f.imReadinessScore,
  };

  const interceptRow = coeffs.find((c) => c.feature_name === 'intercept');
  let logit = interceptRow?.coefficient ?? 0;

  for (const { feature_name, coefficient } of coeffs) {
    if (feature_name === 'intercept') continue;
    logit += (featureVec[feature_name] ?? 0) * coefficient;
  }

  return sigmoid(logit);
}

// ─── Factor explanations ───────────────────────────────────────────────

function buildTopFactors(f: DealFeatureVector): Array<{ factor: string; impact: string }> {
  const factors: Array<{ factor: string; impact: string; impactNum: number }> = [];

  if (f.bestMatchGrade >= 4)
    factors.push({ factor: 'S등급 매수자 매칭 있음', impact: '+18%', impactNum: 18 });
  else if (f.bestMatchGrade >= 3)
    factors.push({ factor: 'A등급 매수자 매칭 있음', impact: '+10%', impactNum: 10 });

  if (f.currentStageOrd >= 4)
    factors.push({ factor: '미팅 이후 단계 진행 중', impact: '+12%', impactNum: 12 });

  if (f.vacancyDemandVerified)
    factors.push({ factor: '임대 수요 AI 검증됨', impact: '+8%', impactNum: 8 });

  if (f.sGradeCount >= 2)
    factors.push({ factor: `최우선 매수자 ${f.sGradeCount}명 확보`, impact: '+5%', impactNum: 5 });

  if (f.totalHoldDays >= 30)
    factors.push({ factor: `${f.totalHoldDays}일 이상 정체`, impact: '-8%', impactNum: -8 });

  if (f.missingDataCount >= 5)
    factors.push({ factor: '자료 미비 항목 다수', impact: '-5%', impactNum: -5 });

  if (f.hasIm)
    factors.push({ factor: 'IM 작성됨', impact: '+5%', impactNum: 5 });

  return factors
    .sort((a, b) => Math.abs(b.impactNum) - Math.abs(a.impactNum))
    .slice(0, 5)
    .map(({ factor, impact }) => ({ factor, impact }));
}

function recommendedAction(f: DealFeatureVector, prob: number): string {
  if (prob >= 0.75 && f.currentStageOrd < 4)
    return '매수자 미팅 일정을 이번 주 안에 잡아보세요';
  if (prob >= 0.60 && f.currentStageOrd >= 4)
    return 'LOI 의향서 작성을 제안해보세요';
  if (f.vacancyDemandVerified && !f.hasIm)
    return '임대 수요가 검증됐습니다 — 모바일 투자설명서를 만들어보세요';
  if (f.bestMatchGrade === 0)
    return '매수자 조건을 등록하고 AI 매칭을 실행해보세요';
  if (f.totalHoldDays >= 30)
    return '딜이 30일 이상 정체됐습니다 — 매수자에게 직접 연락해보세요';
  return '현재 진행 상황을 매수자에게 공유해보세요';
}

// ─── Main predict function ─────────────────────────────────────────────

export async function predictDealConversion(
  features: DealFeatureVector,
): Promise<ConversionPrediction> {
  const supabase = getClient();

  // Check training data count
  const { count: trainingCount } = await supabase
    .from('deal_conversion_features')
    .select('id', { count: 'exact', head: true })
    .not('converted', 'is', null);

  let prob: number;
  let mode: 'model' | 'heuristic';

  if ((trainingCount ?? 0) >= 80) {
    const modelProb = await modelScore(features);
    if (modelProb !== null) {
      prob = modelProb;
      mode = 'model';
    } else {
      prob = heuristicScore(features);
      mode = 'heuristic';
    }
  } else {
    prob = heuristicScore(features);
    mode = 'heuristic';
  }

  const confidence: 'high' | 'medium' | 'low' =
    (trainingCount ?? 0) >= 200 ? 'high' :
    (trainingCount ?? 0) >= 80  ? 'medium' : 'low';

  return {
    probability:      Math.round(prob * 1000) / 1000,
    probabilityLabel: `${Math.round(prob * 100)}%`,
    confidence,
    topFactors:       buildTopFactors(features),
    recommendedAction: recommendedAction(features, prob),
    mode,
    boundaryNote: '전환율 예측은 통계/규칙 기반 참고치입니다. 실제 결과와 다를 수 있으며, 매수자 결정에 보증을 제공하지 않습니다.',
  };
}
