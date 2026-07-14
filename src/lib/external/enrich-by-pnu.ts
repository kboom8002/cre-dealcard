// src/lib/external/enrich-by-pnu.ts

import { fetchBuildingRegister, fetchBuildingRecap, type BuildingRegisterData, type BuildingRecapData } from "./building-register-api";
import { fetchLandPrice, type LandPriceData } from "./land-price-api";
import { fetchLandUsePlan, type LandUsePlanData } from "./land-use-api";
import { fetchComparableTransactions, type ComparableTransaction } from "./real-transaction-api";
import { fetchLocationPoi, type LocationPoiData } from "./kakao-map-api";
import { fetchRegistryData, type RegistryData } from "./registry-api";
import { buildKakaoStaticMapUrl } from "./kakao-static-map";
import { createServiceClient } from "@/lib/supabase/service";
import type { ExternalDataEnrichmentResult } from "./external-data-orchestrator";
import type { ResolvedAddress } from "./address-resolver";
import { geocodeAddress } from "@/domain/verification/address-resolver";
import { fetchCommercialDistrictFull, type CommercialDistrictAnalysis } from "./semas-commercial-api";

const CACHE_TTL_DAYS = 30;

/**
 * 공통 코어: ResolvedAddress가 확정된 후, 7개 API를 병렬 호출하고 캐시에 저장.
 * enrichBuildingDataByPNU와 enrichBuildingData(orchestrator) 양쪽에서 공유.
 */
