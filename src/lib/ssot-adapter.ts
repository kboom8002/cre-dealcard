import { createServiceClient } from '@/lib/supabase/service';
import type { Asset, Deal, LeaseUnit } from '@/types/database';
import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';

/**
 * @module SSoT Adapter
 * @description Bridges the legacy `building_ssot_lite` flat schema
 * to the v3 ontology `assets.attrs` format expected by domain modules.
 *
 * Decision #2: building_ssot_lite 유지 + 어댑터 함수로 점진적 전환
 */

/** Extracts v3-compatible attrs from building_ssot_lite or assets record */
export function buildAttrsFromSsotLite(
  building: Record<string, any>,
): Record<string, unknown> {
  const existingAttrs = (building.attrs ?? {}) as Record<string, any>;
  const layers = (building.layers ?? existingAttrs.layers ?? {}) as Record<string, any>;
  const leaseSummary = (building.lease_summary ?? existingAttrs.leaseSummary ?? existingAttrs.lease_summary ?? {}) as Record<string, any>;
  const finance = (layers.finance ?? existingAttrs.finance ?? {}) as Record<string, any>;
  const rawInput = building.raw_input ?? existingAttrs.rawInput ?? null;

  // 원문 메모 슬롯 파싱 (기존 데이터 복구용)
  const memoSlots = rawInput ? extractSlotsFromMemo(rawInput).slots : [];
  const slotMap = new Map(memoSlots.map(s => [s.key, s.value]));

  // Parse price from finance layer, raw input slots, asking_price, or price_band
  const priceBandStr = building.price_band ?? existingAttrs.priceBand ?? existingAttrs.price_band ?? null;
  let askingPriceKrw = Number(
    finance.asking_price_krw ??
    building.asking_price_krw ??
    building.asking_price ??
    existingAttrs.askingPriceKrw ??
    existingAttrs.asking_price_krw ??
    (slotMap.get('askingPriceKrw') as number) ??
    0
  );

  if (!askingPriceKrw && priceBandStr) {
    askingPriceKrw = parsePriceBand(priceBandStr);
  }

  // Extract gross annual income from lease summary, finance layer, or raw memo
  const monthlyRentTotal = Number(
    finance.monthly_rent_krw ??
    leaseSummary?.monthly_rent_total_krw ??
    existingAttrs.monthlyRentKrw ??
    (slotMap.get('monthlyRentKrw') as number) ??
    0
  );
  const grossAnnualIncomeKrw = (monthlyRentTotal * 12) || (existingAttrs.grossAnnualIncomeKrw as number) || 0;

  // Extract area from size_signal, layers, or raw memo slots
  const landAreaPyung = layers?.land_area_pyung ?? layers?.building_register?.land_area_pyung ?? existingAttrs.landAreaPyung ?? (slotMap.get('landAreaPyung') as number) ?? null;
  const totalFloorAreaPyung = layers?.total_floor_area_pyung ?? layers?.building_register?.total_floor_area_pyung ?? existingAttrs.totalFloorAreaPyung ?? (slotMap.get('totalFloorAreaPyung') as number) ?? null;

  return {
    // Required slots for grade-engine
    pnu: layers?.pnu ?? building.pnu ?? existingAttrs.pnu ?? null,
    address: layers?.location?.raw_address ?? building.raw_address ?? layers?.location?.address ?? existingAttrs.address ?? existingAttrs.rawAddress ?? null,
    rawInput: building.raw_input ?? existingAttrs.rawInput ?? null,
    landAreaPyung,
    totalFloorAreaPyung,
    askingPriceKrw,
    grossAnnualIncomeKrw,
    zoningRegion: layers?.land_use_plan?.zoning ?? building.zoning_region ?? existingAttrs.zoningRegion ?? null,

    // Enhanced slots
    approvalDate: layers?.building_register?.approval_date ?? existingAttrs.approvalDate ?? null,
    farHeadroomPp: layers?.far_headroom_pp ?? existingAttrs.farHeadroomPp ?? null,
    evictionStatus: layers?.eviction_status ?? building.vacancy_signal ?? existingAttrs.evictionStatus ?? existingAttrs.vacancySignal ?? null,
    rentRoll: leaseSummary?.tenants ?? existingAttrs.rentRoll ?? null,
    officialLandPricePerSqm: layers?.official_land_price_per_sqm ?? existingAttrs.officialLandPricePerSqm ?? null,
    roadContactType: layers?.road_contact_type ?? existingAttrs.roadContactType ?? null,
    parkingCapacity: layers?.parking_capacity ?? existingAttrs.parkingCapacity ?? null,

    // Additional for archetype-classifier
    assetType: building.asset_type ?? existingAttrs.assetType ?? existingAttrs.asset_type ?? null,
    vacancySignal: building.vacancy_signal ?? existingAttrs.vacancySignal ?? existingAttrs.vacancy_signal ?? null,
    currentUseSignal: building.current_use_signal ?? existingAttrs.currentUseSignal ?? existingAttrs.current_use_signal ?? null,
    priceBand: priceBandStr,
    areaSignal: building.area_signal ?? existingAttrs.areaSignal ?? existingAttrs.area_signal ?? null,
    completionEra: layers?.building_register?.completion_era ?? existingAttrs.completionEra ?? null,
    totalFloors: layers?.building_register?.total_floors ?? existingAttrs.totalFloors ?? null,

    // Financial inputs
    opexRatioPct: layers?.financial_assumptions?.opex_ratio_pct ?? existingAttrs.opexRatioPct ?? 10,
    vacancyReservePct: layers?.financial_assumptions?.vacancy_reserve_pct ?? existingAttrs.vacancyReservePct ?? 5,
    loanAmountKrw: existingAttrs.loanAmountKrw ?? ((leaseSummary?.loan_amount_manwon ?? 0) * 10000),
    totalDepositKrw: existingAttrs.totalDepositKrw ?? ((leaseSummary?.total_deposit_manwon ?? 0) * 10000),
    loanStatus: layers?.financial?.loanStatus || leaseSummary?.loan_status || existingAttrs.loanStatus || null,

    // Pack slots & market benchmark
    hospitalitySpec: layers?.pack_slots?.HospitalitySpec || layers?.hospitality_spec || existingAttrs.hospitalitySpec || null,
    comparableAvgPricePerPyung: layers?.comparable_avg_per_pyung ?? existingAttrs.comparableAvgPricePerPyung ?? null,
    sigungu: layers?.location?.sigungu ?? existingAttrs.sigungu ?? null,

    // ── Phase A: 누락 필드 매핑 복구 (teaser-projector 연결) ──
    investmentPosture: building.investment_posture || existingAttrs.investmentPosture || layers?.investment_posture || null,
    buildYear: existingAttrs.buildYear ?? (layers?.building_register?.approval_date
      ? new Date(String(layers.building_register.approval_date)).getFullYear()
      : (layers?.building_register?.completion_era ? parseInt(String(layers.building_register.completion_era), 10) || null : null)),
    floorsAboveGround: existingAttrs.floorsAboveGround
      || layers?.building_register?.floors_above_ground
      || layers?.building_register?.total_floors || null,
    monthlyRentKrw: monthlyRentTotal || existingAttrs.monthlyRentKrw || null,
    vacancyPct: existingAttrs.vacancyPct ?? leaseSummary?.vacancy_pct ?? (leaseSummary?.vacancy_rate != null
      ? Number(leaseSummary.vacancy_rate) * 100 : null),
    capRatePct: (() => {
      if (existingAttrs.capRatePct != null) return existingAttrs.capRatePct;
      const income = monthlyRentTotal * 12;
      return (askingPriceKrw && askingPriceKrw > 0 && income > 0)
        ? Math.round((income / askingPriceKrw) * 10000) / 100 : null;
    })(),
    pricePerPyung: (() => {
      if (existingAttrs.pricePerPyung != null) return existingAttrs.pricePerPyung;
      return (askingPriceKrw && askingPriceKrw > 0 && totalFloorAreaPyung && totalFloorAreaPyung > 0)
        ? Math.round(askingPriceKrw / totalFloorAreaPyung) : null;
    })(),
    photoCount: existingAttrs.photoCount ?? layers?.photos?.length ?? building?.photo_urls?.length ?? 0,
    urgencyTag: building.urgency_tag || existingAttrs.urgencyTag || layers?.urgency_tag || null,
    roomCount: layers?.pack_slots?.HospitalitySpec?.totalRoomCount
      || layers?.hospitality_spec?.totalRoomCount || existingAttrs.roomCount || null,
    operationType: layers?.pack_slots?.HospitalitySpec?.operatingModel
      || layers?.hospitality_spec?.operatingModel || existingAttrs.operationType || null,
    floorLeases: leaseSummary?.tenants || layers?.rent_roll || existingAttrs.floorLeases || null,

    // Pack slots
    physicalSpec: layers?.pack_slots?.PhysicalSpec || existingAttrs.physicalSpec || null,
    developmentPlan: layers?.pack_slots?.DevelopmentPlan || existingAttrs.developmentPlan || null,
    vacatePlan: layers?.pack_slots?.VacatePlan || existingAttrs.vacatePlan || null,
    permitRisk: layers?.pack_slots?.PermitRisk || existingAttrs.permitRisk || null,
    occupancyPlan: layers?.pack_slots?.OccupancyPlan || existingAttrs.occupancyPlan || null,
    sectionalSpec: layers?.pack_slots?.SectionalSpec || existingAttrs.sectionalSpec || null,
    residentialSpec: layers?.pack_slots?.ResidentialSpec || existingAttrs.residentialSpec || null,

    // ── Category-level filled markers for grade-engine NEW_WEIGHTS ──
    // grade-engine iterates baseWeights keys (lease_roll, building_basic, ...)
    // and checks attrs[category] != null. Without these, score is always 0% = Grade D.
    // Memo-parsed data (asset_type, size_signal, area_signal) should contribute to base grade.
    building_basic: (totalFloorAreaPyung || layers?.building_register || building.asset_type || existingAttrs.assetType || building.size_signal || existingAttrs.sizeSignal) ? true : null,
    land_parcel: (landAreaPyung || layers?.land_use_plan || building.area_signal || existingAttrs.areaSignal) ? true : null,
    zoning: (layers?.land_use_plan?.zoning || building.area_signal || existingAttrs.areaSignal) ? true : null,
    road_access: (layers?.road_contact_type || layers?.parking_capacity || building.current_use_signal || existingAttrs.currentUseSignal) ? true : null,
    lease_roll: (grossAnnualIncomeKrw > 0 || leaseSummary?.tenants || building.vacancy_signal || existingAttrs.vacancySignal) ? true : null,
    financial_input: (askingPriceKrw && askingPriceKrw > 0) ? true : null,
    title_encumbrance: layers?.title_encumbrance ? true : null,
    market_comp: layers?.market_comp ? true : null,
    pack: (layers?.pack_slots && Object.keys(layers.pack_slots).length > 0) ? true : null,
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
export function parsePriceBand(priceBand: string | null | undefined): number {
  if (!priceBand) return 0;
  const match = priceBand.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
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
    investment_posture: String(row.investment_posture || attrs.investmentPosture || 'income'),
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
  
  // 1. Check existing assets row
  const { data: asset } = await supabase
    .from('assets')
    .select('*')
    .eq('id', buildingId)
    .maybeSingle();
  
  // 2. Fetch legacy building_ssot_lite record
  const { data: legacy } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .maybeSingle();

  // Helper to sync from building_ssot_lite to assets, deals, lease_units
  const syncFromLegacy = async (legacyRecord: Record<string, any>) => {
    const convertedAsset = buildAssetFromSsotLite({
      ...legacyRecord,
      lease_summary: legacyRecord.lease_summary ?? {},
    });
    const { data: upsertedAsset, error: assetError } = await supabase
      .from('assets')
      .upsert(convertedAsset, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (assetError) {
      console.warn(`[ssot-adapter] Sync/migration failed for asset ${buildingId}:`, assetError.message);
    } else {
      // Lazy-write to deals table
      const convertedDeal = buildDealFromSsotLite(legacyRecord);
      if (convertedDeal.broker_id) {
        const { error: dealError } = await supabase
          .from('deals')
          .upsert(convertedDeal, { onConflict: 'id' });
        if (dealError) console.warn(`[ssot-adapter] Sync failed for deal ${buildingId}:`, dealError.message);
      }
      
      // Lazy-write to lease_units table
      const units = buildLeaseUnitsFromSsotLite(legacyRecord, buildingId);
      if (units.length > 0) {
        await supabase.from('lease_units').delete().eq('asset_id', buildingId);
        const { error: leaseError } = await supabase.from('lease_units').insert(units);
        if (leaseError) console.warn(`[ssot-adapter] Sync failed for lease_units ${buildingId}:`, leaseError.message);
      }
    }

    return { upsertedAsset: upsertedAsset || convertedAsset, assetError };
  };

  if (asset) {
    if (legacy) {
      const isLegacyNewer = !!(
        legacy.updated_at &&
        asset.updated_at &&
        new Date(legacy.updated_at).getTime() > new Date(asset.updated_at).getTime()
      );

      const attrs = (asset.attrs ?? {}) as Record<string, any>;
      const keyFields = ['askingPriceKrw', 'totalFloorAreaPyung', 'landAreaPyung', 'address', 'assetType'];
      const isMissingKeyFields =
        !asset.attrs ||
        typeof attrs !== 'object' ||
        Object.keys(attrs).length === 0 ||
        keyFields.some((k) => attrs[k] === undefined || attrs[k] === null);

      if (isLegacyNewer || isMissingKeyFields) {
        const { upsertedAsset, assetError } = await syncFromLegacy(legacy);
        if (!assetError) {
          return { source: 'assets', data: upsertedAsset as Record<string, unknown>, migrated: true };
        }
      }
    }
    return { source: 'assets', data: asset, migrated: false };
  }
  
  // 3. Fall back to legacy table when asset does not exist
  if (!legacy) {
    return { source: 'building_ssot_lite', data: {}, migrated: false };
  }
  
  // Convert and lazy-write to new tables
  const { assetError } = await syncFromLegacy(legacy);
  
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

// F-3: im.pages.yaml 정본에서 면 순서 로딩
let pageOrderCache: Record<string, string[]> | null = null;

/** Resolves candidate paths for credeal/ssot/im.pages.yaml across CLI, tests, and build environments */
export function resolveImPagesYamlPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'credeal', 'ssot', 'im.pages.yaml'),
    path.resolve(__dirname, '../../credeal/ssot/im.pages.yaml'),
    path.resolve(__dirname, '../../../credeal/ssot/im.pages.yaml'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore access error
    }
  }
  return null;
}

/** Default canonical section order if YAML loading fails */
export const DEFAULT_CANONICAL_PAGE_ORDER: string[] = [
  'property_overview', 'title_rights', 'land_detail', 'location_access',
  'lease_status', 'site_analysis', 'occupancy_fit', 'operation_overview', 'market_position',
  'income_analysis', 'development_feasibility', 'gop_analysis', 'cost_comparison', 'comparable_analysis',
  'risk_check', 'checklist', 'investment_thesis', 'next_steps',
];

/** Mapping from im.pages.yaml page keys to Mobile IM section types (SSoT im.bindings.yaml §sections.map) */
const PAGE_KEY_TO_SECTION_MAP: Record<string, string> = {
  cover: 'property_overview',
  overview: 'property_overview',
  points: 'investment_thesis',
  location: 'location_access',
  parcels: 'title_rights',
  land: 'land_detail',
  rentroll: 'lease_status',
  lease2: 'lease_status',
  invest: 'income_analysis',
  market: 'income_analysis',
  risk: 'risk_check',
  evidence: 'title_rights',
  landvalue: 'land_detail',
  photos_ext: 'property_overview',
  photos_int: 'property_overview',
  terms: 'next_steps',
};

export function clearPageOrderCache(): void {
  pageOrderCache = null;
}

export function loadPageOrder(postureOrPreset: string): string[] {
  if (!pageOrderCache) {
    try {
      const yamlPath = resolveImPagesYamlPath();
      if (!yamlPath) {
        throw new Error('[ssot-adapter] im.pages.yaml not found in candidate paths');
      }
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const parsed = yaml.load(raw) as {
        sequence?: Array<{ key: string }>;
        presets?: Record<string, { order: string[] }>;
      };

      const result: Record<string, string[]> = {};

      // 1. Load presets directly (jsre_field_navy, evidence_first, land_value_first)
      if (parsed?.presets) {
        for (const [presetKey, preset] of Object.entries(parsed.presets)) {
          if (Array.isArray(preset?.order)) {
            result[presetKey] = preset.order;
          }
        }
      }

      // 2. Derive income posture order from sequence and bindings
      if (Array.isArray(parsed?.sequence)) {
        const sequenceKeys = parsed.sequence.map((s) => s.key);
        result['sequence'] = sequenceKeys;

        // Mapped section types for mobile IM (16 items)
        const mappedSections: string[] = sequenceKeys.map(
          (key) => PAGE_KEY_TO_SECTION_MAP[key] ?? key
        );
        result['income'] = mappedSections;
      }

      pageOrderCache = result;
    } catch {
      pageOrderCache = {};
    }
  }

  // Lookup by posture or preset, falling back to DEFAULT_CANONICAL_PAGE_ORDER
  return pageOrderCache[postureOrPreset] ?? DEFAULT_CANONICAL_PAGE_ORDER;
}

