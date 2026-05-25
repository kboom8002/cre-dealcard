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

    // Fetch all transitions
    const { data: transitions, error } = await supabase
      .from("pipeline_stage_transitions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Aggregate statistics
    const totalTransitions = transitions?.length || 0;
    const stageTransitionCounts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    let totalHoldDays = 0;
    let holdDaysCount = 0;

    for (const t of transitions || []) {
      const path = `${t.from_stage} -> ${t.to_stage}`;
      stageTransitionCounts[path] = (stageTransitionCounts[path] || 0) + 1;

      if (t.transition_reason) {
        reasonCounts[t.transition_reason] = (reasonCounts[t.transition_reason] || 0) + 1;
      }

      if (t.hold_days !== null && t.hold_days !== undefined) {
        totalHoldDays += Number(t.hold_days);
        holdDaysCount++;
      }
    }

    const avgHoldDays = holdDaysCount > 0 ? Math.round((totalHoldDays / holdDaysCount) * 10) / 10 : 0;

    return NextResponse.json({
      ok: true,
      data: {
        totalTransitions,
        stageTransitionCounts,
        reasonCounts,
        avgHoldDays,
        recentTransitions: (transitions || []).slice(0, 15),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/admin/pipeline-analytics]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
