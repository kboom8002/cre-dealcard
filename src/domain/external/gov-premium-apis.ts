import type { SupabaseClient } from "@supabase/supabase-js";
import { xmlText, xmlAll } from "@/lib/utils/xml-parser";
import { fetchLandPrice } from "@/lib/external/land-price-api";
import { todayKst, parseIssueDate } from "@/lib/magazine/kst";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('gov-premium-apis');


// ─── 환경변수 ───────────────────────────────────────────────────────────────────
const MOLIT_API_KEY = process.env.MOLIT_API_KEY || process.env.DATA_GO_KR_API_KEY || "";
const SEMAS_API_KEY = process.env.SEMAS_API_KEY || process.env.DATA_GO_KR_API_KEY || "";
const ENERGY_API_KEY = process.env.ENERGY_API_KEY || process.env.DATA_GO_KR_API_KEY || "";

// ─── 권역별 법정동 코드 ─────────────────────────────────────────────────────────
const REGION_LAWD: Record<string, string[]> = {
  gbd:     ["11680"], // 강남구
  seongsu: ["11200"], // 성동구
  ybd:     ["11560"], // 영등포구
};

const DISTRICT_NAME_BY_LAWD: Record<string, string> = {
  "11680": "강남구",
  "11200": "성동구",
  "11560": "영등포구",
};

// ─── A1: MOLIT 상업·업무용 부동산 실거래가 API ─────────────────────────────────
// https://apis.data.go.kr/1613000/RTMSDataSvcSh/getRTMSDataSvcSh
export async function fetchCommercialTransactions(
  supabase: SupabaseClient,
  region: string,
): Promise<any[]> {
  if (!MOLIT_API_KEY) {
    log.warn("[MOLIT] API key missing — skipping real transaction fetch");
    return [];
  }

  const ym = todayKst().slice(0, 7).replace("-", "");
  const lawdCodes = REGION_LAWD[region] || ["11680"];
  const results: any[] = [];

  for (const lawd of lawdCodes) {
    try {
      const url = `https://apis.data.go.kr/1613000/RTMSDataSvcSh/getRTMSDataSvcSh?serviceKey=${encodeURIComponent(MOLIT_API_KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=100&pageNo=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xmlAll(xml, "item");

      const txMap = new Map<string, any>();
      for (const item of items) {
        const address = xmlText(item, "지번");
        const dong = xmlText(item, "법정동");
        const usageType = xmlText(item, "용도");
        const price = parseInt(xmlText(item, "거래금액").replace(/,/g, ""), 10) * 10000; // 만원→원
        const area = parseFloat(xmlText(item, "건물면적") || xmlText(item, "전용면적") || "0");
        const dealYear = xmlText(item, "년");
        const dealMonth = xmlText(item, "월");
        const dealDay = xmlText(item, "일");
        const txDate = `${dealYear}-${String(dealMonth).padStart(2, "0")}-${String(dealDay).padStart(2, "0")}`;

        // 가격/거래일을 해석할 수 없는 행은 저장하지 않는다 (NaN·가짜 날짜 적재 금지)
        if (!Number.isFinite(price) || price <= 0 || !parseIssueDate(txDate)) continue;

        const key = `${address}_${txDate}_${price}`;
        txMap.set(key, {
          address,
          dong,
          district: DISTRICT_NAME_BY_LAWD[lawd] ?? region,
          usage_type: usageType || "상업용",
          transaction_price: price,
          building_area: area,
          transaction_date: txDate,
        });
      }

      const transactionsToUpsert = Array.from(txMap.values());
      if (transactionsToUpsert.length > 0) {
        const { data, error } = await supabase
          .from("external_transactions")
          .upsert(transactionsToUpsert, {
            onConflict: "address,transaction_date,transaction_price",
            ignoreDuplicates: true,
          })
          .select();

        if (error) {
          log.error(`[MOLIT] external_transactions upsert failed for ${region}/${lawd}:`, error);
        } else if (data) {
          results.push(...data);
        }
      }
    } catch (err) {
      log.warn(`[MOLIT] Region ${region}/${lawd} failed:`, err);
    }
  }
  return results;
}

// ─── A1b: 한국부동산원 임대동향 (공공데이터포털) ──────────────────────────────────
export async function fetchRentalTrend(supabase: SupabaseClient, region: string): Promise<any> {
  if (!MOLIT_API_KEY) {
    log.warn("[RentalTrend] MOLIT_API_KEY missing — skipping");
    return null;
  }

  // Real: 한국부동산원 오피스시장동향 API
  // https://apis.data.go.kr/1611000/OfcMktService/getOfcMktInfo
  try {
    const regionCode = region === "gbd" ? "1" : region === "seongsu" ? "2" : "3";
    const url = `https://apis.data.go.kr/1611000/OfcMktService/getOfcMktInfo?serviceKey=${encodeURIComponent(MOLIT_API_KEY)}&regionCode=${regionCode}&numOfRows=1&pageNo=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const xml = await res.text();
      const vacancyRaw = xmlText(xml, "vacancyRate");
      const indexRaw = xmlText(xml, "rentalIndex");
      const quarter = xmlText(xml, "quarter");
      const vacancyRate = parseFloat(vacancyRaw);
      const rentalIndex = parseFloat(indexRaw);
      // 응답에 분기·공실률·임대지수가 모두 있어야 저장한다 (가짜 기본값 금지)
      if (!quarter || !Number.isFinite(vacancyRate) || !Number.isFinite(rentalIndex)) {
        log.warn(`[RentalTrend] ${region} — response missing quarter/vacancyRate/rentalIndex; nothing stored`);
        return null;
      }
      const trend = { region, quarter, vacancy_rate: vacancyRate, rental_index: rentalIndex };
      const { error: delErr } = await supabase.from("rental_trend_data").delete().eq("region", region).eq("quarter", trend.quarter);
      if (delErr) throw delErr;
      const { data, error } = await supabase.from("rental_trend_data").insert(trend).select().single();
      if (error) throw error;
      return data;
    }
  } catch (err) {
    log.warn(`[RentalTrend] ${region} API failed:`, err);
  }

  // API 실패 시 null 반환 (더미 fallback 없음)
  log.warn(`[RentalTrend] ${region} — no data available`);
  return null;
}

