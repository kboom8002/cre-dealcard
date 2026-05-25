import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MarketIndicatorEngine } from "@/domain/analytics/market-indicator-engine";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id || "")
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: indicators, error } = await supabase
      .from("market_leading_indicators")
      .select("*")
      .order("computed_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: indicators || [],
    });
  } catch (error: any) {
    console.error("[GET /api/admin/market-indicators]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id || "")
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const engine = new MarketIndicatorEngine(supabase);

    const regions = ["GBD", "CBD", "YBD", "Other"];
    const assetTypes = ["office", "retail", "warehouse", "other"];

    const computed = [];
    for (const r of regions) {
      for (const a of assetTypes) {
        const snapshot = await engine.generateSnapshot(r, a);
        computed.push(snapshot);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully computed ${computed.length} market indicators.`,
      data: computed,
    });
  } catch (error: any) {
    console.error("[POST /api/admin/market-indicators]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
