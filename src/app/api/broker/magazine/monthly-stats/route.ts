import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, jsonError } from "@/lib/magazine/authz";
import { fetchBokMonthlyLoanRates } from "@/lib/external/bok-ecos-api";
import { fetchMonthlyWholeBuildingTransactions } from "@/lib/external/real-transaction-api";
import { normalizeMonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
  REGION_DISTRICT_KEYWORDS,
  REGION_SIGUNGU_CODES,
  resolveMonthlyGraphicPair,
  type DbCommercialDistrictRow,
  type DbRentalTrendRow,
  type DbTransactionRow,
} from "@/domain/magazine/monthly-stats-hydration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { ctx, error } = await requireBrokerContext(request);
  if (error || !ctx) {
    return error ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }

  const sp = request.nextUrl.searchParams;
  const regionKey = normalizeMonthlyRegionKey(sp.get("region") ?? "gbd");
  const { pairId, pair } = resolveMonthlyGraphicPair(sp.get("pair") ?? "molit_bok");
  const yearMonth = sp.get("ym") ?? sp.get("yearMonth") ?? undefined;

  try {
    const supabase = createServiceClient();
    const keywords = REGION_DISTRICT_KEYWORDS[regionKey] ?? REGION_DISTRICT_KEYWORDS.gbd;
    const sigunguCodes = REGION_SIGUNGU_CODES[regionKey] ?? REGION_SIGUNGU_CODES.gbd;

    const sixMonthsAgo = new Date(Date.now() - 185 * 86_400_000).toISOString().slice(0, 10);

    const [txRes, rentalRes, commRes, bokRes] = await Promise.all([
      Promise.resolve(
        supabase
          .from("external_transactions")
          .select("transaction_date, transaction_price, building_area, district, dong, address, raw_data")
          .gte("transaction_date", sixMonthsAgo)
          .order("transaction_date", { ascending: true })
          .limit(300),
      ).catch(() => ({ data: null })),
      Promise.resolve(
        supabase
          .from("rental_trend_data")
          .select("region, quarter, vacancy_rate, rental_index")
          .eq("region", regionKey)
          .order("quarter", { ascending: true })
          .limit(8),
      ).catch(() => ({ data: null })),
      Promise.resolve(
        supabase
          .from("commercial_district")
          .select("district_name, sales_volume_index, footfall_index")
          .limit(30),
      ).catch(() => ({ data: null })),
      fetchBokMonthlyLoanRates(6).catch(() => []),
    ]);

    const rawTxs = Array.isArray(txRes?.data) ? (txRes.data as DbTransactionRow[]) : [];
    let matchedTxs = rawTxs.filter((r) => {
      const hay = `${r.district ?? ""} ${r.dong ?? ""} ${r.address ?? ""}`;
      return keywords.some((kw) => hay.includes(kw));
    });

    // DB 적재가 아직 부족한 권역이면 국토부 실거래가 API 직접 조회로 보충 (통건물 필터링)
    if (matchedTxs.length < 2) {
      const liveMolit = await fetchMonthlyWholeBuildingTransactions(sigunguCodes, 6).catch(() => []);
      if (liveMolit.length > 0) {
        matchedTxs = liveMolit.map((m) => ({
          transaction_date: `${m.ym}-01`,
          transaction_price: m.dealAmountKrw,
          building_area: m.landAreaM2 > 0 ? m.landAreaM2 : m.buildingAreaM2,
          district: m.sigunguCode,
          dong: m.dong,
          address: m.dong,
          building_type: m.buildingType,
        }));
      }
    }

    const rentalRows = Array.isArray(rentalRes?.data)
      ? (rentalRes.data as DbRentalTrendRow[])
      : [];

    const rawComm = Array.isArray(commRes?.data)
      ? (commRes.data as DbCommercialDistrictRow[])
      : [];
    const matchedComm = rawComm.filter((r) =>
      keywords.some((kw) => String(r.district_name ?? "").includes(kw)),
    );

    const bokLoanRates = Array.isArray(bokRes) ? bokRes : [];

    const charts = hydrateMonthlyChartsFromDbRows({
      regionKey,
      yearMonth,
      pair,
      transactions: matchedTxs,
      rentalRows,
      commercialRows: matchedComm,
      bokLoanRates,
    });

    const liveDbAvailable = charts.some((c) => c.sourceMode === "public_db");

    return NextResponse.json({
      ok: true,
      regionKey,
      pairId,
      liveDbAvailable,
      charts,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      regionKey,
      pairId,
      liveDbAvailable: false,
      charts: buildDefaultMonthlyGraphicPair(regionKey, pair),
    });
  }
}
