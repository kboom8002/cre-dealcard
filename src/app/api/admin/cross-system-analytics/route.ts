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

    // 1. Funnel Events (last 30 days)
    const { data: events, error: eventsErr } = await supabase
      .from("activity_events")
      .select("event_type, source_app")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (eventsErr) throw eventsErr;

    const eventCounts: Record<string, { count: number; source_app: string }> = {};
    for (const e of events) {
      if (!eventCounts[e.event_type]) {
        eventCounts[e.event_type] = { count: 0, source_app: e.source_app || "unknown" };
      }
      eventCounts[e.event_type].count++;
    }

    // 2. Full IM Handoff Statuses
    const { data: fullImHandoffs, error: fihErr } = await supabase
      .from("full_im_handoffs")
      .select("status, count", { count: "exact" });
      // actually we can't select count directly like this in single query easily without rpc
      
    // Let's do it manually since it's admin dashboard
    const { data: fihData } = await supabase.from("full_im_handoffs").select("status");
    const fullImHandoffStatusCounts: Record<string, number> = {};
    for (const row of fihData || []) {
      fullImHandoffStatusCounts[row.status] = (fullImHandoffStatusCounts[row.status] || 0) + 1;
    }

    // 3. Space AI Handoff Statuses
    const { data: spaceAiData } = await supabase.from("space_ai_handoffs").select("status");
    const spaceAiHandoffStatusCounts: Record<string, number> = {};
    for (const row of spaceAiData || []) {
      spaceAiHandoffStatusCounts[row.status] = (spaceAiHandoffStatusCounts[row.status] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      data: {
        eventCounts,
        fullImHandoffStatusCounts,
        spaceAiHandoffStatusCounts,
      }
    });
  } catch (error: any) {
    log.error("[GET /api/admin/cross-system-analytics]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
