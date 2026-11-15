import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import { normalizeClientEmail } from '@/domain/inbox/inbox-outbound';

const SVIX_TIMESTAMP_TOLERANCE_SEC = 300;

declare global {
  // eslint-disable-next-line no-var
  var __CRE_RESEND_WEBHOOK_FALLBACK_IDS__: Set<string> | undefined;
}

function getFallbackIdSet(): Set<string> {
  if (!globalThis.__CRE_RESEND_WEBHOOK_FALLBACK_IDS__) {
    globalThis.__CRE_RESEND_WEBHOOK_FALLBACK_IDS__ = new Set<string>();
  }
  return globalThis.__CRE_RESEND_WEBHOOK_FALLBACK_IDS__;
}

function isIgnorableSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const code = String((err as { code?: unknown }).code || '');
  if (
    code === 'PGRST116' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703'
  ) {
    return true;
  }
  const msg = String((err as { message?: unknown }).message || '');
  return /relationship|does not exist|schema cache/i.test(msg);
}

function extractRecipientEmails(rawTo: unknown): string[] {
  const rawItems: string[] = Array.isArray(rawTo)
    ? rawTo.filter((item): item is string => typeof item === 'string')
    : typeof rawTo === 'string'
      ? [rawTo]
      : [];

  const normalized = new Set<string>();
  for (const raw of rawItems) {
    const angleMatch = raw.match(/<([^>]+)>/);
    const candidate = angleMatch ? angleMatch[1] : raw;
    const clean = normalizeClientEmail(candidate);
    if (clean) {
      normalized.add(clean);
    }
  }
  return Array.from(normalized);
}

