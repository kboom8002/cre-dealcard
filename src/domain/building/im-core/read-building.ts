/**
 * Pure Building Read Path (WP-P05-01 / S3)
 * 
 * Strict Read Purity Principle:
 * "읽기는 읽기만: GET·공개 경로에서는 쓰기 0회"
 * 
 * Performs strictly read-only SELECT queries with zero DB mutations
 * (no upsert to assets/deals, no lease_units delete/insert).
 * Wrapped in React cache() for request-level deduplication across Server Components.
 */
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('read-building');

export interface BuildingRecord {
  id: string;
  owner_id?: string | null;
  status?: string | null;
  address?: string | null;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  asking_price_krw?: number | null;
  total_floor_area_pyung?: number | null;
  land_area_pyung?: number | null;
  layers?: Record<string, any> | null;
  lease_summary?: Record<string, any> | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  [key: string]: any;
}

/**
 * Low-level pure read function without React cache.
 */
export async function readBuildingPure(
  buildingId: string,
  options?: { client?: { from: (table: string) => any; [key: string]: any } | any }
): Promise<BuildingRecord | null> {
  if (!buildingId || typeof buildingId !== 'string') {
    return null;
  }

  let supabase = options?.client;
  if (!supabase) {
    try {
      const serviceModule = '@/lib/supabase/service';
      const mod = await import(/* webpackIgnore: true */ serviceModule);
      supabase = mod.createServiceClient();
    } catch (e) {
      log.error('Failed to resolve supabase service client:', e);
      return null;
    }
  }

  try {
    // 1. Primary SSOT: building_ssot_lite
    const { data: ssotData, error: ssotError } = await supabase
      .from('building_ssot_lite')
      .select('*')
      .eq('id', buildingId)
      .maybeSingle();

    if (ssotError) {
      log.warn(`Error reading building_ssot_lite for ${buildingId}:`, ssotError.message);
    }

    if (ssotData) {
      const record = { ...ssotData } as BuildingRecord;
      // Backward compatibility: allow destructuring const { data } = await readBuilding(...)
      Object.defineProperty(record, 'data', {
        get() {
          return record;
        },
        enumerable: false,
        configurable: true,
      });
      return record;
    }

    // 2. Secondary fallback: assets (pure SELECT only, zero writes)
    const { data: assetData, error: assetError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', buildingId)
      .maybeSingle();

    if (assetError) {
      log.warn(`Error reading assets for ${buildingId}:`, assetError.message);
    }

    if (assetData) {
      const record = { ...assetData } as BuildingRecord;
      Object.defineProperty(record, 'data', {
        get() {
          return record;
        },
        enumerable: false,
        configurable: true,
      });
      return record;
    }

    return null;
  } catch (err) {
    log.error(`Unexpected exception in readBuilding for ${buildingId}:`, err);
    return null;
  }
}

const memoizeRead = <T extends Function>(fn: T): T => {
  try {
    const r = (globalThis as any).React;
    if (r && typeof r.cache === 'function') {
      return r.cache(fn);
    }
  } catch {}
  return fn;
};

/**
 * Pure readBuilding wrapped in React.cache() when available for request-level deduplication.
 * Safe for use in all GET, OG, and public routes.
 */
export const readBuilding = memoizeRead(readBuildingPure);
