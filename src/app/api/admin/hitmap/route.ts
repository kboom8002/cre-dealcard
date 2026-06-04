import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/hitmap
 * Retrieves functionality usage statistics (G3 Heatmap) based on activity_events
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Query all event_types and count them
    const { data, error } = await supabase
      .from("activity_events")
      .select("event_type");

    if (error) throw error;

    // Aggregate counts
    const heatmap: Record<string, number> = {};
    for (const row of data || []) {
      const type = row.event_type;
      heatmap[type] = (heatmap[type] || 0) + 1;
    }

    // Format for charts/lists
    const formatted = Object.entries(heatmap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, heatmap: formatted });
  } catch (err: unknown) {
    console.error("[api/admin/hitmap] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
