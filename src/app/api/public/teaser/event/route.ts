import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createTeaserEvent, inferIntentFromEvents } from '@/domain/deal/teaser/teaser-insight';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import {
  extractShareTokenFromInput,
  verifyShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

const MAX_TEASER_EVENT_BODY_BYTES = 16 * 1024;
const TEASER_EVENT_RATE_LIMIT_PER_MIN = 60;

const PUBLIC_TEASER_ALLOWED_EVENT_TYPES = new Set([
  'view',
  'dwell',
  'slider_interact',
  'cta_click',
  'gate_request',
  'share',
  'teaser_view',
  'teaser_dwell',
  'teaser_cta_click',
  'teaser_share',
  'deal_card_view',
  'deal_card_dwell',
  'article_read',
  'magazine_read',
  'intent.pro_request',
  'intent.pro_im_request',
  'inquiry_submitted',
]);

const PII_EVENT_KEYS = new Set([
  'name',
  'phone',
  'email',
  'company',
  'requester_name',
  'requester_phone',
  'requester_email',
  'requester_company',
]);

const RESERVED_SNAPSHOT_KEYS = new Set([
  'card4',
  'broker_profile',
  'brokerProfile',
  'brokerprofile',
  'im_item',
  'imItem',
  'imitem',
  'private_memo_text',
  'published_snapshot',
  'draft_payload',
  'revoked_via',
  'actor_id',
  'status',
]);

function sanitizeEventValue(val: unknown, allowPii: boolean, depth: number): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    if (depth > 4) return [];
    return val.map((item) =>
      item && typeof item === 'object' ? sanitizeEventValue(item, allowPii, depth + 1) : item
    );
  }
  if (typeof val === 'object') {
    return sanitizeEventPayload(val, allowPii, depth + 1);
  }
  return val;
}

function sanitizeEventPayload(
  raw: unknown,
  allowPii: boolean,
  depth = 0
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (depth > 4) return {};
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (RESERVED_SNAPSHOT_KEYS.has(key) || RESERVED_SNAPSHOT_KEYS.has(lowerKey)) {
      continue;
    }
    if (!allowPii && (PII_EVENT_KEYS.has(key) || PII_EVENT_KEYS.has(lowerKey))) {
      continue;
    }
    out[key] = sanitizeEventValue(val, allowPii, depth);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const rawForwarded = request.headers.get('x-forwarded-for');
    const clientIp =
      (rawForwarded ? rawForwarded.split(',')[0]?.trim() : '') ||
      request.headers.get('x-real-ip')?.trim() ||
      'unknown';
    const rateAllowed = await checkRateLimit(
      clientIp,
      'public_teaser_event',
      TEASER_EVENT_RATE_LIMIT_PER_MIN,
      60_000,
    );
    if (!rateAllowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please try again shortly.' },
        { status: 429 },
      );
    }

    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_TEASER_EVENT_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Request body exceeds 16KB limit' },
        { status: 413 },
      );
    }

    const rawText = await request.text().catch(() => '');
    if (Buffer.byteLength(rawText, 'utf8') > MAX_TEASER_EVENT_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Request body exceeds 16KB limit' },
        { status: 413 },
      );
    }

    let rawBody: unknown = null;
    if (rawText.trim().length > 0) {
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        rawBody = null;
      }
    }
    const body =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};
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
      privacyConsent,
    } = body;
    if (typeof eventType !== 'string' || !eventType) {
      return NextResponse.json({ ok: false, error: 'Missing required field: eventType' }, { status: 400 });
    }

    if (!PUBLIC_TEASER_ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_EVENT_TYPE', error: 'Unsupported eventType' },
        { status: 400 },
      );
    }

    const allowPii =
      privacyConsent === true &&
      (eventType === 'intent.pro_im_request' ||
        eventType === 'intent.pro_request' ||
        eventType === 'gate_request' ||
        eventType === 'inquiry_submitted');
    const effectiveEventData = sanitizeEventPayload(eventData || metadata || {}, allowPii);

    const effectiveConfigId = String(teaserConfigId || buildingId || docId || 'anon-config');

    let effectiveVisitorFp = typeof visitorFp === 'string' && visitorFp ? visitorFp : '';
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

    // Record to activity_events ONLY when buildingId is explicitly provided
    const targetBuildingId = buildingId || null;
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
        const metaPayload = {
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
        };
        const fullEventRow: Record<string, unknown> = {
          building_id: targetIdStr,
          building_ssot_lite_id: targetIdStr,
          event_type: mappedEventType,
          entity_type: 'building',
          entity_id: isUuid(targetIdStr) ? targetIdStr : null,
          metadata: metaPayload,
        };
        const insRes = await supabase.from('activity_events').insert(fullEventRow);
        if (insRes?.error) {
          const code = String(insRes.error.code || '');
          const msg = String(insRes.error.message || '');
          if (
            code === '22P02' ||
            code === 'PGRST204' ||
            code === '42703' ||
            /invalid input syntax for type uuid|column .* does not exist/i.test(msg)
          ) {
            const rest: Record<string, unknown> = { ...fullEventRow };
            delete rest.building_ssot_lite_id;
            delete rest.building_id;
            await supabase.from('activity_events').insert(
              code === '22P02' && !isUuid(targetIdStr)
                ? { ...rest, building_id: targetIdStr, building_ssot_lite_id: null }
                : rest
            );
          }
        }
      } catch (actErr) {
        log.warn('[teaser-event] activity_events insert failed:', actErr);
      }
    }

    // On gate_request, infer buyer intent from all accumulated events
    if (eventType === 'gate_request') {
      let allEvents: Array<Record<string, unknown>> = [];
      try {
        const { data } = await supabase
          .from('teaser_events')
          .select('*')
          .eq('visitor_fp', effectiveVisitorFp)
          .eq('teaser_config_id', effectiveConfigId)
          .order('created_at', { ascending: true });
        if (Array.isArray(data)) {
          allEvents = data as Array<Record<string, unknown>>;
        }
      } catch {
        allEvents = [];
      }

      const mapped = allEvents.map((e) =>
        createTeaserEvent(
          String(e.teaser_config_id || effectiveConfigId),
          String(e.visitor_fp || effectiveVisitorFp),
          String(e.event_type || 'view') as Parameters<typeof createTeaserEvent>[2],
          (e.event_data && typeof e.event_data === 'object' ? (e.event_data as Record<string, unknown>) : {})
        )
      );
      const intent = inferIntentFromEvents(mapped);
      return NextResponse.json({ ok: true, intent });
    }

    if (eventType === 'magazine_read' || eventType === 'article_read') {
      const rawEventObj =
        eventData && typeof eventData === 'object' ? (eventData as Record<string, unknown>) : null;
      // If the client passed an interest profile in the event data, use it
      if (rawEventObj?.profile) {
        const { generateAutoIntents } = await import('@/domain/magazine/subscriber-profile');
        const intents = generateAutoIntents(
          rawEventObj.profile as Parameters<typeof generateAutoIntents>[0]
        );
        
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
