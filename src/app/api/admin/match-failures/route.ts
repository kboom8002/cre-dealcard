import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    console.error("[GET /api/admin/match-failures]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