export async function enrichBuildingDataCore(
  resolvedAddress: ResolvedAddress,
  rawAddress: string,
  buildingSsotLiteId: string
): Promise<ExternalDataEnrichmentResult> {
  const errors: { api: string; message: string }[] = [];
  const { sigunguCd, bjdongCd, bun, ji, pnu, lat, lng } = resolvedAddress;

  let buildingRegister: BuildingRegisterData | null = null;
  let recapData: BuildingRecapData | null = null;
  let landPrice: LandPriceData | null = null;
  let landUsePlan: LandUsePlanData | null = null;
  let comparableTransactions: ComparableTransaction[] = [];
  let locationPoi: LocationPoiData | null = null;
  let registryData: RegistryData | null = null;
  let commercialDistrict: CommercialDistrictAnalysis | null = null;
  let mapImageUrl: string | null = null;

  await Promise.all([
    (async () => {
      try {
        buildingRegister = await fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji);
      } catch (e: unknown) {
        errors.push({ api: "building-register", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        landPrice = await fetchLandPrice(pnu);
      } catch (e: unknown) {
        errors.push({ api: "land-price", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        landUsePlan = await fetchLandUsePlan(pnu);
      } catch (e: unknown) {
        errors.push({ api: "land-use", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        comparableTransactions = await fetchComparableTransactions(sigunguCd);
      } catch (e: unknown) {
        errors.push({ api: "real-transaction", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        locationPoi = await fetchLocationPoi(lat, lng);
      } catch (e: unknown) {
        errors.push({ api: "kakao-map-local", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        registryData = await fetchRegistryData(rawAddress, pnu);
      } catch (e: unknown) {
        errors.push({ api: "registry", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        recapData = await fetchBuildingRecap(sigunguCd, bjdongCd, bun, ji);
      } catch (e: unknown) {
        errors.push({ api: "building-recap", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        if (pnu) commercialDistrict = await fetchCommercialDistrictFull(createServiceClient(), pnu);
      } catch (e: unknown) {
        errors.push({ api: "semas-commercial", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
  ]);

  // 총괄표제부 데이터 병합
  const br = buildingRegister as BuildingRegisterData | null;
  const rc = recapData as BuildingRecapData | null;
  if (br && rc) {
    br.archArea = rc.archArea;
    br.elevatorCount = rc.rideUseElvtCnt + rc.emgenUseElvtCnt;
    br.parkingCount = rc.indrAutoUtcnt + rc.oudrAutoUtcnt + rc.indrMechUtcnt;
    br.heatMethod = rc.heatMethodNm;
  }

  // 카카오 스태틱 맵
  if (lat && lng) {
    try {
      mapImageUrl = buildKakaoStaticMapUrl({
        lat, lng, level: 3, width: 640, height: 360, marker: true,
      });
    } catch {
      mapImageUrl = null;
    }
  }

  const enrichmentResult: ExternalDataEnrichmentResult = {
    resolvedAddress,
    buildingRegister,
    landPrice,
    landUsePlan,
    comparableTransactions,
    locationPoi,
    mapImageUrl,
    registryData,
    commercialDistrict,
    enrichedAt: new Date().toISOString(),
    errors,
  };

  // ─── 캐시 저장
  try {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("external_data_cache")
      .select("id")
      .eq("building_ssot_lite_id", buildingSsotLiteId)
      .maybeSingle();

    const cacheData = {
      building_ssot_lite_id: buildingSsotLiteId,
      pnu: resolvedAddress.pnu,
      legal_dong_code: resolvedAddress.legalDongCode,
      road_address: resolvedAddress.roadAddress,
      jibun_address: resolvedAddress.jibunAddress,
      latitude: resolvedAddress.lat,
      longitude: resolvedAddress.lng,
      building_register: buildingRegister || {},
      building_register_fetched_at: buildingRegister ? new Date().toISOString() : null,
      official_land_price: landPrice || {},
      land_price_fetched_at: landPrice ? new Date().toISOString() : null,
      land_use_plan: landUsePlan || {},
      land_use_fetched_at: landUsePlan ? new Date().toISOString() : null,
      comparable_transactions: comparableTransactions,
      transactions_fetched_at: comparableTransactions.length > 0 ? new Date().toISOString() : null,
      location_poi: locationPoi || {},
      location_fetched_at: locationPoi ? new Date().toISOString() : null,
      registry_data: registryData || {},
      registry_fetched_at: registryData ? new Date().toISOString() : null,
      commercial_district: commercialDistrict || {},
      commercial_fetched_at: commercialDistrict ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("external_data_cache").update(cacheData).eq("id", existing.id);
    } else {
      await supabase.from("external_data_cache").insert([cacheData]);
    }
  } catch (dbErr) {
    console.error("[external-data] Failed to write cache to DB:", dbErr);
  }

  return enrichmentResult;
}

/**
 * PNU가 확정된 경우 주소 변환(resolveAddress) 단계를 건너뛰고
 * enrichBuildingDataCore를 직접 호출합니다.
 */
export async function enrichBuildingDataByPNU(
  pnu: string,
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
      const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
      if (age < ttlMs) {
        console.info(`[external-data] Cache hit (${Math.round(age / 86400000)}d old)`);
        return reconstructFromCache(cached);
      }
      console.info(`[external-data] Cache expired (${Math.round(age / 86400000)}d)`);
    }
  } catch { /* 캐시 조회 실패 시 정상 진행 */ }

  // PNU에서 주소 코드 파싱
  const legalDongCode = pnu.substring(0, 10);
  const sigunguCd = pnu.substring(0, 5);
  const bjdongCd = pnu.substring(5, 10);
  const bun = pnu.substring(11, 15) || "0000";
  const ji = pnu.substring(15, 19) || "0000";

  // 좌표 해석
  let lat = 37.50085;
  let lng = 127.03698;
  try {
    const geo = await geocodeAddress(rawAddress);
    if (geo) { lat = geo.lat; lng = geo.lng; }
    else {
      console.warn(`[enrich-by-pnu] geocodeAddress returned null for "${rawAddress}" → using fallback`);
      applyFallbackCoords();
    }
  } catch (geoErr: any) {
    console.warn(`[enrich-by-pnu] geocodeAddress error for "${rawAddress}": ${geoErr?.message} → using fallback`);
    applyFallbackCoords();
  }

  function applyFallbackCoords() {
    if (rawAddress.includes("삼성")) { lat = 37.5088; lng = 127.0631; }
    else if (rawAddress.includes("서초")) { lat = 37.4876; lng = 127.0174; }
    else if (rawAddress.includes("성수")) { lat = 37.5447; lng = 127.0562; }
    else if (rawAddress.includes("마포") || rawAddress.includes("합정")) { lat = 37.5500; lng = 126.9099; }
    else if (rawAddress.includes("천안")) { lat = 36.8151; lng = 127.1139; }
    else if (rawAddress.includes("대전")) { lat = 36.3504; lng = 127.3845; }
    else if (rawAddress.includes("대구")) { lat = 35.8714; lng = 128.6014; }
    else if (rawAddress.includes("부산")) { lat = 35.1796; lng = 129.0756; }
    else if (rawAddress.includes("광주")) { lat = 35.1595; lng = 126.8526; }
    else if (rawAddress.includes("수원")) { lat = 37.2636; lng = 127.0286; }
    else if (rawAddress.includes("인천")) { lat = 37.4563; lng = 126.7052; }
    else if (rawAddress.includes("세종")) { lat = 36.4800; lng = 127.2551; }
    else if (rawAddress.includes("울산")) { lat = 35.5384; lng = 129.3114; }
    else if (rawAddress.includes("제주")) { lat = 33.4996; lng = 126.5312; }
  }

  const resolvedAddress: ResolvedAddress = {
    pnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    roadAddress: rawAddress,
    jibunAddress: rawAddress,
    lat,
    lng,
    buildingMgtNo: pnu + "000000",
  };

  return enrichBuildingDataCore(resolvedAddress, rawAddress, buildingSsotLiteId);
}

export function reconstructFromCache(cached: any): ExternalDataEnrichmentResult {
  let mapImageUrl: string | null = null;
  if (cached.latitude && cached.longitude) {
    try {
      mapImageUrl = buildKakaoStaticMapUrl({
        lat: cached.latitude, lng: cached.longitude,
        level: 3, width: 640, height: 360, marker: true,
      });
    } catch { /* ignore */ }
  }

  return {
    resolvedAddress: {
      pnu: cached.pnu, legalDongCode: cached.legal_dong_code,
      sigunguCd: cached.pnu?.substring(0, 5) ?? "", bjdongCd: cached.pnu?.substring(5, 10) ?? "",
      bun: cached.pnu?.substring(11, 15) ?? "0000", ji: cached.pnu?.substring(15, 19) ?? "0000",
      roadAddress: cached.road_address, jibunAddress: cached.jibun_address,
      lat: cached.latitude, lng: cached.longitude, buildingMgtNo: cached.pnu + "000000",
    },
    buildingRegister: cached.building_register || null,
    landPrice: cached.official_land_price || null,
    landUsePlan: cached.land_use_plan || null,
    comparableTransactions: cached.comparable_transactions || [],
    locationPoi: cached.location_poi || null,
    mapImageUrl,
    registryData: cached.registry_data || null,
    commercialDistrict: cached.commercial_district || null,
    enrichedAt: cached.updated_at,
    errors: cached.errors ? (typeof cached.errors === 'string' ? JSON.parse(cached.errors) : cached.errors) : [],
  };
}
