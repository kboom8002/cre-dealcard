import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, jsonError } from "@/lib/magazine/authz";
import { normalizeMonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
  MONTHLY_GRAPHIC_PAIR_PRESETS,
  REGION_DISTRICT_KEYWORDS,
  type DbCommercialDistrictRow,
  type DbRentalTrendRow,
  type DbTransactionRow,
  type MonthlyChartPairId,
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
  const rawPairId = (sp.get("pair") ?? "reb_molit") as MonthlyChartPairId;
  const pairPreset =
    MONTHLY_GRAPHIC_PAIR_PRESETS.find((p) => p.id === rawPairId) ??
    MONTHLY_GRAPHIC_PAIR_PRESETS[0];
  const yearMonth = sp.get("ym") ?? undefined;

  try {
    const supabase = createServiceClient();
    const keywords = REGION_DISTRICT_KEYWORDS[regionKey] ?? REGION_DISTRICT_KEYWORDS.gbd;

    const sixMonthsAgo = new Date(Date.now() - 185 * 86_400_000).toISOString().slice(0, 10);

    const [txRes, rentalRes, commRes] = await Promise.all([
      Promise.resolve(
        supabase
          .from("external_transactions")
          .select("transaction_date, transaction_price, building_area, district, dong, address")
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
    ]);

    const rawTxs = Array.isArray(txRes?.data) ? (txRes.data as DbTransactionRow[]) : [];
    const matchedTxs = rawTxs.filter((r) => {
      const hay = `${r.district ?? ""} ${r.dong ?? ""} ${r.address ?? ""}`;
      return keywords.some((kw) => hay.includes(kw));
    });

    const rentalRows = Array.isArray(rentalRes?.data)
      ? (rentalRes.data as DbRentalTrendRow[])
      : [];

    const rawComm = Array.isArray(commRes?.data)
      ? (commRes.data as DbCommercialDistrictRow[])
      : [];
    const matchedComm = rawComm.filter((r) =>
      keywords.some((kw) => String(r.district_name ?? "").includes(kw)),
    );

    const charts = hydrateMonthlyChartsFromDbRows({
      regionKey,
      yearMonth,
      pair: pairPreset.pair,
      transactions: matchedTxs,
      rentalRows,
      commercialRows: matchedComm,
    });

    const liveDbAvailable = charts.some((c) => c.sourceMode === "public_db");

    return NextResponse.json({
      ok: true,
      regionKey,
      pairId: pairPreset.id,
      liveDbAvailable,
      charts,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      regionKey,
      pairId: pairPreset.id,
      liveDbAvailable: false,
      charts: buildDefaultMonthlyGraphicPair(regionKey, pairPreset.pair),
    });
  }
}
