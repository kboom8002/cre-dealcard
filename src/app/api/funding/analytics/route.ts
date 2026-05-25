import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Fetch all projects
    const { data: projects, error: pErr } = await supabase
      .from("funding_projects")
      .select("*");

    if (pErr) throw pErr;

    // Fetch failure logs
    const { data: failureLogs, error: fErr } = await supabase
      .from("funding_failure_logs")
      .select("*");

    if (fErr) throw fErr;

    // Aggregate
    const totalProjects = projects?.length || 0;
    const activeProjects = projects?.filter((p) => p.status === "open").length || 0;
    const completedProjects = projects?.filter((p) => p.status === "funded").length || 0;
    const failedProjects = projects?.filter((p) => p.status === "failed").length || 0;

    let totalTargetAmount = 0;
    let totalCurrentAmount = 0;
    let totalInvestors = 0;

    for (const p of projects || []) {
      totalTargetAmount += Number(p.target_amount || 0);
      totalCurrentAmount += Number(p.current_amount || 0);
      totalInvestors += p.investor_count || 0;
    }

    const overallProgress = totalTargetAmount > 0 ? Math.round((totalCurrentAmount / totalTargetAmount) * 100) : 0;

    return NextResponse.json({
      ok: true,
      data: {
        totalProjects,
        activeProjects,
        completedProjects,
        failedProjects,
        totalTargetAmount,
        totalCurrentAmount,
        totalInvestors,
        overallProgress,
        failureLogs: failureLogs || [],
      },
    });
  } catch (error: any) {
    console.error("[GET /api/funding/analytics]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
