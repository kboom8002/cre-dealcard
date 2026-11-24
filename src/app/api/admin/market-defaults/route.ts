import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { getMarketDefaults, invalidateMarketDefaultsCache } from "@/domain/ontology/market-data-provider";
import { fetchRegionalCommercialBenchmarks } from "@/lib/external/rone-api";
import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

interface MarketDefaultsInsertPayload {
  commercial_mortgage_rate_pct: unknown;
  pf_interest_rate_pct: unknown;
  max_ltv_pct: unknown;
  construction_cost_rc: unknown;
  construction_cost_sc: unknown;
  construction_cost_src: unknown;
  acquisition_tax_rate_pct: unknown;
  cap_rate_benchmarks: unknown;
  notes: unknown;
  created_by: string | undefined;
}

/** Deactivates previous active defaults and inserts a new active market_defaults row. */
async function replaceActiveMarketDefaults(
  supabase: ServerSupabaseClient,
  payload: MarketDefaultsInsertPayload,
) {
  const table = supabase.from("market_defaults");
  await table.update({ active: false }).eq("active", true);
  const { data, error } = await table
    .insert({
      ...payload,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;
  invalidateMarketDefaultsCache();
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;

    const defaults = await getMarketDefaults();
    return NextResponse.json({
      ok: true,
      data: defaults,
    });
  } catch (error: unknown) {
    log.error("[MarketDefaults] Error fetching defaults:", error);
    return NextResponse.json(
      { ok: false, error: "시장 기본값을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;

    const supabase = await createServerSupabaseClient();
    const body = await req.json();

    if (body?.action === "sync_rone") {
      const benchmarks = await fetchRegionalCommercialBenchmarks();
      const current = await getMarketDefaults();
      const syncedAt = new Date().toISOString();

      const mergedCapBenchmarks: Record<string, any> = {
        ...((current as any)?.cap_rate_benchmarks ?? {}),
      };
      for (const b of benchmarks) {
        mergedCapBenchmarks[b.regionKey] = {
          ...(typeof mergedCapBenchmarks[b.regionKey] === "object" ? mergedCapBenchmarks[b.regionKey] : {}),
          regionLabel: b.regionLabel,
          landPriceRatePct: b.landPriceRatePct,
          rentalYieldPct: b.rentalYieldPct,
          vacancyRatePct: b.vacancyRatePct,
          quarterLabel: b.quarterLabel,
          source: b.source,
          syncedAt,
        };
      }

      const syncedRow = await replaceActiveMarketDefaults(supabase, {
        commercial_mortgage_rate_pct: (current as any)?.commercial_mortgage_rate_pct,
        pf_interest_rate_pct: (current as any)?.pf_interest_rate_pct,
        max_ltv_pct: (current as any)?.max_ltv_pct,
        construction_cost_rc: (current as any)?.construction_cost_rc,
        construction_cost_sc: (current as any)?.construction_cost_sc,
        construction_cost_src: (current as any)?.construction_cost_src,
        acquisition_tax_rate_pct: (current as any)?.acquisition_tax_rate_pct,
        cap_rate_benchmarks: mergedCapBenchmarks,
        notes: `R-ONE 12M 평균 자동 동기화 (${syncedAt.slice(0, 10)})`,
        created_by: guard.user?.id,
      });

      return NextResponse.json({
        ok: true,
        action: "sync_rone",
        syncedAt,
        benchmarks,
        data: syncedRow,
      });
    }

    const {
      commercial_mortgage_rate_pct,
      pf_interest_rate_pct,
      max_ltv_pct,
      construction_cost_rc,
      construction_cost_sc,
      construction_cost_src,
      acquisition_tax_rate_pct,
      cap_rate_benchmarks,
      notes,
    } = body;

    const data = await replaceActiveMarketDefaults(supabase, {
      commercial_mortgage_rate_pct,
      pf_interest_rate_pct,
      max_ltv_pct,
      construction_cost_rc,
      construction_cost_sc,
      construction_cost_src,
      acquisition_tax_rate_pct,
      cap_rate_benchmarks,
      notes,
      created_by: guard.user?.id,
    });

    log.info("[MarketDefaults] Admin updated market defaults", { adminId: guard.user?.id });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: unknown) {
    log.error("[MarketDefaults] Error updating defaults:", error);
    return NextResponse.json(
      { ok: false, error: "시장 기본값 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
