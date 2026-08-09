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

  // ── Pack Slot Hard Filters ──
  let packSlots = true;
  if (intent.mustHave && intent.mustHave.length > 0) {
    // 1. 명도 조건
    if (intent.mustHave.some(m => m.includes('명도완료') || m.includes('즉시입주'))) {
      if (building.vacatePlan === 'pre_vacate' || building.vacatePlan === 'contested') {
        packSlots = false;
        failReasons.push(`명도 조건 불일치: 매수자 즉시입주 요구 ↔ 매물 명도 상태(${building.vacatePlan})`);
      }
    }

    // 2. 위반건축물 불가 조건
    if (intent.mustHave.some(m => m.includes('위반건축물불가') || m.includes('적법건축물'))) {
      if (building.illegalExtension) {
        packSlots = false;
        failReasons.push(`위반건축물 조건 불일치: 매수자 적법건축물 요구 ↔ 위반건축물 존재`);
      }
    }

    // 3. 구분등기 불가 조건
    if (intent.mustHave.some(m => m.includes('단독소유') || m.includes('구분등기불가'))) {
      if (building.sectionalOwners && building.sectionalOwners > 1) {
        packSlots = false;
        failReasons.push(`소유 구조 불일치: 매수자 단독소유 요구 ↔ 구분소유자 ${building.sectionalOwners}인`);
      }
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
    details: { region, budget, asset, schedule, packSlots } 
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
    building.investmentPosture ? `투자관점: ${building.investmentPosture}` : '',
    building.buildingUse ? `용도: ${building.buildingUse}` : '',
    building.priceBand ?? '',
    building.fitSummary,
    building.vacancySignal ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const intentText = [
    intent.preferredRegions.join(' '),
    intent.purchasePurpose,
    intent.investmentPosture ? `선호관점: ${intent.investmentPosture}` : '',
    intent.buildingUse ? `선호용도: ${intent.buildingUse}` : '',
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

export function computeMarketScore(building: MatchInput['building']): number {
  let score = 0.5; // default base

  if (building.dealCuriosityScore) {
    score = (building.dealCuriosityScore / 100) * 0.6;
  }

  const vacancy = building.vacancySignal ?? '';
  if (vacancy.includes('만실') || vacancy.includes('100%')) {
    score += 0.2;
  } else if (vacancy.includes('공실') && !vacancy.includes('없음')) {
    score -= 0.1;
  }

  if (building.investmentPosture === 'development') {
    score += 0.15;
  } else if (building.investmentPosture === 'trading') {
    score += 0.10;
  }

  return Math.min(Math.max(score, 0), 1);
}

export function computeVacancyScore(
  building: MatchInput['building'],
  intent: MatchInput['intent']
): number {
  let score = 0.5;

  const vacancy = building.vacancySignal ?? '';
  if (vacancy.includes('만실') || vacancy.includes('없음') || vacancy.includes('100%')) {
    score = 0.9;
  } else if (vacancy.includes('일부')) {
    score = 0.6;
  } else if (vacancy.includes('전체') || vacancy.includes('공실')) {
    score = 0.3;
  }

  const posture = intent.investmentPosture || building.investmentPosture || '';
  if (['development', 'owner_occupied'].includes(posture)) {
    if (building.vacatePlan === 'vacant') score += 0.15;
    else if (building.vacatePlan === 'contested') score -= 0.3;
    else if (building.vacatePlan === 'pre_vacate') score -= 0.1;
  }

  if (posture === 'development' && vacancy.includes('공실')) {
    score = Math.max(score, 0.75); // 개발 목적에서는 명도 필요 없는 공실이 더 유리
  }

  return Math.min(Math.max(score, 0), 1);
}

export function computeEnsembleScore(params: {
  similarity: number;
  dealCuriosityScore: number;
  building: MatchInput['building'];
  intent: MatchInput['intent'];
  scheduleFitScore?: number;
  purposeWeights: Record<string, number>;
}): number {
  const { similarity, dealCuriosityScore, building, intent, scheduleFitScore = 0, purposeWeights } = params;

  const semanticScore = similarity;
  const financialScore = dealCuriosityScore / 100;
  const marketScore = computeMarketScore(building);
  const vacancyScore = computeVacancyScore(building, intent);

  const w = purposeWeights;
  return (
    (w.market    ?? 0) * marketScore   +
    (w.financial ?? 0) * financialScore +
    (w.vacancy   ?? 0) * vacancyScore  +
    (w.semantic  ?? 0) * semanticScore +
    (w.schedule  ?? 0) * scheduleFitScore +
    (w.tax       ?? 0) * financialScore
  ) * 100;
}

export function scoreToGrade(score: number): MatchGrade {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

// ─── Resolve weight profile ────────────────────────────────────────────

export function resolveWeightProfile(
  purchasePurpose: string,
  inferred?: string,
  explicitPosture?: string,
): WeightProfile {
  // 1. Explicit ontology v0.4 posture
  if (explicitPosture && PURPOSE_WEIGHTS[explicitPosture as WeightProfile]) {
    return explicitPosture as WeightProfile;
  }

  const combined = `${purchasePurpose} ${inferred ?? ''}`.toLowerCase();

  if (combined.includes('income') || combined.includes('수익') || combined.includes('임대')) return 'income';
  if (combined.includes('owner') || combined.includes('사옥') || combined.includes('자가')) return 'owner_occupied';
  if (combined.includes('dev') || combined.includes('개발') || combined.includes('신축') || combined.includes('철거')) return 'development';
  if (combined.includes('op') || combined.includes('운영') || combined.includes('호텔') || combined.includes('매출')) return 'operating';
  if (combined.includes('trade') || combined.includes('시세차익') || combined.includes('단기') || combined.includes('매매')) return 'trading';
  if (combined.includes('gift') || combined.includes('증여') || combined.includes('상속')) return 'gift';

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
    input.intent.investmentPosture || input.building.investmentPosture,
  );
  const weights = PURPOSE_WEIGHTS[profile];
  const schedInput = input as unknown as ScheduleMatchInput;
  const scheduleFitScore = schedInput.clientSchedule 
    ? computeScheduleFitScore(schedInput.vendor.availableSlots, schedInput.clientSchedule)
    : 0;

  const stage3Score = computeEnsembleScore({
    similarity,
    dealCuriosityScore: input.building.dealCuriosityScore ?? 50,
    building: input.building,
    intent: input.intent,
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
