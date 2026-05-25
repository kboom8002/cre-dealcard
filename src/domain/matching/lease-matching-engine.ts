/**
 * Lease Matching Engine
 * 3-Stage pipeline: Hard Filter → Semantic Cosine Similarity → Ensemble Scoring
 */
import OpenAI from "openai";
import { matchRegion } from "./region-hierarchy";

const openai = new OpenAI();

export interface LeaseSpaceMatchInput {
  id: string;
  building_id?: string;
  floor: string | null;
  area_sqm: number | null;
  space_type: "office" | "retail" | "f_and_b" | "warehouse" | "other";
  deposit: number | null;
  monthly_rent: number | null;
  maintenance_fee: number | null;
  available_from: string | null;
  lease_term_months: number | null;
  incentives: {
    rentFreeMonths?: number;
    interiorSupport?: string | null;
    freeRentDetail?: string | null;
  } | null;
  restrictions: string[];
  // from linked building
  area_signal?: string | null;
  fit_summary?: string | null;
  caution_summary?: string | null;
}

export interface TenantIntentMatchInput {
  id: string;
  business_type: string | null;
  preferred_regions: string[];
  area_min: number | null;
  area_max: number | null;
  budget_deposit_max: number | null;
  budget_monthly_max: number | null;
  preferred_floors: string[];
  move_in_target: string | null;
  must_have: string[];
  nice_to_have: string[];
}

export interface LeaseMatchInput {
  space: LeaseSpaceMatchInput;
  intent: TenantIntentMatchInput;
}

export type LeaseMatchGrade = "S" | "A" | "B" | "C";

export interface LeaseMatchResult {
  grade: LeaseMatchGrade;
  score: number;
  stage1Passed: boolean;
  stage2Similarity: number;
  stage3Score: number;
  reasoning: string;
}

// ─── Stage 1: Hard Filter ──────────────────────────────────────────────

export function runLeaseHardFilter(input: LeaseMatchInput): { passed: boolean; failReasons: string[] } {
  const { space, intent } = input;
  const failReasons: string[] = [];

  // 1. Monthly Rent check (Tolerance: max 20% higher than tenant's maximum monthly budget)
  if (intent.budget_monthly_max !== null && space.monthly_rent !== null) {
    if (space.monthly_rent > intent.budget_monthly_max * 1.2) {
      failReasons.push(
        `월세 상한 초과: 매물 월세 ${space.monthly_rent}만원 > 희망 월세 ${intent.budget_monthly_max}만원 × 1.2`
      );
    }
  }

  // 2. Deposit check (Tolerance: max 15% higher than tenant's maximum deposit budget)
  if (intent.budget_deposit_max !== null && space.deposit !== null) {
    if (space.deposit > intent.budget_deposit_max * 1.15) {
      failReasons.push(
        `보증금 상한 초과: 매물 보증금 ${space.deposit}만원 > 희망 보증금 ${intent.budget_deposit_max}만원 × 1.15`
      );
    }
  }

  // 3. Region check (using Gu-Dong region hierarchy)
  const regionSource = space.area_signal || "서울";
  if (intent.preferred_regions.length > 0) {
    const regionMatch = matchRegion(regionSource, intent.preferred_regions);
    if (!regionMatch.matched) {
      failReasons.push(
        `권역 불일치: 매물 권역 [${regionSource}] ∉ 희망 권역 [${intent.preferred_regions.join(", ")}]`
      );
    }
  }

  // 4. Area range check (Tolerance: min 20% smaller or max 20% larger than requested range)
  if (space.area_sqm !== null) {
    if (intent.area_min !== null && space.area_sqm < intent.area_min * 0.8) {
      failReasons.push(
        `최소 전용면적 미달: 매물 면적 ${space.area_sqm.toFixed(1)}㎡ < 희망 최소 ${intent.area_min}㎡ × 0.8`
      );
    }
    if (intent.area_max !== null && space.area_sqm > intent.area_max * 1.2) {
      failReasons.push(
        `최대 전용면적 초과: 매물 면적 ${space.area_sqm.toFixed(1)}㎡ > 희망 최대 ${intent.area_max}㎡ × 1.2`
      );
    }
  }

  return { passed: failReasons.length === 0, failReasons };
}

// ─── Stage 2: Semantic Similarity ─────────────────────────────────────

