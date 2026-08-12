export interface BuildingSSoTLite {
  [key: string]: unknown;
  // Core Identity
  id: string;
  pnu?: string;
  address?: string;
  building_name?: string;
  asset_type?: string;

  // Area & Zoning
  land_area_pyung?: number;
  total_floor_area_pyung?: number;
  far_pct?: number;
  zoning_region?: string;

  // Financial
  asking_price_krw?: number;
  gross_annual_income_krw?: number;

  // Signals (computed by upstream)
  area_signal?: string;
  price_band?: string;
  size_signal?: string;
  vacancy_signal?: string;

  // Summaries
  fit_summary?: string;
  caution_summary?: string;
  lease_summary?: Record<string, unknown>;
  ancillary_incomes?: unknown[];
  floor_leases?: unknown[];
  layers?: Record<string, unknown>;

  // Metadata
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}
