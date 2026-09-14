import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { getMarketDefaults, invalidateMarketDefaultsCache, STATIC_MARKET_DEFAULTS } from "@/domain/ontology/market-data-provider";
import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export async function GET() {
  try {
    const defaults = await getMarketDefaults();
    return NextResponse.json({
      ok: true,
      data: defaults,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, data: STATIC_MARKET_DEFAULTS, error: error?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;

    const supabase = await createServerSupabaseClient();
    const body = await req.json();
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

    // Deactivate previous defaults
    await supabase.from("market_defaults").update({ active: false }).eq("active", true);

    // Insert new active defaults
    const { data, error } = await supabase
      .from("market_defaults")
      .insert({
        commercial_mortgage_rate_pct,
        pf_interest_rate_pct,
        max_ltv_pct,
        construction_cost_rc,
        construction_cost_sc,
        construction_cost_src,
        acquisition_tax_rate_pct,
        cap_rate_benchmarks,
        notes,
        active: true,
        created_by: guard.user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    invalidateMarketDefaultsCache();

    log.info("[MarketDefaults] Admin updated market defaults", { adminId: guard.user?.id });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error: any) {
    log.error("[MarketDefaults] Error updating defaults:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
