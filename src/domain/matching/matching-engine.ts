/**
 * Matching Engine — Phase 1 ①②
 * 3-Stage pipeline: Hard Filter → Semantic Distance → Ensemble
 *
 * Stage 1: Rule-based hard filter (O(1), no AI)
 * Stage 2: OpenAI text-embedding-3-small cosine similarity
 * Stage 3: Purpose-weighted ensemble → final grade S/A/B/C
 */
import OpenAI from 'openai';
import type {
  MatchInput,
  MatchResult,
  MatchGrade,
  Stage1Result,
  WeightProfile,
} from './matching-types';
import { PURPOSE_WEIGHTS } from './matching-types';

const openai = new OpenAI();

// ─── Stage 1: Hard Filter ──────────────────────────────────────────────

export function runHardFilter(input: MatchInput): Stage1Result {
  const { building, intent } = input;
  const failReasons: string[] = [];

  // Budget check: priceBand vs budgetRange
  if (intent.budgetRange.max !== null && building.priceBand) {
    const priceNum = extractPriceNumber(building.priceBand);
    if (priceNum !== null && priceNum > intent.budgetRange.max * 1.2) {
      failReasons.push(
        `가격대 불일치: ${building.priceBand} > 예산 상한 ${intent.budgetRange.display} × 1.2`,
      );
    }
  }

  // Region check: areaSignal vs preferredRegions
  if (intent.preferredRegions.length > 0) {
    const regionMatch = intent.preferredRegions.some(
      (r) =>
        building.areaSignal.includes(r) ||
        r.includes(building.areaSignal.slice(0, 2)),
    );
    if (!regionMatch) {
      failReasons.push(
        `지역 불일치: ${building.areaSignal} ∉ [${intent.preferredRegions.join(', ')}]`,
      );
    }
  }

  // Asset type check
  if (intent.assetTypes.length > 0) {
    const assetMatch = intent.assetTypes.some(
      (t) =>
        building.assetType.includes(t) ||
        t.includes(building.assetType.slice(0, 2)),
    );
    if (!assetMatch) {
      failReasons.push(
        `자산 유형 불일치: ${building.assetType} ∉ [${intent.assetTypes.join(', ')}]`,
      );
    }
  }

  return { passed: failReasons.length === 0, failReasons };
}

// ─── Stage 2: Semantic Similarity ─────────────────────────────────────

export async function computeSemanticSimilarity(
  input: MatchInput,
): Promise<number> {
  const { building, intent } = input;

  const buildingText = [
    building.areaSignal,
    building.assetType,
    building.priceBand ?? '',
    building.fitSummary,
    building.vacancySignal ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const intentText = [
    intent.preferredRegions.join(' '),
    intent.purchasePurpose,
    intent.assetTypes.join(' '),
    intent.mustHave.join(' '),
    intent.niceToHave.join(' '),
    intent.inferredPurpose ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const [bEmbed, iEmbed] = await Promise.all([
    embedText(buildingText),
    embedText(intentText),
  ]);

  return cosineSimilarity(bEmbed, iEmbed);
}

// ─── Stage 3: Ensemble Scoring ────────────────────────────────────────

export function computeEnsembleScore(params: {
  similarity: number;
  dealCuriosityScore: number; // 0-100 from DealCuriosityWriter
  vacancyDemandVerified: boolean;
  purposeWeights: Record<string, number>;
}): number {
  const { similarity, dealCuriosityScore, vacancyDemandVerified, purposeWeights } = params;

  // Normalize sub-scores to 0-1
  const semanticScore = similarity;                           // already 0-1
  const financialScore = dealCuriosityScore / 100;
  const marketScore = financialScore * 0.8;                   // proxy until real market data
  const vacancyScore = vacancyDemandVerified ? 1.0 : 0.3;

  const w = purposeWeights;
  return (
    (w.market    ?? 0.25) * marketScore   +
    (w.financial ?? 0.30) * financialScore +
    (w.vacancy   ?? 0.20) * vacancyScore  +
    (w.semantic  ?? 0.25) * semanticScore
  ) * 100; // scale to 0-100
}

export function scoreToGrade(score: number): MatchGrade {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

// ─── Resolve weight profile ────────────────────────────────────────────

export function resolveWeightProfile(purchasePurpose: string, inferred?: string): WeightProfile {
  const combined = `${purchasePurpose} ${inferred ?? ''}`;
  if (combined.includes('사옥')) return '사옥';
  if (combined.includes('증여')) return '증여';
  if (combined.includes('투자')) return '투자';
  return 'default';
}

// ─── Main entry point ──────────────────────────────────────────────────

export async function runMatchingEngine(input: MatchInput): Promise<MatchResult> {
  // Stage 1
  const { passed, failReasons } = runHardFilter(input);
  if (!passed) {
    return {
      grade: 'C',
      score: 0,
      stage1Passed: false,
      stage2Similarity: 0,
      stage3Score: 0,
      reasoning: `Stage 1 필터 탈락: ${failReasons.join(' / ')}`,
      purposeWeightProfile: 'default',
    };
  }

  // Stage 2
  const similarity = await computeSemanticSimilarity(input);

  // Stage 3
  const profile = resolveWeightProfile(
    input.intent.purchasePurpose,
    input.intent.inferredPurpose,
  );
  const weights = PURPOSE_WEIGHTS[profile];
  const stage3Score = computeEnsembleScore({
    similarity,
    dealCuriosityScore: input.building.dealCuriosityScore ?? 50,
    vacancyDemandVerified: false, // enriched separately
    purposeWeights: weights,
  });

  const grade = scoreToGrade(stage3Score);

  const gradeLabel: Record<MatchGrade, string> = {
    S: '최우선 매칭 (즉시 연락 권장)',
    A: '높은 적합도',
    B: '참고 가능',
    C: '매칭 미흡',
  };

  return {
    grade,
    score: Math.round(stage3Score * 100) / 100,
    stage1Passed: true,
    stage2Similarity: Math.round(similarity * 100000) / 100000,
    stage3Score: Math.round(stage3Score * 100) / 100,
    reasoning: `[${grade}] ${gradeLabel[grade]} | 시맨틱 유사도 ${(similarity * 100).toFixed(1)}% | 목적 프로파일: ${profile}`,
    purposeWeightProfile: profile,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return resp.data[0].embedding;
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

function extractPriceNumber(priceBand: string): number | null {
  // "80억대" → 8000000000
  const match = priceBand.match(/(\d+(?:\.\d+)?)\s*억/);
  if (!match) return null;
  return parseFloat(match[1]) * 100_000_000;
}
