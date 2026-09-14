import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;
    const user = guard.user;

    const { data: logs, error } = await supabase
      .from("match_failure_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const totalFailures = logs?.length || 0;
    const rejectedByCounts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    let totalPriceGap = 0;
    let priceGapCount = 0;

    for (const l of logs || []) {
      rejectedByCounts[l.rejected_by] = (rejectedByCounts[l.rejected_by] || 0) + 1;
      reasonCounts[l.failure_reason] = (reasonCounts[l.failure_reason] || 0) + 1;

      if (l.price_gap_pct !== null && l.price_gap_pct !== undefined) {
        totalPriceGap += Number(l.price_gap_pct);
        priceGapCount++;
      }
    }

    const avgPriceGapPct = priceGapCount > 0 ? Math.round((totalPriceGap / priceGapCount) * 10) / 10 : 0;

    return NextResponse.json({
      ok: true,
      data: {
        totalFailures,
        rejectedByCounts,
        reasonCounts,
        avgPriceGapPct,
        recentLogs: (logs || []).slice(0, 15),
      },
    });
  } catch (error: any) {
    log.error("[GET /api/admin/match-failures]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
