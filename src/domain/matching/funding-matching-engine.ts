import { embedText } from "@/ai/llm-client";

export interface FundingProjectMatchInput {
  project: {
    id: string;
    projectName: string;
    assetType: "real_estate" | "startup" | "art" | "ip";
    targetAmount: number;
    minInvestment: number;
    expectedReturnPct: number;
    investmentPeriodMonths: number;
    riskLevel: number;
    tokenType: "sto" | "equity" | "profit_share";
    descriptionMemo?: string | null;
  };
  investor: {
    id: string;
    investorType: "general" | "qualified" | "professional";
    investmentPreference: string[];
    preferredSectors: string[];
    investmentMin?: number | null;
    investmentMax?: number | null;
    maxRiskTolerance?: number | null;
    expectedReturnMin?: number | null;
    investmentHorizonMonths?: number | null;
    mustHaveCriteria: string[];
    niceToHaveCriteria: string[];
  };
}

export interface FundingMatchResult {
  grade: "S" | "A" | "B" | "C";
  score: number;
  stage1Passed: boolean;
  stage2Similarity: number;
  reasoning: string;
}

/**
 * 3-Stage Crowdfunding/STO Matching Engine
 */
export async function runFundingMatchingEngine(
  input: FundingProjectMatchInput,
): Promise<FundingMatchResult> {
  const { project, investor } = input;
  const failReasons: string[] = [];

  // ── Stage 1: Hard Filter ───────────────────────────────────
  // 1. Min investment check
  if (investor.investmentMax && project.minInvestment > investor.investmentMax) {
    failReasons.push(
      `최소투자금 제한 초과: 프로젝트 최소투자금 ${project.minInvestment}원 > 투자 희망 한도 ${investor.investmentMax}원`
    );
  }

  // 2. Risk level check
  if (investor.maxRiskTolerance && project.riskLevel > investor.maxRiskTolerance) {
    failReasons.push(
      `위험 등급 불일치: 프로젝트 등급 ${project.riskLevel} > 투자자 상한 ${investor.maxRiskTolerance}`
    );
  }

  // 3. Sector / Asset type check (relaxed: check if sector preference list is empty or matching)
  if (investor.preferredSectors.length > 0 && !investor.preferredSectors.includes(project.assetType)) {
    failReasons.push(
      `자산 부문 불일치: 프로젝트 ${project.assetType} ∉ 투자 선호 자산 [${investor.preferredSectors.join(", ")}]`
    );
  }

  if (failReasons.length > 0) {
    return {
      grade: "C",
      score: 0,
      stage1Passed: false,
      stage2Similarity: 0,
      reasoning: `Stage 1 필터 탈락: ${failReasons.join(" / ")}`,
    };
  }

  // ── Stage 2: Semantic Similarity ──────────────────────────
  let similarity = 0.5; // baseline fallback
  try {
    const projectText = [
      project.projectName,
      project.assetType,
      project.tokenType,
      project.descriptionMemo || "",
    ]
      .filter(Boolean)
      .join(" ");

    const investorText = [
      investor.investmentPreference.join(" "),
      investor.preferredSectors.join(" "),
      investor.mustHaveCriteria.join(" "),
      investor.niceToHaveCriteria.join(" "),
    ]
      .filter(Boolean)
      .join(" ");

    const [pEmbed, iEmbed] = await Promise.all([
      embedText(projectText),
      embedText(investorText),
    ]);

    similarity = cosineSimilarity(pEmbed, iEmbed);
  } catch (e) {
    console.warn("[runFundingMatchingEngine] OpenAI embeddings failed, using keyword match fallback");
    // fallback keyword overlap
    const keywords = (project.descriptionMemo || "").split(/\s+/);
    const preferences = investor.investmentPreference.concat(investor.mustHaveCriteria);
    const overlap = keywords.filter((k) => preferences.some((p) => p.includes(k) || k.includes(p)));
    similarity = Math.min(0.9, 0.5 + (overlap.length * 0.08));
  }

  // ── Stage 3: Ensemble Scoring ─────────────────────────────
  // 1. Semantic Similarity Score (35%)
  const semanticScore = similarity * 100;

  // 2. Expected Return Fit (25%)
  let returnScore = 70; // baseline
  if (investor.expectedReturnMin) {
    const gap = project.expectedReturnPct - investor.expectedReturnMin;
    if (gap >= 0) returnScore = 100;
    else returnScore = Math.max(30, 100 - Math.abs(gap) * 15);
  }

  // 3. Risk Fit (25%)
  let riskScore = 80;
  if (investor.maxRiskTolerance) {
    const gap = investor.maxRiskTolerance - project.riskLevel;
    // exact match or lower risk is great
    if (gap >= 0) riskScore = 100 - gap * 10;
    else riskScore = 40; // over risk tolerance
  }

  // 4. Period/Horizon Fit (15%)
  let horizonScore = 80;
  if (investor.investmentHorizonMonths) {
    const gap = investor.investmentHorizonMonths - project.investmentPeriodMonths;
    if (gap >= 0) horizonScore = 100 - (gap / 12) * 5; // slowly degrade if period is way shorter than horizon
    else horizonScore = Math.max(20, 100 - Math.abs(gap) * 3); // degrade faster if period is longer than horizon
  }

  const finalScore =
    semanticScore * 0.35 +
    returnScore * 0.25 +
    riskScore * 0.25 +
    horizonScore * 0.15;

  let grade: "S" | "A" | "B" | "C" = "C";
  if (finalScore >= 85) grade = "S";
  else if (finalScore >= 70) grade = "A";
  else if (finalScore >= 50) grade = "B";

  const gradeLabels = {
    S: "최우수 매칭 (즉시 펀딩 참여 권장)",
    A: "높은 투자 적합도",
    B: "포트폴리오 분산 참고 가능",
    C: "매칭 적합도 미흡",
  };

  return {
    grade,
    score: Math.round(finalScore * 100) / 100,
    stage1Passed: true,
    stage2Similarity: Math.round(similarity * 100000) / 100000,
    reasoning: `[${grade}] ${gradeLabels[grade]} | 시맨틱 매칭 ${(similarity * 100).toFixed(1)}% | 연 예상수익률 ${project.expectedReturnPct}% | 위험도 등급 ${project.riskLevel}/5`,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
