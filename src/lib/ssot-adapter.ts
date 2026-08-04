import { createServiceClient } from '@/lib/supabase/service';
import type { Asset, Deal, LeaseUnit } from '@/types/database';

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

    // ── Category-level filled markers for grade-engine NEW_WEIGHTS ──
    // grade-engine iterates baseWeights keys (lease_roll, building_basic, ...)
    // and checks attrs[category] != null. Without these, score is always 0% = Grade D.
    building_basic: (totalFloorAreaPyung || layers?.building_register) ? true : null,
    land_parcel: (landAreaPyung || layers?.land_use_plan) ? true : null,
    zoning: (layers?.land_use_plan?.zoning || building.area_signal) ? true : null,
    road_access: (layers?.road_contact_type || layers?.parking_capacity) ? true : null,
    lease_roll: (grossAnnualIncomeKrw > 0 || leaseSummary?.tenants) ? true : null,
    financial_input: (askingPriceKrw && askingPriceKrw > 0) ? true : null,
    title_encumbrance: layers?.title_encumbrance ? true : null,
    market_comp: layers?.market_comp ? true : null,
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

/**
 * Converts a building_ssot_lite row into an Asset entity.
 * Used for progressive migration from flat table to relational schema.
 * @see dev-spec-v2
 */
export function buildAssetFromSsotLite(row: Record<string, unknown>): Partial<Asset> {
  const attrs = buildAttrsFromSsotLite(row);
  const provenance = buildProvenanceFromSsotLite(row);
  return {
    id: String(row.id || ''),
    asset_type: String(row.asset_type || attrs.assetType || 'office'),
    pnu: String(row.pnu || attrs.pnu || ''),
    region_code: String(attrs.regionCode || ''),
    zoning_region: String(attrs.zoningRegion || ''),
    attrs,
    provenance,
    data_grade: String(attrs.dataGrade || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

/**
 * Converts a building_ssot_lite row into a Deal entity.
 */
export function buildDealFromSsotLite(row: Record<string, unknown>): Partial<Deal> {
  const attrs = buildAttrsFromSsotLite(row);
  return {
    id: String(row.id || ''),
    broker_id: String(row.broker_id || ''),
    asset_id: String(row.id || ''), // same ID for migration
    pipeline_stage: String(row.pipeline_stage || row.status || 'memo_input'),
    mandate_type: String(row.mandate_type || 'exclusive'),
    asking_price_krw: Number(attrs.askingPriceKrw || 0),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

/**
 * Extracts lease units from rent roll data embedded in building_ssot_lite.
 */
export function buildLeaseUnitsFromSsotLite(row: Record<string, unknown>, assetId: string): Partial<LeaseUnit>[] {
  const layers = (row.layers || {}) as Record<string, unknown>;
  const rentRoll = (layers.rent_roll || []) as Array<Record<string, unknown>>;
  
  return rentRoll.map((unit, idx) => ({
    asset_id: assetId,
    floor: String(unit.floor || unit.층 || `${idx + 1}F`),
    tenant_sector: String(unit.tenant_sector || unit.업종 || ''),
    area_pyung: Number(unit.area_pyung || unit.면적 || 0),
    deposit_krw: Number(unit.deposit_krw || unit.보증금 || 0),
    monthly_rent_krw: Number(unit.monthly_rent_krw || unit.월세 || 0),
    mgmt_fee_krw: Number(unit.mgmt_fee_krw || unit.관리비 || 0),
    source_tier: 'broker_input',
  }));
}

/**
 * Read-through migration middleware.
 * Tries the new `assets` table first; if not found, reads from `building_ssot_lite`,
 * converts, lazy-writes to `assets`, and returns the result.
 * This enables gradual migration without a big-bang cutover.
 * @see SDD S1-T3
 */
export async function readWithMigration(buildingId: string): Promise<{
  source: 'assets' | 'building_ssot_lite';
  data: Record<string, unknown>;
  migrated: boolean;
}> {
  const supabase = createServiceClient();
  
  // 1. Try new table first
  const { data: asset } = await supabase
    .from('assets')
    .select('*')
    .eq('id', buildingId)
    .maybeSingle();
  
  if (asset) {
    return { source: 'assets', data: asset, migrated: false };
  }
  
  // 2. Fall back to legacy table
  const { data: legacy } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .single();
  
  if (!legacy) {
    return { source: 'building_ssot_lite', data: {}, migrated: false };
  }
  
  // 3. Convert and lazy-write to new tables
  const convertedAsset = buildAssetFromSsotLite({
    ...legacy,
    lease_summary: legacy.lease_summary ?? {},
  });
  const { error: assetError } = await supabase
    .from('assets')
    .upsert(convertedAsset, { onConflict: 'id' })
    .select()
    .single();
  
  if (assetError) {
    console.warn(`[ssot-adapter] Lazy migration failed for asset ${buildingId}:`, assetError.message);
  } else {
    // 3a. Lazy-write to deals table
    const convertedDeal = buildDealFromSsotLite(legacy);
    if (convertedDeal.broker_id) {
      const { error: dealError } = await supabase
        .from('deals')
        .upsert(convertedDeal, { onConflict: 'id' });
      if (dealError) console.warn(`[ssot-adapter] Lazy migration failed for deal ${buildingId}:`, dealError.message);
    }
    
    // 3b. Lazy-write to lease_units table
    const units = buildLeaseUnitsFromSsotLite(legacy, buildingId);
    if (units.length > 0) {
      await supabase.from('lease_units').delete().eq('asset_id', buildingId);
      const { error: leaseError } = await supabase.from('lease_units').insert(units);
      if (leaseError) console.warn(`[ssot-adapter] Lazy migration failed for lease_units ${buildingId}:`, leaseError.message);
    }
  }
  
  return { source: 'building_ssot_lite', data: legacy, migrated: !assetError };
}

/**
 * Batch read-through migration for multiple buildings.
 */
export async function readManyWithMigration(buildingIds: string[]): Promise<{
  results: Array<{ id: string; source: string; data: Record<string, unknown> }>;
  migratedCount: number;
}> {
  const results = [];
  let migratedCount = 0;
  
  for (const id of buildingIds) {
    const result = await readWithMigration(id);
    results.push({ id, source: result.source, data: result.data });
    if (result.migrated) migratedCount++;
  }
  
  return { results, migratedCount };
}
