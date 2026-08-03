/**
 * provenance.ts — 온톨로지 v0.2 Provenance 5-Tier 시스템
 * Spec: ONTOLOGY_V0.2_SPEC.md §1
 * 
 * v0.1의 4-tier에서 'seller' 등급을 추가하여 5-tier로 확장.
 * 매도인 진술(seller)과 중개인 입력(broker)의 책임 소재를 분리합니다.
 * 파생값에 대한 합성 규칙(additive, ratio, scenario)을 신설합니다.
 */

// ── 5-Tier Provenance ──────────────────────────────────────────────

/** v0.2 Provenance 등급 (신뢰도 내림차순) */
export type ProvenanceTier = 'public' | 'expert' | 'seller' | 'broker' | 'assumed';

/** Provenance 등급별 메타데이터 */
export interface ProvenanceMeta {
  tier: ProvenanceTier;
  badge: string;
  label: string;
  score: number;
  responsibility: string;
}

/** 5-tier 정의 레지스트리 */
export const PROVENANCE_REGISTRY: Record<ProvenanceTier, ProvenanceMeta> = {
  public: {
    tier: 'public',
    badge: '✓',
    label: '공부확인',
    score: 1.00,
    responsibility: '발급기관',
  },
  expert: {
    tier: 'expert',
    badge: '★',
    label: '전문가검증',
    score: 0.95,
    responsibility: '해당 자격사',
  },
  seller: {
    tier: 'seller',
    badge: '▲',
    label: '매도인고지',
    score: 0.65,
    responsibility: '매도인',
  },
  broker: {
    tier: 'broker',
    badge: '●',
    label: '중개인입력',
    score: 0.60,
    responsibility: '중개인',
  },
  assumed: {
    tier: 'assumed',
    badge: '◇',
    label: 'AI추정·가정',
    score: 0.30,
    responsibility: '없음 (가정)',
  },
};

/** 점수에서 가장 가까운 Provenance Tier 반환 */
export function scoreToTier(score: number): ProvenanceTier {
  if (score >= 0.975) return 'public';
  if (score >= 0.80) return 'expert';
  if (score >= 0.625) return 'seller';
  if (score >= 0.45) return 'broker';
  return 'assumed';
}

/** 배지 문자열 생성 (예: "● 중개인입력") */
export function formatBadge(tier: ProvenanceTier): string {
  const meta = PROVENANCE_REGISTRY[tier];
  return `${meta.badge} ${meta.label}`;
}

// ── 파생값 합성 규칙 (§1.2) ────────────────────────────────────────

export type CompositionKind = 'additive' | 'ratio' | 'scenario';

export interface ProvenanceInput {
  value: number;
  score: number;
  label: string;
}

export interface ComposedProvenance {
  compositionKind: CompositionKind;
  score: number;
  tier: ProvenanceTier;
  badge: string;
  weakestLink: { label: string; tier: ProvenanceTier; score: number } | null;
  inputs: ProvenanceInput[];
}

/**
 * A. 가감산 — 기여 절대값 가중 평균
 * NOI 등 입출금 합산 지표에 사용
 */
export function composeAdditive(inputs: ProvenanceInput[]): ComposedProvenance {
  if (inputs.length === 0) {
    return {
      compositionKind: 'additive',
      score: 0.30,
      tier: 'assumed',
      badge: formatBadge('assumed'),
      weakestLink: null,
      inputs,
    };
  }

  const total = inputs.reduce((s, i) => s + Math.abs(i.value), 0);
  const score = total === 0
    ? 0.30
    : inputs.reduce((s, i) => s + (Math.abs(i.value) / total) * i.score, 0);

  const weakest = inputs.reduce((min, i) => i.score < min.score ? i : min, inputs[0]);
  const tier = scoreToTier(score);

  return {
    compositionKind: 'additive',
    score: parseFloat(score.toFixed(3)),
    tier,
    badge: formatBadge(tier),
    weakestLink: {
      label: weakest.label,
      tier: scoreToTier(weakest.score),
      score: weakest.score,
    },
    inputs,
  };
}

/**
 * B. 비율 — 분자·분모 중 낮은 쪽
 * Cap Rate 등 비율 지표에 사용
 */
export function composeRatio(
  numerator: ProvenanceInput,
  denominator: ProvenanceInput,
): ComposedProvenance {
  const score = Math.min(numerator.score, denominator.score);
  const tier = scoreToTier(score);
  const inputs = [numerator, denominator];
  const weakest = numerator.score <= denominator.score ? numerator : denominator;

  return {
    compositionKind: 'ratio',
    score: parseFloat(score.toFixed(3)),
    tier,
    badge: formatBadge(tier),
    weakestLink: {
      label: weakest.label,
      tier: scoreToTier(weakest.score),
      score: weakest.score,
    },
    inputs,
  };
}

/**
 * C. 시나리오 — 미래 예측은 입력이 아무리 정확해도 가정이다
 * 총수익률·NPV·IRR에 적용
 * C22: 시나리오 지표는 반드시 'assumed'
 */
export const SCENARIO_SCORE = 0.30;

export function composeScenario(inputs: ProvenanceInput[]): ComposedProvenance {
  return {
    compositionKind: 'scenario',
    score: SCENARIO_SCORE,
    tier: 'assumed',
    badge: formatBadge('assumed'),
    weakestLink: null, // 전체가 가정이므로 최약 고리 표시 불필요
    inputs,
  };
}

// ── v0.1 → v0.2 마이그레이션 헬퍼 ─────────────────────────────────

/** v0.1 provenance를 v0.2로 변환. seller 후보 슬롯 목록 기반. */
export const SELLER_CANDIDATE_SLOTS = new Set([
  'loanAmountKrw',          // 실 대출잔액
  'tenantDelinquency',      // 임차인 연체 이력
  'mgmtFeeDetail',          // 관리비 실비 내역
  'equipmentHistory',       // 설비 교체 이력
  'askingPriceKrw',         // 매각 희망가
]);

/**
 * v0.1 4-tier → v0.2 5-tier 변환
 * broker 중 매도인 진술분을 seller로 이동 (후보 목록 기반)
 */
export function migrateProvenanceTier(
  slotKey: string,
  v01Tier: string,
): ProvenanceTier {
  // v0.1의 'public_api' → 'public'
  if (v01Tier === 'public_api') return 'public';
  // v0.1의 'ocr' → 'public' (공부 문서 OCR)
  if (v01Tier === 'ocr') return 'public';
  // v0.1의 'derived' → 'assumed'
  if (v01Tier === 'derived') return 'assumed';
  // v0.1의 'broker_input' → seller 후보면 seller, 아니면 broker
  if (v01Tier === 'broker_input' || v01Tier === 'broker') {
    return SELLER_CANDIDATE_SLOTS.has(slotKey) ? 'seller' : 'broker';
  }
  // expert는 그대로
  if (v01Tier === 'expert') return 'expert';
  // 기본값
  return 'assumed';
}
