import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  isUuid,
  saveInboxState,
  upsertCustomInboxClient,
} from '@/lib/im-lite/quick-generate-store';
import {
  normalizeClientEmail,
  normalizeTransactionalBasis,
} from '@/domain/inbox/inbox-outbound';
import { issueConfirmToken, sendOptInConfirmation } from '@/domain/magazine/consent-service';
import { loadOptInSenderIdentity } from '@/lib/magazine/opt-in-sender';
import { normalizeKrPhone, toE164Kr } from '@/lib/magazine/pii';
import { isMissingColumnError } from '@/lib/magazine/subscriber-view';
import { escapeIlike } from '@/lib/utils/postgrest-escape';
import {
  extractFreeMemoFromLegacyNotes,
  formatBudgetManwonDisplay,
  normalizeClientRole,
  parseBudgetManwonInput,
  parseGateRequestReason,
  parsePreferredRegionsInput,
  toSafeEpochMs,
  type InboxCrmClientRole,
} from './inbox-helpers';
import {
  getInboxSchemaCaps,
  isIgnorableSchemaError,
  markInboxSchemaCapUnsupported,
} from './inbox-schema-caps';
import {
  isEmailSuppressed,
  recordEmailSuppression,
  SUPPRESSION_LOOKUP_FAILED,
} from '@/lib/legal/email-suppression';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('inbox-actions-clients');

type ServiceSupabase = ReturnType<typeof createServiceClient>;

type LooseQueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

type LooseQuery = PromiseLike<LooseQueryResult> & {
  select?: (cols?: string) => LooseQuery;
  eq?: (col: string, val: unknown) => LooseQuery;
  in?: (col: string, vals: unknown[]) => LooseQuery;
  ilike?: (col: string, val: string) => LooseQuery;
  order?: (col: string, opts?: { ascending?: boolean }) => LooseQuery;
  limit?: (n: number) => LooseQuery;
  maybeSingle?: () => PromiseLike<LooseQueryResult>;
  single?: () => PromiseLike<LooseQueryResult>;
};

