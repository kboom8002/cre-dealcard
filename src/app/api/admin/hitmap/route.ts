import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth-guard";
import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

/**
 * GET /api/admin/hitmap
 * Retrieves functionality usage statistics (G3 Heatmap) based on activity_events
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireRole(request, ["admin"]);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();

    // Query all event_types and count them
    const { data, error } = await supabase
      .from('activity_events')
      .select('event_type')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // last 30 days

    if (error) {
      log.error("[Hitmap] Error fetching events:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate counts
    const aggregation: Record<string, number> = {};
    for (const row of data || []) {
      const type = row.event_type;
      aggregation[type] = (aggregation[type] || 0) + 1;
    }

    // Format for heatmap UI
    const heatmapData = Object.entries(aggregation).map(([feature, count]) => ({
      feature,
      count,
      intensity: Math.min(100, Math.max(10, count * 5)) // Simple normalization
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ heatmap: heatmapData });
  } catch (error: any) {
    log.error("[Hitmap] Unhandled error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
