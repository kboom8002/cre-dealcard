/**
 * Vibe 상보 벡터 계산 엔진
 *
 * 프로필 사진의 7D Vibe 벡터를 분석하여,
 * 전체 Valence·Trust를 극대화하는 "상보적" 배경 벡터를 계산.
 */

import {
  type Vibe7D,
  VIBE_AXES,
  estimateVADFrom7D,
  clampVibe,
  blendVibes,
  cosineSimilarity,
  vec7DToArray,
  classifyVTI,
} from "./vibe-vector";

// ── Trust Score 계산 ──────────────────────────────────

/**
 * 7D 벡터에서 신뢰성 점수를 산출한다.
 * Trust = polish×0.35 + heritage×0.30 + authentic×0.20 + energy×0.15
 */
export function computeTrustFromVibe(v: Vibe7D): number {
  const raw = v.polish * 0.35 + v.heritage * 0.30 + v.authentic * 0.20 + v.energy * 0.15;
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

/**
 * 7D 벡터에서 Valence를 산출한다.
 * Valence = warmth×0.4 + playful×0.3 + authentic×0.3, mapped to [0,1]
 */
export function computeValenceFromVibe(v: Vibe7D): number {
  const raw = v.warmth * 0.4 + v.playful * 0.3 + v.authentic * 0.3;
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

// ── Coherence 계산 (aihompyhub vibeSeal.ts 포팅) ─────

/**
 * Vibe 벡터의 내적 일관성 점수를 계산한다.
 * 일관성 = VTI 프로토타입과의 유사도(60%) + 분산 적절성(25%) + 극단값 패널티(15%)
 */
export function calculateVibeCoherence(vibe: Vibe7D): number {
  const { confidence } = classifyVTI(vibe);

  const values = VIBE_AXES.map((k) => vibe[k]);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;

  const varianceScore =
    variance < 0.02 ? variance / 0.02 : variance > 0.08 ? Math.max(0, 1 - (variance - 0.08) / 0.08) : 1.0;

  const extremeCount = values.filter((v) => v < 0.05 || v > 0.95).length;
  const extremePenalty = Math.max(0, 1 - extremeCount * 0.15);

  const raw = confidence * 0.6 + varianceScore * 0.25 + extremePenalty * 0.15;
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

// ── 상보 벡터 계산 ───────────────────────────────────

/**
 * 프로필 사진의 Vibe 벡터로부터 상보적 배경 벡터를 계산한다.
 *
 * 원리:
 * - 부족한 축(0.65 미만)은 보강한다
 * - 과도한 축(0.85 초과)은 약간 희석한다
 * - 결과적으로 사진+배경 합성 시 Valence와 Trust가 극대화된다
 */
export function computeComplementaryVibe(
  photoVibe: Vibe7D,
  targetValence = 0.60,
  targetTrust = 0.80,
): Vibe7D {
  const complement: Partial<Vibe7D> = {};

  for (const axis of VIBE_AXES) {
    const val = photoVibe[axis];
    const deficit = Math.max(0, 0.65 - val); // 0.65 이하면 보강
    const surplus = Math.max(0, val - 0.85); // 0.85 이상이면 희석

    // 기본값 0.50에서 부족분 보강, 과잉분 약간 억제
    complement[axis] = 0.50 + deficit * 1.2 - surplus * 0.4;
  }

  const clamped = clampVibe(complement as Vibe7D);

  // Valence/Trust 목표 미달 시 추가 보정
  const composite = blendVibes(photoVibe, clamped, 0.40, 0.60);
  const currentValence = computeValenceFromVibe(composite);
  const currentTrust = computeTrustFromVibe(composite);

  if (currentValence < targetValence) {
    // warmth, playful, authentic 추가 보강
    const gap = targetValence - currentValence;
    clamped.warmth = Math.min(1, clamped.warmth + gap * 0.5);
    clamped.playful = Math.min(1, clamped.playful + gap * 0.3);
    clamped.authentic = Math.min(1, clamped.authentic + gap * 0.2);
  }

  if (currentTrust < targetTrust) {
    const gap = targetTrust - currentTrust;
    clamped.polish = Math.min(1, clamped.polish + gap * 0.4);
    clamped.heritage = Math.min(1, clamped.heritage + gap * 0.3);
    clamped.energy = Math.min(1, clamped.energy + gap * 0.2);
  }

  return clampVibe(clamped);
}

// ── 합성 점수 계산 ───────────────────────────────────

export interface CompositeScores {
  valence: number;    // 0~1
  trust: number;      // 0~1
  coherence: number;  // 0~1
  vad: { valence: number; arousal: number; dominance: number };
}

/**
 * 사진 Vibe + 배경 Vibe → 합성 점수
 * 배경이 더 넓은 면적 → 사진 40% + 배경 60%
 */
export function computeCompositeScores(photoVibe: Vibe7D, bgVibe: Vibe7D): CompositeScores {
  const composite = blendVibes(photoVibe, bgVibe, 0.40, 0.60);
  return {
    valence: computeValenceFromVibe(composite),
    trust: computeTrustFromVibe(composite),
    coherence: calculateVibeCoherence(composite),
    vad: estimateVADFrom7D(composite),
  };
}

// ── 템플릿 매칭 ──────────────────────────────────────

import type { VibeTemplate } from "./vibe-templates";

export interface TemplateMatch {
  template: VibeTemplate;
  score: number;
  compositeScores: CompositeScores;
}

/**
 * 상보 벡터와 가장 잘 맞는 템플릿을 찾는다.
 * AI 호출 없이 코사인 유사도로 매칭.
 */
export function matchTemplates(
  photoVibe: Vibe7D,
  complementVibe: Vibe7D,
  templates: VibeTemplate[],
  topN = 3,
): TemplateMatch[] {
  const compArr = vec7DToArray(complementVibe);

  return templates
    .map((t) => {
      const score = cosineSimilarity(compArr, vec7DToArray(t.vibeVector));
      const compositeScores = computeCompositeScores(photoVibe, t.vibeVector);
      return { template: t, score, compositeScores };
    })
    .sort((a, b) => {
      // 1차: Trust + Valence 합산 최대화, 2차: 코사인 유사도
      const aTotal = a.compositeScores.trust + a.compositeScores.valence;
      const bTotal = b.compositeScores.trust + b.compositeScores.valence;
      if (Math.abs(aTotal - bTotal) > 0.05) return bTotal - aTotal;
      return b.score - a.score;
    })
    .slice(0, topN);
}
