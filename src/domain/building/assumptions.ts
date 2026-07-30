/**
 * @module Assumptions
 * @description Centralized financial assumptions for CREDEAL v3.
 * Currently uses hardcoded defaults; designed for future `assumptions` DB table.
 * @see SDD §5 S0-T2
 */

export interface FinancialAssumptions {
  opexRatioPct: number;
  vacancyReservePct: number;
  remodelCostPerSqm: number;
  discountRate: number;
  terminalCapRate: number;
  holdPeriodYears: number;
  annualRentGrowthPct: number;
  annualOpexGrowthPct: number;
  ltvMaxPct: number;
  loanInterestRatePct: number;
}

const DEFAULT_ASSUMPTIONS: FinancialAssumptions = {
  opexRatioPct: 10,
  vacancyReservePct: 5,
  remodelCostPerSqm: 500_000,
  discountRate: 0.08,
  terminalCapRate: 0.06,
  holdPeriodYears: 5,
  annualRentGrowthPct: 2,
  annualOpexGrowthPct: 3,
  ltvMaxPct: 65,
  loanInterestRatePct: 4.5,
};

let overrides: Partial<FinancialAssumptions> = {};

/**
 * Returns the current assumptions, with any overrides applied on top of defaults.
 * In future, this will load from the `assumptions` DB table per asset type.
 */
export function getAssumptions(assetType?: string): FinancialAssumptions {
  // TODO: S0-T2 Phase 2 — Load from Supabase `assumptions` table keyed by assetType
  return { ...DEFAULT_ASSUMPTIONS, ...overrides };
}

/**
 * Sets runtime overrides for assumptions. Useful for testing and per-deal customization.
 */
export function setAssumptionOverrides(partial: Partial<FinancialAssumptions>): void {
  overrides = { ...overrides, ...partial };
}

/**
 * Resets all overrides back to defaults.
 */
export function resetAssumptions(): void {
  overrides = {};
}
