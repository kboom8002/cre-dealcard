import { createServiceClient } from "@/lib/supabase/service";

export interface FundingFeatureVector {
  targetAmount: number;
  minInvestment: number;
  expectedReturnPct: number;
  investmentPeriodMonths: number;
  riskLevel: number;
  matchedInvestorCount: number;
  highFitCount: number;
  currentAmount: number;
  investorCount: number;
  daysOpen: number;
  regulatoryVerified: boolean;
}

export interface FundingSuccessPrediction {
  probability: number;       // 0-1
  probabilityLabel: string;  // "72%"
  confidence: "high" | "medium" | "low";
  topFactors: Array<{ factor: string; impact: string }>;
  recommendedAction: string;
  mode: "model" | "heuristic";
  boundaryNote: string;
}

// Heuristic scoring for crowdfunding success (cold start)
function heuristicScore(f: FundingFeatureVector): number {
  let score = 0.40; // baseline

  // Matched investors
  if (f.highFitCount >= 10) score += 0.20;
  else if (f.highFitCount >= 5) score += 0.12;
  else if (f.highFitCount >= 2) score += 0.05;

  // Expected return appeal
  if (f.expectedReturnPct >= 12) score += 0.10;
  else if (f.expectedReturnPct >= 8) score += 0.05;

  // Regulatory safety
  if (f.regulatoryVerified) score += 0.08;

  // Risk profile (low/mid risk has higher retail appeal)
  if (f.riskLevel <= 2) score += 0.05;
  else if (f.riskLevel === 5) score -= 0.10;

  // Progress momentum
  const progressPct = f.targetAmount > 0 ? f.currentAmount / f.targetAmount : 0;
  if (progressPct >= 0.8) score += 0.15;
  else if (progressPct >= 0.5) score += 0.08;

  // Time decay
  if (f.daysOpen >= 30) score -= 0.12;

  return Math.max(0.05, Math.min(0.98, score));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Optional model inference placeholder (reusing pattern)
async function modelScore(f: FundingFeatureVector): Promise<number | null> {
  try {
    const supabase = createServiceClient();
    const { data: coeffs } = await supabase
      .from("prediction_model_coefficients")
      .select("feature_name, coefficient")
      .eq("model_name", "funding_success_lr_v1");

    if (!coeffs || coeffs.length === 0) return null;

    const featureVec: Record<string, number> = {
      target_amount: f.targetAmount,
      min_investment: f.minInvestment,
      expected_return_pct: f.expectedReturnPct,
      investment_period_months: f.investmentPeriodMonths,
      risk_level: f.riskLevel,
      matched_investor_count: f.matchedInvestorCount,
      high_fit_count: f.highFitCount,
      current_amount: f.currentAmount,
      investor_count: f.investorCount,
      days_open: f.daysOpen,
      regulatory_verified: f.regulatoryVerified ? 1 : 0,
    };

    const interceptRow = coeffs.find((c) => c.feature_name === "intercept");
    let logit = interceptRow?.coefficient ?? 0;

    for (const { feature_name, coefficient } of coeffs) {
      if (feature_name === "intercept") continue;
      logit += (featureVec[feature_name] ?? 0) * coefficient;
    }

    return sigmoid(logit);
  } catch (e) {
    return null;
  }
}

function buildTopFactors(f: FundingFeatureVector): Array<{ factor: string; impact: string }> {
  const factors: Array<{ factor: string; impact: string; impactNum: number }> = [];

  if (f.highFitCount >= 5) {
    factors.push({ factor: "최우수 매칭 투자자 다수 확보", impact: "+12%", impactNum: 12 });
  }
  if (f.expectedReturnPct >= 10) {
    factors.push({ factor: "경쟁력 있는 예상 수익률", impact: "+10%", impactNum: 10 });
  }
  if (f.regulatoryVerified) {
    factors.push({ factor: "자본시장법 규제 적격 검증 완료", impact: "+8%", impactNum: 8 });
  }
  if (f.riskLevel <= 2) {
    factors.push({ factor: "비교적 낮은 위험 등급", impact: "+5%", impactNum: 5 });
  }
  const progressPct = f.targetAmount > 0 ? f.currentAmount / f.targetAmount : 0;
  if (progressPct >= 0.5) {
    factors.push({ factor: `모집률 달성 호조 (${Math.round(progressPct * 100)}%)`, impact: "+8%", impactNum: 8 });
  }
  if (f.daysOpen >= 30) {
    factors.push({ factor: "장기 공모 진행 중 (정체 위험)", impact: "-12%", impactNum: -12 });
  }

  return factors
    .sort((a, b) => Math.abs(b.impactNum) - Math.abs(a.impactNum))
    .slice(0, 5)
    .map(({ factor, impact }) => ({ factor, impact }));
}

function getRecommendedAction(f: FundingFeatureVector, prob: number): string {
  const progressPct = f.targetAmount > 0 ? f.currentAmount / f.targetAmount : 0;

  if (prob >= 0.8 && progressPct < 0.5) {
    return "매칭 적합도가 높습니다. 대기 투자자들에게 카카오톡 알림톡을 발송해보세요.";
  }
  if (progressPct >= 0.8) {
    return "펀딩 마감이 임박했습니다. 최종 마케팅 자료(티저)를 재배포하여 공모를 완료하세요.";
  }
  if (!f.regulatoryVerified) {
    return "준법 감시(Compliance) 자격 확인 증빙 서류를 업로드하여 투자 신뢰도를 높이세요.";
  }
  if (f.highFitCount === 0) {
    return "AI 매칭 엔진을 호출하여 투자 성향이 일치하는 소득적격 투자자군을 도출하세요.";
  }
  return "공모 진행 현황 및 중간 정산 리포트를 참여 투자자들에게 자동 업데이트해보세요.";
}

/**
 * Predicts crowdfunding / STO project success probability and provides top factors.
 */
export async function predictFundingSuccess(
  features: FundingFeatureVector,
): Promise<FundingSuccessPrediction> {
  let prob: number;
  let mode: "model" | "heuristic";

  const modelProb = await modelScore(features);
  if (modelProb !== null) {
    prob = modelProb;
    mode = "model";
  } else {
    prob = heuristicScore(features);
    mode = "heuristic";
  }

  return {
    probability: Math.round(prob * 1000) / 1000,
    probabilityLabel: `${Math.round(prob * 100)}%`,
    confidence: mode === "model" ? "medium" : "low",
    topFactors: buildTopFactors(features),
    recommendedAction: getRecommendedAction(features, prob),
    mode,
    boundaryNote: "본 예측치는 크라우드펀딩 프로젝트의 구조적 속성에 기초한 통계적 기대치입니다. 실제 공모 달성률을 보장하거나 권유하지 않습니다.",
  };
}
