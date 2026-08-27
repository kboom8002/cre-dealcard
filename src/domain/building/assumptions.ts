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
  /** 취득세율 (%) */
  acquisitionTaxPct: number;
  /** 중개수수료율 (%) */
  brokerageFeePct: number;
  /** 재산세율 (%) */
  propertyTaxPct: number;
  /** 기본 Cap Rate */
  entryCapBase: number;
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
  acquisitionTaxPct: 4.6,
  brokerageFeePct: 0.9,
  propertyTaxPct: 0.4,
  entryCapBase: 0.04,
};

let overrides: Partial<FinancialAssumptions> = {};

const ASSET_TYPE_OVERRIDES: Record<string, Partial<FinancialAssumptions>> = {
  '오피스': { opexRatioPct: 15 },
  '리테일': { opexRatioPct: 20 },
  '지식산업센터': { opexRatioPct: 22 },
  '물류': { opexRatioPct: 12 },
  '호텔': { opexRatioPct: 25, vacancyReservePct: 10 },
  '원룸': { opexRatioPct: 15 },
  '병원': { opexRatioPct: 22 },
  '주유소': { opexRatioPct: 10 },
  '교육': { opexRatioPct: 20 },
};

/**
 * Returns the current assumptions, with any overrides applied on top of defaults.
 * In future, this will load from the `assumptions` DB table per asset type.
 */
export function getAssumptions(assetType?: string): FinancialAssumptions {
  // TODO: S0-T2 Phase 2 — Load from Supabase `assumptions` table keyed by assetType
  const base = { ...DEFAULT_ASSUMPTIONS, ...overrides };
  if (assetType) {
    const matchedKey = Object.keys(ASSET_TYPE_OVERRIDES).find(k =>
      assetType.toLowerCase().includes(k.toLowerCase())
    );
    if (matchedKey) {
      return { ...base, ...ASSET_TYPE_OVERRIDES[matchedKey] };
    }
  }
  return base;
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

/**
 * Phase 2 준비: Supabase에서 자산 유형별 가정값 로드
 * @todo S0-T2 Phase 2 — Supabase `assumptions` 테이블 연동
 */
export async function loadAssumptionsFromDB(
  _assetType?: string
): Promise<Partial<FinancialAssumptions> | null> {
  // Phase 2: Supabase 연동 시 구현
  // const { data } = await supabase.from('assumptions').select('*').eq('asset_type', assetType).single();
  // if (data) return data as Partial<FinancialAssumptions>;
  return null;
}