// ─── A2: 토지이음 용도지역 (공간정보 플랫폼) ──────────────────────────────────────
// 실제 연동 API 가 없다. 과거에는 하드코딩 용도지역을 land_use_plans 에 upsert 했으나(M2-05 동류의 가짜 적재),
// 정직하게 null 을 반환한다. 실제 용도지역 조회는 `@/lib/external/land-use-api` 의 fetchLandUsePlan(pnu) 사용.
export async function fetchLandUsePlan(_supabase: SupabaseClient, pnu: string): Promise<any> {
  log.warn(`[LandUsePlan] No real integration here — returning null for PNU ${pnu} (use lib/external/land-use-api)`);
  return null;
}

// ─── A3: 등기부등본 (미연동) ───────────────────────────────────────────────────────
// 과거 스텁은 가짜 소유자·근저당·청결점수를 반환했다. 연동 전에는 "사용 불가"를 명시한다.
export async function fetchRegisterSummary(buildingId: string): Promise<any> {
  return {
    ok: false, buildingId, status: "unavailable",
    message: "등기부등본 자동 연동 API 미연동 — 제공 가능한 데이터 없음",
    summary: null,
  };
}

// ─── A4: 건물에너지효율등급 API (한국에너지공단) ───────────────────────────────────
// https://apis.data.go.kr/1611000/BldrgEnergyRatingService/getBldrgEnergyRatingInfo
export async function fetchEnergyRating(supabase: SupabaseClient, buildingId: string): Promise<any> {
  if (!ENERGY_API_KEY) {
    log.warn("[EnergyRating] API key missing — skipping");
    return null;
  }

  try {
    const url = `https://apis.data.go.kr/1611000/BldrgEnergyRatingService/getBldrgEnergyRatingInfo?serviceKey=${encodeURIComponent(ENERGY_API_KEY)}&buildingId=${buildingId}&numOfRows=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    
    const xml = await res.text();
    const grade = xmlText(xml, "energyRatingGrade");
    if (!grade) return null;
    
    const energy = parseFloat(xmlText(xml, "primaryEnergyConsumption") || "0");
    const rating = {
      building_id: buildingId,
      rating: grade,
      annual_energy_consumption: energy || 0,
      updated_at: new Date().toISOString(),
    };
    
    await supabase.from("energy_ratings").delete().eq("building_id", buildingId);
    const { data, error } = await supabase.from("energy_ratings").insert(rating).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    log.warn("[EnergyRating] API failed:", err);
    return null;
  }
}

// ─── A5: 소상공인 상권분석 API (SEMAS) ─────────────────────────────────────────
// https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong
const SEMAS_DISTRICT_CODES: Record<string, { dongCode: string; name: string }> = {
  "D001": { dongCode: "1120065000", name: "성수역 카페거리" },  // 성동구 성수동
  "D002": { dongCode: "1168010800", name: "강남역 테헤란로" }, // 강남구 역삼동
  "D003": { dongCode: "1156011000", name: "여의도 IFC몰 상권" }, // 영등포구 여의도동
};

/**
 * 상권 지수. SEMAS 키가 없거나 API 호출/해석에 실패하면 **아무것도 저장하지 않고 null** 을 반환한다.
 * (과거: 하드코딩 지수 D001~D003 을 commercial_district 에 upsert → 운영 DB 오염, M2-05/함정 15)
 * 호출 크론이 Promise.all 이므로 DB 오류도 throw 하지 않고 로그 후 null.
 */
export async function fetchCommercialDistrict(supabase: SupabaseClient, districtCode: string): Promise<any> {
  const dcInfo = SEMAS_DISTRICT_CODES[districtCode];

  if (!SEMAS_API_KEY) {
    log.warn(`[SEMAS] API key missing — district ${districtCode} skipped (no fallback upsert)`);
    return null;
  }
  if (!dcInfo) {
    log.warn(`[SEMAS] Unknown district code ${districtCode} — skipped`);
    return null;
  }

  try {
    const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong?serviceKey=${encodeURIComponent(SEMAS_API_KEY)}&divId=adongCd&key=${dcInfo.dongCode}&pageIndex=1&pageSize=1&type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      log.warn(`[SEMAS] District ${districtCode} HTTP ${res.status} — nothing stored`);
      return null;
    }
    const json = await res.json();
    const totalStores = Number(json?.body?.totalCount);
    if (!Number.isFinite(totalStores) || totalStores <= 0) {
      log.warn(`[SEMAS] District ${districtCode} — no store count in response; nothing stored`);
      return null;
    }
    // 점포수 기반 상권 인덱스 간이 계산 (실측 점포수에서만 파생)
    const salesIdx = Math.min(10, totalStores / 500);
    const footfallIdx = Math.min(10, totalStores / 400);
    const district = {
      district_code: districtCode,
      district_name: dcInfo.name,
      sales_volume_index: parseFloat(salesIdx.toFixed(1)),
      footfall_index: parseFloat(footfallIdx.toFixed(1)),
    };
    const { data, error } = await supabase.from("commercial_district").upsert(district, { onConflict: "district_code" }).select().single();
    if (error) {
      log.error(`[SEMAS] commercial_district upsert failed for ${districtCode}:`, error);
      return null;
    }
    return data;
  } catch (err) {
    log.warn(`[SEMAS] District ${districtCode} failed:`, err);
    return null;
  }
}

// ─── A6: 개별공시지가 API (국토부) ─────────────────────────────────────────────
// https://apis.data.go.kr/1611000/nsdi/EnsIdvLandPriceService/wgs84/getEnsIdvLandPriceInfos
export async function fetchOfficialLandPrice(supabase: SupabaseClient, pnu: string, year: number): Promise<any> {
  const result = await fetchLandPrice(pnu);
  const pricePerSqm = result?.pricePerSqm ?? 0;
  if (!pricePerSqm) {
    log.warn(`[OfficialLandPrice] No data for PNU ${pnu} year ${year}`);
    return null;
  }

  const price = { pnu, year, price_per_sqm: pricePerSqm };
  const { data, error } = await supabase.from("official_land_prices").upsert(price, { onConflict: "pnu,year" }).select().single();
  if (error) throw error;
  return data;
}

// ─── A7: 건축허가 API (국토부 건축물대장) ────────────────────────────────────────
// https://apis.data.go.kr/1613000/ArchPmsService/getApBrPermitInfo
export async function fetchConstructionPermits(
  supabase: SupabaseClient,
  region: string,
): Promise<any[]> {
  if (!MOLIT_API_KEY) {
    log.warn("[ConstructionPermits] MOLIT_API_KEY missing — skipping");
    return [];
  }

  const REGION_SIGUNGU: Record<string, { code: string; name: string }> = {
    gbd:     { code: "11680", name: "강남구" },
    seongsu: { code: "11200", name: "성동구" },
    ybd:     { code: "11560", name: "영등포구" },
  };
  const regionInfo = REGION_SIGUNGU[region] || REGION_SIGUNGU.gbd;
  const results: any[] = [];

  try {
    const url = `https://apis.data.go.kr/1613000/ArchPmsService/getApBrPermitInfo?serviceKey=${encodeURIComponent(MOLIT_API_KEY)}&sigunguCd=${regionInfo.code}&numOfRows=5&pageNo=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xmlAll(xml, "item");

    const permitMap = new Map<string, any>();
    for (const item of items) {
      const purposeRaw = xmlText(item, "mainPurpsCdNm") || xmlText(item, "etcPurps") || "";
      // 업무/근생 용도만 필터
      if (!/업무|근린|상업|판매/.test(purposeRaw)) continue;

      const text = `${regionInfo.name} ${xmlText(item, "platPlc") || ""} ${xmlText(item, "bldNm") || purposeRaw} 건축허가`;
      const totalArea = parseFloat(xmlText(item, "totArea") || "0");
      const floorCnt = xmlText(item, "grndFlrCnt") || "?";
      const ugFloorCnt = xmlText(item, "ugrndFlrCnt") || "0";
      const detail = `${purposeRaw} | 연면적 ${totalArea.toLocaleString()}㎡ | 지하${ugFloorCnt}층~지상${floorCnt}층`;

      permitMap.set(text, {
        text,
        detail,
        district: regionInfo.name,
        region,
      });
    }

    const permitsToUpsert = Array.from(permitMap.values());
    if (permitsToUpsert.length > 0) {
      const { data, error } = await supabase
        .from("construction_permits")
        .upsert(permitsToUpsert, { onConflict: "text" })
        .select();
      if (!error && data) results.push(...data);
    }
  } catch (err) {
    log.warn(`[ConstructionPermits] ${region} failed:`, err);
  }
  return results;
}
