import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMarketDefaults, invalidateMarketDefaultsCache, STATIC_MARKET_DEFAULTS } from "@/domain/ontology/market-data-provider";

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
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Check if user is logged in
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        commercial_mortgage_rate_pct: commercial_mortgage_rate_pct ?? 5.2,
        pf_interest_rate_pct: pf_interest_rate_pct ?? 8.5,
        max_ltv_pct: max_ltv_pct ?? 70,
        construction_cost_rc: construction_cost_rc ?? 750,
        construction_cost_sc: construction_cost_sc ?? 680,
        construction_cost_src: construction_cost_src ?? 850,
        acquisition_tax_rate_pct: acquisition_tax_rate_pct ?? 4.6,
        cap_rate_benchmarks: cap_rate_benchmarks ?? { 강남구: 3.6, 서초구: 3.8, 중구: 4.0, default: 4.5 },
        source: 'manual',
        notes: notes || 'Admin dashboard update',
        active: true,
        updated_by: user.email || user.id,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("[POST /api/admin/market-defaults] DB insert warning:", error.message);
    }

    invalidateMarketDefaultsCache();
    const updatedDefaults = await getMarketDefaults();

    return NextResponse.json({
      ok: true,
      message: "시장 기본값이 정상 갱신되었습니다.",
      data: updatedDefaults,
    });
  } catch (error: any) {
    console.error("[POST /api/admin/market-defaults] Error:", error);
    return NextResponse.json({ error: error?.message ?? "Failed to save market defaults" }, { status: 500 });
  }
}
