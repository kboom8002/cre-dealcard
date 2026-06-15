/**
 * GET /api/broker/im-lite/[buildingId]/views
 * Returns view count and recent views for broker dashboard.
 * Requires broker auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id: buildingId } = await params;
  const supabase = createServiceClient();

  const { data: events, error } = await supabase
    .from('activity_events')
    .select('id, metadata, created_at')
    .eq('building_id', buildingId)
    .eq('event_type', 'im_lite_view')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const allViews = events ?? [];
  const totalViews = allViews.length;

  // Count unique by user_agent_hash
  const uniqueHashes = new Set(
    allViews.map((e) => (e.metadata as Record<string, unknown>)?.user_agent_hash as string).filter(Boolean)
  );
  const uniqueViews = uniqueHashes.size;

  const recentViews = allViews.slice(0, 20).map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    metadata: e.metadata,
  }));

  return NextResponse.json({
    ok: true,
    buildingId,
    totalViews,
    uniqueViews,
    recentViews,
  });
}
