import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, jsonError } from "@/lib/magazine/authz";
import { toKstDate } from "@/lib/magazine/kst";
import { fetchBokMonthlyLoanRates } from "@/lib/external/bok-ecos-api";
import { fetchMonthlyWholeBuildingTransactions } from "@/lib/external/real-transaction-api";
import { normalizeMonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
  hydrateMonthlyChartsFromRpcRows,
  REGION_DISTRICT_KEYWORDS,
  REGION_SIGUNGU_CODES,
  resolveMonthlyGraphicPair,
  type DbCommercialDistrictRow,
  type DbRentalTrendRow,
  type DbTransactionRow,
  type RpcMonthlyTxStatRow,
} from "@/domain/magazine/monthly-stats-hydration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeSupabaseRows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<{ data: T[] | null }> {
  try {
    return await query;
  } catch {
    return { data: null };
  }
}

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

    const sixMonthsAgo = toKstDate(new Date(Date.now() - 185 * 86_400_000));

    // 1. 서버 측 권역별 월별 실거래 집계 RPC 우선 호출 (표본 < 3건 중앙값 억제, 빈 월 표본 없음 포함)
    let rpcMonthlyRows: RpcMonthlyTxStatRow[] | null = null;
    try {
      if (typeof (supabase as { rpc?: unknown }).rpc === "function") {
        const rpcRes = await (
          supabase as {
            rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data?: unknown; error?: unknown }>;
          }
        ).rpc("get_monthly_regional_tx_stats", {
          p_sigungu_codes: [...sigunguCodes],
          p_district_keywords: [...keywords],
          p_months: 6,
          p_anchor_ym: yearMonth ?? null,
        });
        if (!rpcRes?.error && Array.isArray(rpcRes?.data)) {
          rpcMonthlyRows = rpcRes.data as RpcMonthlyTxStatRow[];
        }
      }
    } catch {
      rpcMonthlyRows = null;
    }

    const districtOrExpr = keywords
      .flatMap((kw) => [`district.ilike.%${kw}%`, `dong.ilike.%${kw}%`, `address.ilike.%${kw}%`])
      .join(",");

    let txQuery = supabase
      .from("external_transactions")
      .select("transaction_date, transaction_price, building_area, land_area, district, dong, address, raw_data")
      .gte("transaction_date", sixMonthsAgo)
      .order("transaction_date", { ascending: false })
      .limit(500);
    if (districtOrExpr && typeof (txQuery as { or?: (expr: string) => unknown }).or === "function") {
      txQuery = (txQuery as { or: (expr: string) => typeof txQuery }).or(districtOrExpr);
    }

    const [txRes, rentalRes, commRes, bokRes] = await Promise.all([
      safeSupabaseRows<DbTransactionRow>(txQuery),
      safeSupabaseRows<DbRentalTrendRow>(
        supabase
          .from("rental_trend_data")
          .select("region, quarter, vacancy_rate, rental_index")
          .eq("region", regionKey)
          .order("quarter", { ascending: true })
          .limit(8),
      ),
      safeSupabaseRows<DbCommercialDistrictRow>(
        supabase
          .from("commercial_district")
          .select("district_name, sales_volume_index, footfall_index")
          .limit(30),
      ),
      fetchBokMonthlyLoanRates(6).catch(() => []),
    ]);

    const rawTxs = Array.isArray(txRes?.data) ? (txRes.data as DbTransactionRow[]) : [];
    let matchedTxs = rawTxs.filter((r) => {
      const hay = `${r.district ?? ""} ${r.dong ?? ""} ${r.address ?? ""}`;
      return keywords.some((kw) => hay.includes(kw)) || sigunguCodes.includes(String(r.district ?? ""));
    });

    const hasRpcLiveTx =
      Array.isArray(rpcMonthlyRows) &&
      rpcMonthlyRows.length > 0 &&
      rpcMonthlyRows.some((r) => Number(r.tx_count ?? 0) > 0);

    // DB 적재가 아직 부족한 권역이면 국토부 실거래가 API 직접 조회로 보충 (통건물 필터링 · 연면적/대지면적 분리 유지)
    if (!hasRpcLiveTx && matchedTxs.length < 2) {
      const liveMolit = await fetchMonthlyWholeBuildingTransactions(sigunguCodes, 6).catch(() => []);
      if (liveMolit.length > 0) {
        matchedTxs = liveMolit.map((m) => ({
          transaction_date: `${m.ym}-01`,
          transaction_price: m.dealAmountKrw,
          building_area: m.buildingAreaM2 > 0 ? m.buildingAreaM2 : null,
          land_area: m.landAreaM2 > 0 ? m.landAreaM2 : null,
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

    const charts = hasRpcLiveTx
      ? hydrateMonthlyChartsFromRpcRows({
          regionKey,
          yearMonth,
          pair,
          rpcRows: rpcMonthlyRows!,
          transactions: matchedTxs,
          rentalRows,
          commercialRows: matchedComm,
          bokLoanRates,
        })
      : hydrateMonthlyChartsFromDbRows({
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
