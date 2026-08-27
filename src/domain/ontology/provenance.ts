/**
 * provenance.ts — 온톨로지 Provenance 5-Tier 시스템
 * Spec: ONTOLOGY_V0.2_SPEC.md §1 · ONTOLOGY_V0.4_SPEC.md §4 (유지 확인)
 *
 * v0.1의 4-tier에서 'seller' 등급을 추가하여 5-tier로 확장.
 * 매도인 진술(seller)과 중개인 입력(broker)의 책임 소재를 분리합니다.
 * 파생값에 대한 합성 규칙(additive, ratio, scenario)을 신설합니다.
 *
 * v0.4 감사에서 구현 적합이 확인되었습니다. 로직 변경 없음.
 */

// ── 9-Tier Provenance (v0.5) ──────────────────────────────────────────────

/** v0.5 Provenance 등급 (신뢰도 내림차순 및 출처 10종 세분화) */
export type ProvenanceTier =
  | 'registry'              // 공부 (건축물대장, 등기부, 토지대장) — 1.00
  | 'public_api'            // 공공 API 원시 (V-World, 국토부) — 0.95
  | 'public_api_identified' // 공공 API 식별 결과 (D36 §4.3 S2b) — 0.90
  | 'broker_aug'            // 공공 + 중개인 보강 — 0.80
  | 'expert'                // 감정평가, 구조진단 — 0.95
  | 'ledger'                // 임대차 원장, 관리비 내역서 — 0.70
  | 'seller'                // 매도인 진술 — 0.65
  | 'broker'                // 중개인 진술 — 0.60
  | 'derived'               // 파생 계산값 — 최약 고리 승계
  | 'assumed'               // 가정값 — 0.30
  // 하위 호환 별칭 (v0.2/v0.4 레거시)
  | 'public';

// ── SourceTier 6단 표시 체계 (ONTOLOGY_V0.5_SPEC §5.2) ── (B-2)
export type SourceTier = 'S1' | 'S2a' | 'S2b' | 'S3' | 'S4' | 'S5';

/** ProvenanceTier → SourceTier 매핑 */
export function tierOf(p: ProvenanceTier): SourceTier {
  switch (p) {
    case 'registry':   return 'S1';
    case 'public_api': return 'S2a';
    case 'public_api_identified': return 'S2b';
    case 'broker_aug': return 'S2b';
    case 'expert':     return 'S3';
    case 'ledger':
    case 'seller':
    case 'broker':
    case 'derived':    return 'S4';
    case 'assumed':    return 'S5';
    case 'public':     return 'S1'; // 레거시 호환
  }
}

// ── 하위 호환 명시 export ── (B-2)
export type LegacyProvenanceTier = 'public' | 'expert' | 'seller' | 'broker' | 'assumed';

export const LEGACY_PROVENANCE_MAPPING: Record<LegacyProvenanceTier, ProvenanceTier> = {
  public: 'registry',
  expert: 'expert',
  seller: 'seller',
  broker: 'broker',
  assumed: 'assumed',
};

/** Provenance 등급별 메타데이터 */
export interface ProvenanceMeta {
  tier: ProvenanceTier;
  badge: string;
  label: string;
  score: number | null; // derived는 입력값의 최약 고리에 따라 동적 결정
  responsibility: string;
}

/** 9-tier 정의 레지스트리 (레거시 public 포함) */
export const PROVENANCE_REGISTRY: Record<ProvenanceTier, ProvenanceMeta> = {
  registry: {
    tier: 'registry',
    badge: '✓',
    label: '공부확인',
    score: 1.00,
    responsibility: '발급기관',
  },
  public_api: {
    tier: 'public_api',
    badge: '✓',
    label: '공공API',
    score: 0.95,
    responsibility: 'API 운영기관',
  },
  public_api_identified: {
    tier: 'public_api_identified',
    badge: '✓',
    label: '공공API식별',
    score: 0.90,
    responsibility: 'API 운영기관 + 시스템',
  },
  broker_aug: {
    tier: 'broker_aug',
    badge: '●✓',
    label: '공공+보강',
    score: 0.80,
    responsibility: '중개인+운영기관',
  },
  expert: {
    tier: 'expert',
    badge: '★',
    label: '전문가검증',
    score: 0.95,
    responsibility: '해당 자격사',
  },
  ledger: {
    tier: 'ledger',
    badge: '📋',
    label: '원장확인',
    score: 0.70,
    responsibility: '원장 제공자',
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
  derived: {
    tier: 'derived',
    badge: '⚙',
    label: '파생계산',
    score: null,
    responsibility: '시스템',
  },
  assumed: {
    tier: 'assumed',
    badge: '◇',
    label: 'AI추정·가정',
    score: 0.30,
    responsibility: '없음 (가정)',
  },
  // 하위 호환 매핑
  public: {
    tier: 'registry',
    badge: '✓',
    label: '공부확인',
    score: 1.00,
    responsibility: '발급기관',
  },
};

/** 점수에서 가장 가까운 Provenance Tier 반환 */
export function scoreToTier(score: number): ProvenanceTier {
  if (score >= 0.975) return 'registry';
  if (score >= 0.80) return 'expert';
  if (score >= 0.625) return 'seller';
  if (score >= 0.45) return 'broker';
  return 'assumed';
}

/** 배지 문자열 생성 (예: "● 중개인입력") */
export function formatBadge(tier: ProvenanceTier): string {
  const meta = PROVENANCE_REGISTRY[tier] || PROVENANCE_REGISTRY.assumed;
  return `${meta.badge} ${meta.label}`;
}

/** C21: 파생값 최약 고리 승계 */
export function derivedConfidence(inputs: ProvenanceTier[]): number {
  const scores = inputs
    .map(p => PROVENANCE_REGISTRY[p]?.score)
    .filter((s): s is number => s !== null && s !== undefined);
  return scores.length > 0 ? Math.min(...scores) : 0.30;
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
