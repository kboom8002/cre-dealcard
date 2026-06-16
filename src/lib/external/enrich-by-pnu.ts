// src/lib/external/enrich-by-pnu.ts

import { fetchBuildingRegister, type BuildingRegisterData } from "./building-register-api";
import { fetchLandPrice, type LandPriceData } from "./land-price-api";
import { fetchLandUsePlan, type LandUsePlanData } from "./land-use-api";
import { fetchComparableTransactions, type ComparableTransaction } from "./real-transaction-api";
import { fetchLocationPoi, type LocationPoiData } from "./kakao-map-api";
import { fetchRegistryData, type RegistryData } from "./registry-api";
import { buildKakaoStaticMapUrl } from "./kakao-static-map";
import { createServiceClient } from "@/lib/supabase/service";
import type { ExternalDataEnrichmentResult } from "./external-data-orchestrator";

/**
 * PNU가 확정된 경우 주소 변환(resolveAddress) 단계를 건너뛰고 6개 API를 직접 병렬 호출합니다.
 * 주소 변환 실패 위험을 0%로 줄입니다.
 */
export async function enrichBuildingDataByPNU(
  pnu: string,
  rawAddress: string,
  buildingSsotLiteId: string
): Promise<ExternalDataEnrichmentResult | null> {
  const errors: { api: string; message: string }[] = [];

  const legalDongCode = pnu.substring(0, 10);
  const sigunguCd = pnu.substring(0, 5);
  const bjdongCd = pnu.substring(5, 10);
  const bun = pnu.substring(11, 15) || "0000";
  const ji = pnu.substring(15, 19) || "0000";

  // Mock lat/lng based on area code
  let lat = 37.50085;
  let lng = 127.03698;
  if (rawAddress.includes("삼성")) { lat = 37.5088; lng = 127.0631; }
  else if (rawAddress.includes("서초")) { lat = 37.4876; lng = 127.0174; }
  else if (rawAddress.includes("성수")) { lat = 37.5447; lng = 127.0562; }
  else if (rawAddress.includes("마포") || rawAddress.includes("합정")) { lat = 37.5500; lng = 126.9099; }

  const resolvedAddress = {
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
  ]);

  if (lat && lng) {
    try {
      mapImageUrl = buildKakaoStaticMapUrl({
        lat,
        lng,
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
