import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createTeaserEvent, inferIntentFromEvents } from '@/domain/deal/teaser/teaser-insight';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { teaserConfigId, visitorFp, eventType, eventData, buildingId, docId } = body;

    if (!eventType) {
      return NextResponse.json({ ok: false, error: 'Missing required field: eventType' }, { status: 400 });
    }

    const effectiveConfigId = teaserConfigId || buildingId || docId || 'anon-config';

    let effectiveVisitorFp = visitorFp;
    if (!effectiveVisitorFp) {
      const userAgent = request.headers.get('user-agent') ?? '';
      const forwardedFor = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';
      if (userAgent || forwardedFor) {
        effectiveVisitorFp = 'anon_' + createHash('sha256').update(`${userAgent}|${forwardedFor}`).digest('hex').slice(0, 16);
      } else {
        effectiveVisitorFp = 'anon_' + Date.now().toString(36);
      }
    }

    const supabase = createServiceClient();

    // Save event to teaser_events table
    const { error: insertError } = await supabase.from('teaser_events').insert({
      teaser_config_id: effectiveConfigId,
      visitor_fp: effectiveVisitorFp,
      event_type: eventType,
      event_data: eventData || {},
    });

    if (insertError) {
      console.error('[teaser-event] Insert failed:', insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // Also record to activity_events if buildingId is present
    if (buildingId) {
      await supabase.from('activity_events').insert({
        building_ssot_lite_id: buildingId,
        building_id: buildingId,
        event_type: eventType,
        metadata: eventData || {},
      });
    }

    // On gate_request, infer buyer intent from all accumulated events
    if (eventType === 'gate_request') {
      const { data: allEvents } = await supabase
        .from('teaser_events')
        .select('*')
        .eq('visitor_fp', effectiveVisitorFp)
        .eq('teaser_config_id', effectiveConfigId)
        .order('created_at', { ascending: true });

      const mapped = (allEvents || []).map((e: any) =>
        createTeaserEvent(e.teaser_config_id, e.visitor_fp, e.event_type, e.event_data || {})
      );
      const intent = inferIntentFromEvents(mapped);
      return NextResponse.json({ ok: true, intent });
    }

    if (eventType === 'magazine_read' || eventType === 'article_read') {
      // If the client passed an interest profile in the event data, use it
      if (eventData?.profile) {
        const { generateAutoIntents } = await import('@/domain/magazine/subscriber-profile');
        const intents = generateAutoIntents(eventData.profile);
        
        // Example: Log or store intents
        console.info('[teaser-event] Generated auto intents:', intents);
        
        return NextResponse.json({ ok: true, intents });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[teaser-event] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
