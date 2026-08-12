/**
 * @module FeatureFlags
 * @description CREDEAL v3 Feature Flag System.
 * Controls rollout of new features with kill-switch capability.
 * @see SDD §5 S0-T10, TASKS.md
 */

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  stage: string; // SDD stage reference
}

/** All feature flags with their default states */
const FLAGS: Record<string, FeatureFlag> = {
  ff_s0_assumptions: {
    key: 'ff_s0_assumptions',
    enabled: true,
    description: 'S0-T2: Use centralized assumptions instead of hardcoded defaults',
    stage: 'S0',
  },
  ff_s0_ui_financials: {
    key: 'ff_s0_ui_financials',
    enabled: false,
    description: 'S0-T12: Block UI-level financial calculations (enforce Rule #5)',
    stage: 'S0',
  },
  ff_s1_addr_guard: {
    key: 'ff_s1_addr_guard',
    enabled: true,
    description: 'S1-T15: Enable address fallback reliability guard (C13)',
    stage: 'S1',
  },
  ff_s1_ontology_loader: {
    key: 'ff_s1_ontology_loader',
    enabled: true,
    description: 'S1-T1: Use asset-ontology module for type definitions',
    stage: 'S1',
  },
  ff_s1_cache_ttl_diff: {
    key: 'ff_s1_cache_ttl_diff',
    enabled: true,
    description: 'S1-T16: Differentiated cache TTL per data source',
    stage: 'S1',
  },
  ff_s2_memo_mapper: {
    key: 'ff_s2_memo_mapper',
    enabled: true,
    description: 'S2-T3: Enable memo-to-slot NLP extraction',
    stage: 'S2',
  },
  ff_s2_tacit_label: {
    key: 'ff_s2_tacit_label',
    enabled: true,
    description: 'S2-T5: Enable 1-tap tacit labeling on deal fallout',
    stage: 'S2',
  },
  ff_s2_edit_diff: {
    key: 'ff_s2_edit_diff',
    enabled: true,
    description: 'S2-T6: Collect edit diffs for LLM prompt calibration',
    stage: 'S2',
  },
  ff_s3_nlg_mask: {
    key: 'ff_s3_nlg_mask',
    enabled: true,
    description: 'S3-T1: Use deterministic NLG mask templates instead of free LLM',
    stage: 'S3',
  },
  ff_s3_pro_im: {
    key: 'ff_s3_pro_im',
    enabled: true,
    description: 'S3-T4: Enable Pro IM tier with NDA gate',
    stage: 'S3',
  },
  ff_s3_photo_filter: {
    key: 'ff_s3_photo_filter',
    enabled: true,
    description: 'S3-T10: Enable photo privacy filtering by IM tier',
    stage: 'S3',
  },
  ff_s4_give_to_get: {
    key: 'ff_s4_give_to_get',
    enabled: false,
    description: 'S4-K1: Enable Give-to-Get network mechanics',
    stage: 'S4',
  },
  ff_posture_income: {
    key: 'ff_posture_income',
    enabled: true,
    description: 'Phase delta: Enable posture income',
    stage: 'PhaseDelta',
  },
  ff_posture_development: {
    key: 'ff_posture_development',
    enabled: true,
    description: 'Phase delta: Enable posture development',
    stage: 'PhaseDelta',
  },
  ff_posture_operating: {
    key: 'ff_posture_operating',
    enabled: true,
    description: 'Phase delta: Enable posture operating',
    stage: 'PhaseDelta',
  },
  ff_posture_owner_occupied: {
    key: 'ff_posture_owner_occupied',
    enabled: true,
    description: 'Phase delta: Enable posture owner_occupied',
    stage: 'PhaseDelta',
  },
  ff_posture_trading: {
    key: 'ff_posture_trading',
    enabled: false,
    description: 'Phase delta: Enable posture trading (beta)',
    stage: 'PhaseDelta',
  },
};

let runtimeOverrides: Record<string, boolean> = {};

/**
 * Checks if a feature flag is enabled.
 */
export function isFeatureEnabled(flagKey: string): boolean {
  if (flagKey in runtimeOverrides) return runtimeOverrides[flagKey];
  return FLAGS[flagKey]?.enabled ?? false;
}

/**
 * Returns all registered feature flags.
 */
export function getAllFlags(): FeatureFlag[] {
  return Object.values(FLAGS).map(f => ({
    ...f,
    enabled: runtimeOverrides[f.key] ?? f.enabled,
  }));
}

/**
 * Overrides a flag at runtime. Useful for per-request or A/B testing.
 */
export function setFlagOverride(flagKey: string, enabled: boolean): void {
  runtimeOverrides[flagKey] = enabled;
}

/**
 * Resets all runtime overrides.
 */
export function resetFlagOverrides(): void {
  runtimeOverrides = {};
}