type LooseDb = {
  from: (table: string) => {
    select: (cols?: string) => LooseQuery;
    insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => LooseQuery;
    update: (payload: Record<string, unknown>) => LooseQuery;
  };
};

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function tryGetServiceClient(): { supabase: ServiceSupabase | null; blocked: boolean } {
  try {
    return { supabase: createServiceClient(), blocked: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (process.env.NODE_ENV === 'test' && msg.includes('getServerEnv must not be called on the client')) {
      return { supabase: null, blocked: false };
    }
    return { supabase: null, blocked: true };
  }
}

async function resolveLeadThreadEmail(
  supabase: ServiceSupabase,
  userId: string,
  rawTargetId: string
): Promise<string> {
  if (!isUuid(rawTargetId) || !isUuid(userId)) return '';
  const db = supabase as unknown as LooseDb;
  for (const tbl of ['gate_requests', 'im_inquiry_requests'] as const) {
    try {
      const q = db.from(tbl).select('*');
      if (typeof q.eq !== 'function') continue;
      const eqQ = q.eq('id', rawTargetId);
      const res = typeof eqQ.maybeSingle === 'function' ? await eqQ.maybeSingle() : await eqQ;
      const row = asRecord(res?.data);
      if (!row.id) continue;

      const ownerRef = String(
        row.broker_user_id ?? row.target_broker_id ?? row.broker_id ?? row.owner_id ?? ''
      ).trim();
      if (ownerRef && ownerRef !== userId) continue;
      if (!ownerRef && isUuid(String(row.building_id || ''))) {
        const bQ = db.from('building_ssot_lite').select('id, owner_id');
        if (typeof bQ.eq === 'function') {
          const bEq = bQ.eq('id', String(row.building_id));
          const bRes = typeof bEq.maybeSingle === 'function' ? await bEq.maybeSingle() : await bEq;
          const bRow = asRecord(bRes?.data);
          if (String(bRow.owner_id || '') !== userId) continue;
        }
      } else if (!ownerRef) {
        continue;
      }

      const candidate =
        normalizeClientEmail(typeof row.requester_email === 'string' ? row.requester_email : null) ||
        normalizeClientEmail(typeof row.email === 'string' ? row.email : null) ||
        normalizeClientEmail(parseGateRequestReason(row.reason).requesterEmail) ||
        normalizeClientEmail(parseGateRequestReason(row.message).requesterEmail);
      if (candidate) return candidate;
    } catch {
      // ignore missing table in minimal mocks
    }
  }
  return '';
}

async function ensurePendingMagazineOptIn(
  supabase: ServiceSupabase,
  params: {
    userId: string;
    email: string;
    clientName: string;
    clientPhone: string;
    rawClientUuid: string | null;
    existingSubRow?: Record<string, unknown> | null;
  }
): Promise<{
  outcome: 'already_confirmed' | 'pending_dispatched' | 'suppressed_or_unsubscribed' | 'suppression_unavailable';
  confirmEmailSent: boolean;
  subscriberId?: string;
}> {
  const email = normalizeClientEmail(params.email);
  if (!email) {
    return { outcome: 'pending_dispatched', confirmEmailSent: false };
  }

  const db = supabase as unknown as LooseDb;
  let brokerSlug = params.userId;
  try {
    const bpRes = await supabase
      .from('broker_profiles')
      .select('slug')
      .eq('user_id', params.userId)
      .maybeSingle();
    if (bpRes?.data?.slug) {
      brokerSlug = String(bpRes.data.slug).trim() || params.userId;
    }
  } catch {
    // fallback to userId
  }
  const brokerKeys = Array.from(new Set([params.userId, brokerSlug].filter(Boolean)));

  const suppCheck = await isEmailSuppressed(supabase, {
    email,
    brokerId: params.userId,
    brokerKeys,
  });
  if (suppCheck.suppressed) {
    if (suppCheck.reason === SUPPRESSION_LOOKUP_FAILED) {
      return { outcome: 'suppression_unavailable', confirmEmailSent: false };
    }
    return { outcome: 'suppressed_or_unsubscribed', confirmEmailSent: false };
  }

  let matchedRows: Array<Record<string, unknown>> = [];
  if (params.existingSubRow) {
    matchedRows.push(params.existingSubRow);
  } else {
    try {
      let q = db.from('magazine_subscribers').select('*');
      if (typeof q.in === 'function' && brokerKeys.length > 0) {
        q = q.in('broker_id', brokerKeys);
      } else if (typeof q.eq === 'function') {
        q = q.eq('broker_id', brokerSlug);
      }
      if (typeof q.eq === 'function') {
        const exactRes = await q.eq('subscriber_email', email);
        if (!exactRes?.error && Array.isArray(exactRes?.data) && exactRes.data.length > 0) {
          matchedRows = exactRes.data.map(asRecord);
        }
      }
      if (matchedRows.length === 0) {
        let ciQ = db.from('magazine_subscribers').select('*');
        if (typeof ciQ.in === 'function' && brokerKeys.length > 0) {
          ciQ = ciQ.in('broker_id', brokerKeys);
        } else if (typeof ciQ.eq === 'function') {
          ciQ = ciQ.eq('broker_id', brokerSlug);
        }
        if (typeof ciQ.ilike === 'function') {
          const ciRes = await ciQ.ilike('subscriber_email', escapeIlike(email));
          if (!ciRes?.error && Array.isArray(ciRes?.data)) {
            matchedRows = ciRes.data
              .map(asRecord)
              .filter(
                (r) =>
                  normalizeClientEmail(typeof r.subscriber_email === 'string' ? r.subscriber_email : null) ===
                  email
              );
          }
        }
      }
    } catch {
      // non-blocking if magazine_subscribers unavailable
    }
  }

  for (const row of matchedRows) {
    const st = String(row.status ?? 'active').toLowerCase();
    const cf = String(row.confirm_status ?? row.consent_status ?? 'pending').toLowerCase();
    const ds = String(row.email_delivery_status ?? 'ok').toLowerCase();
    if (
      st === 'unsubscribed' ||
      cf === 'unsubscribed' ||
      Boolean(row.unsubscribed_at) ||
      ds === 'bounced' ||
      ds === 'complained'
    ) {
      return { outcome: 'suppressed_or_unsubscribed', confirmEmailSent: false };
    }
    if (st === 'active' && cf === 'confirmed') {
      return {
        outcome: 'already_confirmed',
        confirmEmailSent: false,
        subscriberId: String(row.id || ''),
      };
    }
  }

  const { token: confirmToken, hash: confirmTokenHash } = issueConfirmToken();
  const nowIso = new Date().toISOString();
  const rawPhone = typeof params.clientPhone === 'string' ? params.clientPhone.trim() : '';
  const formattedPhone = rawPhone ? normalizeKrPhone(rawPhone) : null;
  const channel: 'email' | 'both' = formattedPhone ? 'both' : 'email';
  const existingPending = matchedRows[0] ?? null;
  let targetBrokerKey = brokerSlug;
  let subscriberId = '';

  try {
    if (existingPending && existingPending.id) {
      subscriberId = String(existingPending.id);
      targetBrokerKey = String(existingPending.broker_id || brokerSlug);
      const patchFull: Record<string, unknown> = {
        subscriber_name: params.clientName || existingPending.subscriber_name || email.split('@')[0],
        subscriber_email: email,
        ...(formattedPhone && !existingPending.subscriber_phone
          ? { subscriber_phone: formattedPhone, phone_e164: toE164Kr(formattedPhone) }
          : {}),
        ...(params.rawClientUuid && !existingPending.client_id ? { client_id: params.rawClientUuid } : {}),
        channel: existingPending.channel === 'both' || formattedPhone ? 'both' : 'email',
        status: 'active',
        broker_user_id: params.userId,
        consent_channel: 'broker_attested',
        consent_source: 'broker_inbox',
        marketing_consent_at: nowIso,
        confirm_status: 'pending',
        consent_status: 'pending',
        confirm_token_hash: confirmTokenHash,
        consent_version: 'v1',
      };
      let updQ = db.from('magazine_subscribers').update(patchFull);
      if (typeof updQ.eq === 'function') {
        updQ = updQ.eq('id', subscriberId);
        if (typeof updQ.eq === 'function') updQ = updQ.eq('broker_id', targetBrokerKey);
      }
      let updRes = await updQ;
      if (updRes?.error && (isMissingColumnError(updRes.error) || isIgnorableSchemaError(updRes.error))) {
        const legacyPatch: Record<string, unknown> = {
          subscriber_name: params.clientName || existingPending.subscriber_name || email.split('@')[0],
          subscriber_email: email,
          channel: existingPending.channel === 'both' || formattedPhone ? 'both' : 'email',
          status: 'active',
          marketing_consent_at: nowIso,
          confirm_status: 'pending',
          confirm_token_hash: confirmTokenHash,
        };
        let retryQ = db.from('magazine_subscribers').update(legacyPatch);
        if (typeof retryQ.eq === 'function') {
          retryQ = retryQ.eq('id', subscriberId);
          if (typeof retryQ.eq === 'function') retryQ = retryQ.eq('broker_id', targetBrokerKey);
        }
        updRes = await retryQ;
        if (updRes?.error && (isMissingColumnError(updRes.error) || isIgnorableSchemaError(updRes.error))) {
          let minQ = db.from('magazine_subscribers').update({ status: 'active' });
          if (typeof minQ.eq === 'function') {
            minQ = minQ.eq('id', subscriberId);
            if (typeof minQ.eq === 'function') minQ = minQ.eq('broker_id', targetBrokerKey);
          }
          await minQ;
        }
      }
    } else {
      const base: Record<string, unknown> = {
        broker_id: brokerSlug,
        subscriber_phone: formattedPhone,
        subscriber_name: params.clientName || email.split('@')[0],
        subscriber_email: email,
        channel,
        status: 'active',
        source: 'manual',
        client_id: params.rawClientUuid || null,
        subscribed_at: nowIso,
      };
      const consentFields: Record<string, unknown> = {
        broker_user_id: params.userId,
        ...(formattedPhone ? { phone_e164: toE164Kr(formattedPhone) } : {}),
        consent_channel: 'broker_attested',
        consent_source: 'broker_inbox',
        marketing_consent_at: nowIso,
        confirm_status: 'pending',
        consent_status: 'pending',
        confirm_token_hash: confirmTokenHash,
        consent_version: 'v1',
      };
      const runSubIns = async (row: Record<string, unknown>) => {
        const q = db.from('magazine_subscribers').insert(row);
        if (typeof q.select === 'function') {
          const sq = q.select('id');
          return typeof sq.single === 'function' ? await sq.single() : await sq;
        }
        return await q;
      };
      let insRes = await runSubIns({ ...base, ...consentFields });
      if (insRes?.error && (isMissingColumnError(insRes.error) || isIgnorableSchemaError(insRes.error))) {
        const { consent_status: _cs, consent_source: _csrc, ...legacyConsent } = consentFields;
        void _cs;
        void _csrc;
        insRes = await runSubIns({ ...base, ...legacyConsent });
      }
      if (insRes?.error && (isMissingColumnError(insRes.error) || isIgnorableSchemaError(insRes.error))) {
        insRes = await runSubIns(base);
      }
      const insData = asRecord(insRes?.data);
      if (insData.id) {
        subscriberId = String(insData.id);
      }
    }
  } catch {
    // non-blocking if magazine_subscribers unavailable in minimal test harness
  }

  let confirmEmailSent = false;
  try {
    const sender = await loadOptInSenderIdentity(supabase, params.userId, null);
    const confirmRes = await sendOptInConfirmation({
      channel,
      email,
      brokerSlug: targetBrokerKey,
      brokerName: sender.brokerName,
      brokerContact: sender.brokerContact,
      subscriberName: params.clientName || null,
      token: confirmToken,
    });
    confirmEmailSent = confirmRes.sent;
  } catch {
    // non-blocking (D4 allowlist / dry-run / disabled safe)
  }

  return {
    outcome: 'pending_dispatched',
    confirmEmailSent,
    ...(subscriberId ? { subscriberId } : {}),
  };
}

export async function handleToggleNewsletterAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  clientId: string;
  body: Record<string, unknown>;
}) {
  const { action, userId, buildingId, threadId, clientId, body } = params;
  const targetKey = clientId || threadId;
  if (!targetKey) {
    return NextResponse.json({ ok: false, error: '대상 고객 식별자가 필요합니다.' }, { status: 400 });
  }
  const subscribed = Boolean(body?.subscribed);
  const rawClientId = targetKey.replace(/^(?:custom[-_]|cli-|sub_)/, '');
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';
  const rawContact = typeof body?.clientPhone === 'string' ? body.clientPhone.trim() : '';
  const clientEmail =
    typeof body?.clientEmail === 'string' && body.clientEmail.includes('@')
      ? body.clientEmail.trim().toLowerCase()
      : rawContact.includes('@')
        ? rawContact.toLowerCase()
        : '';
  const clientPhone = rawContact.includes('@') ? '' : rawContact;

  let supabaseClient: ServiceSupabase | null = null;
  try {
    supabaseClient = createServiceClient();
  } catch {
    supabaseClient = null;
  }

  // WP-7.3E P1-4 / WP-7.4E P1-1: subscribing is only "confirmed" when an existing confirmed consent record
  // backs it. Otherwise we upsert a 'pending' row in magazine_subscribers, dispatch the DOI confirmation
  // email (respecting dry-run / send-disabled flags), and return optInPending: true, newsletterSubscribed: false.
  let hasConfirmedConsentRecord = false;
  let confirmEmailSent = false;

  if (supabaseClient && isUuid(userId)) {
    let existingSubRow: Record<string, unknown> | null = null;
    if (targetKey.startsWith('sub_') && rawClientId) {
      try {
        let subLookup = await supabaseClient
          .from('magazine_subscribers')
          .select('id, broker_id, subscriber_name, subscriber_phone, subscriber_email, channel, client_id, status, unsubscribed_at, confirm_status, consent_status')
          .eq('id', rawClientId)
          .maybeSingle();
        if (subLookup?.error && isIgnorableSchemaError(subLookup.error)) {
          subLookup = await supabaseClient
            .from('magazine_subscribers')
            .select('id, broker_id, subscriber_name, subscriber_phone, subscriber_email, channel, status, unsubscribed_at, confirm_status')
            .eq('id', rawClientId)
            .maybeSingle();
        }
        if (!subLookup?.error && subLookup?.data) {
          existingSubRow = subLookup.data as Record<string, unknown>;
        }
      } catch {
        // non-blocking
      }
    }

    let existingCli: Record<string, unknown> | null = null;
    if (isUuid(rawClientId) && !targetKey.startsWith('sub_')) {
      try {
        let cliLookup = await supabaseClient
          .from('broker_clients')
          .select('id, display_name, phone, email, tags, consent_status, unsubscribed_at')
          .eq('id', rawClientId)
          .eq('broker_id', userId)
          .maybeSingle();
        if (cliLookup?.error && isIgnorableSchemaError(cliLookup.error)) {
          cliLookup = await supabaseClient
            .from('broker_clients')
            .select('id, display_name, phone, email, tags')
            .eq('id', rawClientId)
            .eq('broker_id', userId)
            .maybeSingle();
        }
        if (!cliLookup?.error && cliLookup?.data) {
          existingCli = cliLookup.data as Record<string, unknown>;
        }
      } catch {
        // non-blocking
      }
    }

    const memMatch = (getInboxState().customClients || []).find(
      (c) => c.ownerId === userId && (c.id === targetKey || c.id === rawClientId || c.id === `custom_${rawClientId}`)
    );
    let lookupEmail = String(
      clientEmail || existingSubRow?.subscriber_email || existingCli?.email || memMatch?.clientEmail || ''
    )
      .trim()
      .toLowerCase();

    if (!lookupEmail && isUuid(rawClientId) && !targetKey.startsWith('sub_') && !existingCli) {
      lookupEmail = await resolveLeadThreadEmail(supabaseClient, userId, rawClientId);
    }

    if (subscribed) {
      const cliTags = Array.isArray(existingCli?.tags) ? existingCli.tags.map(String) : [];
      const wasSubUnsubscribed = Boolean(
        existingSubRow &&
          (existingSubRow.status === 'unsubscribed' ||
            Boolean(existingSubRow.unsubscribed_at) ||
            existingSubRow.consent_status === 'unsubscribed')
      );
      const wasCliUnsubscribed = Boolean(
        existingCli &&
          (existingCli.consent_status === 'unsubscribed' ||
            Boolean(existingCli.unsubscribed_at) ||
            cliTags.some((t: string) => /수신거부|해지|unsub/i.test(t)))
      );
      const suppCheck = lookupEmail
        ? await isEmailSuppressed(supabaseClient, { email: lookupEmail, brokerId: userId, brokerKeys: [userId] })
        : { suppressed: false, reason: undefined as string | undefined };

      if (suppCheck.suppressed && suppCheck.reason === SUPPRESSION_LOOKUP_FAILED) {
        return NextResponse.json(
          {
            ok: false,
            code: 'SUPPRESSION_CHECK_UNAVAILABLE',
            error: '수신거부 이력을 확인할 수 없어 구독 상태를 변경하지 않았습니다. 잠시 후 다시 시도해 주세요.',
          },
          { status: 503 }
        );
      }

      if (wasSubUnsubscribed || wasCliUnsubscribed || suppCheck.suppressed) {
        return NextResponse.json(
          {
            ok: false,
            code: 'RECIPIENT_SELF_OPTIN_REQUIRED',
            error:
              '수신자 본인이 수신거부한 고객은 중개사가 임의로 재구독 처리할 수 없습니다. 고객 본인의 재동의 링크를 이용해 주세요.',
          },
          { status: 403 }
        );
      }

      if (existingSubRow) {
        const subConfirm = String(
          existingSubRow.confirm_status ?? existingSubRow.consent_status ?? 'pending'
        ).toLowerCase();
        if (subConfirm === 'confirmed') {
          hasConfirmedConsentRecord = true;
        }
      }

      if (existingCli) {
        const cliConsent = String(existingCli.consent_status ?? 'unconfirmed').toLowerCase();
        if (cliConsent === 'confirmed') {
          hasConfirmedConsentRecord = true;
        }
      }

      if (!hasConfirmedConsentRecord && lookupEmail) {
        const doiRes = await ensurePendingMagazineOptIn(supabaseClient, {
          userId,
          email: lookupEmail,
          clientName:
            clientName ||
            String(existingCli?.display_name || existingSubRow?.subscriber_name || '').trim(),
          clientPhone:
            clientPhone ||
            String(existingCli?.phone || existingSubRow?.subscriber_phone || '').trim(),
          rawClientUuid: isUuid(rawClientId) && !targetKey.startsWith('sub_') ? rawClientId : null,
          existingSubRow,
        });
        if (doiRes.outcome === 'suppression_unavailable') {
          return NextResponse.json(
            {
              ok: false,
              code: 'SUPPRESSION_CHECK_UNAVAILABLE',
              error: '수신거부 이력을 확인할 수 없어 구독 상태를 변경하지 않았습니다. 잠시 후 다시 시도해 주세요.',
            },
            { status: 503 }
          );
        }
        if (doiRes.outcome === 'suppressed_or_unsubscribed') {
          return NextResponse.json(
            {
              ok: false,
              code: 'RECIPIENT_SELF_OPTIN_REQUIRED',
              error:
                '수신자 본인이 수신거부한 고객은 중개사가 임의로 재구독 처리할 수 없습니다. 고객 본인의 재동의 링크를 이용해 주세요.',
            },
            { status: 403 }
          );
        }
        if (doiRes.outcome === 'already_confirmed') {
          hasConfirmedConsentRecord = true;
        } else {
          confirmEmailSent = doiRes.confirmEmailSent;
        }
      }
    }

    if (targetKey.startsWith('sub_') && rawClientId && (!subscribed || hasConfirmedConsentRecord)) {
      try {
        const nowIso = new Date().toISOString();
        const subPatch: Record<string, unknown> = subscribed
          ? { status: 'active' }
          : { status: 'unsubscribed', consent_status: 'unsubscribed', unsubscribed_at: nowIso };
        const existingSubBrokerId = existingSubRow?.broker_id ? String(existingSubRow.broker_id).trim() : '';
        let subScopeBrokerId = userId;
        if (existingSubBrokerId && existingSubBrokerId !== userId) {
          const { data: bp } = await supabaseClient
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', userId)
            .maybeSingle();
          const ownSlug = bp?.slug ? String(bp.slug).trim() : '';
          if (ownSlug && existingSubBrokerId === ownSlug) {
            subScopeBrokerId = ownSlug;
          }
        }
        if (getInboxSchemaCaps().subscriberExtended) {
          const { error: subUpdErr } = await supabaseClient
            .from('magazine_subscribers')
            .update(subPatch)
            .eq('id', rawClientId)
            .eq('broker_id', subScopeBrokerId);
          if (subUpdErr && isIgnorableSchemaError(subUpdErr)) {
            markInboxSchemaCapUnsupported('subscriberExtended');
            const fallbackPatch = subscribed
              ? { status: 'active' }
              : { status: 'unsubscribed', unsubscribed_at: nowIso };
            const retryRes = await supabaseClient
              .from('magazine_subscribers')
              .update(fallbackPatch)
              .eq('id', rawClientId)
              .eq('broker_id', subScopeBrokerId);
            if (retryRes?.error && isIgnorableSchemaError(retryRes.error)) {
              await supabaseClient
                .from('magazine_subscribers')
                .update({ status: subscribed ? 'active' : 'unsubscribed' })
                .eq('id', rawClientId)
                .eq('broker_id', subScopeBrokerId);
            }
          }
        } else {
          await supabaseClient
            .from('magazine_subscribers')
            .update({ status: subscribed ? 'active' : 'unsubscribed' })
            .eq('id', rawClientId)
            .eq('broker_id', subScopeBrokerId);
        }
      } catch {
        // non-blocking if magazine_subscribers unavailable
      }
    }

    if (isUuid(rawClientId) && !targetKey.startsWith('sub_') && existingCli) {
      try {
        const prevTags = Array.isArray(existingCli.tags) ? existingCli.tags.map(String) : [];
        const cleaned = prevTags.filter(
          (t: string) =>
            !/뉴스레터|구독|수신거부|수신동의|수신확인대기|newsletter|subscribe|unsub/i.test(t)
        );
        const nextTags = !subscribed
          ? [...cleaned, '수신거부']
          : hasConfirmedConsentRecord
            ? [...cleaned, '뉴스레터구독']
            : [...cleaned, '수신확인대기'];
        const cliPatch: Record<string, unknown> = !subscribed
          ? {
              tags: nextTags,
              consent_status: 'unsubscribed',
              unsubscribed_at: new Date().toISOString(),
            }
          : hasConfirmedConsentRecord
            ? {
                tags: nextTags,
                consent_status: 'confirmed',
              }
            : {
                tags: nextTags,
                consent_status: 'pending',
              };
        const { error: cliUpdErr } = await supabaseClient
          .from('broker_clients')
          .update(cliPatch)
          .eq('id', rawClientId)
          .eq('broker_id', userId);
        if (cliUpdErr && isIgnorableSchemaError(cliUpdErr)) {
          await supabaseClient
            .from('broker_clients')
            .update({ tags: nextTags })
            .eq('id', rawClientId)
            .eq('broker_id', userId);
        }
      } catch {
        // non-blocking if broker_clients missing
      }
    }

    if (!subscribed && lookupEmail) {
      await recordEmailSuppression(supabaseClient, {
        email: lookupEmail,
        brokerId: userId,
        scope: 'broker',
        reason: 'unsubscribe',
        source: 'broker_inbox',
      }).catch(() => null);

      if (!targetKey.startsWith('sub_')) {
        try {
          const { data: bp } = await supabaseClient
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', userId)
            .maybeSingle();
          const ownSlug = bp?.slug ? String(bp.slug).trim() : '';
          const brokerKeys = Array.from(new Set([userId, ownSlug].filter(Boolean)));
          const nowIso = new Date().toISOString();
          const { error: subSyncErr } = await supabaseClient
            .from('magazine_subscribers')
            .update({ status: 'unsubscribed', consent_status: 'unsubscribed', unsubscribed_at: nowIso })
            .in('broker_id', brokerKeys)
            .eq('subscriber_email', lookupEmail);
          if (subSyncErr && isIgnorableSchemaError(subSyncErr)) {
            await supabaseClient
              .from('magazine_subscribers')
              .update({ status: 'unsubscribed', unsubscribed_at: nowIso })
              .in('broker_id', brokerKeys)
              .eq('subscriber_email', lookupEmail);
          }
        } catch {
          // non-blocking
        }
      }
    }

    const optInPending = subscribed && !hasConfirmedConsentRecord;
    const { error: toggleEvErr } = await supabaseClient.from('activity_events').insert({
      actor_id: userId,
      event_type: 'newsletter_subscription_toggled',
      entity_type: 'building',
      entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
      metadata: {
        thread_id: threadId || targetKey,
        client_id: targetKey,
        raw_client_id: rawClientId,
        client_name: clientName || null,
        client_phone: clientPhone || null,
        client_email: lookupEmail || clientEmail || null,
        newsletter_subscribed: subscribed && hasConfirmedConsentRecord,
        subscribed,
        newsletter_opt_in_pending: optInPending,
        consent_status: !subscribed ? 'unsubscribed' : hasConfirmedConsentRecord ? 'confirmed' : 'pending',
        consent_basis: !subscribed
          ? 'broker_recorded_opt_out'
          : hasConfirmedConsentRecord
            ? 'existing_confirmed_record'
            : 'double_opt_in_required',
      },
    });
    if (toggleEvErr) {
      return NextResponse.json(
        { ok: false, persisted: false, error: '뉴스레터 수신 상태 변경 중 데이터베이스 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  }

  const effectiveSubscribed = subscribed && hasConfirmedConsentRecord;
  const state = getInboxState();
  let updatedInMem = false;
  for (const c of state.customClients) {
    if (c.ownerId === userId && (c.id === targetKey || c.id === rawClientId || c.id === `custom_${rawClientId}`)) {
      c.newsletterSubscribed = effectiveSubscribed;
      if (subscribed && !effectiveSubscribed) {
        Object.assign(c as unknown as Record<string, unknown>, {
          consentStatus: 'pending',
          newsletterOptInPending: true,
        });
      }
      updatedInMem = true;
    }
  }
  if (updatedInMem) saveInboxState(state);

  const pendingDoubleOptIn = subscribed && !effectiveSubscribed;
  return NextResponse.json({
    ok: true,
    persisted: true,
    action,
    clientId: targetKey,
    newsletterSubscribed: effectiveSubscribed,
    ...(pendingDoubleOptIn
      ? {
          consentStatus: 'pending',
          optInPending: true,
          requiresDoubleOptIn: true,
          confirmEmailSent,
          message:
            '수신 동의 확인 대기 상태로 기록했습니다. 고객 본인이 구독 확인 링크(더블 옵트인)를 완료해야 광고성 메일을 보낼 수 있습니다.',
        }
      : {}),
  });
}

type ExistingClientSnap = {
  id: string;
  dbUuid: string | null;
  clientName: string;
  clientGrade: 'VIP' | '일반' | '잠재';
  isVip: boolean;
  clientRole: InboxCrmClientRole;
  clientPhone: string;
  clientEmail: string | null;
  transactionalBasis: ReturnType<typeof normalizeTransactionalBasis>;
  preferredRegions: string[];
  preferredRegion: string;
  budgetManwon: number | null;
  budget: string;
  freeMemo: string;
  buildingId: string;
  buildingTitle: string;
  newsletterSubscribed: boolean;
  consentStatus: string | null;
};

export async function handleUpsertClientAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  clientId: string;
  body: Record<string, unknown>;
}) {
  const { action, userId, buildingId, threadId, clientId, body } = params;
  const hasOwn = (prop: string) =>
    Boolean(body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, prop));

  const lookupKey = clientId || threadId;
  const rawLookupId = lookupKey.replace(/^(?:custom[-_]|cli-)/, '');
  let existingSnap: ExistingClientSnap | null = null;

  if (lookupKey) {
    const foundMem = (getInboxState().customClients || []).find(
      (c) =>
        c.ownerId === userId &&
        (c.id === lookupKey || c.id === rawLookupId || c.id === `custom_${rawLookupId}` || c.id === `cli-${rawLookupId}`)
    );
    const m = foundMem ? asRecord(foundMem) : undefined;

    if (m) {
      const memRegions = parsePreferredRegionsInput(m.preferredRegions, m.preferredRegion);
      const memBudget = parseBudgetManwonInput(m.budgetManwon, m.budget);
      const memGrade: 'VIP' | '일반' | '잠재' =
        m.clientGrade === '일반' || m.clientGrade === '잠재' ? m.clientGrade : 'VIP';
      existingSnap = {
        id: String(m.id || lookupKey),
        dbUuid: isUuid(rawLookupId) ? rawLookupId : null,
        clientName: String(m.clientName || ''),
        clientGrade: memGrade,
        isVip: typeof m.isVip === 'boolean' ? m.isVip : memGrade === 'VIP',
        clientRole: normalizeClientRole(m.clientRole) || 'buyer',
        clientPhone: String(m.clientPhone || ''),
        clientEmail: normalizeClientEmail(typeof m.clientEmail === 'string' ? m.clientEmail : null),
        transactionalBasis: normalizeTransactionalBasis(m.transactionalBasis),
        preferredRegions: memRegions,
        preferredRegion: String(m.preferredRegion || memRegions.join(', ')),
        budgetManwon: memBudget,
        budget: String(m.budget || formatBudgetManwonDisplay(memBudget)),
        freeMemo: typeof m.freeMemo === 'string' ? m.freeMemo : '',
        buildingId: String(m.buildingId || ''),
        buildingTitle: String(m.buildingTitle || ''),
        newsletterSubscribed: Boolean(m.newsletterSubscribed),
        consentStatus: typeof m.consentStatus === 'string' ? m.consentStatus.trim().toLowerCase() : null,
      };
    }

    if (isUuid(userId)) {
      try {
        const supabase = createServiceClient();
        const looseDb = supabase as unknown as LooseDb;
        if (isUuid(rawLookupId)) {
          let cliQ = looseDb.from('broker_clients').select('*');
          if (typeof cliQ.eq === 'function') {
            cliQ = cliQ.eq('id', rawLookupId);
            if (typeof cliQ.eq === 'function') cliQ = cliQ.eq('broker_id', userId);
          }
          const cliRes =
            typeof cliQ.maybeSingle === 'function'
              ? await cliQ.maybeSingle()
              : typeof cliQ.single === 'function'
                ? await cliQ.single()
                : await cliQ;
          const dbRow = cliRes?.data ? asRecord(cliRes.data) : null;
          if (dbRow && dbRow.id) {
            const dbTags = Array.isArray(dbRow.tags) ? dbRow.tags.map(String) : [];
            const dbTier = String(dbRow.tier || '').toLowerCase();
            const dbIsVip =
              typeof dbRow.is_vip === 'boolean' ? dbRow.is_vip : dbTier === 'vip' || dbTags.includes('VIP');
            const dbGrade: 'VIP' | '일반' | '잠재' = dbIsVip ? 'VIP' : dbTier === 'potential' ? '잠재' : '일반';
            const dbRegions = parsePreferredRegionsInput(dbRow.preferred_regions);
            const dbBudget = parseBudgetManwonInput(dbRow.budget_manwon);
            const linkedIds = Array.isArray(dbRow.linked_building_ids) ? dbRow.linked_building_ids.map(String) : [];
            const dbConsentStatus =
              typeof dbRow.consent_status === 'string' && dbRow.consent_status.trim()
                ? dbRow.consent_status.trim().toLowerCase()
                : null;
            existingSnap = {
              id: existingSnap?.id || lookupKey,
              dbUuid: String(dbRow.id),
              clientName: String(dbRow.display_name || dbRow.name || existingSnap?.clientName || ''),
              clientGrade: dbGrade,
              isVip: dbIsVip,
              clientRole: normalizeClientRole(dbRow.client_role ?? dbRow.client_type) || 'buyer',
              clientPhone: String(dbRow.phone || existingSnap?.clientPhone || ''),
              clientEmail:
                normalizeClientEmail(typeof dbRow.email === 'string' ? dbRow.email : null) ??
                existingSnap?.clientEmail ??
                null,
              transactionalBasis: existingSnap?.transactionalBasis ?? null,
              preferredRegions: dbRegions.length > 0 ? dbRegions : existingSnap?.preferredRegions || [],
              preferredRegion: dbRegions.length > 0 ? dbRegions.join(', ') : existingSnap?.preferredRegion || '',
              budgetManwon: dbBudget ?? existingSnap?.budgetManwon ?? null,
              budget: formatBudgetManwonDisplay(dbBudget ?? existingSnap?.budgetManwon ?? null) || existingSnap?.budget || '',
              freeMemo:
                (typeof dbRow.free_memo === 'string'
                  ? dbRow.free_memo
                  : extractFreeMemoFromLegacyNotes(dbRow.notes)) || existingSnap?.freeMemo || '',
              buildingId: linkedIds[0] || existingSnap?.buildingId || '',
              buildingTitle: existingSnap?.buildingTitle || '',
              newsletterSubscribed:
                dbConsentStatus === 'confirmed'
                  ? dbTags.some((t: string) => /뉴스레터구독|newsletter/i.test(t)) ||
                    Boolean(existingSnap?.newsletterSubscribed)
                  : false,
              consentStatus: dbConsentStatus,
            };
          }
        }

        let evQ = looseDb.from('activity_events').select('id, event_type, metadata, created_at');
        if (typeof evQ.eq === 'function') {
          evQ = evQ.eq('actor_id', userId);
          if (typeof evQ.eq === 'function') evQ = evQ.eq('event_type', 'custom_client_upserted');
        }
        if (typeof evQ.order === 'function') evQ = evQ.order('created_at', { ascending: true });
        const evRes = await evQ;
        const evRows = [...(Array.isArray(evRes?.data) ? evRes.data.map(asRecord) : [])].sort(
          (a, b) => toSafeEpochMs(a.created_at) - toSafeEpochMs(b.created_at)
        );
        for (const ev of evRows) {
          const meta = asRecord(ev.metadata);
          const evClientId = String(meta.client_id || '').trim();
          const evRawId = evClientId.replace(/^(?:custom[-_]|cli-)/, '');
          if (evClientId !== lookupKey && evRawId !== rawLookupId && String(meta.raw_client_id || '') !== rawLookupId) {
            continue;
          }
          const evRegions = parsePreferredRegionsInput(meta.preferred_regions, meta.preferred_region);
          const evBudget = parseBudgetManwonInput(meta.budget_manwon, meta.budget);
          const evGrade: 'VIP' | '일반' | '잠재' =
            meta.client_grade === '일반' || meta.client_grade === '잠재' ? meta.client_grade : 'VIP';
          const evConsent =
            typeof meta.consent_status === 'string' && meta.consent_status.trim()
              ? meta.consent_status.trim().toLowerCase()
              : existingSnap?.consentStatus ?? null;
          const evConfirmedSub =
            typeof meta.newsletter_subscribed === 'boolean'
              ? meta.newsletter_subscribed &&
                meta.newsletter_opt_in_pending !== true &&
                evConsent === 'confirmed'
              : Boolean(existingSnap?.newsletterSubscribed);
          existingSnap = {
            id: evClientId || existingSnap?.id || lookupKey,
            dbUuid: existingSnap?.dbUuid || (isUuid(evRawId) ? evRawId : null),
            clientName: String(meta.client_name || existingSnap?.clientName || ''),
            clientGrade: evGrade,
            isVip: typeof meta.is_vip === 'boolean' ? meta.is_vip : evGrade === 'VIP',
            clientRole: normalizeClientRole(meta.client_role) || existingSnap?.clientRole || 'buyer',
            clientPhone: String(meta.client_phone ?? existingSnap?.clientPhone ?? ''),
            clientEmail:
              normalizeClientEmail(typeof meta.client_email === 'string' ? meta.client_email : null) ??
              existingSnap?.clientEmail ??
              null,
            transactionalBasis: normalizeTransactionalBasis(meta.transactional_basis) ?? existingSnap?.transactionalBasis ?? null,
            preferredRegions: evRegions.length > 0 ? evRegions : existingSnap?.preferredRegions || [],
            preferredRegion: String(meta.preferred_region || evRegions.join(', ') || existingSnap?.preferredRegion || ''),
            budgetManwon: evBudget ?? existingSnap?.budgetManwon ?? null,
            budget: String(meta.budget || formatBudgetManwonDisplay(evBudget) || existingSnap?.budget || ''),
            freeMemo: typeof meta.free_memo === 'string' ? meta.free_memo : existingSnap?.freeMemo ?? '',
            buildingId: String(meta.building_id ?? existingSnap?.buildingId ?? ''),
            buildingTitle: String(meta.building_title ?? existingSnap?.buildingTitle ?? ''),
            newsletterSubscribed: evConfirmedSub,
            consentStatus: evConsent,
          };
        }
      } catch {
        // non-blocking pre-read fallback
      }
    }
  }

  const incomingName =
    hasOwn('clientName') || hasOwn('display_name') ? String(body?.clientName ?? body?.display_name ?? '').trim() : '';
  const clientName = incomingName || existingSnap?.clientName || '';
  if (!clientName) {
    return NextResponse.json({ ok: false, error: '고객 성함을 입력해 주세요.' }, { status: 400 });
  }

  const explicitIsVip = typeof body?.isVip === 'boolean' ? body.isVip : typeof body?.is_vip === 'boolean' ? body.is_vip : undefined;
  const explicitGradeRaw =
    typeof body?.clientGrade === 'string' && body.clientGrade.trim()
      ? (body.clientGrade.trim() as 'VIP' | '일반' | '잠재')
      : undefined;
  const resolvedIsVip =
    explicitIsVip !== undefined
      ? explicitIsVip
      : explicitGradeRaw !== undefined
        ? explicitGradeRaw === 'VIP'
        : existingSnap
          ? existingSnap.isVip
          : true;
  const clientGrade: 'VIP' | '일반' | '잠재' =
    explicitGradeRaw ||
    (explicitIsVip !== undefined
      ? explicitIsVip ? 'VIP' : existingSnap?.clientGrade === '잠재' ? '잠재' : '일반'
      : existingSnap?.clientGrade || 'VIP');

  const resolvedClientRole: InboxCrmClientRole =
    normalizeClientRole(body?.clientRole ?? body?.client_role ?? body?.clientType ?? body?.client_type) ??
    existingSnap?.clientRole ??
    'buyer';

  const rawPhone =
    hasOwn('clientPhone') || hasOwn('phone')
      ? String(body?.clientPhone ?? body?.phone ?? '').trim()
      : existingSnap?.clientPhone || '';
  const clientPhone = rawPhone === '010-0000-0000' || rawPhone === '01000000000' ? '' : rawPhone;

  const hasEmailProp = hasOwn('clientEmail') || hasOwn('email');
  const rawClientEmail = hasEmailProp ? String(body?.clientEmail ?? body?.email ?? '').trim() : '';
  const parsedIncomingEmail = rawClientEmail ? normalizeClientEmail(rawClientEmail) : null;
  if (hasEmailProp && rawClientEmail && !parsedIncomingEmail) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소 형식을 입력해 주세요.' }, { status: 400 });
  }
  const clientEmail = hasEmailProp ? parsedIncomingEmail : existingSnap?.clientEmail ?? null;

  const transactionalBasis = hasOwn('transactionalBasis')
    ? normalizeTransactionalBasis(body?.transactionalBasis)
    : existingSnap?.transactionalBasis ?? null;

  const hasRegionsProp =
    hasOwn('preferredRegions') || hasOwn('preferred_regions') || hasOwn('preferredRegion') || hasOwn('preferred_region');
  const resolvedPreferredRegions = hasRegionsProp
    ? parsePreferredRegionsInput(
        body?.preferredRegions ?? body?.preferred_regions,
        body?.preferredRegion ?? body?.preferred_region
      )
    : existingSnap?.preferredRegions ?? [];
  const preferredRegion =
    typeof body?.preferredRegion === 'string' && body.preferredRegion.trim()
      ? body.preferredRegion.trim()
      : resolvedPreferredRegions.length > 0
        ? resolvedPreferredRegions.join(', ')
        : hasRegionsProp ? '' : existingSnap?.preferredRegion ?? '';

  const hasBudgetProp = hasOwn('budgetManwon') || hasOwn('budget_manwon') || hasOwn('budget');
  const resolvedBudgetManwon = hasBudgetProp
    ? (body?.budgetManwon === null || body?.budget_manwon === null) && !body?.budget
      ? null
      : parseBudgetManwonInput(body?.budgetManwon ?? body?.budget_manwon, body?.budget)
    : existingSnap?.budgetManwon ?? null;
  const budget =
    typeof body?.budget === 'string' && body.budget.trim()
      ? body.budget.trim()
      : formatBudgetManwonDisplay(resolvedBudgetManwon) || (!hasBudgetProp ? existingSnap?.budget ?? '' : '');

  const hasFreeMemoProp = hasOwn('freeMemo') || hasOwn('free_memo') || hasOwn('memo') || hasOwn('notes');
  const resolvedFreeMemo = hasFreeMemoProp
    ? String(body?.freeMemo ?? body?.free_memo ?? body?.memo ?? body?.notes ?? '').trim()
    : existingSnap?.freeMemo ?? '';

  const resolvedBuildingId = hasOwn('buildingId') ? buildingId : buildingId || existingSnap?.buildingId || '';
  const buildingTitle = String(
    body?.buildingTitle || existingSnap?.buildingTitle || (resolvedBuildingId ? '관심 매물' : '관심 매물 미지정')
  ).trim();
  const newsletterSubscribed =
    typeof body?.newsletterOptIn === 'boolean'
      ? body.newsletterOptIn
      : typeof body?.newsletterSubscribed === 'boolean'
        ? body.newsletterSubscribed
        : Boolean(existingSnap?.newsletterSubscribed);

  let resolvedClientId = lookupKey || `custom_${Date.now()}`;
  const rawUuidCandidate = existingSnap?.dbUuid || resolvedClientId.replace(/^(?:custom[-_]|cli-)/, '');

  let effectiveConsentStatus: string = isUuid(rawUuidCandidate)
    ? existingSnap?.consentStatus || 'unconfirmed'
    : 'pending';

  if (isUuid(rawUuidCandidate) && isUuid(userId)) {
    try {
      const preSupabase = createServiceClient();
      const cliCheckRes = await preSupabase
        .from('broker_clients')
        .select('id, consent_status')
        .eq('id', rawUuidCandidate)
        .eq('broker_id', userId)
        .maybeSingle();
      if (!cliCheckRes?.error && cliCheckRes?.data) {
        const dbConsent = String(
          (cliCheckRes.data as { consent_status?: string | null }).consent_status ?? ''
        )
          .trim()
          .toLowerCase();
        effectiveConsentStatus = dbConsent || 'unconfirmed';
      }
    } catch {
      // keep existingSnap fallback
    }
  }

  if (newsletterSubscribed && effectiveConsentStatus === 'unconfirmed') {
    effectiveConsentStatus = 'pending';
  }

  // Double opt-in invariant: marketingConsentConfirmed === true alone never confirms recipient self opt-in
  let confirmedOptIn = newsletterSubscribed && effectiveConsentStatus === 'confirmed';
  let optInPending =
    newsletterSubscribed &&
    (effectiveConsentStatus === 'pending' || effectiveConsentStatus === 'unconfirmed');
  let confirmEmailSent: boolean | undefined;

  let persistence: 'canonical' | 'activity_event_fallback' | 'activity_event_only' | 'memory_only' = 'memory_only';
  if (isUuid(userId)) {
    const { supabase, blocked } = tryGetServiceClient();
    if (blocked) {
      return NextResponse.json(
        { ok: false, persisted: false, error: '데이터베이스 연결을 초기화할 수 없습니다.' },
        { status: 503 }
      );
    }
    if (supabase) {
      const looseDb = supabase as unknown as LooseDb;
      const resolvedTier: 'vip' | 'normal' | 'potential' = resolvedIsVip
        ? 'vip'
        : clientGrade === '잠재' ? 'potential' : 'normal';
      const roleTag =
        resolvedClientRole === 'seller' ? '매도' : resolvedClientRole === 'tenant' ? '임차' : resolvedClientRole === 'partner' ? '공동중개' : '';
      const buildTagsPayload = (isConfirmed: boolean, isPending: boolean, consentSt: string) =>
        Array.from(
          new Set(
            [
              ...resolvedPreferredRegions,
              preferredRegion && !resolvedPreferredRegions.includes(preferredRegion) ? preferredRegion : '',
              budget,
              roleTag,
              isConfirmed ? '뉴스레터구독' : '',
              isPending ? '수신확인대기' : '',
              consentSt === 'unsubscribed' ? '수신거부' : '',
            ].filter(Boolean)
          )
        );
      const tagsPayload = buildTagsPayload(confirmedOptIn, optInPending, effectiveConsentStatus);
      const legacyBase = {
        client_type: (resolvedClientRole === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller',
        display_name: clientName,
        phone: clientPhone || null,
        tier: resolvedTier,
        tags: tagsPayload,
        notes: resolvedFreeMemo,
        linked_building_ids: resolvedBuildingId && isUuid(resolvedBuildingId) ? [resolvedBuildingId] : [],
      };
      const structuredExtra = {
        is_vip: resolvedIsVip,
        client_role: resolvedClientRole,
        preferred_regions: resolvedPreferredRegions,
        budget_manwon: resolvedBudgetManwon,
        free_memo: resolvedFreeMemo,
      };

      let dbWriteRes: LooseQueryResult | null = null;
      let attemptedCanonical = false;
      let canonicalClientUuid: string | null = isUuid(rawUuidCandidate) ? rawUuidCandidate : null;
      try {
        if (isUuid(rawUuidCandidate)) {
          attemptedCanonical = true;
          const runCanonicalUpdate = async (
            updatePayload: Record<string, unknown>
          ): Promise<{ res: LooseQueryResult; canCheckMatched: boolean; matchedRow: boolean }> => {
            const baseUpd = looseDb
              .from('broker_clients')
              .update(updatePayload)
              .eq?.('id', rawUuidCandidate)
              ?.eq?.('broker_id', userId);
            if (!baseUpd) {
              return { res: { data: null, error: null }, canCheckMatched: false, matchedRow: true };
            }
            if (typeof baseUpd.select === 'function') {
              const sq = baseUpd.select('id');
              if (typeof sq.maybeSingle === 'function') {
                const mRes = await sq.maybeSingle();
                const row = Array.isArray(mRes?.data) ? mRes.data[0] ?? null : mRes?.data ?? null;
                return { res: mRes, canCheckMatched: true, matchedRow: Boolean(row) };
              }
              const sRes = await sq;
              const hasRow = Array.isArray(sRes?.data) ? sRes.data.length > 0 : Boolean(sRes?.data);
              return { res: sRes, canCheckMatched: true, matchedRow: hasRow };
            }
            const rawRes = await baseUpd;
            const canCheck = Array.isArray(rawRes?.data);
            const hasRow = Array.isArray(rawRes?.data) ? rawRes.data.length > 0 : true;
            return { res: rawRes, canCheckMatched: canCheck, matchedRow: hasRow };
          };

          const runCanonicalReinsert = async (includeExt: boolean): Promise<LooseQueryResult> => {
            const insQ = looseDb.from('broker_clients').insert({
              id: rawUuidCandidate,
              broker_id: userId,
              ...legacyBase,
              ...(includeExt
                ? {
                    ...(clientEmail !== undefined ? { email: clientEmail } : {}),
                    ...structuredExtra,
                    consent_status: effectiveConsentStatus || 'pending',
                    consent_source: 'broker_manual',
                  }
                : {}),
            });
            if (typeof insQ.select === 'function') {
              const sq = insQ.select('id');
              return typeof sq.maybeSingle === 'function'
                ? await sq.maybeSingle()
                : typeof sq.single === 'function'
                ? await sq.single()
                : await sq;
            }
            return await insQ;
          };

          const useExt = getInboxSchemaCaps().brokerClientsExtended;
          const payload = useExt
            ? {
                ...legacyBase,
                ...(clientEmail !== undefined ? { email: clientEmail } : {}),
                ...structuredExtra,
                ...(optInPending ? { consent_status: 'pending' } : {}),
              }
            : legacyBase;
          let updOutcome = await runCanonicalUpdate(payload);
          dbWriteRes = updOutcome.res;
          if (useExt && dbWriteRes?.error && isIgnorableSchemaError(dbWriteRes.error)) {
            markInboxSchemaCapUnsupported('brokerClientsExtended');
            updOutcome = await runCanonicalUpdate(legacyBase);
            dbWriteRes = updOutcome.res;
          }

          // Inbox P1-1: Undo-Delete re-inserts a previously hard-deleted UUID row when 0 rows matched
          if (
            !dbWriteRes?.error &&
            updOutcome.canCheckMatched &&
            !updOutcome.matchedRow &&
            action === 'upsert_client'
          ) {
            const effectiveExt = getInboxSchemaCaps().brokerClientsExtended;
            dbWriteRes = await runCanonicalReinsert(effectiveExt);
            if (effectiveExt && dbWriteRes?.error && isIgnorableSchemaError(dbWriteRes.error)) {
              markInboxSchemaCapUnsupported('brokerClientsExtended');
              dbWriteRes = await runCanonicalReinsert(false);
            }
          }
        } else if (action === 'upsert_client') {
          attemptedCanonical = true;
          const runInsert = async (includeExt: boolean): Promise<LooseQueryResult> => {
            const insQ = looseDb.from('broker_clients').insert({
              broker_id: userId,
              ...legacyBase,
              ...(includeExt
                ? {
                    ...(clientEmail ? { email: clientEmail } : {}),
                    ...structuredExtra,
                    consent_status: 'pending',
                    consent_source: 'broker_manual',
                  }
                : {}),
            });
            if (typeof insQ.select === 'function') {
              const sq = insQ.select('id');
              return typeof sq.single === 'function' ? await sq.single() : await sq;
            }
            return await insQ;
          };
          const useExt = getInboxSchemaCaps().brokerClientsExtended;
          dbWriteRes = await runInsert(useExt);
          if (useExt && dbWriteRes?.error && isIgnorableSchemaError(dbWriteRes.error)) {
            markInboxSchemaCapUnsupported('brokerClientsExtended');
            dbWriteRes = await runInsert(false);
          }
          const createdRow = asRecord(dbWriteRes?.data);
          if (createdRow.id) {
            canonicalClientUuid = isUuid(String(createdRow.id)) ? String(createdRow.id) : null;
            resolvedClientId = `custom_${String(createdRow.id)}`;
          }
        }
      } catch (err) {
        dbWriteRes = { error: { message: err instanceof Error ? err.message : String(err) } };
      }

      const canonicalErr = dbWriteRes?.error ?? null;
      if (attemptedCanonical && canonicalErr && !isIgnorableSchemaError(canonicalErr)) {
        log.error('broker_clients upsert failed', {
          code: canonicalErr?.code ?? null,
          error: canonicalErr?.message ?? null,
        });
        return NextResponse.json(
          { ok: false, persisted: false, error: '고객 정보 저장 중 데이터베이스 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
      const canonicalOk = attemptedCanonical && !canonicalErr;

      // WP-7.4E P1-1: when broker opts in a valid, non-suppressed/non-confirmed email,
      // ensure a 'pending' row in magazine_subscribers and trigger DOI confirmation email.
      if (newsletterSubscribed && clientEmail && effectiveConsentStatus !== 'unsubscribed' && !confirmedOptIn) {
        const doiRes = await ensurePendingMagazineOptIn(supabase, {
          userId,
          email: clientEmail,
          clientName,
          clientPhone,
          rawClientUuid: canonicalClientUuid,
        });
        if (doiRes.outcome === 'already_confirmed') {
          effectiveConsentStatus = 'confirmed';
          confirmedOptIn = true;
          optInPending = false;
          confirmEmailSent = false;
          if (canonicalOk && canonicalClientUuid) {
            const confirmedTags = buildTagsPayload(true, false, 'confirmed');
            await supabase
              .from('broker_clients')
              .update({ consent_status: 'confirmed', tags: confirmedTags })
              .eq('id', canonicalClientUuid)
              .eq('broker_id', userId)
              .then(
                () => null,
                () => null
              );
          }
        } else if (doiRes.outcome === 'suppressed_or_unsubscribed') {
          confirmedOptIn = false;
          optInPending = false;
          confirmEmailSent = false;
        } else if (doiRes.outcome === 'pending_dispatched') {
          effectiveConsentStatus = 'pending';
          confirmedOptIn = false;
          optInPending = true;
          confirmEmailSent = doiRes.confirmEmailSent;
        }
      }

      let evErr: unknown = null;
      try {
        const evRes = await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: 'custom_client_upserted',
          entity_type: 'building',
          entity_id: resolvedBuildingId && isUuid(resolvedBuildingId) ? resolvedBuildingId : userId,
          metadata: {
            client_id: resolvedClientId,
            raw_client_id: isUuid(rawUuidCandidate)
              ? rawUuidCandidate
              : resolvedClientId.replace(/^(?:custom[-_]|cli-)/, ''),
            client_name: clientName,
            client_grade: clientGrade,
            is_vip: resolvedIsVip,
            client_role: resolvedClientRole,
            client_phone: clientPhone,
            client_email: clientEmail || '',
            transactional_basis: transactionalBasis || '',
            preferred_regions: resolvedPreferredRegions,
            preferred_region: preferredRegion,
            budget_manwon: resolvedBudgetManwon,
            budget,
            free_memo: resolvedFreeMemo,
            building_id: resolvedBuildingId,
            building_title: buildingTitle,
            newsletter_subscribed: confirmedOptIn,
            newsletter_opt_in_pending: optInPending,
            consent_status: effectiveConsentStatus,
          },
        });
        evErr = evRes?.error ?? null;
      } catch (err) {
        evErr = err;
      }

      if (canonicalOk) {
        persistence = 'canonical';
      } else if (!evErr) {
        persistence = attemptedCanonical ? 'activity_event_fallback' : 'activity_event_only';
        if (attemptedCanonical) {
          log.warn('broker_clients unavailable (pre-cutover schema); upsert recorded to activity_events only', {
            code: canonicalErr?.code ?? null,
          });
        }
      } else {
        return NextResponse.json(
          { ok: false, persisted: false, error: '고객 정보 저장 중 데이터베이스 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }
  }

  if (!resolvedClientId.startsWith('custom_') && !resolvedClientId.startsWith('cli-')) {
    resolvedClientId = `custom_${resolvedClientId}`;
  }
  const state = upsertCustomInboxClient({
    id: resolvedClientId,
    ownerId: userId,
    clientName,
    clientGrade,
    clientPhone,
    clientEmail,
    transactionalBasis,
    budget,
    preferredRegion,
    buildingId: resolvedBuildingId,
    buildingTitle,
    newsletterSubscribed: confirmedOptIn,
  });
  const matchedMem = state.customClients.find((c) => c.id === resolvedClientId && c.ownerId === userId);
  const extraMem = {
    isVip: resolvedIsVip,
    clientRole: resolvedClientRole,
    preferredRegions: resolvedPreferredRegions,
    budgetManwon: resolvedBudgetManwon,
    freeMemo: resolvedFreeMemo,
    consentStatus: effectiveConsentStatus,
    newsletterOptInPending: optInPending,
  };
  if (matchedMem) {
    Object.assign(matchedMem as unknown as Record<string, unknown>, extraMem);
    saveInboxState(state);
  }
  const ownSavedClient = {
    ...(matchedMem || {
      id: resolvedClientId,
      ownerId: userId,
      clientName,
      clientGrade,
      clientPhone,
      clientEmail,
      transactionalBasis,
      budget,
      preferredRegion,
      buildingId: resolvedBuildingId,
      buildingTitle,
      newsletterSubscribed: confirmedOptIn,
      createdAt: new Date().toISOString(),
    }),
    ...extraMem,
  };
  return NextResponse.json({
    ok: true,
    persisted: persistence !== 'memory_only',
    persistence,
    ...(persistence === 'activity_event_fallback'
      ? {
          warning:
            '고객 DB 테이블이 아직 준비되지 않아 활동 기록에만 임시 저장했습니다. 데이터베이스 업데이트 후 다시 저장해 주세요.',
        }
      : {}),
    action,
    clientId: ownSavedClient.id,
    newsletterSubscribed: confirmedOptIn,
    optInPending,
    ...(confirmEmailSent !== undefined ? { confirmEmailSent } : {}),
    client: ownSavedClient,
  });
}

/**
 * WP-7.4E P1-3: shared tombstone + PII scrub + memory eviction helper invoked by both
 * Inbox `delete_client` and `DELETE /api/broker/clients/[id]` so deleted CRM contacts
 * are never resurrected from prior `activity_events` or in-memory state.
 */
export async function purgeDeletedBrokerClientArtifacts(
  supabase: ServiceSupabase | null,
  params: { userId: string; targetKey?: string; rawClientId: string }
): Promise<{ tombstoneRecorded: boolean; piiScrubbed: boolean; tombstoneError?: unknown }> {
  const { userId } = params;
  const rawClientId = params.rawClientId.replace(/^(?:custom[-_]|cli-)/, '');
  const targetKey = params.targetKey || (rawClientId ? `custom_${rawClientId}` : '');

  const state = getInboxState();
  state.customClients = (state.customClients || []).filter(
    (c) =>
      !(
        c.ownerId === userId &&
        (c.id === targetKey ||
          c.id === rawClientId ||
          c.id === `custom_${rawClientId}` ||
          c.id === `cli-${rawClientId}`)
      )
  );
  saveInboxState(state);

  if (!supabase || !isUuid(userId)) {
    return { tombstoneRecorded: false, piiScrubbed: false };
  }

  const { error: delEvErr } = await supabase.from('activity_events').insert({
    actor_id: userId,
    event_type: 'custom_client_deleted',
    entity_type: 'building',
    entity_id: userId,
    metadata: {
      client_id: targetKey,
      raw_client_id: rawClientId,
      deleted_at: new Date().toISOString(),
    },
  });
  if (delEvErr) {
    return { tombstoneRecorded: false, piiScrubbed: false, tombstoneError: delEvErr };
  }

  const piiScrubbed = await scrubDeletedClientPiiEvents(supabase, {
    userId,
    targetKey,
    rawClientId,
  });
  return { tombstoneRecorded: true, piiScrubbed };
}

export async function handleDeleteClientAction(params: {
  action: string;
  userId: string;
  threadId: string;
  clientId: string;
}) {
  const { action, userId, threadId, clientId } = params;
  const targetKey = clientId || threadId;
  if (!targetKey) {
    return NextResponse.json({ ok: false, error: '삭제할 고객 ID가 필요합니다.' }, { status: 400 });
  }
  const rawClientId = targetKey.replace(/^(?:custom[-_]|cli-)/, '');

  const { supabase, blocked } = tryGetServiceClient();
  if (blocked) {
    return NextResponse.json(
      { ok: false, persisted: false, error: '데이터베이스 연결을 초기화할 수 없습니다.' },
      { status: 503 }
    );
  }

  if (supabase && isUuid(userId) && isUuid(rawClientId)) {
    const { error: cliDelErr } = await supabase
      .from('broker_clients')
      .delete()
      .eq('id', rawClientId)
      .eq('broker_id', userId);
    if (cliDelErr && !isIgnorableSchemaError(cliDelErr)) {
      return NextResponse.json(
        { ok: false, persisted: false, error: '고객 정보 삭제 중 데이터베이스 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  }

  const purged = await purgeDeletedBrokerClientArtifacts(supabase, {
    userId,
    targetKey,
    rawClientId,
  });
  if (purged.tombstoneError) {
    return NextResponse.json(
      { ok: false, persisted: false, error: '고객 삭제 기록 저장 중 데이터베이스 오류가 발생했습니다.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    action,
    deletedId: targetKey,
    piiScrubbed: purged.piiScrubbed,
  });
}

/** Non-statutory CRM events whose metadata carries client PII (name/phone/email/memo). */
const CLIENT_PII_EVENT_TYPES = ['custom_client_upserted', 'inbox_custom_client_upserted', 'call_note_recorded'] as const;

/**
 * WP-7.3E P1-10: on client deletion, scrub PII from that client's prior non-statutory CRM events.
 * Statutory consent/suppression evidence (newsletter_subscription_toggled, email_suppression_recorded,
 * magazine_unsubscribed, email_bounced/complained …) is intentionally left untouched.
 */
async function scrubDeletedClientPiiEvents(
  supabase: ServiceSupabase,
  params: { userId: string; targetKey: string; rawClientId: string }
): Promise<boolean> {
  const { userId, targetKey, rawClientId } = params;
  const keys = new Set(
    [targetKey, rawClientId, rawClientId ? `custom_${rawClientId}` : '', rawClientId ? `cli-${rawClientId}` : ''].filter(Boolean)
  );
  const looseDb = supabase as unknown as LooseDb;
  try {
    let q = looseDb.from('activity_events').select('id, event_type, entity_id, metadata');
    if (typeof q.eq === 'function') q = q.eq('actor_id', userId);
    if (typeof q.in === 'function') q = q.in('event_type', [...CLIENT_PII_EVENT_TYPES]);
    if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
    if (typeof q.limit === 'function') q = q.limit(2000);
    const res = await q;
    if (res?.error) {
      if (!isIgnorableSchemaError(res.error)) {
        log.warn('client PII scrub lookup failed', { code: res.error.code ?? null });
        return false;
      }
      return true;
    }
    let ok = true;
    for (const evRaw of Array.isArray(res?.data) ? res.data : []) {
      const ev = asRecord(evRaw);
      const meta = asRecord(ev.metadata);
      if (meta.pii_scrubbed_at) continue;
      const refs = [meta.client_id, meta.raw_client_id, meta.thread_id]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);
      const entityMatches =
        String(ev.event_type) === 'call_note_recorded' && rawClientId && isUuid(rawClientId) && ev.entity_id === rawClientId;
      if (!refs.some((r) => keys.has(r)) && !entityMatches) continue;
      const scrubbed: Record<string, unknown> = {
        client_id: meta.client_id ?? null,
        raw_client_id: meta.raw_client_id ?? null,
        thread_id: meta.thread_id ?? null,
        building_id: meta.building_id ?? null,
        consent_status: meta.consent_status ?? null,
        newsletter_subscribed: false,
        pii_scrubbed_at: new Date().toISOString(),
        pii_scrub_reason: 'client_deleted',
      };
      const upd = await supabase
        .from('activity_events')
        .update({ metadata: scrubbed })
        .eq('id', String(ev.id || ''))
        .eq('actor_id', userId);
      if (upd?.error) ok = false;
    }
    return ok;
  } catch (err) {
    log.warn('client PII scrub threw', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
