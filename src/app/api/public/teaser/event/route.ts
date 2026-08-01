import { NextResponse } from 'next/server';
import { createTeaserEvent, inferIntentFromEvents } from '@/domain/deal/teaser/teaser-insight';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { teaserConfigId, visitorFp, eventType, eventData } = body;

    if (!teaserConfigId || !visitorFp || !eventType) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Save event to teaser_events table
    const { error: insertError } = await supabase.from('teaser_events').insert({
      teaser_config_id: teaserConfigId,
      visitor_fp: visitorFp,
      event_type: eventType,
      event_data: eventData || {},
    });

    if (insertError) {
      console.error('[teaser-event] Insert failed:', insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // On gate_request, infer buyer intent from all accumulated events
    if (eventType === 'gate_request') {
      const { data: allEvents } = await supabase
        .from('teaser_events')
        .select('*')
        .eq('visitor_fp', visitorFp)
        .eq('teaser_config_id', teaserConfigId)
        .order('created_at', { ascending: true });

      const mapped = (allEvents || []).map((e: any) =>
        createTeaserEvent(e.teaser_config_id, e.visitor_fp, e.event_type, e.event_data || {})
      );
      const intent = inferIntentFromEvents(mapped);
      return NextResponse.json({ ok: true, intent });
    }

    if (eventType === 'magazine_read' || eventType === 'article_read') {
      // If the client passed an interest profile in the event data, use it
      if (eventData.profile) {
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