export function verifyResendSvixSignature(params: {
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  webhookSecret: string;
  nowEpochSec?: number;
}): { ok: boolean; status: number; error?: string } {
  const rawSecret = params.webhookSecret.trim();
  if (!rawSecret) {
    return {
      ok: false,
      status: 503,
      error: 'RESEND_WEBHOOK_SECRET is not configured.',
    };
  }

  const svixId = params.svixId.trim();
  const svixTimestamp = params.svixTimestamp.trim();
  const svixSignature = params.svixSignature.trim();

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      ok: false,
      status: 401,
      error: 'Missing required Svix webhook signature headers.',
    };
  }

  if (!/^\d+$/.test(svixTimestamp)) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid Svix webhook timestamp.',
    };
  }

  const tsSec = Number(svixTimestamp);
  const nowSec = params.nowEpochSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > SVIX_TIMESTAMP_TOLERANCE_SEC) {
    return {
      ok: false,
      status: 401,
      error: 'Expired or out-of-window Svix webhook timestamp.',
    };
  }

  const base64Secret = rawSecret.replace(/^whsec_/, '');
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(base64Secret, 'base64');
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Invalid RESEND_WEBHOOK_SECRET encoding.',
    };
  }

  if (secretBytes.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'Invalid empty RESEND_WEBHOOK_SECRET.',
    };
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${params.rawBody}`;
  const expectedSigB64 = crypto
    .createHmac('sha256', secretBytes)
    .update(signedPayload, 'utf8')
    .digest('base64');
  const expectedBuf = Buffer.from(expectedSigB64, 'utf8');

  const candidates = svixSignature.split(/\s+/).filter(Boolean);
  for (const token of candidates) {
    const commaIdx = token.indexOf(',');
    if (commaIdx <= 0) continue;
    const version = token.slice(0, commaIdx).trim();
    const sigValue = token.slice(commaIdx + 1).trim();
    if (version !== 'v1' || !sigValue) continue;

    const candBuf = Buffer.from(sigValue, 'utf8');
    if (candBuf.length === expectedBuf.length && crypto.timingSafeEqual(candBuf, expectedBuf)) {
      return { ok: true, status: 200 };
    }
  }

  return {
    ok: false,
    status: 401,
    error: 'Invalid Svix webhook HMAC signature.',
  };
}

export async function POST(req: NextRequest) {
  const webhookSecret = (process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: 'RESEND_WEBHOOK_SECRET is not configured.' },
      { status: 503 }
    );
  }

  const svixId =
    req.headers.get('svix-id') || req.headers.get('webhook-id') || '';
  const svixTimestamp =
    req.headers.get('svix-timestamp') || req.headers.get('webhook-timestamp') || '';
  const svixSignature =
    req.headers.get('svix-signature') || req.headers.get('webhook-signature') || '';

  const rawBody = await req.text();

  const verification = verifyResendSvixSignature({
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    webhookSecret,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.error || 'Unauthorized webhook request.' },
      { status: verification.status }
    );
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody) as Record<string, any>;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Malformed JSON payload.' },
      { status: 400 }
    );
  }

  const eventType = String(payload?.type || '').trim();
  if (
    eventType !== 'email.bounced' &&
    eventType !== 'email.complained' &&
    eventType !== 'email.delivered'
  ) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      type: eventType || 'unknown',
    });
  }

  const data =
    payload?.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, any>)
      : {};
  const recipients = extractRecipientEmails(data.to);
  if (recipients.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: 'no_valid_recipient',
    });
  }

  const emailId =
    typeof data.email_id === 'string' && data.email_id.trim()
      ? data.email_id.trim()
      : typeof data.id === 'string' && data.id.trim()
        ? data.id.trim()
        : null;
  const occurredAt =
    typeof payload?.created_at === 'string' && payload.created_at.trim()
      ? payload.created_at.trim()
      : new Date().toISOString();

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Database service client unavailable.' },
      { status: 503 }
    );
  }

  const cleanSvixId = svixId.trim();

  // Idempotency guard via svix-id against activity_events (with fallback Set if select fails)
  try {
    let dupQ: any = supabase
      .from('activity_events')
      .select('id, event_type, metadata, created_at');
    if (typeof dupQ?.in === 'function') {
      dupQ = dupQ.in('event_type', ['email_bounced', 'email_complained', 'email_delivered']);
    }
    if (typeof dupQ?.order === 'function') {
      dupQ = dupQ.order('created_at', { ascending: false });
    }
    if (typeof dupQ?.limit === 'function') {
      dupQ = dupQ.limit(200);
    }
    const dupRes = await dupQ;
    if (!dupRes?.error && Array.isArray(dupRes?.data)) {
      const alreadyHandled = dupRes.data.some((ev: any) => {
        const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        return String(meta.svix_id || '') === cleanSvixId;
      });
      if (alreadyHandled) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          svixId: cleanSvixId,
        });
      }
    } else if (getFallbackIdSet().has(cleanSvixId)) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        svixId: cleanSvixId,
      });
    }
  } catch {
    if (getFallbackIdSet().has(cleanSvixId)) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        svixId: cleanSvixId,
      });
    }
  }

  const isBounceOrComplaint =
    eventType === 'email.bounced' || eventType === 'email.complained';
  const deliveryStatus: 'bounced' | 'complained' | 'ok' =
    eventType === 'email.complained'
      ? 'complained'
      : eventType === 'email.bounced'
        ? 'bounced'
        : 'ok';
  const auditEventType: 'email_bounced' | 'email_complained' | 'email_delivered' =
    eventType === 'email.complained'
      ? 'email_complained'
      : eventType === 'email.bounced'
        ? 'email_bounced'
        : 'email_delivered';

  const bounceReason = isBounceOrComplaint
    ? String(
        data?.bounce?.message ||
          data?.bounce?.description ||
          data?.complaint?.feedback_type ||
          data?.reason ||
          (eventType === 'email.complained'
            ? '수신자 스팸 신고 접수'
            : '수신 서버 반송 (배달 불가)')
      ).trim()
    : null;

  let updatedClients = 0;
  let updatedSubscribers = 0;
  let recordedEvents = 0;

  for (const email of recipients) {
    const matchedBrokerIds = new Set<string>();
    const brokerSlugsToResolve = new Set<string>();
    let matchedThreadId: string | null = null;
    let matchedBuildingUuid: string | null = null;

    // 1. Match & update broker_clients
    try {
      let cliQ: any = supabase
        .from('broker_clients')
        .select('id, broker_id, email, tags')
        .eq('email', email);
      let cliRes = await cliQ;
      let matchedCliRows = Array.isArray(cliRes?.data) ? cliRes.data : [];

      if (matchedCliRows.length === 0) {
        let scanQ: any = supabase
          .from('broker_clients')
          .select('id, broker_id, email, tags');
        if (typeof scanQ?.limit === 'function') {
          scanQ = scanQ.limit(200);
        }
        const scanRes = await scanQ;
        if (Array.isArray(scanRes?.data)) {
          matchedCliRows = scanRes.data.filter(
            (r: any) => normalizeClientEmail(r?.email) === email
          );
        }
      }

      for (const row of matchedCliRows) {
        const rowId = String(row?.id || '').trim();
        const rowBrokerId = String(row?.broker_id || '').trim();
        if (isUuid(rowBrokerId)) {
          matchedBrokerIds.add(rowBrokerId);
        }
        if (rowId && !matchedThreadId) {
          matchedThreadId = `custom_${rowId}`;
        }

        if (isBounceOrComplaint && rowId) {
          const prevTags = Array.isArray(row?.tags)
            ? row.tags.map((t: unknown) => String(t))
            : [];
          const nextTags =
            deliveryStatus === 'complained'
              ? Array.from(new Set([...prevTags, '수신거부']))
              : prevTags;

          const structuredPatch: Record<string, any> = {
            email_delivery_status: deliveryStatus,
            email_bounced_at: occurredAt,
            email_bounce_reason: bounceReason,
            ...(deliveryStatus === 'complained' ? { tags: nextTags } : {}),
          };

          const updRes = await supabase
            .from('broker_clients')
            .update(structuredPatch)
            .eq('id', rowId);

          if (updRes?.error && isIgnorableSchemaError(updRes.error)) {
            if (deliveryStatus === 'complained') {
              await supabase
                .from('broker_clients')
                .update({ tags: nextTags })
                .eq('id', rowId);
            }
          }
          updatedClients += 1;
        }
      }
    } catch {
      // non-blocking if broker_clients unavailable
    }

    // 2. Match & update magazine_subscribers
    try {
      let subQ: any = supabase
        .from('magazine_subscribers')
        .select('id, broker_id, broker_user_id, subscriber_email, status')
        .eq('subscriber_email', email);
      let subRes = await subQ;
      if (subRes?.error && isIgnorableSchemaError(subRes.error)) {
        subQ = supabase
          .from('magazine_subscribers')
          .select('id, broker_id, subscriber_email, status')
          .eq('subscriber_email', email);
        subRes = await subQ;
      }

      let matchedSubRows = Array.isArray(subRes?.data) ? subRes.data : [];
      if (matchedSubRows.length === 0) {
        let scanSubQ: any = supabase.from('magazine_subscribers').select('*');
        if (typeof scanSubQ?.limit === 'function') {
          scanSubQ = scanSubQ.limit(200);
        }
        const scanSubRes = await scanSubQ;
        if (Array.isArray(scanSubRes?.data)) {
          matchedSubRows = scanSubRes.data.filter(
            (r: any) => normalizeClientEmail(r?.subscriber_email ?? r?.email) === email
          );
        }
      }

      for (const sRow of matchedSubRows) {
        const subId = String(sRow?.id || '').trim();
        const bUserId = String(sRow?.broker_user_id || '').trim();
        const bKey = String(sRow?.broker_id || '').trim();
        if (isUuid(bUserId)) {
          matchedBrokerIds.add(bUserId);
        } else if (isUuid(bKey)) {
          matchedBrokerIds.add(bKey);
        } else if (bKey) {
          brokerSlugsToResolve.add(bKey);
        }
        if (subId && !matchedThreadId) {
          matchedThreadId = `sub_${subId}`;
        }

        if (isBounceOrComplaint && subId) {
          const fullSubPatch: Record<string, any> =
            deliveryStatus === 'complained'
              ? {
                  email_delivery_status: 'complained',
                  email_bounced_at: occurredAt,
                  email_bounce_reason: bounceReason,
                  status: 'unsubscribed',
                  unsubscribed_at: occurredAt,
                }
              : {
                  email_delivery_status: 'bounced',
                  email_bounced_at: occurredAt,
                  email_bounce_reason: bounceReason,
                };

          const subUpdRes = await supabase
            .from('magazine_subscribers')
            .update(fullSubPatch)
            .eq('id', subId);

          if (subUpdRes?.error && isIgnorableSchemaError(subUpdRes.error)) {
            if (deliveryStatus === 'complained') {
              await supabase
                .from('magazine_subscribers')
                .update({
                  status: 'unsubscribed',
                  unsubscribed_at: occurredAt,
                })
                .eq('id', subId);
            }
          }
          updatedSubscribers += 1;
        }
      }
    } catch {
      // non-blocking if magazine_subscribers unavailable
    }

    // Resolve broker user_ids from slugs if needed
    if (brokerSlugsToResolve.size > 0) {
      try {
        let bpQ: any = supabase
          .from('broker_profiles')
          .select('user_id, slug');
        const slugArr = Array.from(brokerSlugsToResolve);
        if (typeof bpQ?.in === 'function') {
          bpQ = bpQ.in('slug', slugArr);
        }
        const bpRes = await bpQ;
        for (const bp of Array.isArray(bpRes?.data) ? bpRes.data : []) {
          if (slugArr.includes(String(bp?.slug || '')) && isUuid(bp?.user_id)) {
            matchedBrokerIds.add(String(bp.user_id));
          }
        }
      } catch {
        // ignore if broker_profiles unavailable
      }
    }

    // 3. Also correlate recent outbound email events (inbox_email_sent) for actor_id / thread_id
    try {
      let sentQ: any = supabase
        .from('activity_events')
        .select('actor_id, entity_id, event_type, metadata, created_at');
      if (typeof sentQ?.in === 'function') {
        sentQ = sentQ.in('event_type', ['inbox_email_sent', 'custom_client_upserted']);
      }
      if (typeof sentQ?.order === 'function') {
        sentQ = sentQ.order('created_at', { ascending: false });
      }
      if (typeof sentQ?.limit === 'function') {
        sentQ = sentQ.limit(100);
      }
      const sentRes = await sentQ;
      for (const ev of Array.isArray(sentRes?.data) ? sentRes.data : []) {
        const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        const evEmail = normalizeClientEmail(
          meta.to_email ?? meta.client_email ?? meta.email
        );
        const evMsgId = typeof meta.message_id === 'string' ? meta.message_id : null;
        if (evEmail === email || (emailId && evMsgId === emailId)) {
          if (isUuid(ev?.actor_id)) {
            matchedBrokerIds.add(String(ev.actor_id));
          }
          if (!matchedThreadId && (meta.thread_id || meta.client_id)) {
            matchedThreadId = String(meta.thread_id || meta.client_id);
          }
          const bCandidate = String(meta.building_id || ev?.entity_id || '');
          if (!matchedBuildingUuid && isUuid(bCandidate)) {
            matchedBuildingUuid = bCandidate;
          }
        }
      }
    } catch {
      // ignore
    }

    // 4. Insert durable audit event(s) into activity_events
    const baseMetadata: Record<string, any> = {
      email,
      to_email: email,
      email_id: emailId,
      svix_id: cleanSvixId,
      thread_id: matchedThreadId,
      ...(bounceReason ? { reason: bounceReason } : {}),
    };

    const brokerTargets =
      matchedBrokerIds.size > 0 ? Array.from(matchedBrokerIds) : [null];

    for (const targetBrokerId of brokerTargets) {
      const entityUuid = matchedBuildingUuid || targetBrokerId || null;
      const insRes = await supabase.from('activity_events').insert({
        actor_id: targetBrokerId,
        actor_role: 'system',
        event_type: auditEventType,
        entity_type: entityUuid ? 'building' : 'email',
        entity_id: entityUuid,
        metadata: baseMetadata,
        created_at: occurredAt,
      });
      if (!insRes?.error) {
        recordedEvents += 1;
      }
    }
  }

  getFallbackIdSet().add(cleanSvixId);

  return NextResponse.json({
    ok: true,
    type: eventType,
    svixId: cleanSvixId,
    recipients,
    updatedClients,
    updatedSubscribers,
    recordedEvents,
  });
}
