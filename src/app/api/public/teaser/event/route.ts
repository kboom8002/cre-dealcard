import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createTeaserEvent, inferIntentFromEvents } from '@/domain/deal/teaser/teaser-insight';
import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import {
  extractShareTokenFromInput,
  verifyShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      teaserConfigId,
      visitorFp,
      eventType,
      eventData,
      metadata,
      buildingId,
      docId,
      shareToken,
      share_token,
      token,
    } = body;
    const effectiveEventData = eventData || metadata || {};

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

    // Save event to teaser_events table (non-blocking: teaser_config_id may be a buildingId or non-UUID,
    // and event_type may be 'intent.pro_im_request' which is not in teaser_events check constraint)
    try {
      const { error: insertError } = await supabase.from('teaser_events').insert({
        teaser_config_id: effectiveConfigId,
        visitor_fp: effectiveVisitorFp,
        event_type: eventType,
        event_data: effectiveEventData,
      });

      if (insertError) {
        log.warn('[teaser-event] teaser_events insert skipped:', insertError.message);
      }
    } catch (e) {
      log.warn('[teaser-event] teaser_events insert error:', e);
    }

    // Record to activity_events when buildingId or docId is present
    // Note: activity_events does NOT have top-level building_ssot_lite_id or building_id columns;
    // store them inside metadata and map 'view' -> 'deal_card_view'.
    const targetBuildingId = buildingId || docId || (teaserConfigId && teaserConfigId !== 'anon-config' ? teaserConfigId : null);
    const rawShareToken =
      (typeof shareToken === 'string' && shareToken.trim()) ||
      (typeof share_token === 'string' && share_token.trim()) ||
      (typeof token === 'string' && token.trim()) ||
      extractShareTokenFromInput(typeof effectiveEventData?.url === 'string' ? effectiveEventData.url : null) ||
      extractShareTokenFromInput(request.headers.get('referer'));

    let verifiedRecipientId: string | null = null;
    let verifiedBrokerId: string | null = null;
    let verifiedChannel: ShareLinkChannel | null = null;
    let hasShareToken = false;

    if (rawShareToken) {
      try {
        const verified = await verifyShareLinkToken({
          token: rawShareToken,
          buildingId: targetBuildingId ? String(targetBuildingId) : undefined,
        });
        if (verified.valid) {
          hasShareToken = true;
          verifiedRecipientId = verified.recipientId || null;
          verifiedBrokerId = verified.brokerId || null;
          verifiedChannel = verified.channel || null;
        }
      } catch {
        // non-blocking share token attribution fallback
      }
    }

    if (targetBuildingId) {
      const targetIdStr = String(targetBuildingId);
      const mappedEventType =
        eventType === 'view'
          ? 'deal_card_view'
          : eventType === 'dwell'
            ? 'deal_card_dwell'
            : String(eventType);
      try {
        await supabase.from('activity_events').insert({
          event_type: mappedEventType,
          entity_type: 'building',
          entity_id: isUuid(targetIdStr) ? targetIdStr : null,
          metadata: {
            ...(typeof effectiveEventData === 'object' && effectiveEventData !== null
              ? effectiveEventData
              : {}),
            building_id: String(buildingId || targetIdStr),
            ...(isUuid(targetIdStr) ? { building_ssot_lite_id: targetIdStr } : {}),
            ...(docId ? { doc_id: String(docId) } : {}),
            ...(verifiedRecipientId ? { recipient_id: verifiedRecipientId } : {}),
            ...(verifiedBrokerId ? { broker_id: verifiedBrokerId } : {}),
            ...(verifiedChannel ? { share_token_channel: verifiedChannel } : {}),
            ...(hasShareToken ? { has_share_token: true } : {}),
            visitor_fp: effectiveVisitorFp,
          },
        });
      } catch (actErr) {
        log.warn('[teaser-event] activity_events insert failed:', actErr);
      }
    }

    // On gate_request, infer buyer intent from all accumulated events
    if (eventType === 'gate_request') {
      let allEvents: any[] = [];
      try {
        const { data } = await supabase
          .from('teaser_events')
          .select('*')
          .eq('visitor_fp', effectiveVisitorFp)
          .eq('teaser_config_id', effectiveConfigId)
          .order('created_at', { ascending: true });
        if (Array.isArray(data)) {
          allEvents = data;
        }
      } catch {
        allEvents = [];
      }

      const mapped = allEvents.map((e: any) =>
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
        log.info('[teaser-event] Generated auto intents:', intents);
        
        return NextResponse.json({ ok: true, intents });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('[teaser-event] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
