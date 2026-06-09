// src/lib/external/external-data-orchestrator.ts
// 5개 공공데이터 + 카카오 API를 병렬 호출하여 Mobile IM 생성에 필요한 데이터를 수집.
// Supabase external_data_cache 테이블에 결과를 저장하여 재호출을 최소화.
// 각 API 실패 시 개별 에러를 기록하고 성공한 소스만으로 진행 (fault-tolerant).
// Phase 1: 등기정보광장 API + 카카오 Static Map 추가

import { resolveAddress, type ResolvedAddress } from "./address-resolver";
import { fetchBuildingRegister, type BuildingRegisterData } from "./building-register-api";
import { fetchLandPrice, type LandPriceData } from "./land-price-api";
import { fetchLandUsePlan, type LandUsePlanData } from "./land-use-api";
import { fetchComparableTransactions, type ComparableTransaction } from "./real-transaction-api";
import { fetchLocationPoi, type LocationPoiData } from "./kakao-map-api";
import { fetchRegistryData, type RegistryData } from "./registry-api";
import { buildKakaoStaticMapUrl } from "./kakao-static-map";
import { createServiceClient } from "@/lib/supabase/service";

export interface ExternalDataEnrichmentResult {
  resolvedAddress: ResolvedAddress;
  buildingRegister: BuildingRegisterData | null;
  landPrice: LandPriceData | null;
  landUsePlan: LandUsePlanData | null;
  comparableTransactions: ComparableTransaction[];
  locationPoi: LocationPoiData | null;
  mapImageUrl: string | null;
  registryData: RegistryData | null;
  enrichedAt: string;
  errors: { api: string; message: string }[];
}

/**
 * 주소 문자열로부터 6개 API를 병렬 호출하여
 * ExternalDataEnrichmentResult를 반환합니다.
 */
export async function enrichBuildingData(
  rawAddress: string,
  buildingSsotLiteId: string
): Promise<ExternalDataEnrichmentResult | null> {
  const errors: { api: string; message: string }[] = [];

  const resolvedAddress = await resolveAddress(rawAddress);
  if (!resolvedAddress) {
    console.error("[external-data] Failed to resolve address:", rawAddress);
    return null;
  }

  let buildingRegister: BuildingRegisterData | null = null;
  let landPrice: LandPriceData | null = null;
  let landUsePlan: LandUsePlanData | null = null;
  let comparableTransactions: ComparableTransaction[] = [];
  let locationPoi: LocationPoiData | null = null;
  let registryData: RegistryData | null = null;
  let mapImageUrl: string | null = null;

  await Promise.all([
    (async () => {
      try {
        buildingRegister = await fetchBuildingRegister(
          resolvedAddress.sigunguCd,
          resolvedAddress.bjdongCd,
          resolvedAddress.bun,
          resolvedAddress.ji
        );
      } catch (e: unknown) {
        errors.push({ api: "building-register", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        landPrice = await fetchLandPrice(resolvedAddress.pnu);
      } catch (e: unknown) {
        errors.push({ api: "land-price", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        landUsePlan = await fetchLandUsePlan(resolvedAddress.pnu);
      } catch (e: unknown) {
        errors.push({ api: "land-use", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        comparableTransactions = await fetchComparableTransactions(resolvedAddress.sigunguCd);
      } catch (e: unknown) {
        errors.push({ api: "real-transaction", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        locationPoi = await fetchLocationPoi(resolvedAddress.lat, resolvedAddress.lng);
      } catch (e: unknown) {
        errors.push({ api: "kakao-map-local", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
    (async () => {
      try {
        registryData = await fetchRegistryData(rawAddress, resolvedAddress.pnu);
      } catch (e: unknown) {
        errors.push({ api: "registry", message: e instanceof Error ? e.message : "Unknown error" });
      }
    })(),
  ]);

  if (resolvedAddress.lat && resolvedAddress.lng) {
    try {
      mapImageUrl = buildKakaoStaticMapUrl({
        lat: resolvedAddress.lat,
        lng: resolvedAddress.lng,
        level: 3,
        width: 640,
        height: 360,
        marker: true,
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
    enrichedAt: new Date().toISOString(),
    errors,
  };

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
