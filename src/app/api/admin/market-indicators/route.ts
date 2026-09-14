import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MarketIndicatorEngine } from "@/domain/analytics/market-indicator-engine";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;
    const user = guard.user;

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
    log.error("[GET /api/admin/market-indicators]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;
    const user = guard.user;

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
    log.error("[POST /api/admin/market-indicators]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
