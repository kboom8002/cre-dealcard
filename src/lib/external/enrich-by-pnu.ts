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
import { createModuleLogger } from "@/lib/logger";
import { resolveMainLotPnu, type MainLotResolution } from "./main-lot-resolver";

export { resolveMainLotPnu } from "./main-lot-resolver";
export type { MainLotResolution } from "./main-lot-resolver";

const logger = createModuleLogger("enrich-by-pnu");
const CACHE_TTL_DAYS = 30;

export type ExternalPayloadSource =
  | "buildingRegister"
  | "building_register"
  | "landPrice"
  | "land_price"
  | "official_land_price"
  | "landUsePlan"
  | "land_use_plan"
  | "locationPoi"
  | "location_poi"
  | "comparableTransactions"
  | "comparable_transactions"
  | "registryData"
  | "registry_data"
  | "commercialDistrict"
  | "commercial_district";

/**
 * Guards against `{}` empty-object 30-day cache poisoning in `external_data_cache`.
 * Returns true ONLY when the payload contains meaningful domain fields for that source.
 */
export function isNonEmptyExternalPayload(
  source: ExternalPayloadSource | string,
  payload: unknown
): boolean {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return false;
  }

  if (source === "comparableTransactions" || source === "comparable_transactions") {
    return Array.isArray(payload) && payload.length > 0;
  }

  if (Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, any>;
  if (Object.keys(record).length === 0) {
    return false;
  }

  switch (source) {
    case "buildingRegister":
    case "building_register": {
      const pk = String(record.mgmBldrgstPk ?? "").trim();
      const totArea = Number(record.totArea ?? record.totalArea ?? 0);
      const platArea = Number(record.platArea ?? 0);
      const purpsNm = String(record.mainPurpsCdNm ?? "").trim();
      const mainPurpose = String(record.mainPurpose ?? "").trim();
      const bldNm = String(record.bldNm ?? record.buildingName ?? "").trim();
      const platPlc = String(record.platPlc ?? record.newPlatPlc ?? "").trim();
      return (
        pk.length > 0 ||
        (Number.isFinite(totArea) && totArea > 0) ||
        (Number.isFinite(platArea) && platArea > 0) ||
        (purpsNm.length > 0 && purpsNm !== "[용도 미기재]") ||
        (mainPurpose.length > 0 && mainPurpose !== "[용도 미기재]") ||
        bldNm.length > 0 ||
        platPlc.length > 0
      );
    }

    case "landPrice":
    case "land_price":
    case "official_land_price": {
      const officialLandPrice = Number(record.officialLandPrice ?? 0);
      const pricePerSqm = Number(record.pricePerSqm ?? record.officialPricePerM2 ?? record.pblntfPclnd ?? 0);
      const hasHistory = Array.isArray(record.history) && record.history.length > 0;
      return (
        (Number.isFinite(officialLandPrice) && officialLandPrice > 0) ||
        (Number.isFinite(pricePerSqm) && pricePerSqm > 0) ||
        hasHistory
      );
    }

    case "landUsePlan":
    case "land_use_plan": {
      const zoningDistrict = String(record.zoningDistrict ?? "").trim();
      const jibunAddress = String(record.jibunAddress ?? "").trim();
      const hasZoneTypes = Array.isArray(record.zoneTypes) && record.zoneTypes.length > 0;
      const hasItems = Array.isArray(record.items) && record.items.length > 0;
      const hasAllZones = Array.isArray(record.allZones) && record.allZones.length > 0;
      const hasRegulations = Array.isArray(record.regulations) && record.regulations.length > 0;
      return (
        zoningDistrict.length > 0 ||
        jibunAddress.length > 0 ||
        hasZoneTypes ||
        hasItems ||
        hasAllZones ||
        hasRegulations
      );
    }

    case "locationPoi":
    case "location_poi": {
      const hasNearestStation = Boolean(
        record.nearestStation &&
          typeof record.nearestStation === "object" &&
          String(record.nearestStation.name ?? "").trim().length > 0
      );
      const hasNearbyStations = Array.isArray(record.nearbyStations) && record.nearbyStations.length > 0;
      const hasStations = Array.isArray(record.stations) && record.stations.length > 0;
      const hasPois = Array.isArray(record.pois) && record.pois.length > 0;
      const hasFacilities = Array.isArray(record.nearbyFacilities) && record.nearbyFacilities.length > 0;
      const cs = record.commercialSummary;
      const hasCommercialCounts =
        cs &&
        typeof cs === "object" &&
        (Number(cs.convenienceCount) > 0 ||
          Number(cs.cafeCount) > 0 ||
          Number(cs.bankCount) > 0 ||
          Number(cs.restaurantCount) > 0);
      return (
        hasNearestStation ||
        hasNearbyStations ||
        hasStations ||
        hasPois ||
        hasFacilities ||
        Boolean(hasCommercialCounts)
      );
    }

    case "registryData":
    case "registry_data": {
      if (record.source === "fallback_mock" || record.encumbranceRisk === "unavailable") {
        return false;
      }
      if (record.checked === false) {
        return false;
      }
      const ownerName = String(record.ownerName ?? "").trim();
      const hasMortgages = Array.isArray(record.mortgages) && record.mortgages.length > 0;
      const hasAttachments = Array.isArray(record.attachments) && record.attachments.length > 0;
      const hasEncumbrances = Array.isArray(record.encumbrances) && record.encumbrances.length > 0;
      return (
        record.checked === true ||
        ownerName.length > 0 ||
        hasMortgages ||
        hasAttachments ||
        hasEncumbrances
      );
    }

    default: {
      return Object.values(record).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          v !== "" &&
          (!Array.isArray(v) || v.length > 0) &&
          (typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 0)
      );
    }
  }
}

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
  staleSources?: string[],
  mainLot?: MainLotResolution | null
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
      if (
        cachedData &&
        !isSourceStale(staleSources, 'building_register', 'buildingRegister') &&
        isNonEmptyExternalPayload('buildingRegister', cachedData.building_register)
      ) {
        buildingRegister = cachedData.building_register;
        return;
      }
      // 대표지번 해석 단계에서 이미 조회한 대장이면 재호출하지 않는다 (동일 인자: hint 없음, platGbCd)
      if (mainLot && mainLot.mainPnu === pnu) { buildingRegister = { ...mainLot.register }; return; }
      try { 
        const platGbCd = pnu.charAt(10) === '2' ? '1' : '0';
        buildingRegister = await fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji, undefined, platGbCd); 
      }
      catch (e: unknown) { errors.push({ api: "building-register", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'land_price', 'land_price_vworld', 'landPrice') &&
        isNonEmptyExternalPayload('landPrice', cachedData.official_land_price)
      ) {
        landPrice = cachedData.official_land_price;
        return;
      }
      try { landPrice = await fetchLandPrice(pnu); }
      catch (e: unknown) { errors.push({ api: "land-price", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'land_use_plan', 'land_use_plan_vworld', 'landUse', 'landUsePlan') &&
        isNonEmptyExternalPayload('landUsePlan', cachedData.land_use_plan)
      ) {
        landUsePlan = cachedData.land_use_plan;
        return;
      }
      try { landUsePlan = await fetchLandUsePlan(pnu); }
      catch (e: unknown) { errors.push({ api: "land-use", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'comparable_tx', 'comparableTransactions', 'comparableTx') &&
        isNonEmptyExternalPayload('comparableTransactions', cachedData.comparable_transactions)
      ) {
        comparableTransactions = cachedData.comparable_transactions;
        return;
      }
      try { comparableTransactions = await fetchComparableTransactions(sigunguCd); }
      catch (e: unknown) { errors.push({ api: "real-transaction", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'location_poi', 'locationPoi') &&
        isNonEmptyExternalPayload('locationPoi', cachedData.location_poi)
      ) {
        locationPoi = cachedData.location_poi;
        return;
      }
      try { if (lat != null && lng != null) { locationPoi = await fetchLocationPoi(lat, lng); } }
      catch (e: unknown) { errors.push({ api: "kakao-map-local", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'registry', 'registryData') &&
        isNonEmptyExternalPayload('registryData', cachedData.registry_data)
      ) {
        registryData = cachedData.registry_data;
        return;
      }
      try { registryData = await fetchRegistryData(rawAddress, pnu); }
      catch (e: unknown) { errors.push({ api: "registry", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'building_register', 'buildingRegister', 'building_recap', 'buildingRecap') &&
        isNonEmptyExternalPayload('buildingRegister', cachedData.building_register)
      ) {
        return;
      }
      try { recapData = await fetchBuildingRecap(sigunguCd, bjdongCd, bun, ji); }
      catch (e: unknown) { errors.push({ api: "building-recap", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    (async () => {
      if (
        cachedData &&
        !isSourceStale(staleSources, 'commercial_district', 'commercialDistrict') &&
        isNonEmptyExternalPayload('commercialDistrict', cachedData.commercial_district)
      ) {
        commercialDistrict = cachedData.commercial_district;
        return;
      }
      try { if (pnu) commercialDistrict = await fetchCommercialDistrictFull(createServiceClient(), pnu); }
      catch (e: unknown) { errors.push({ api: "semas-commercial", message: e instanceof Error ? e.message : "Unknown error" }); }
    })(),
    // 9. V-World WMS 지적도 이미지 (Phase 4)
    // F2 fix: Rule 40에 따라 지적도 이미지는 DB에 캐싱되지 않으므로 항상 실시간 fetch
    (async () => {
      try {
        if (lat != null && lng != null) {
          cadastralMapImage = await fetchCadastralMapImage(lat, lng, 800, 600, 150, pnu);
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

  // 대표지번 provenance (register_main_pnu / 부속지번) — 프롬프트에는 stripRenderOnlyExternal 로 제외됨
  if (br && mainLot && mainLot.mainPnu === pnu) {
    br.mainPnu = mainLot.mainPnu;
    if (mainLot.attachedLots.length > 0) br.attachedLots = [...mainLot.attachedLots];
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
        logger.warn(`Failed to fetch data for secondary PNU ${secPnu}`, { err });
      }
    }));
    
    if (secondaryParcels.length > 0) {
      const brData = buildingRegister as BuildingRegisterData | null;
      if (brData) {
        const additionalArea = secondaryParcels.reduce((sum, sp) => sum + sp.platArea, 0);
        if (brData.platArea > 0) {
          // 대장 platArea 는 대표지번+부속지번 합산 면적이다 (p5: 518.7). 보조필지 면적을 다시 더하면 이중계상 (→ 783.5).
          // 보조필지 개별 면적은 secondaryParcels 로만 노출한다.
          logger.info(`Register platArea ${brData.platArea}㎡ already covers the lot; skip adding ${additionalArea}㎡ from ${secondaryParcels.length} secondary parcels`);
        } else {
          brData.platArea = (Number.isFinite(brData.platArea) ? brData.platArea : 0) + additionalArea;
          logger.info(`Added ${additionalArea}㎡ from ${secondaryParcels.length} secondary parcels. New total platArea: ${brData.platArea}㎡`);
        }
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

  // 지번 주소(jibunAddress) 정합성 보강: 도로명주소가 그대로 복사된 경우 토지특성·건축물대장 platPlc 지번으로 교체
  const authenticJibun =
    (landUsePlan as any)?.jibunAddress?.trim() ||
    String((br as any)?.platPlc || "").trim();
  if (
    authenticJibun &&
    (!resolvedAddress.jibunAddress ||
      resolvedAddress.jibunAddress === resolvedAddress.roadAddress ||
      resolvedAddress.jibunAddress === rawAddress)
  ) {
    resolvedAddress.jibunAddress = authenticJibun;
  }

  const validBuildingRegister = isNonEmptyExternalPayload("buildingRegister", buildingRegister)
    ? buildingRegister
    : null;
  const validLandPrice = isNonEmptyExternalPayload("landPrice", landPrice) ? landPrice : null;
  const validLandUsePlan = isNonEmptyExternalPayload("landUsePlan", landUsePlan) ? landUsePlan : null;
  const validComparableTransactions = isNonEmptyExternalPayload(
    "comparableTransactions",
    comparableTransactions
  )
    ? comparableTransactions
    : [];
  const validLocationPoi = isNonEmptyExternalPayload("locationPoi", locationPoi) ? locationPoi : null;
  const validRegistryData = isNonEmptyExternalPayload("registryData", registryData)
    ? registryData
    : null;
  const validCommercialDistrict = isNonEmptyExternalPayload(
    "commercialDistrict",
    commercialDistrict
  )
    ? commercialDistrict
    : null;

  const enrichmentResult: ExternalDataEnrichmentResult = {
    resolvedAddress,
    buildingRegister: validBuildingRegister,
    landPrice: validLandPrice,
    landUsePlan: validLandUsePlan,
    comparableTransactions: validComparableTransactions,
    locationPoi: validLocationPoi,
    mapImageUrl,
    registryData: validRegistryData,
    commercialDistrict: validCommercialDistrict,
    cadastralMapImage: (cadastralMapImage as any)?.base64 ?? null,
    secondaryParcels,
    enrichedAt: new Date().toISOString(),
    errors,
  };

  // ─── 캐시 저장 (빈 객체 `{}` 영속화 금지 — 모든 소스 실패 시 신규 row 삽입 생략)
  const hasAnyValidPayload =
    validBuildingRegister !== null ||
    validLandPrice !== null ||
    validLandUsePlan !== null ||
    validComparableTransactions.length > 0 ||
    validLocationPoi !== null ||
    validRegistryData !== null;

  try {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("external_data_cache")
      .select("id")
      .eq("building_ssot_lite_id", buildingSsotLiteId)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    if (existing) {
      const updatePatch: Record<string, any> = {
        pnu: resolvedAddress.pnu,
        legal_dong_code: resolvedAddress.legalDongCode,
        road_address: resolvedAddress.roadAddress,
        jibun_address: resolvedAddress.jibunAddress,
        latitude: resolvedAddress.lat,
        longitude: resolvedAddress.lng,
        updated_at: nowIso,
      };

      if (validBuildingRegister !== null) {
        updatePatch.building_register = validBuildingRegister;
        updatePatch.building_register_fetched_at = nowIso;
      } else if (
        cachedData &&
        cachedData.building_register != null &&
        !isNonEmptyExternalPayload("buildingRegister", cachedData.building_register)
      ) {
        updatePatch.building_register = null;
        updatePatch.building_register_fetched_at = null;
      }

      if (validLandPrice !== null) {
        updatePatch.official_land_price = validLandPrice;
        updatePatch.land_price_fetched_at = nowIso;
      } else if (
        cachedData &&
        cachedData.official_land_price != null &&
        !isNonEmptyExternalPayload("landPrice", cachedData.official_land_price)
      ) {
        updatePatch.official_land_price = null;
        updatePatch.land_price_fetched_at = null;
      }

      if (validLandUsePlan !== null) {
        updatePatch.land_use_plan = validLandUsePlan;
        updatePatch.land_use_fetched_at = nowIso;
      } else if (
        cachedData &&
        cachedData.land_use_plan != null &&
        !isNonEmptyExternalPayload("landUsePlan", cachedData.land_use_plan)
      ) {
        updatePatch.land_use_plan = null;
        updatePatch.land_use_fetched_at = null;
      }

      if (validComparableTransactions.length > 0) {
        updatePatch.comparable_transactions = validComparableTransactions;
        updatePatch.transactions_fetched_at = nowIso;
      }

      if (validLocationPoi !== null) {
        updatePatch.location_poi = validLocationPoi;
        updatePatch.location_fetched_at = nowIso;
      } else if (
        cachedData &&
        cachedData.location_poi != null &&
        !isNonEmptyExternalPayload("locationPoi", cachedData.location_poi)
      ) {
        updatePatch.location_poi = null;
        updatePatch.location_fetched_at = null;
      }

      if (validRegistryData !== null) {
        updatePatch.registry_data = validRegistryData;
        updatePatch.registry_fetched_at = nowIso;
      } else if (
        cachedData &&
        cachedData.registry_data != null &&
        !isNonEmptyExternalPayload("registryData", cachedData.registry_data)
      ) {
        updatePatch.registry_data = null;
        updatePatch.registry_fetched_at = null;
      }

      if (hasAnyValidPayload || Object.keys(updatePatch).length > 7) {
        await supabase.from("external_data_cache").update(updatePatch).eq("id", existing.id);
      }
    } else if (hasAnyValidPayload) {
      const insertData = {
        building_ssot_lite_id: buildingSsotLiteId,
        pnu: resolvedAddress.pnu,
        legal_dong_code: resolvedAddress.legalDongCode,
        road_address: resolvedAddress.roadAddress,
        jibun_address: resolvedAddress.jibunAddress,
        latitude: resolvedAddress.lat,
        longitude: resolvedAddress.lng,
        building_register: validBuildingRegister,
        building_register_fetched_at: validBuildingRegister ? nowIso : null,
        official_land_price: validLandPrice,
        land_price_fetched_at: validLandPrice ? nowIso : null,
        land_use_plan: validLandUsePlan,
        land_use_fetched_at: validLandUsePlan ? nowIso : null,
        comparable_transactions: validComparableTransactions,
        transactions_fetched_at: validComparableTransactions.length > 0 ? nowIso : null,
        location_poi: validLocationPoi,
        location_fetched_at: validLocationPoi ? nowIso : null,
        registry_data: validRegistryData,
        registry_fetched_at: validRegistryData ? nowIso : null,
        updated_at: nowIso,
      };
      await supabase.from("external_data_cache").insert([insertData]);
    } else {
      logger.warn("Skipping external_data_cache insert because all external sources returned empty/failed", {
        buildingSsotLiteId,
        pnu: resolvedAddress.pnu,
      });
    }
  } catch (dbErr) {
    logger.error("Failed to write cache to DB", { dbErr });
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
    logger.warn(`Missing PNU for address ${rawAddress}`);
    return null;
  }

  // 19자리 숫자 PNU 목록 추출
  const pnuTokens = pnu.split(/[\s,]+/).map(s => s.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  const valid19Pnus = pnuTokens.filter(s => s.length === 19);
  const primaryPnu = valid19Pnus[0] || (pnuTokens[0]?.length >= 19 ? pnuTokens[0].substring(0, 19) : null);

  if (!primaryPnu || primaryPnu.length !== 19) {
    logger.warn(`Invalid PNU length: ${pnu} for address ${rawAddress}`);
    return null;
  }

  if (valid19Pnus.length > 1) {
    logger.info(`Multi-PNU detected: ${valid19Pnus.length} parcels. Primary: ${primaryPnu}, others: ${valid19Pnus.slice(1).join(', ')}`);
  }

  // 대표지번 해석 (실패/미발견 → null: 입력 첫 필지로 기존 동작 유지)
  const resolveLotsSafe = async (): Promise<MainLotResolution | null> => {
    try {
      return await resolveMainLotPnu(valid19Pnus.length > 0 ? valid19Pnus : [primaryPnu], rawAddress);
    } catch (e) {
      logger.warn("resolveMainLotPnu failed", { err: e });
      return null;
    }
  };

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
      // 과거 조회 실패로 빈 대장({})이나 빈 공시지가/토지이용계획/주변POI({})이 캐시된 경우 자동 재조회
      const registerMissing = !isNonEmptyExternalPayload("buildingRegister", cached.building_register);
      const landPriceMissing = !isNonEmptyExternalPayload("landPrice", cached.official_land_price);
      const landUseMissing = !isNonEmptyExternalPayload("landUsePlan", cached.land_use_plan);
      const locationPoiMissing =
        (cached.latitude != null && cached.longitude != null && !isNonEmptyExternalPayload("locationPoi", cached.location_poi)) ||
        (cached.location_poi != null && !isNonEmptyExternalPayload("locationPoi", cached.location_poi));

      if (staleSourcesInfo.length > 0 || registerMissing || landPriceMissing || landUseMissing || locationPoiMissing) {
        logger.info(`${staleSourcesInfo.length} sources stale: ${staleSourcesInfo.map(s => s.source).join(', ')}${registerMissing ? ' (+building_register empty)' : ''}${landPriceMissing ? ' (+land_price empty)' : ''}${landUseMissing ? ' (+land_use empty)' : ''}${locationPoiMissing ? ' (+location_poi empty)' : ''}`);
        const staleSources = staleSourcesInfo.map(s => s.source);
        if (registerMissing && !staleSources.includes('building_register')) staleSources.push('building_register');
        if (landPriceMissing && !staleSources.includes('land_price')) staleSources.push('land_price');
        if (landUseMissing && !staleSources.includes('land_use_plan')) staleSources.push('land_use_plan');
        if (locationPoiMissing && !staleSources.includes('location_poi')) staleSources.push('location_poi');
        const needRegister = isSourceStale(staleSources, 'building_register', 'buildingRegister');
        const mainLot = needRegister ? await resolveLotsSafe() : null;
        const staleLotPnu = mainLot?.mainPnu ?? primaryPnu;
        const cachedJibun = cached.jibun_address && cached.jibun_address !== rawAddress ? String(cached.jibun_address) : "";
        return await enrichBuildingDataCore(
          {
            pnu: staleLotPnu, legalDongCode: staleLotPnu.substring(0, 10), sigunguCd: staleLotPnu.substring(0, 5), bjdongCd: staleLotPnu.substring(5, 10),
            bun: staleLotPnu.substring(11, 15) || "0000", ji: staleLotPnu.substring(15, 19) || "0000",
            roadAddress: rawAddress, jibunAddress: cachedJibun, lat: cached.latitude || null, lng: cached.longitude || null, buildingMgtNo: staleLotPnu + "000000",
            allPnus: mainLot?.orderedPnus ?? valid19Pnus
          },
          rawAddress,
          buildingSsotLiteId,
          cached,
          staleSources,
          mainLot
        );
      } else {
        logger.info(`Cache hit (${Math.round(cacheAge / 86400000)}d old)`);
        const result = reconstructFromCache(cached);
        if (result.cadastralMapImage === null && result.resolvedAddress?.lat != null && result.resolvedAddress?.lng != null) {
          try {
            const cadResult = await fetchCadastralMapImage(result.resolvedAddress.lat, result.resolvedAddress.lng, 800, 600, 150, result.resolvedAddress?.pnu);
            (result as any).cadastralMapImage = cadResult?.base64 ?? null;
          } catch (e) {
            logger.warn("Failed to re-fetch cadastral map on cache hit", { err: e });
          }
        }
        return result;
      }
    }
  } catch { /* 캐시 조회 실패 시 정상 진행 */ }

  // 대표지번 해석: 입력 순서와 무관하게 표제부가 있는 필지를 primary 로 (실패 시 입력 첫 필지 유지)
  const mainLot = await resolveLotsSafe();
  const lotPnu = mainLot?.mainPnu ?? primaryPnu;

  // PNU에서 주소 코드 파싱
  const legalDongCode = lotPnu.substring(0, 10);
  const sigunguCd = lotPnu.substring(0, 5);
  const bjdongCd = lotPnu.substring(5, 10);
  const bun = lotPnu.substring(11, 15) || "0000";
  const ji = lotPnu.substring(15, 19) || "0000";

  // 좌표 해석
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const geo = await geocodeAddress(rawAddress);
    if (geo) { lat = geo.lat; lng = geo.lng; }
    else {
      logger.warn(`geocodeAddress returned null for "${rawAddress}" → using fallback`);
      applyFallbackCoords();
    }
  } catch (geoErr: any) {
    logger.warn(`geocodeAddress error for "${rawAddress}": ${geoErr?.message} → using fallback`);
    applyFallbackCoords();
  }

  function applyFallbackCoords() {
    logger.warn(`applyFallbackCoords called for "${rawAddress}" - arbitrary fallback coords removed`);
    // Do NOT set arbitrary coordinates
  }

  const resolvedAddress: ResolvedAddress = {
    pnu: lotPnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    roadAddress: rawAddress,
    jibunAddress: "",
    lat,
    lng,
    buildingMgtNo: lotPnu + "000000",
    allPnus: mainLot?.orderedPnus ?? valid19Pnus,
  };

  return enrichBuildingDataCore(resolvedAddress, rawAddress, buildingSsotLiteId, undefined, undefined, mainLot);
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
    buildingRegister: isNonEmptyExternalPayload("buildingRegister", cached.building_register)
      ? cached.building_register
      : null,
    landPrice: isNonEmptyExternalPayload("landPrice", cached.official_land_price)
      ? cached.official_land_price
      : null,
    landUsePlan: isNonEmptyExternalPayload("landUsePlan", cached.land_use_plan)
      ? cached.land_use_plan
      : null,
    comparableTransactions: Array.isArray(cached.comparable_transactions)
      ? cached.comparable_transactions
      : [],
    locationPoi: isNonEmptyExternalPayload("locationPoi", cached.location_poi)
      ? cached.location_poi
      : null,
    mapImageUrl,
    registryData: isNonEmptyExternalPayload("registryData", cached.registry_data)
      ? cached.registry_data
      : null,
    commercialDistrict: isNonEmptyExternalPayload("commercialDistrict", cached.commercial_district)
      ? cached.commercial_district
      : null,
    cadastralMapImage: null, // WMS 이미지는 캐시에 저장하지 않음 — 재호출 필요. WMS image should be re-fetched by the caller if valid coordinates exist.
    enrichedAt: cached.updated_at,
    errors: cached.errors ? (typeof cached.errors === 'string' ? JSON.parse(cached.errors) : cached.errors) : [],
  };
}
