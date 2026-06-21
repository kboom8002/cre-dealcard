/**
 * Matching Engine — Phase 1 ①②
 * 3-Stage pipeline: Hard Filter → Semantic Distance → Ensemble
 *
 * Stage 1: Rule-based hard filter (O(1), no AI)
 * Stage 2: OpenAI text-embedding-3-small cosine similarity
 * Stage 3: Purpose-weighted ensemble → final grade S/A/B/C
 */
import { embedText } from '@/ai/llm-client';
import type {
  MatchInput,
  MatchResult,
  MatchGrade,
  Stage1Result,
  WeightProfile,
  ScheduleMatchInput,
  AvailableSlotSummary,
} from './matching-types';
import { PURPOSE_WEIGHTS } from './matching-types';
import { matchRegion } from './region-hierarchy';
import { matchAssetType } from './asset-type-taxonomy';

// ─── Stage 1: Hard Filter ──────────────────────────────────────────────

export function runHardFilter(input: MatchInput): Stage1Result {
  const { building, intent } = input;
  const failReasons: string[] = [];
  
  let budget = true;
  let region = true;
  let asset = true;

  // Budget check: priceBand vs budgetRange
  if (intent.budgetRange.max !== null && building.priceBand) {
    const priceNum = extractPriceNumber(building.priceBand);
    if (priceNum !== null && priceNum > intent.budgetRange.max * 1.2) {
      budget = false;
      failReasons.push(
        `가격대 불일치: ${building.priceBand} > 예산 상한 ${intent.budgetRange.display} × 1.2`,
      );
    }
  }

  // Region check: areaSignal vs preferredRegions
  if (intent.preferredRegions.length > 0) {
    const regionResult = matchRegion(building.areaSignal, intent.preferredRegions);
    if (!regionResult.matched) {
      region = false;
      failReasons.push(
        `지역 불일치: ${building.areaSignal} ∉ [${intent.preferredRegions.join(', ')}]`,
      );
    }
  }

  // Asset type check
  if (intent.assetTypes.length > 0) {
    const assetMatch = matchAssetType(building.assetType, intent.assetTypes);
    if (!assetMatch) {
      asset = false;
      failReasons.push(
        `자산 유형 불일치: ${building.assetType} ∉ [${intent.assetTypes.join(', ')}]`,
      );
    }
  }

  // ── 🆕 Schedule check (if ScheduleMatchInput) ──
  let schedule = true;
  const schedInput = input as unknown as ScheduleMatchInput;
  if (schedInput.clientSchedule) {
    if (schedInput.clientSchedule.preferredDates.length > 0) {
      const hasOverlap = schedInput.vendor.availableSlots?.some(slot =>
        schedInput.clientSchedule.preferredDates.some(range =>
          slot.date >= range.start && slot.date <= range.end &&
          slot.status === 'available'
        )
      );

      if (!hasOverlap) {
        schedule = false;
        failReasons.push(`일정 불일치: 고객 선호 기간에 가용 슬롯 없음`);
      }
    }

    if (schedInput.clientSchedule.blackoutDates.length > 0) {
      const allBlackout = schedInput.vendor.availableSlots
        ?.filter(s => s.status === 'available')
        .every(slot => schedInput.clientSchedule.blackoutDates.includes(slot.date));

      if (allBlackout && (schedInput.vendor.availableSlots?.length || 0) > 0) {
        schedule = false;
        failReasons.push(`모든 가용 슬롯이 고객 불가 날짜에 해당`);
      }
    }
  }

  return { 
    passed: failReasons.length === 0, 
    failReasons, 
    details: { region, budget, asset, schedule } 
  };
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
  scheduleFitScore?: number;  // 0-1 from computeScheduleFitScore
  purposeWeights: Record<string, number>;
}): number {
  const { similarity, dealCuriosityScore, vacancyDemandVerified, scheduleFitScore = 0, purposeWeights } = params;

  // Normalize sub-scores to 0-1
  const semanticScore = similarity;                           // already 0-1
  const financialScore = dealCuriosityScore / 100;
  const marketScore = financialScore * 0.8;                   // proxy until real market data
  const vacancyScore = vacancyDemandVerified ? 1.0 : 0.3;

  const w = purposeWeights;
  return (
    (w.market    ?? 0) * marketScore   +
    (w.financial ?? 0) * financialScore +
    (w.vacancy   ?? 0) * vacancyScore  +
    (w.semantic  ?? 0) * semanticScore +
    (w.schedule  ?? 0) * scheduleFitScore
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
  const { passed, failReasons, details } = runHardFilter(input);
  if (!passed) {
    return {
      grade: 'C',
      score: 0,
      stage1Passed: false,
      stage2Similarity: 0,
      stage3Score: 0,
      reasoning: `Stage 1 필터 탈락: ${failReasons.join(' / ')}`,
      purposeWeightProfile: 'default',
      stage1Details: details || { region: false, budget: false, asset: false },
      stage3Weights: {},
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
  const schedInput = input as unknown as ScheduleMatchInput;
  const scheduleFitScore = schedInput.clientSchedule 
    ? computeScheduleFitScore(schedInput.vendor.availableSlots, schedInput.clientSchedule)
    : 0;

  const stage3Score = computeEnsembleScore({
    similarity,
    dealCuriosityScore: input.building.dealCuriosityScore ?? 50,
    vacancyDemandVerified: false, // enriched separately
    scheduleFitScore,
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
    stage1Details: details || { region: true, budget: true, asset: true },
    stage3Weights: weights,
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

function extractPriceNumber(priceBand: string): number | null {
  // "80억대" → 8000000000
  const match = priceBand.match(/(\d+(?:\.\d+)?)\s*억/);
  if (!match) return null;
  return parseFloat(match[1]) * 100_000_000;
}

export function computeScheduleFitScore(
  availableSlots: AvailableSlotSummary[],
  clientSchedule: ScheduleMatchInput['clientSchedule']
): number {
  if (!availableSlots || availableSlots.length === 0) return 0;

  const availableCount = availableSlots.filter(s => s.status === 'available').length;
  const matchingSlots = availableSlots.filter(slot =>
    clientSchedule.preferredDates.some(range =>
      slot.date >= range.start && slot.date <= range.end
    ) &&
    !clientSchedule.blackoutDates.includes(slot.date)
  );

  // Base match rate
  let score = matchingSlots.length / Math.max(availableCount, 1);

  // Flexibility bonus/penalty
  if (clientSchedule.flexibility === 'flexible') score *= 1.15;
  if (clientSchedule.flexibility === 'strict') score *= 0.85;

  // Urgency penalty
  if (clientSchedule.urgency === 'immediate') {
    const today = new Date().toISOString().split('T')[0];
    const nearSlots = matchingSlots.filter(s => {
      const diff = (new Date(s.date).getTime() - new Date(today).getTime()) / (1000 * 3600 * 24);
      return diff <= 7;
    });
    if (nearSlots.length === 0) score *= 0.5;
  }

  return Math.min(Math.max(score, 0), 1.0);
}
