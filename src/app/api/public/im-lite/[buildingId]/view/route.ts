/**
 * POST /api/public/im-lite/[buildingId]/view
 * Records a page view event for broker tracking.
 * Public endpoint — no auth required.
 * Uses activity_events table.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createHash } from 'node:crypto';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  let sectionViewed: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    sectionViewed = typeof body?.section_viewed === 'string' ? body.section_viewed : undefined;
  } catch {
    // ignore parse errors
  }

  const userAgent = req.headers.get('user-agent') ?? '';
  const forwardedFor = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const referrer = req.headers.get('referer') ?? '';

  // Hash UA + IP for anonymised fingerprinting (no PII stored)
  const fingerprintRaw = `${userAgent}|${forwardedFor}`;
  const userAgentHash = createHash('sha256').update(fingerprintRaw).digest('hex').slice(0, 16);

  try {
    const supabase = createServiceClient();
    await supabase.from('activity_events').insert([
      {
        building_id: buildingId,
        event_type: 'im_lite_view',
        metadata: {
          referrer,
          user_agent_hash: userAgentHash,
          section_viewed: sectionViewed ?? null,
        },
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    // Non-critical — tracking failure should not break the viewer
    console.error('[im-lite/view] Failed to record view event:', err);
  }

  return NextResponse.json({ ok: true });
}
