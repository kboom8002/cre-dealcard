import type { SupabaseClient } from "@supabase/supabase-js";

// A1: Korea Real Estate Board (한국부동산원) Rental Trend API Client
export async function fetchRentalTrend(supabase: SupabaseClient, region: string): Promise<any> {
  const dummyTrends: Record<string, any> = {
    gbd: { region: "gbd", quarter: "2026 Q1", vacancy_rate: 3.2, rental_index: 104.5 },
    seongsu: { region: "seongsu", quarter: "2026 Q1", vacancy_rate: 1.5, rental_index: 112.1 },
    ybd: { region: "ybd", quarter: "2026 Q1", vacancy_rate: 2.8, rental_index: 99.8 },
  };

  const trend = dummyTrends[region] || { region, quarter: "2026 Q1", vacancy_rate: 4.0, rental_index: 100.0 };

  // Avoid duplicate trend records for the same region and quarter
  await supabase
    .from("rental_trend_data")
    .delete()
    .eq("region", trend.region)
    .eq("quarter", trend.quarter);

  const { data, error } = await supabase
    .from("rental_trend_data")
    .insert(trend)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A2: Landeum (토지e음) Land Use Plan API Client
export async function fetchLandUsePlan(supabase: SupabaseClient, pnu: string): Promise<any> {
  const dummyPlans: Record<string, any> = {
    "1168010100101230045": { pnu: "1168010100101230045", zoning: "일반상업지역, 지구단위계획구역", restrictions: "용적률 800% 이하, 건폐율 60% 이하" },
    "1120011400100450012": { pnu: "1120011400100450012", zoning: "준공업지역, 역사문화환경보존지역", restrictions: "용적률 400% 이하, 건폐율 60% 이하" },
  };

  const plan = dummyPlans[pnu] || { pnu, zoning: "제2종일반주거지역", restrictions: "용적률 200% 이하, 건폐율 60% 이하" };

  const { data, error } = await supabase
    .from("land_use_plans")
    .upsert(plan, { onConflict: "pnu" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A3: Certified Copy of Register (등기부등본) Stub API
export async function fetchRegisterSummary(buildingId: string): Promise<any> {
  // Certified copies cannot be queried directly from public API automatically in real-time, hence stub.
  return {
    ok: true,
    buildingId,
    status: "ready",
    lastUpdated: new Date().toISOString(),
    message: "등기부등본 자동 연동 API 준비 중 (PoC 후속 버전 탑재 예정)",
    summary: {
      ownerships: ["소유자: 김*수 (지분 100%)"],
      collaterals: ["을구 근저당설정: 신한은행 48억원 (채권최고액 57.6억원)"],
      cleannessScore: 92 // Out of 100 risk assessment index
    }
  };
}

// A4: Building Energy Efficiency (에너지공단) API Client
export async function fetchEnergyRating(supabase: SupabaseClient, buildingId: string): Promise<any> {
  const rating = {
    building_id: buildingId,
    rating: "1++등급 (우수)",
    annual_energy_consumption: 145.2,
    updated_at: new Date().toISOString()
  };

  // Avoid duplicate ratings for the same building ID
  await supabase
    .from("energy_ratings")
    .delete()
    .eq("building_id", buildingId);

  const { data, error } = await supabase
    .from("energy_ratings")
    .insert(rating)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A5: Small Enterprise District Analysis (소상공인시장진흥공단 상권분석) API Client
export async function fetchCommercialDistrict(supabase: SupabaseClient, districtCode: string): Promise<any> {
  const dummyDistricts: Record<string, any> = {
    "D001": { district_code: "D001", district_name: "성수역 카페거리", sales_volume_index: 8.5, footfall_index: 9.2 },
    "D002": { district_code: "D002", district_name: "강남역 테헤란로", sales_volume_index: 9.4, footfall_index: 9.8 }
  };

  const district = dummyDistricts[districtCode] || { district_code: districtCode, district_name: "신규 상권", sales_volume_index: 5.0, footfall_index: 5.0 };

  const { data, error } = await supabase
    .from("commercial_district")
    .upsert(district, { onConflict: "district_code" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A6: Official Land Price (공시지가) API Client
export async function fetchOfficialLandPrice(supabase: SupabaseClient, pnu: string, year: number): Promise<any> {
  const price = {
    pnu,
    year,
    price_per_sqm: BigInt(8500000) // 8,500,000 KRW per sqm
  };

  const { data, error } = await supabase
    .from("official_land_prices")
    .upsert(price, { onConflict: "pnu,year" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
