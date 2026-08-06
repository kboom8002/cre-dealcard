/**
 * Vibe OS 2.1 — 7D 벡터 타입, VTI 프로토타입, 코사인 유사도
 * Ported from aihompyhub/apps/storefront/lib/gallery/vibeVector.ts
 */

/** Vibe OS 2.1 7D 정동 벡터 */
export interface Vibe7D {
  warmth: number;     // [0,1] 따뜻함·포근함
  energy: number;     // [0,1] 활기·역동성
  polish: number;     // [0,1] 세련됨·완성도
  authentic: number;  // [0,1] 진정성·솔직함
  heritage: number;   // [0,1] 전통·클래식
  futuristic: number; // [0,1] 혁신·미래지향
  playful: number;    // [0,1] 유쾌함·위트
}

/** VTI 분류 레이블 (Vibe OS 2.1 7개 원형) */
export type VibeVtiType =
  | "Calm-Care"
  | "Calm-Polished"
  | "Focus-Competent"
  | "Play-Spark"
  | "Bold-Futurist"
  | "Heritage-Trust"
  | "Raw-Authentic";

/** VTI 메타데이터 */
export interface VtiMeta {
  type: VibeVtiType;
  label_ko: string;
  label_en: string;
  emoji: string;
  color: string;
  description: string;
}

/** VTI 프로토타입 벡터 (aihompyhub 기준) */
export const VTI_PROTOTYPES: { meta: VtiMeta; vector: Vibe7D }[] = [
  {
    meta: { type: "Calm-Care", label_ko: "따뜻한 돌봄", label_en: "Calm Care", emoji: "🌿", color: "#6ee7b7", description: "따뜻한 공감으로 고객과 함께하는 중개인" },
    vector: { warmth: 0.85, energy: 0.25, polish: 0.55, authentic: 0.75, heritage: 0.55, futuristic: 0.30, playful: 0.35 },
  },
  {
    meta: { type: "Calm-Polished", label_ko: "차분한 격조", label_en: "Calm Polished", emoji: "💎", color: "#a5b4fc", description: "세련되고 격조 있는 전문 서비스" },
    vector: { warmth: 0.40, energy: 0.25, polish: 0.90, authentic: 0.50, heritage: 0.65, futuristic: 0.45, playful: 0.20 },
  },
  {
    meta: { type: "Focus-Competent", label_ko: "집중 전문가", label_en: "Focus Competent", emoji: "🎯", color: "#67e8f9", description: "데이터 기반의 정확한 분석과 실행력" },
    vector: { warmth: 0.40, energy: 0.75, polish: 0.70, authentic: 0.55, heritage: 0.45, futuristic: 0.60, playful: 0.30 },
  },
  {
    meta: { type: "Play-Spark", label_ko: "유쾌한 에너지", label_en: "Play Spark", emoji: "⚡", color: "#fde68a", description: "활기차고 접근하기 쉬운 파트너" },
    vector: { warmth: 0.65, energy: 0.80, polish: 0.35, authentic: 0.70, heritage: 0.25, futuristic: 0.55, playful: 0.90 },
  },
  {
    meta: { type: "Bold-Futurist", label_ko: "대담한 혁신", label_en: "Bold Futurist", emoji: "🚀", color: "#f9a8d4", description: "혁신적이고 미래지향적인 투자 안목" },
    vector: { warmth: 0.30, energy: 0.85, polish: 0.60, authentic: 0.50, heritage: 0.15, futuristic: 0.95, playful: 0.65 },
  },
  {
    meta: { type: "Heritage-Trust", label_ko: "전통 신뢰", label_en: "Heritage Trust", emoji: "🏛️", color: "#d4a28a", description: "오랜 경험에서 우러나는 깊은 신뢰" },
    vector: { warmth: 0.60, energy: 0.30, polish: 0.80, authentic: 0.60, heritage: 0.95, futuristic: 0.15, playful: 0.25 },
  },
  {
    meta: { type: "Raw-Authentic", label_ko: "날것의 진정성", label_en: "Raw Authentic", emoji: "🌱", color: "#86efac", description: "진솔하고 투명한 거래의 가치" },
    vector: { warmth: 0.70, energy: 0.45, polish: 0.20, authentic: 0.95, heritage: 0.50, futuristic: 0.35, playful: 0.55 },
  },
];

