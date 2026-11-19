import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import { normalizeClientEmail } from '@/domain/inbox/inbox-outbound';
import { hashEmailForSuppression, recordEmailSuppression } from '@/lib/legal/email-suppression';
import { escapeIlike } from '@/lib/utils/postgrest-escape';
import { maskEmail, redactPiiInText } from '@/lib/magazine/pii';

const SVIX_TIMESTAMP_TOLERANCE_SEC = 300;
/** svix-id 중복 검사 창 — Svix 재전송 스케줄(최대 약 하루+)을 넉넉히 덮는 3일 */
const SVIX_DUPLICATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** 대상 조회 상한(같은 이메일의 행이 비정상적으로 많아도 무한 스캔하지 않는다) */
const RECIPIENT_MATCH_LIMIT = 100;

/**
 * P1-4: activity_events 는 email_bounced/complained 가 영구 보존 대상이므로 평문 이메일을 남기지 않는다.
 * email_suppressions 와 같은 해시(sha256 of normalized email)로 매칭하고, 사람이 읽을 표시는 마스킹 값만 둔다.
 */
function recipientAuditFields(email: string): { email_hash: string; email_masked: string } {
  return { email_hash: hashEmailForSuppression(email), email_masked: maskEmail(email) };
}

/**
 * P2-4: 수신자 이메일로 행을 **대상 조회**한다(테넌트 전체 스캔 금지).
 *  1) 정규화(소문자·trim) 이메일 정확 일치 `.eq`
 *  2) 없으면 대소문자 무시 정확 일치 `.ilike`(와일드카드 이스케이프) — 레거시 대문자 저장 행 호환
 * 필요한 컬럼만, RECIPIENT_MATCH_LIMIT 상한. 결과는 다시 정규화 비교로 거른다.
 */
type LooseQuery = PromiseLike<{ data?: unknown; error?: unknown }> & {
  eq?: (col: string, val: unknown) => LooseQuery;
  ilike?: (col: string, val: string) => LooseQuery;
  in?: (col: string, vals: unknown[]) => LooseQuery;
  gte?: (col: string, val: string) => LooseQuery;
  order?: (col: string, opts?: { ascending?: boolean }) => LooseQuery;
  limit?: (n: number) => LooseQuery;
};
type LooseDb = { from: (table: string) => { select: (cols: string) => LooseQuery } };

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

async function findRowsByRecipientEmail(
  supabase: unknown,
  table: string,
  columns: string,
  emailColumn: string,
  email: string,
): Promise<{ rows: Array<Record<string, unknown>>; error: unknown }> {
  const db = supabase as LooseDb;
  const sameEmail = (r: Record<string, unknown>) =>
    normalizeClientEmail(typeof r?.[emailColumn] === 'string' ? (r[emailColumn] as string) : null) === email;

  let exactQ: LooseQuery = db.from(table).select(columns);
  if (typeof exactQ.eq !== 'function') return { rows: [], error: null };
  exactQ = exactQ.eq(emailColumn, email);
  if (typeof exactQ.limit === 'function') exactQ = exactQ.limit(RECIPIENT_MATCH_LIMIT);
  const exactRes = await exactQ;
  if (exactRes?.error) return { rows: [], error: exactRes.error };
  const exactRows = (Array.isArray(exactRes?.data) ? exactRes.data : []) as Array<Record<string, unknown>>;
  if (exactRows.length > 0) return { rows: exactRows, error: null };

  let ciQ: LooseQuery = db.from(table).select(columns);
  if (typeof ciQ.ilike !== 'function') return { rows: [], error: null };
  ciQ = ciQ.ilike(emailColumn, escapeIlike(email));
  if (typeof ciQ.limit === 'function') ciQ = ciQ.limit(RECIPIENT_MATCH_LIMIT);
  const ciRes = await ciQ;
  if (ciRes?.error) return { rows: [], error: ciRes.error };
  const ciRows = (Array.isArray(ciRes?.data) ? ciRes.data : []) as Array<Record<string, unknown>>;
  return { rows: ciRows.filter(sameEmail), error: null };
}

