/**
 * @file thresholds.ts
 * @description System-wide threshold constants (SSOT)
 * Rule 8: No hardcoded thresholds in domain and test code
 * @see AGENTS.md §8
 */

export const THRESHOLDS = {
  // Data Grade Thresholds (grade-engine)
  GRADE_D_MAX: 40,
  GRADE_C_MAX: 65,
  GRADE_B_MAX: 85,

  // Cap Rate Warnings (%)
  CAP_RATE_LOW_WARNING: 2.0,
  CAP_RATE_HIGH_WARNING: 15.0,

  // Execution Timeouts (ms)
  IM_SOFT_TIMEOUT_MS: 90_000,
  IM_GENERATION_TIMEOUT_MS: 105_000,
  IM_HARD_TIMEOUT_MS: 120_000,

  // Provenance Reliability Coefficients (ONTOLOGY_V0.5_SPEC §6.2)
  PROVENANCE_REGISTRY: 1.0,
  PROVENANCE_PUBLIC_API: 0.95,
  PROVENANCE_PUBLIC_API_IDENTIFIED: 0.90,
  PROVENANCE_EXPERT: 0.95,
  PROVENANCE_BROKER_AUG: 0.80,
  PROVENANCE_LEDGER: 0.70,
  PROVENANCE_SELLER: 0.65,
  PROVENANCE_BROKER: 0.60,
  PROVENANCE_ASSUMED: 0.30,

  // Page Limits (AGENTS.md Rule 10)
  PAGE_HARD_LIMIT: 16,

  // E2E Test & UI Thresholds
  MIN_CONTENT_LENGTH: 500,
  MAX_LOAD_TIME_MS: 10_000,
} as const;

export const TIMEOUT_THRESHOLDS = {
  SOFT_LIMIT_MS: THRESHOLDS.IM_SOFT_TIMEOUT_MS,
  HARD_LIMIT_MS: THRESHOLDS.IM_GENERATION_TIMEOUT_MS,
  KILL_LIMIT_MS: THRESHOLDS.IM_HARD_TIMEOUT_MS,
} as const;

export type Thresholds = typeof THRESHOLDS;