export const VIBE_AXES: (keyof Vibe7D)[] = [
  "warmth", "energy", "polish", "authentic", "heritage", "futuristic", "playful",
];

// ── 벡터 연산 유틸리티 ──────────────────────────────

export function vec7DToArray(v: Vibe7D): number[] {
  return VIBE_AXES.map((k) => v[k]);
}

export function arrayToVec7D(arr: number[]): Vibe7D {
  const v: Partial<Vibe7D> = {};
  VIBE_AXES.forEach((k, i) => { v[k] = arr[i] ?? 0.5; });
  return v as Vibe7D;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na * nb > 0 ? dot / (na * nb) : 0;
}

export function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));
}

/** 복합 유사도: 코사인 60% + 유클리디안 40% */
export function compositeSimilarity(a: Vibe7D, b: Vibe7D): number {
  const arrA = vec7DToArray(a);
  const arrB = vec7DToArray(b);
  const direction = cosineSimilarity(arrA, arrB);
  const dist = euclideanDistance(arrA, arrB);
  const intensity = 1 - Math.min(1, dist / Math.sqrt(VIBE_AXES.length));
  return Math.round((direction * 0.6 + intensity * 0.4) * 1000) / 1000;
}

// ── VTI 분류 ─────────────────────────────────────────

/** 7D 벡터 → VTI 분류 (코사인 유사도 기반) */
export function classifyVTI(vec: Vibe7D): { meta: VtiMeta; confidence: number } {
  const arr = vec7DToArray(vec);
  let best = VTI_PROTOTYPES[0]!;
  let bestScore = -1;
  for (const proto of VTI_PROTOTYPES) {
    const score = cosineSimilarity(arr, vec7DToArray(proto.vector));
    if (score > bestScore) { bestScore = score; best = proto; }
  }
  return { meta: best.meta, confidence: Math.round(bestScore * 1000) / 1000 };
}

// ── VAD 역추정 ───────────────────────────────────────

/** 7D → VAD (Valence-Arousal-Dominance) */
export function estimateVADFrom7D(vec: Vibe7D) {
  return {
    valence: Math.round(((vec.warmth * 0.4 + vec.playful * 0.3 + vec.authentic * 0.3) * 2 - 1) * 100) / 100,
    arousal: Math.round(((vec.energy * 0.5 + vec.futuristic * 0.3 - vec.heritage * 0.2) * 2 - 1) * 100) / 100,
    dominance: Math.round(((vec.polish * 0.4 + vec.futuristic * 0.3 + vec.authentic * 0.2) * 2 - 1) * 100) / 100,
  };
}

// ── 주도 축 추출 ─────────────────────────────────────

export function getDominantAxes(vec: Vibe7D, n = 2): (keyof Vibe7D)[] {
  return (Object.entries(vec) as [keyof Vibe7D, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k);
}

// ── 벡터 블렌딩 ──────────────────────────────────────

export function blendVibes(a: Vibe7D, b: Vibe7D, wA: number, wB: number): Vibe7D {
  const result: Partial<Vibe7D> = {};
  for (const k of VIBE_AXES) {
    result[k] = Math.round((a[k] * wA + b[k] * wB) * 1000) / 1000;
  }
  return result as Vibe7D;
}

export function clampVibe(v: Vibe7D): Vibe7D {
  const result: Partial<Vibe7D> = {};
  for (const k of VIBE_AXES) {
    result[k] = Math.round(Math.min(1, Math.max(0, v[k])) * 1000) / 1000;
  }
  return result as Vibe7D;
}
