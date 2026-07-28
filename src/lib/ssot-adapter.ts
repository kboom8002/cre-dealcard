/**
 * @module SSoT Adapter
 * @description Bridges the legacy `building_ssot_lite` flat schema
 * to the v3 ontology `assets.attrs` format expected by domain modules.
 *
 * Decision #2: building_ssot_lite 유지 + 어댑터 함수로 점진적 전환
 */

/** Extracts v3-compatible attrs from building_ssot_lite record */
export function buildAttrsFromSsotLite(
  building: Record<string, any>,
): Record<string, unknown> {
  const layers = (building.layers ?? {}) as Record<string, any>;
  const leaseSummary = (building.lease_summary ?? {}) as Record<string, any>;

  // Parse price from price_band (e.g. "80억대" → 8000000000)
  const askingPriceKrw = parsePriceBand(building.price_band);

  // Extract gross annual income from lease summary
  const monthlyRentTotal = leaseSummary?.monthly_rent_total_krw ?? 0;
  const grossAnnualIncomeKrw = monthlyRentTotal * 12;

  // Extract area from size_signal or layers
  const landAreaPyung = layers?.land_area_pyung ?? layers?.building_register?.land_area_pyung ?? null;
  const totalFloorAreaPyung = layers?.total_floor_area_pyung ?? layers?.building_register?.total_floor_area_pyung ?? null;

  return {
    // Required slots for grade-engine
    pnu: layers?.pnu ?? building.pnu ?? null,
    address: layers?.location?.address ?? building.area_signal ?? null,
    landAreaPyung,
    totalFloorAreaPyung,
    askingPriceKrw,
    grossAnnualIncomeKrw,
    zoningRegion: layers?.land_use_plan?.zoning ?? null,

    // Enhanced slots
    approvalDate: layers?.building_register?.approval_date ?? null,
    farHeadroomPp: layers?.far_headroom_pp ?? null,
    evictionStatus: layers?.eviction_status ?? building.vacancy_signal ?? null,
    rentRoll: leaseSummary?.tenants ?? null,
    officialLandPricePerSqm: layers?.official_land_price_per_sqm ?? null,
    roadContactType: layers?.road_contact_type ?? null,
    parkingCapacity: layers?.parking_capacity ?? null,

    // Additional for archetype-classifier
    assetType: building.asset_type ?? null,
    vacancySignal: building.vacancy_signal ?? null,
    currentUseSignal: building.current_use_signal ?? null,
    priceBand: building.price_band ?? null,
    areaSignal: building.area_signal ?? null,
    completionEra: layers?.building_register?.completion_era ?? null,
    totalFloors: layers?.building_register?.total_floors ?? null,

    // Financial inputs
    opexRatioPct: layers?.financial_assumptions?.opex_ratio_pct ?? 10,
    vacancyReservePct: layers?.financial_assumptions?.vacancy_reserve_pct ?? 5,
    loanAmountKrw: (leaseSummary?.loan_amount_manwon ?? 0) * 10000,
    totalDepositKrw: (leaseSummary?.total_deposit_manwon ?? 0) * 10000,
  };
}

/** Builds a basic provenance map from building_ssot_lite */
export function buildProvenanceFromSsotLite(
  building: Record<string, any>,
): Record<string, { tier: string; source: string }> {
  const provenance: Record<string, { tier: string; source: string }> = {};
  const layers = (building.layers ?? {}) as Record<string, any>;

  // Mark public data sources
  if (layers?.building_register) {
    for (const key of ['landAreaPyung', 'totalFloorAreaPyung', 'approvalDate']) {
      provenance[key] = { tier: 'public_api', source: 'building_register' };
    }
  }
  if (layers?.land_use_plan) {
    provenance['zoningRegion'] = { tier: 'public_api', source: 'land_use_plan' };
  }
  if (layers?.official_land_price_per_sqm) {
    provenance['officialLandPricePerSqm'] = { tier: 'public_api', source: 'official_land_price' };
  }

  // Broker-entered data
  if (building.price_band) {
    provenance['askingPriceKrw'] = { tier: 'broker', source: 'manual_input' };
  }
  if (building.lease_summary?.tenants?.length > 0) {
    provenance['rentRoll'] = { tier: 'broker', source: 'manual_input' };
    provenance['grossAnnualIncomeKrw'] = { tier: 'broker', source: 'calculated' };
  }

  // AI-derived
  if (building.input_type === 'broker_memo' || building.input_type === 'voice_note') {
    provenance['address'] = provenance['address'] ?? { tier: 'ai_estimated', source: 'memo_extraction' };
    provenance['assetType'] = { tier: 'ai_estimated', source: 'memo_extraction' };
  }

  return provenance;
}

/** Extract FinancialInputs from building record for computeFinancialSummary */
export function buildFinancialInputsFromSsotLite(
  building: Record<string, any>,
): {
  grossAnnualIncomeKrw: number;
  askingPriceKrw: number;
  opexRatioPct: number;
  vacancyReservePct: number;
  loanAmountKrw: number;
  totalDepositKrw: number;
  dataGrade: string;
} {
  const layers = (building.layers ?? {}) as Record<string, any>;
  const leaseSummary = (building.lease_summary ?? {}) as Record<string, any>;

  const monthlyRentTotal = leaseSummary?.monthly_rent_total_krw ?? 0;

  return {
    grossAnnualIncomeKrw: monthlyRentTotal * 12,
    askingPriceKrw: parsePriceBand(building.price_band),
    opexRatioPct: layers?.financial_assumptions?.opex_ratio_pct ?? 10,
    vacancyReservePct: layers?.financial_assumptions?.vacancy_reserve_pct ?? 5,
    loanAmountKrw: (leaseSummary?.loan_amount_manwon ?? 0) * 10000,
    totalDepositKrw: (leaseSummary?.total_deposit_manwon ?? 0) * 10000,
    dataGrade: building.data_grade ?? 'C',
  };
}

/** Parse Korean price band string to KRW number */
function parsePriceBand(priceBand: string | null | undefined): number {
  if (!priceBand) return 0;
  const cleaned = priceBand.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  if (priceBand.includes('조')) return num * 1_000_000_000_000;
  if (priceBand.includes('억')) return num * 100_000_000;
  if (priceBand.includes('만')) return num * 10_000;
  // If the number seems like 만원 units (common in building_ssot_lite)
  if (num > 100 && !priceBand.includes('원')) return num * 10_000;
  return num;
}
