// src/lib/external/enrich-by-pnu.ts

import { fetchBuildingRegister, fetchBuildingRecap, type BuildingRegisterData, type BuildingRecapData } from "./building-register-api";
import { fetchLandPrice, type LandPriceData } from "./land-price-api";
import { fetchLandUsePlan, type LandUsePlanData } from "./land-use-api";
import { fetchComparableTransactions, type ComparableTransaction } from "./real-transaction-api";
import { fetchLocationPoi, type LocationPoiData } from "./kakao-map-api";
import { fetchRegistryData, type RegistryData } from "./registry-api";
import { buildKakaoStaticMapUrl } from "./kakao-static-map";
import { createServiceClient } from "@/lib/supabase/service";
import { CACHE_TTL_BY_SOURCE, type ExternalDataEnrichmentResult } from "./external-data-orchestrator";
import type { ResolvedAddress } from "./address-resolver";
import { geocodeAddress } from "@/domain/verification/address-resolver";
import { fetchCommercialDistrictFull, type CommercialDistrictAnalysis } from "./semas-commercial-api";
import { fetchCadastralMapImage, type CadastralMapResult } from "./vworld-wms-cadastral";

const CACHE_TTL_DAYS = 30;

/**
 * 공통 코어: ResolvedAddress가 확정된 후, 7개 API를 병렬 호출하고 캐시에 저장.
 * enrichBuildingDataByPNU와 enrichBuildingData(orchestrator) 양쪽에서 공유.
 */
/** Checks if a given source key is marked stale in either snake_case or camelCase */
function isSourceStale(staleSources: string[] | undefined, ...keys: string[]): boolean {
  if (!staleSources) return false;
  return keys.some(k => staleSources.includes(k));
}

