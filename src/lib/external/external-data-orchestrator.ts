// src/lib/external/external-data-orchestrator.ts
// 주소 문자열 기반 공공데이터 수집 — 주소 해석(resolveAddress) 후 enrichBuildingDataCore 호출.
// enrichBuildingDataByPNU와 공통 코어를 공유하여 중복을 제거합니다.

import { resolveAddress, type ResolvedAddress } from "./address-resolver";
import type { BuildingRegisterData } from "./building-register-api";
import type { LandPriceData } from "./land-price-api";
import type { LandUsePlanData } from "./land-use-api";
import type { ComparableTransaction } from "./real-transaction-api";
import type { LocationPoiData } from "./kakao-map-api";
import type { RegistryData } from "./registry-api";
import type { CommercialDistrictAnalysis } from "./semas-commercial-api";
import { createServiceClient } from "@/lib/supabase/service";
import { reconstructFromCache, enrichBuildingDataCore } from "./enrich-by-pnu";

const CACHE_TTL_DAYS = 30; // default fallback
export const CACHE_TTL_BY_SOURCE: Record<string, number> = {
  building_register: 90,   // 건축물대장 — rarely changes
  land_price: 180,         // W-3.3: 365→180 단축 (연중 보정 가능성)
  land_price_vworld: 120,  // W-3.3: V-World 토지특성은 수시 업데이트 가능
  land_use_plan: 180,      // 토지이용계획 — semi-annual
  land_use_plan_vworld: 120, // W-3.3: V-World 용도지역
  comparable_tx: 30,       // 실거래가 — monthly update
  location_poi: 90,        // POI — quarterly
  registry: 7,             // 등기부등본 — frequent changes (ownership transfers)
  commercial_district: 60, // 상권분석 — bimonthly
};

/** Returns the cache TTL in days for a given data source */
function getCacheTtl(source: string): number {
  return CACHE_TTL_BY_SOURCE[source] ?? CACHE_TTL_DAYS;
}

export interface ExternalDataEnrichmentResult {
  resolvedAddress: ResolvedAddress;
  buildingRegister: BuildingRegisterData | null;
  landPrice: LandPriceData | null;
  landUsePlan: LandUsePlanData | null;
  comparableTransactions: ComparableTransaction[];
  locationPoi: LocationPoiData | null;
  mapImageUrl: string | null;
  registryData: RegistryData | null;
  commercialDistrict: CommercialDistrictAnalysis | null;
  enrichedAt: string;
  errors: { api: string; message: string }[];
}

/**
 * 주소 문자열로부터 PNU를 해석한 후 6개 API를 병렬 호출하여
 * ExternalDataEnrichmentResult를 반환합니다.
 *
 * 내부적으로 enrichBuildingDataCore()를 호출하여
 * enrichBuildingDataByPNU와 동일한 코어 로직을 공유합니다.
 */
export async function enrichBuildingData(
  rawAddress: string,
  buildingSsotLiteId: string
): Promise<ExternalDataEnrichmentResult | null> {
  // ─── 캐시 확인
  try {
    const supabase = createServiceClient();
    const { data: cached } = await supabase
      .from("external_data_cache")
      .select("*")
      .eq("building_ssot_lite_id", buildingSsotLiteId)
      .maybeSingle();

    if (cached && cached.updated_at) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      const shortestTtl = Math.min(...Object.values(CACHE_TTL_BY_SOURCE));
      const ttlMs = shortestTtl * 24 * 60 * 60 * 1000;
      if (age < ttlMs) {
        console.info(`[external-data] Cache hit (${Math.round(age / 86400000)}d old)`);
        return reconstructFromCache(cached);
      }
      console.info(`[external-data] Cache expired (${Math.round(age / 86400000)}d)`);
    }
  } catch { /* 캐시 조회 실패 시 정상 진행 */ }

  // ─── 주소 해석
  const resolvedAddress = await resolveAddress(rawAddress);
  if (!resolvedAddress) {
    console.error("[external-data] Failed to resolve address:", rawAddress);
    return null;
  }

  // ─── 공통 코어 호출
  return enrichBuildingDataCore(
    resolvedAddress,
    rawAddress,
    buildingSsotLiteId
  );
}