export async function computeLeaseSemanticSimilarity(input: LeaseMatchInput): Promise<number> {
  const { space, intent } = input;

  const spaceText = [
    space.area_signal ?? "",
    space.space_type,
    space.floor ?? "",
    space.fit_summary ?? "",
    space.caution_summary ?? "",
    space.restrictions.join(" "),
    space.incentives?.freeRentDetail ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const intentText = [
    intent.business_type ?? "",
    intent.preferred_regions.join(" "),
    intent.must_have.join(" "),
    intent.nice_to_have.join(" "),
    intent.preferred_floors.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const [sEmbed, iEmbed] = await Promise.all([
    embedText(spaceText),
    embedText(intentText),
  ]);

  return cosineSimilarity(sEmbed, iEmbed);
}

// ─── Stage 3: Ensemble Scoring ────────────────────────────────────────

export function computeLeaseEnsembleScore(params: {
  similarity: number;
  floorMatched: boolean;
  incentivesBenefitScore: number; // 0-1 based on free rent or support
  rentToleranceScore: number;     // 0-1 based on how close/well within budget
}): number {
  const { similarity, floorMatched, incentivesBenefitScore, rentToleranceScore } = params;

  // Weights:
  // - Semantic Similarity: 40%
  // - Floor Preference Match: 20%
  // - Rent Budget Fit: 20%
  // - Incentives / Pre-rent benefit: 20%
  const semanticWeight = 0.4;
  const floorWeight = 0.2;
  const rentWeight = 0.2;
  const incentiveWeight = 0.2;

  const floorScore = floorMatched ? 1.0 : 0.4;

  const score = (
    semanticWeight * similarity +
    floorWeight * floorScore +
    rentWeight * rentToleranceScore +
    incentiveWeight * incentivesBenefitScore
  ) * 100;

  return score;
}

export function leaseScoreToGrade(score: number): LeaseMatchGrade {
  if (score >= 83) return "S";
  if (score >= 68) return "A";
  if (score >= 48) return "B";
  return "C";
}

// ─── Main Match Function ──────────────────────────────────────────────

export async function runLeaseMatchingEngine(input: LeaseMatchInput): Promise<LeaseMatchResult> {
  // Stage 1
  const { passed, failReasons } = runLeaseHardFilter(input);
  if (!passed) {
    return {
      grade: "C",
      score: 0,
      stage1Passed: false,
      stage2Similarity: 0,
      stage3Score: 0,
      reasoning: `필터 통과 실패: ${failReasons.join(" / ")}`,
    };
  }

  // Stage 2
  const similarity = await computeLeaseSemanticSimilarity(input);

  // Stage 3 parameters
  // Floor matching
  const spaceFloor = input.space.floor || "";
  const floorMatched =
    input.intent.preferred_floors.length === 0 ||
    input.intent.preferred_floors.some(f => spaceFloor.includes(f) || f.includes(spaceFloor));

  // Incentives calculation
  let incentivesBenefitScore = 0.3; // baseline
  if (input.space.incentives) {
    const rf = input.space.incentives.rentFreeMonths || 0;
    if (rf >= 3) incentivesBenefitScore = 1.0;
    else if (rf >= 1) incentivesBenefitScore = 0.7;
    
    if (input.space.incentives.interiorSupport) {
      incentivesBenefitScore = Math.min(1.0, incentivesBenefitScore + 0.2);
    }
  }

  // Rent tolerance score: how close or below max budget
  let rentToleranceScore = 0.5;
  if (input.intent.budget_monthly_max !== null && input.space.monthly_rent !== null) {
    const ratio = input.space.monthly_rent / input.intent.budget_monthly_max;
    if (ratio <= 0.8) rentToleranceScore = 1.0;      // extremely within budget
    else if (ratio <= 1.0) rentToleranceScore = 0.8; // comfortably within budget
    else if (ratio <= 1.2) rentToleranceScore = 0.4; // slightly over budget
  }

  const stage3Score = computeLeaseEnsembleScore({
    similarity,
    floorMatched,
    incentivesBenefitScore,
    rentToleranceScore,
  });

  const grade = leaseScoreToGrade(stage3Score);

  const gradeLabels: Record<LeaseMatchGrade, string> = {
    S: "최우선 추천 매물",
    A: "매칭 적합 매물",
    B: "검토 가능 매물",
    C: "매칭 보류 매물",
  };

  return {
    grade,
    score: Math.round(stage3Score * 100) / 100,
    stage1Passed: true,
    stage2Similarity: Math.round(similarity * 100000) / 100000,
    stage3Score: Math.round(stage3Score * 100) / 100,
    reasoning: `[${grade}] ${gradeLabels[grade]} | 시맨틱 일치율 ${(similarity * 100).toFixed(1)}% | 선호층 부합: ${floorMatched ? "예" : "아니오"} | 렌트 조건 점수 ${(incentivesBenefitScore * 100).toFixed(0)}점`,
  };
}

// ─── Embed Helpers ────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return resp.data[0].embedding;
  } catch (err) {
    console.error("Embedding generation failed, returning zero vector:", err);
    return new Array(1536).fill(0);
  }
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
