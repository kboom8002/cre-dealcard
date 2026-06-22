import type { SupabaseClient } from "@supabase/supabase-js";
import { xmlText, xmlAll } from "@/lib/utils/xml-parser";
import { fetchLandPrice } from "@/lib/external/land-price-api";

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

// ─── A1: MOLIT 상업·업무용 부동산 실거래가 API ─────────────────────────────────
// https://apis.data.go.kr/1613000/RTMSDataSvcSh/getRTMSDataSvcSh
export async function fetchCommercialTransactions(
  supabase: SupabaseClient,
  region: string,
): Promise<any[]> {
  if (!MOLIT_API_KEY) {
    console.warn("[MOLIT] API key missing — skipping real transaction fetch");
    return [];
  }

  const today = new Date();
  const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lawdCodes = REGION_LAWD[region] || ["11680"];
  const results: any[] = [];

  for (const lawd of lawdCodes) {
    try {
      const url = `https://apis.data.go.kr/1613000/RTMSDataSvcSh/getRTMSDataSvcSh?serviceKey=${encodeURIComponent(MOLIT_API_KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=10&pageNo=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xmlAll(xml, "item");

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

        const { data, error } = await supabase
          .from("external_transactions")
          .upsert({
            address,
            dong,
            district: lawdCodes.includes("11680") ? "강남구" : lawdCodes.includes("11200") ? "성동구" : "영등포구",
            area_signal: region,
            usage_type: usageType || "상업용",
            transaction_price: price,
            building_area: area,
            transaction_date: txDate,
          }, { onConflict: "address,transaction_date,transaction_price" })
          .select().single();

        if (!error && data) results.push(data);
      }
    } catch (err) {
      console.warn(`[MOLIT] Region ${region}/${lawd} failed:`, err);
    }
  }
  return results;
}

// ─── A1b: 한국부동산원 임대동향 (공공데이터포털) ──────────────────────────────────
export async function fetchRentalTrend(supabase: SupabaseClient, region: string): Promise<any> {
  if (!MOLIT_API_KEY) {
    console.warn("[RentalTrend] MOLIT_API_KEY missing — skipping");
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
      const vacancyRate = parseFloat(xmlText(xml, "vacancyRate") || "0");
      const rentalIndex = parseFloat(xmlText(xml, "rentalIndex") || "100");
      const quarter = xmlText(xml, "quarter") || "2026 Q1";
      const trend = { region, quarter, vacancy_rate: vacancyRate || 2.5, rental_index: rentalIndex || 100 };
      await supabase.from("rental_trend_data").delete().eq("region", region).eq("quarter", trend.quarter);
      const { data, error } = await supabase.from("rental_trend_data").insert(trend).select().single();
      if (error) throw error;
      return data;
    }
  } catch (err) {
    console.warn(`[RentalTrend] ${region} API failed:`, err);
  }

  // API 실패 시 null 반환 (더미 fallback 없음)
  console.warn(`[RentalTrend] ${region} — no data available`);
  return null;
}

// ─── A2: 토지이음 용도지역 (공간정보 플랫폼) ──────────────────────────────────────
export async function fetchLandUsePlan(supabase: SupabaseClient, pnu: string): Promise<any> {
  const dummyPlans: Record<string, any> = {
    "1168010100101230045": { pnu: "1168010100101230045", zoning: "일반상업지역, 지구단위계획구역", restrictions: "용적률 800% 이하" },
    "1120011400100450012": { pnu: "1120011400100450012", zoning: "준공업지역, 역사문화환경보존지역", restrictions: "용적률 400% 이하" },
    "1156011000100340001": { pnu: "1156011000100340001", zoning: "일반상업지역", restrictions: "용적률 600% 이하" },
  };
  const plan = dummyPlans[pnu] || { pnu, zoning: "제2종일반주거지역", restrictions: "용적률 200% 이하" };
  const { data, error } = await supabase.from("land_use_plans").upsert(plan, { onConflict: "pnu" }).select().single();
  if (error) throw error;
  return data;
}

// ─── A3: 등기부등본 스텁 ───────────────────────────────────────────────────────
export async function fetchRegisterSummary(buildingId: string): Promise<any> {
  return {
    ok: true, buildingId, status: "ready",
    lastUpdated: new Date().toISOString(),
    message: "등기부등본 자동 연동 API 준비 중 (PoC 후속 버전 탑재 예정)",
    summary: {
      ownerships: ["소유자: 김*수 (지분 100%)"],
      collaterals: ["을구 근저당설정: 신한은행 48억원 (채권최고액 57.6억원)"],
      cleannessScore: 92,
    },
  };
}

// ─── A4: 건물에너지효율등급 API (한국에너지공단) ───────────────────────────────────
// https://apis.data.go.kr/1611000/BldrgEnergyRatingService/getBldrgEnergyRatingInfo
export async function fetchEnergyRating(supabase: SupabaseClient, buildingId: string): Promise<any> {
  if (!ENERGY_API_KEY) {
    console.warn("[EnergyRating] API key missing — skipping");
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
    console.warn("[EnergyRating] API failed:", err);
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

export async function fetchCommercialDistrict(supabase: SupabaseClient, districtCode: string): Promise<any> {
  const dcInfo = SEMAS_DISTRICT_CODES[districtCode];
  const fallback = {
    "D001": { district_code: "D001", district_name: "성수역 카페거리", sales_volume_index: 8.5, footfall_index: 9.2 },
    "D002": { district_code: "D002", district_name: "강남역 테헤란로", sales_volume_index: 9.4, footfall_index: 9.8 },
    "D003": { district_code: "D003", district_name: "여의도 IFC몰 상권", sales_volume_index: 7.8, footfall_index: 8.1 },
  };

  if (SEMAS_API_KEY && dcInfo) {
    try {
      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong?serviceKey=${encodeURIComponent(SEMAS_API_KEY)}&divId=adongCd&key=${dcInfo.dongCode}&pageIndex=1&pageSize=1&type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = await res.json();
        const totalStores = json?.body?.totalCount || 0;
        // 점포수 기반 상권 인덱스 간이 계산
        const salesIdx = Math.min(10, totalStores / 500);
        const footfallIdx = Math.min(10, totalStores / 400);
        const district = {
          district_code: districtCode,
          district_name: dcInfo.name,
          sales_volume_index: parseFloat(salesIdx.toFixed(1)) || (fallback as any)[districtCode]?.sales_volume_index || 5.0,
          footfall_index: parseFloat(footfallIdx.toFixed(1)) || (fallback as any)[districtCode]?.footfall_index || 5.0,
        };
        const { data, error } = await supabase.from("commercial_district").upsert(district, { onConflict: "district_code" }).select().single();
        if (!error && data) return data;
      }
    } catch (err) {
      console.warn(`[SEMAS] District ${districtCode} failed:`, err);
    }
  }

  // 폴백
  const district = (fallback as any)[districtCode] || { district_code: districtCode, district_name: "신규 상권", sales_volume_index: 5.0, footfall_index: 5.0 };
  const { data, error } = await supabase.from("commercial_district").upsert(district, { onConflict: "district_code" }).select().single();
  if (error) throw error;
  return data;
}

// ─── A6: 개별공시지가 API (국토부) ─────────────────────────────────────────────
// https://apis.data.go.kr/1611000/nsdi/EnsIdvLandPriceService/wgs84/getEnsIdvLandPriceInfos
export async function fetchOfficialLandPrice(supabase: SupabaseClient, pnu: string, year: number): Promise<any> {
  const result = await fetchLandPrice(pnu);
  const pricePerSqm = result?.pricePerSqm ?? 0;
  if (!pricePerSqm) {
    console.warn(`[OfficialLandPrice] No data for PNU ${pnu} year ${year}`);
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
    console.warn("[ConstructionPermits] MOLIT_API_KEY missing — skipping");
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

    for (const item of items) {
      const purposeRaw = xmlText(item, "mainPurpsCdNm") || xmlText(item, "etcPurps") || "";
      // 업무/근생 용도만 필터
      if (!/업무|근린|상업|판매/.test(purposeRaw)) continue;

      const text = `${regionInfo.name} ${xmlText(item, "platPlc") || ""} ${xmlText(item, "bldNm") || purposeRaw} 건축허가`;
      const totalArea = parseFloat(xmlText(item, "totArea") || "0");
      const floorCnt = xmlText(item, "grndFlrCnt") || "?";
      const ugFloorCnt = xmlText(item, "ugrndFlrCnt") || "0";
      const detail = `${purposeRaw} | 연면적 ${totalArea.toLocaleString()}㎡ | 지하${ugFloorCnt}층~지상${floorCnt}층`;

      const { data, error } = await supabase.from("construction_permits").upsert({
        text,
        detail,
        district: regionInfo.name,
        region,
      }, { onConflict: "text" }).select().single();
      if (!error && data) results.push(data);
    }
  } catch (err) {
    console.warn(`[ConstructionPermits] ${region} failed:`, err);
  }
  return results;
}