declare global {
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

  let payload: Record<string, unknown>;
  try {
    const parsedJson: unknown = JSON.parse(rawBody);
    if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
      return NextResponse.json(
        { ok: false, error: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }
    payload = parsedJson as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Malformed JSON payload.' },
      { status: 400 }
    );
  }

  const eventType = String(payload.type || '').trim();
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

  const data = asRecord(payload.data);
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
    typeof payload.created_at === 'string' && payload.created_at.trim()
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

  const looseDb = supabase as unknown as LooseDb;
  const cleanSvixId = svixId.trim();

  // Idempotency guard: prefer indexed JSON filter metadata->>svix_id beyond 200 rows,
  // falling back to in-memory Set and bounded recent event scan when JSON path eq fails.
  const duplicateResponse = () =>
    NextResponse.json({
      ok: true,
      duplicate: true,
      svixId: cleanSvixId,
    });

  if (getFallbackIdSet().has(cleanSvixId)) {
    return duplicateResponse();
  }

  try {
    let jsonDupErr: unknown = null;
    let jsonDupSupported = false;
    // 경계 있는 대상 조회: svix_id 일치 + 웹훅 감사 이벤트 유형 + 최근 재전송 창(Svix 재시도 ≤ 수일) + limit
    const dupWindowStartIso = new Date(Date.now() - SVIX_DUPLICATE_WINDOW_MS).toISOString();

    let fastDupQ: LooseQuery = looseDb
      .from('activity_events')
      .select('id, metadata');
    if (typeof fastDupQ.eq === 'function') {
      fastDupQ = fastDupQ.eq('metadata->>svix_id', cleanSvixId);
      jsonDupSupported = true;
    }
    if (typeof fastDupQ.in === 'function') {
      fastDupQ = fastDupQ.in('event_type', ['email_bounced', 'email_complained', 'email_delivered']);
    }
    if (typeof fastDupQ.gte === 'function') {
      fastDupQ = fastDupQ.gte('created_at', dupWindowStartIso);
    }
    if (typeof fastDupQ.limit === 'function') {
      fastDupQ = fastDupQ.limit(1);
    }

    if (jsonDupSupported) {
      const fastRes = await fastDupQ;
      jsonDupErr = fastRes?.error || null;
      if (!fastRes?.error && Array.isArray(fastRes?.data)) {
        const fastMatched = fastRes.data.some((ev: unknown) => {
          const meta = asRecord(asRecord(ev).metadata);
          return String(meta.svix_id || '') === cleanSvixId;
        });
        if (fastMatched) {
          getFallbackIdSet().add(cleanSvixId);
          return duplicateResponse();
        }
      }
    }

    if (!jsonDupSupported || jsonDupErr || process.env.VITEST) {
      let dupQ: LooseQuery = looseDb
        .from('activity_events')
        .select('id, metadata');
      if (typeof dupQ.in === 'function') {
        dupQ = dupQ.in('event_type', ['email_bounced', 'email_complained', 'email_delivered']);
      }
      if (typeof dupQ.gte === 'function') {
        dupQ = dupQ.gte('created_at', dupWindowStartIso);
      }
      if (typeof dupQ.order === 'function') {
        dupQ = dupQ.order('created_at', { ascending: false });
      }
      if (typeof dupQ.limit === 'function') {
        dupQ = dupQ.limit(200);
      }
      const dupRes = await dupQ;
      if (!dupRes?.error && Array.isArray(dupRes?.data)) {
        const alreadyHandled = dupRes.data.some((ev: unknown) => {
          const meta = asRecord(asRecord(ev).metadata);
          return String(meta.svix_id || '') === cleanSvixId;
        });
        if (alreadyHandled) {
          getFallbackIdSet().add(cleanSvixId);
          return duplicateResponse();
        }
      }
    }
  } catch {
    if (getFallbackIdSet().has(cleanSvixId)) {
      return duplicateResponse();
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

  const bounceObj = asRecord(data.bounce);
  const complaintObj = asRecord(data.complaint);
  const bounceReason = isBounceOrComplaint
    ? String(
        bounceObj.message ||
          bounceObj.description ||
          complaintObj.feedback_type ||
          data.reason ||
          (eventType === 'email.complained'
            ? '수신자 스팸 신고 접수'
            : '수신 서버 반송 (배달 불가)')
      ).trim()
    : null;

  let updatedClients = 0;
  let updatedSubscribers = 0;
  let recordedEvents = 0;

  for (const email of recipients) {
    const emailHash = hashEmailForSuppression(email);
    const matchedBrokerIds = new Set<string>();
    const brokerSlugsToResolve = new Set<string>();
    // WP-7.4E P1-2: keep per-broker thread & building attribution maps instead of
    // overwriting a single shared matchedThreadId from the first tenant row.
    const brokerThreadMap = new Map<string, string>();
    const slugThreadMap = new Map<string, string>();
    const matchedSentThreadByBroker = new Map<string, string>();
    const matchedBuildingByBroker = new Map<string, string>();
    let unattributedThreadId: string | null = null;
    let unattributedBuildingUuid: string | null = null;

    // 1. Match & update broker_clients
    try {
      const cliMatch = await findRowsByRecipientEmail(supabase, 'broker_clients', 'id, broker_id, email, tags', 'email', email);
      const matchedCliRows: Array<Record<string, unknown>> = cliMatch.rows;

      for (const row of matchedCliRows) {
        const rowId = String(row?.id || '').trim();
        const rowBrokerId = String(row?.broker_id || '').trim();
        if (isUuid(rowBrokerId)) {
          matchedBrokerIds.add(rowBrokerId);
          if (rowId && !brokerThreadMap.has(rowBrokerId)) {
            brokerThreadMap.set(rowBrokerId, `custom_${rowId}`);
          }
        }
        if (rowId && !unattributedThreadId) {
          unattributedThreadId = `custom_${rowId}`;
        }

        if (isBounceOrComplaint && rowId) {
          const prevTags = Array.isArray(row?.tags)
            ? row.tags.map((t: unknown) => String(t))
            : [];
          const nextTags =
            deliveryStatus === 'complained'
              ? Array.from(
                  new Set([
                    ...prevTags.filter((t) => !/뉴스레터구독|수신동의/i.test(t)),
                    '수신거부',
                  ])
                )
              : prevTags;

          const structuredPatch: Record<string, unknown> = {
            email_delivery_status: deliveryStatus,
            email_bounced_at: occurredAt,
            email_bounce_reason: bounceReason,
            ...(deliveryStatus === 'complained'
              ? { tags: nextTags, consent_status: 'unsubscribed', unsubscribed_at: occurredAt }
              : {}),
          };

          let updRes = await supabase
            .from('broker_clients')
            .update(structuredPatch)
            .eq('id', rowId);

          if (updRes?.error && isIgnorableSchemaError(updRes.error) && deliveryStatus === 'complained') {
            updRes = await supabase
              .from('broker_clients')
              .update({
                email_delivery_status: deliveryStatus,
                email_bounced_at: occurredAt,
                email_bounce_reason: bounceReason,
                tags: nextTags,
              })
              .eq('id', rowId);
            if (updRes?.error && isIgnorableSchemaError(updRes.error)) {
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
      let subMatch = await findRowsByRecipientEmail(
        supabase,
        'magazine_subscribers',
        'id, broker_id, broker_user_id, subscriber_email, status',
        'subscriber_email',
        email,
      );
      if (subMatch.error && isIgnorableSchemaError(subMatch.error)) {
        subMatch = await findRowsByRecipientEmail(
          supabase,
          'magazine_subscribers',
          'id, broker_id, subscriber_email, status',
          'subscriber_email',
          email,
        );
      }
      const matchedSubRows: Array<Record<string, unknown>> = subMatch.rows;

      for (const sRow of matchedSubRows) {
        const subId = String(sRow?.id || '').trim();
        const bUserId = String(sRow?.broker_user_id || '').trim();
        const bKey = String(sRow?.broker_id || '').trim();
        if (isUuid(bUserId)) {
          matchedBrokerIds.add(bUserId);
          if (subId && !brokerThreadMap.has(bUserId)) {
            brokerThreadMap.set(bUserId, `sub_${subId}`);
          }
        } else if (isUuid(bKey)) {
          matchedBrokerIds.add(bKey);
          if (subId && !brokerThreadMap.has(bKey)) {
            brokerThreadMap.set(bKey, `sub_${subId}`);
          }
        } else if (bKey) {
          brokerSlugsToResolve.add(bKey);
          if (subId && !slugThreadMap.has(bKey)) {
            slugThreadMap.set(bKey, `sub_${subId}`);
          }
        }
        if (subId && !unattributedThreadId) {
          unattributedThreadId = `sub_${subId}`;
        }

        if (isBounceOrComplaint && subId) {
          const fullSubPatch: Record<string, unknown> =
            deliveryStatus === 'complained'
              ? {
                  email_delivery_status: 'complained',
                  email_bounced_at: occurredAt,
                  email_bounce_reason: bounceReason,
                  status: 'unsubscribed',
                  consent_status: 'unsubscribed',
                  unsubscribed_at: occurredAt,
                }
              : {
                  email_delivery_status: 'bounced',
                  email_bounced_at: occurredAt,
                  email_bounce_reason: bounceReason,
                };

          let subUpdRes = await supabase
            .from('magazine_subscribers')
            .update(fullSubPatch)
            .eq('id', subId);

          if (subUpdRes?.error && isIgnorableSchemaError(subUpdRes.error) && deliveryStatus === 'complained') {
            subUpdRes = await supabase
              .from('magazine_subscribers')
              .update({
                email_delivery_status: 'complained',
                email_bounced_at: occurredAt,
                email_bounce_reason: bounceReason,
                status: 'unsubscribed',
                unsubscribed_at: occurredAt,
              })
              .eq('id', subId);
            if (subUpdRes?.error && isIgnorableSchemaError(subUpdRes.error)) {
              subUpdRes = await supabase
                .from('magazine_subscribers')
                .update({
                  status: 'unsubscribed',
                  consent_status: 'unsubscribed',
                  unsubscribed_at: occurredAt,
                })
                .eq('id', subId);
              if (subUpdRes?.error && isIgnorableSchemaError(subUpdRes.error)) {
                await supabase
                  .from('magazine_subscribers')
                  .update({
                    status: 'unsubscribed',
                    unsubscribed_at: occurredAt,
                  })
                  .eq('id', subId);
              }
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
        let bpQ: LooseQuery = looseDb
          .from('broker_profiles')
          .select('user_id, slug');
        const slugArr = Array.from(brokerSlugsToResolve);
        if (typeof bpQ.in === 'function') {
          bpQ = bpQ.in('slug', slugArr);
        }
        const bpRes = await bpQ;
        for (const bpRaw of Array.isArray(bpRes?.data) ? bpRes.data : []) {
          const bp = asRecord(bpRaw);
          const slug = String(bp.slug || '');
          const uid = String(bp.user_id || '');
          if (slugArr.includes(slug) && isUuid(uid)) {
            matchedBrokerIds.add(uid);
            const subTid = slugThreadMap.get(slug);
            if (subTid && !brokerThreadMap.has(uid)) {
              brokerThreadMap.set(uid, subTid);
            }
          }
        }
      } catch {
        // ignore if broker_profiles unavailable
      }
    }

    // 3. Also correlate recent outbound email events (inbox_email_sent) for actor_id / thread_id
    try {
      let sentQ: LooseQuery = looseDb
        .from('activity_events')
        .select('actor_id, entity_id, event_type, metadata, created_at');
      if (typeof sentQ.in === 'function') {
        sentQ = sentQ.in('event_type', ['inbox_email_sent', 'custom_client_upserted']);
      }
      if (typeof sentQ.order === 'function') {
        sentQ = sentQ.order('created_at', { ascending: false });
      }
      if (typeof sentQ.limit === 'function') {
        sentQ = sentQ.limit(100);
      }
      const sentRes = await sentQ;
      for (const evRaw of Array.isArray(sentRes?.data) ? sentRes.data : []) {
        const ev = asRecord(evRaw);
        const meta = asRecord(ev.metadata);
        const evEmail = normalizeClientEmail(
          typeof (meta.to_email ?? meta.client_email ?? meta.email) === 'string'
            ? String(meta.to_email ?? meta.client_email ?? meta.email)
            : null
        );
        const evEmailHash =
          typeof meta.email_hash === 'string' ? meta.email_hash.trim().toLowerCase() : '';
        const evMsgId = typeof meta.message_id === 'string' && meta.message_id.trim() ? meta.message_id.trim() : null;
        const exactMessageMatch = Boolean(emailId && evMsgId === emailId);
        if (exactMessageMatch || evEmail === email || (evEmailHash && evEmailHash === emailHash)) {
          const actorId = typeof ev.actor_id === 'string' ? ev.actor_id.trim() : '';
          const evTid = String(meta.thread_id || meta.client_id || '').trim();
          const bCandidate = String(meta.building_id || ev.entity_id || '').trim();
          if (isUuid(actorId)) {
            matchedBrokerIds.add(actorId);
            if (evTid && (exactMessageMatch || !matchedSentThreadByBroker.has(actorId))) {
              matchedSentThreadByBroker.set(actorId, evTid);
            }
            if (isUuid(bCandidate) && (exactMessageMatch || !matchedBuildingByBroker.has(actorId))) {
              matchedBuildingByBroker.set(actorId, bCandidate);
            }
          } else {
            if (evTid && !unattributedThreadId) {
              unattributedThreadId = evTid;
            }
            if (isUuid(bCandidate) && !unattributedBuildingUuid) {
              unattributedBuildingUuid = bCandidate;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 4. Insert durable audit event(s) into activity_events
    // P1-4: 영구 보존 이벤트에 평문 이메일(email/to_email)을 저장하지 않는다 — 해시 + 마스킹만.
    const auditRecipient = recipientAuditFields(email);
    if (isBounceOrComplaint) {
      await recordEmailSuppression(supabase, {
        email,
        brokerId: Array.from(matchedBrokerIds)[0] ?? null,
        scope: 'global',
        reason: deliveryStatus === 'complained' ? 'complaint' : 'hard_bounce',
        source: 'resend_webhook',
      });
    }

    const brokerTargets: Array<string | null> =
      matchedBrokerIds.size > 0 ? Array.from(matchedBrokerIds) : [null];

    for (const targetBrokerId of brokerTargets) {
      const perBrokerThreadId = targetBrokerId
        ? brokerThreadMap.get(targetBrokerId) || matchedSentThreadByBroker.get(targetBrokerId) || null
        : unattributedThreadId;
      const entityUuid =
        (targetBrokerId ? matchedBuildingByBroker.get(targetBrokerId) : unattributedBuildingUuid) ||
        targetBrokerId ||
        null;
      const metadataForBroker: Record<string, unknown> = {
        ...auditRecipient,
        email_id: emailId,
        svix_id: cleanSvixId,
        thread_id: perBrokerThreadId,
        ...(bounceReason ? { reason: redactPiiInText(bounceReason) } : {}),
      };
      const insRes = await supabase.from('activity_events').insert({
        actor_id: targetBrokerId,
        actor_role: 'system',
        event_type: auditEventType,
        entity_type: entityUuid ? 'building' : 'email',
        entity_id: entityUuid,
        metadata: metadataForBroker,
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