export async function enrichBuildingDataCore(
  resolvedAddress: ResolvedAddress,
  rawAddress: string,
  buildingSsotLiteId: string,
  cachedData?: any,
  staleSources?: string[]
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
  let cadastralMapImage: CadastralMapResult | null = null;
  let mapImageUrl: string | null = null;

  await Promise.all([
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'building_register', 'buildingRegister')) { buildingRegister = cachedData.building_register; return; }
      try { 
        const platGbCd = pnu.charAt(10) === '2' ? '1' : '0';
        buildingRegister = await fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji, undefined, platGbCd); 
      }
      catch (e: unknown) { errors.push({ api: "building-register", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'land_price', 'land_price_vworld', 'landPrice')) { landPrice = cachedData.official_land_price; return; }
      try { landPrice = await fetchLandPrice(pnu); }
      catch (e: unknown) { errors.push({ api: "land-price", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'land_use_plan', 'land_use_plan_vworld', 'landUse', 'landUsePlan')) { landUsePlan = cachedData.land_use_plan; return; }
      try { landUsePlan = await fetchLandUsePlan(pnu); }
      catch (e: unknown) { errors.push({ api: "land-use", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'comparable_tx', 'comparableTransactions', 'comparableTx')) { comparableTransactions = cachedData.comparable_transactions || []; return; }
      try { comparableTransactions = await fetchComparableTransactions(sigunguCd); }
      catch (e: unknown) { errors.push({ api: "real-transaction", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'location_poi', 'locationPoi')) { locationPoi = cachedData.location_poi; return; }
      try { if (lat != null && lng != null) { locationPoi = await fetchLocationPoi(lat, lng); } }
      catch (e: unknown) { errors.push({ api: "kakao-map-local", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'registry', 'registryData')) { registryData = cachedData.registry_data; return; }
      try { registryData = await fetchRegistryData(rawAddress, pnu); }
      catch (e: unknown) { errors.push({ api: "registry", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'building_register', 'buildingRegister', 'building_recap', 'buildingRecap')) { return; }
      try { recapData = await fetchBuildingRecap(sigunguCd, bjdongCd, bun, ji); }
      catch (e: unknown) { errors.push({ api: "building-recap", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'commercial_district', 'commercialDistrict')) { commercialDistrict = cachedData.commercial_district; return; }
      try { if (pnu) commercialDistrict = await fetchCommercialDistrictFull(createServiceClient(), pnu); }
      catch (e: unknown) { errors.push({ api: "semas-commercial", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    // 9. V-World WMS 지적도 이미지 (Phase 4)
    (async () => {
      if (cachedData && !isSourceStale(staleSources, 'cadastral_map', 'cadastralMap')) { return; }
      try {
        if (lat != null && lng != null) {
          cadastralMapImage = await fetchCadastralMapImage(lat, lng, 800, 600, 150);
        }
      } catch (e: unknown) {
        errors.push({ api: "vworld-wms-cadastral", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
  ]);

  // 총괄표제부 데이터 병합 (단일 건물 데이터 우선, 대단지 복합 데이터 왜곡 방지)
  const br = buildingRegister as BuildingRegisterData | null;
  const rc = recapData as BuildingRecapData | null;
  if (br && rc) {
    if (!br.archArea && rc.archArea) br.archArea = rc.archArea;
    if (br.elevatorCount == null || br.elevatorCount === 0) {
      br.passengerElevatorCount = rc.rideUseElvtCnt;
      br.emergencyElevatorCount = rc.emgenUseElvtCnt;
      br.elevatorCount = rc.rideUseElvtCnt + rc.emgenUseElvtCnt;
    }
    
    // 소형/중형 단일 건물(연면적 3,000㎡ 미만)인데 총괄표제부 주차가 수백 대 이상인 경우(단지 전체 합산) 덮어쓰지 않음
    const recapTotalParking = (rc.indrAutoUtcnt || 0) + (rc.oudrAutoUtcnt || 0) + (rc.indrMechUtcnt || 0);
    const isSingleSmallBuilding = br.totalArea && br.totalArea < 3000;
    if (!isSingleSmallBuilding || recapTotalParking < 100) {
      if (br.parkingCount == null || br.parkingCount === 0) {
        br.selfParkingCount = rc.indrAutoUtcnt + rc.oudrAutoUtcnt;
        br.mechanicalParkingCount = rc.indrMechUtcnt;
        br.parkingCount = br.selfParkingCount + br.mechanicalParkingCount;
      }
    }
    if (rc.heatMethodNm) br.heatMethod = rc.heatMethodNm;
  }

  // Multi-PNU secondary parcels
  let secondaryParcels: { pnu: string; platArea: number }[] | undefined = undefined;
  if (resolvedAddress.allPnus && resolvedAddress.allPnus.length > 1) {
    const secondaryPnus = resolvedAddress.allPnus.slice(1);
    secondaryParcels = [];
    
    await Promise.all(secondaryPnus.map(async (secPnu) => {
      try {
        const secSigunguCd = secPnu.substring(0, 5);
        const secBjdongCd = secPnu.substring(5, 10);
        const secBun = secPnu.substring(11, 15) || "0000";
        const secJi = secPnu.substring(15, 19) || "0000";
        
        let secPlatArea = 0;
        const secPlatGbCd = secPnu.charAt(10) === '2' ? '1' : '0';
        const secBr = await fetchBuildingRegister(secSigunguCd, secBjdongCd, secBun, secJi, undefined, secPlatGbCd);
        if (secBr && secBr.platArea > 0) {
          secPlatArea = secBr.platArea;
        } else {
          const secLp = await fetchLandPrice(secPnu);
          if (secLp && secLp.landArea && secLp.landArea > 0) {
            secPlatArea = secLp.landArea;
          }
        }
        
        if (secPlatArea > 0) {
          secondaryParcels!.push({ pnu: secPnu, platArea: secPlatArea });
        }
      } catch (err) {
        console.warn(`[enrich-by-pnu] Failed to fetch data for secondary PNU ${secPnu}:`, err);
      }
    }));
    
    if (secondaryParcels.length > 0) {
      const brData = buildingRegister as BuildingRegisterData | null;
      if (brData) {
        const additionalArea = secondaryParcels.reduce((sum, sp) => sum + sp.platArea, 0);
        brData.platArea += additionalArea;
        console.info(`[enrich-by-pnu] Added ${additionalArea}㎡ from ${secondaryParcels.length} secondary parcels. New total platArea: ${brData.platArea}㎡`);
      }
    }
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
    cadastralMapImage,
    secondaryParcels,
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
  // Multi-PNU 방어: 쉼표/공백 등으로 전달된 복수 필지 PNU 처리 및 19자리 기본 PNU 안전 추출
  if (!pnu) {
    console.warn(`[enrich-by-pnu] Missing PNU for address ${rawAddress}`);
    return null;
  }

  // 19자리 숫자 PNU 목록 추출
  const pnuTokens = pnu.split(/[\s,]+/).map(s => s.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  const valid19Pnus = pnuTokens.filter(s => s.length === 19);
  const primaryPnu = valid19Pnus[0] || (pnuTokens[0]?.length >= 19 ? pnuTokens[0].substring(0, 19) : null);

  if (!primaryPnu || primaryPnu.length !== 19) {
    console.warn(`[enrich-by-pnu] Invalid PNU length: ${pnu} for address ${rawAddress}`);
    return null;
  }

  if (valid19Pnus.length > 1) {
    console.info(`[enrich-by-pnu] Multi-PNU detected: ${valid19Pnus.length} parcels. Primary: ${primaryPnu}, others: ${valid19Pnus.slice(1).join(', ')}`);
  }

  // ─── 캐시 확인
  try {
    const supabase = createServiceClient();
    const { data: cached } = await supabase
      .from("external_data_cache")
      .select("*")
      .eq("building_ssot_lite_id", buildingSsotLiteId)
      .maybeSingle();

    if (cached && cached.updated_at) {
      // v3: Per-source cache staleness detection
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      const staleSourcesInfo = Object.entries(CACHE_TTL_BY_SOURCE)
        .filter(([_, ttlDays]) => cacheAge > (ttlDays as number) * 86400000)
        .map(([source, ttlDays]) => ({ source, ttlDays, stale: true }));

      if (staleSourcesInfo.length > 0) {
        console.info(`[enrich-by-pnu] ${staleSourcesInfo.length} sources stale:`, staleSourcesInfo.map(s => s.source).join(', '));
        const staleSources = staleSourcesInfo.map(s => s.source);
        return await enrichBuildingDataCore(
          {
            pnu: primaryPnu, legalDongCode: primaryPnu.substring(0, 10), sigunguCd: primaryPnu.substring(0, 5), bjdongCd: primaryPnu.substring(5, 10),
            bun: primaryPnu.substring(11, 15) || "0000", ji: primaryPnu.substring(15, 19) || "0000",
            roadAddress: rawAddress, jibunAddress: rawAddress, lat: cached.latitude || null, lng: cached.longitude || null, buildingMgtNo: primaryPnu + "000000",
            allPnus: valid19Pnus
          },
          rawAddress,
          buildingSsotLiteId,
          cached,
          staleSources
        );
      } else {
        console.info(`[external-data] Cache hit (${Math.round(cacheAge / 86400000)}d old)`);
        const result = reconstructFromCache(cached);
        if (result.cadastralMapImage === null && result.resolvedAddress?.lat != null && result.resolvedAddress?.lng != null) {
          try {
            result.cadastralMapImage = await fetchCadastralMapImage(result.resolvedAddress.lat, result.resolvedAddress.lng, 800, 600, 150);
          } catch (e) {
            console.warn("[external-data] Failed to re-fetch cadastral map on cache hit:", e);
          }
        }
        return result;
      }
    }
  } catch { /* 캐시 조회 실패 시 정상 진행 */ }

  // PNU에서 주소 코드 파싱
  const legalDongCode = primaryPnu.substring(0, 10);
  const sigunguCd = primaryPnu.substring(0, 5);
  const bjdongCd = primaryPnu.substring(5, 10);
  const bun = primaryPnu.substring(11, 15) || "0000";
  const ji = primaryPnu.substring(15, 19) || "0000";

  // 좌표 해석
  let lat: number | null = null;
  let lng: number | null = null;
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
    console.warn(`[enrich-by-pnu] applyFallbackCoords called for "${rawAddress}" - arbitrary fallback coords removed`);
    // Do NOT set arbitrary coordinates
  }

  const resolvedAddress: ResolvedAddress = {
    pnu: primaryPnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    roadAddress: rawAddress,
    jibunAddress: rawAddress,
    lat,
    lng,
    buildingMgtNo: primaryPnu + "000000",
    allPnus: valid19Pnus,
  };

  return enrichBuildingDataCore(resolvedAddress, rawAddress, buildingSsotLiteId);
}

export function reconstructFromCache(cached: any): ExternalDataEnrichmentResult {
  let mapImageUrl: string | null = null;
  if (cached.latitude && cached.longitude) {
    try {
      mapImageUrl = buildKakaoStaticMapUrl({
        lat: cached.latitude, lng: cached.longitude,
        level: 3, width: 1280, height: 960, marker: true,
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
    cadastralMapImage: null, // WMS 이미지는 캐시에 저장하지 않음 — 재호출 필요. WMS image should be re-fetched by the caller if valid coordinates exist.
    enrichedAt: cached.updated_at,
    errors: cached.errors ? (typeof cached.errors === 'string' ? JSON.parse(cached.errors) : cached.errors) : [],
  };
}
