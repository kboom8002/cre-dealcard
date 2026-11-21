import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getInboxState, isUuid, listAllQuickImRecords } from '@/lib/im-lite/quick-generate-store';
import { listWorkspaceItemsForOwner } from '@/lib/workspace/workspace-repository';
import {
  isBuildingShareLinkRevokedAsync,
  issueShareLinkToken,
  verifyShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';
import { getBrokerSubscriptionTier } from '@/domain/subscription/tier-gate';
import { createModuleLogger } from '@/lib/logger';
import {
  buildInboxCopyBundle,
  buildInboxUnsubscribeUrl,
  evaluateInboxAlimtalkAccess,
  normalizeClientEmail,
  normalizeTransactionalBasis,
  sendInboxClientEmail,
  sendInboxTransactionalAlimtalk,
  type InboxAlimtalkTemplateId,
  type InboxEmailDeliveryPurpose,
} from '@/domain/inbox/inbox-outbound';
import {
  getInboxSchemaCaps,
  isIgnorableSchemaError,
  markInboxSchemaCapUnsupported,
} from './inbox-schema-caps';
import { hashShareTokenForAudit, parseGateRequestReason, stripShareTokenFromUrl } from './inbox-helpers';
import {
  hashEmailForSuppression,
  isEmailSuppressed,
  SUPPRESSION_LOOKUP_FAILED,
} from '@/lib/legal/email-suppression';
import { assertPublishable } from '@/lib/legal/publish-gate';

type ServiceSupabase = ReturnType<typeof createServiceClient>;

const log = createModuleLogger('inbox-actions-outbound');

const POSTGREST_SAFE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const INQUIRY_BROKER_OWNER_COLS = ['broker_user_id', 'broker_id', 'target_broker_id', 'owner_id'] as const;

type LooseQueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

type LooseQuery = PromiseLike<LooseQueryResult> & {
  eq?: (col: string, val: unknown) => LooseQuery;
  in?: (col: string, vals: unknown[]) => LooseQuery;
  or?: (expr: string) => LooseQuery;
  order?: (col: string, opts?: { ascending?: boolean }) => LooseQuery;
  limit?: (n: number) => LooseQuery;
  maybeSingle?: () => PromiseLike<LooseQueryResult>;
  single?: () => PromiseLike<LooseQueryResult>;
};

type LooseDb = {
  from: (table: string) => {
    select: (cols?: string) => LooseQuery;
  };
  auth?: {
    admin?: {
      getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string | null } | null } | null }>;
    };
  };
};

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

async function maybeSingleRow(q: LooseQuery | undefined): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  if (!q) return { data: null, error: null };
  const r =
    typeof q.maybeSingle === 'function'
      ? await q.maybeSingle()
      : typeof q.single === 'function'
        ? await q.single()
        : await q;
  const data = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : null;
  return { data, error: r?.error ?? null };
}

async function isBuildingOwnedByBroker(supabase: ServiceSupabase, userId: string, buildingId: unknown): Promise<boolean> {
  const bid = typeof buildingId === 'string' ? buildingId.trim() : '';
  if (!bid || !isUuid(bid)) return false;
  const looseDb = supabase as unknown as LooseDb;
  for (const tbl of ['building_ssot_lite', 'workspace_items'] as const) {
    try {
      const q = looseDb.from(tbl).select('id, owner_id');
      const eqQ = typeof q.eq === 'function' ? q.eq('id', bid) : q;
      const r = await maybeSingleRow(eqQ);
      if (!r.error && r.data?.owner_id && String(r.data.owner_id) === userId) return true;
    } catch {
      // table may not exist pre-cutover
    }
  }
  return false;
}

/**
 * WP-7.3E P1-1: resolves the owned inquiry/gate/tour row behind a thread and the requester email(s)
 * recorded on it. A transactional (non-ad) reply is only allowed to an address recorded on that row.
 */
async function resolveVerifiedInquiryRecipient(
  supabase: ServiceSupabase,
  userId: string,
  rawTargetId: string
): Promise<{ ownedRecord: boolean; requesterEmails: Set<string> }> {
  const out = { ownedRecord: false, requesterEmails: new Set<string>() };
  if (!rawTargetId || !isUuid(rawTargetId)) return out;
  const looseDb = supabase as unknown as LooseDb;
  for (const tbl of ['gate_requests', 'im_inquiry_requests', 'inquiries', 'im_pro_grants'] as const) {
    let row: Record<string, unknown> | null = null;
    try {
      const q = looseDb.from(tbl).select('*');
      const eqQ = typeof q.eq === 'function' ? q.eq('id', rawTargetId) : q;
      const r = await maybeSingleRow(eqQ);
      if (r.error || !r.data?.id) continue;
      row = r.data;
    } catch {
      continue; // table may not exist
    }
    const brokerRefs = INQUIRY_BROKER_OWNER_COLS.map((c) => row?.[c])
      .filter((v) => v !== null && v !== undefined && String(v).trim())
      .map((v) => String(v).trim());
    let owned = brokerRefs.includes(userId);
    if (!owned && brokerRefs.length > 0) continue; // explicitly another broker's row
    if (!owned) owned = await isBuildingOwnedByBroker(supabase, userId, row.building_id);
    if (!owned) continue;

    out.ownedRecord = true;
    const addEmail = (raw: unknown) => {
      const e = normalizeClientEmail(typeof raw === 'string' ? raw : null);
      if (e) out.requesterEmails.add(e);
    };
    addEmail(row.requester_email);
    addEmail(row.email);
    addEmail(row.contact_email);
    addEmail(parseGateRequestReason(row.reason).requesterEmail);
    addEmail(parseGateRequestReason(row.message).requesterEmail);
    if (tbl === 'gate_requests' && row.requester_id && isUuid(String(row.requester_id))) {
      try {
        const admin = looseDb.auth?.admin;
        if (admin && typeof admin.getUserById === 'function') {
          const au = await admin.getUserById(String(row.requester_id));
          addEmail(au?.data?.user?.email);
        }
      } catch {
        // auth admin unavailable — rely on recorded row fields only
      }
    }
    break;
  }
  return out;
}

async function resolveBrokerMeta(supabase: ServiceSupabase, userId: string) {
  let brokerName = '담당 중개인';
  let brokerCompany = '';
  let brokerPhone = '';
  let brokerAddress = '';
  let brokerEmail = '';
  let brokerRegNumber = '';
  let brokerSlug = '';
  let subscriptionInfo: { tier: 'free' | 'pro' | 'premium'; isPaid: boolean; status: string } = {
    tier: 'free',
    isPaid: false,
    status: 'free',
  };
  try {
    subscriptionInfo = await getBrokerSubscriptionTier(supabase, userId);
  } catch {
    // default free tier on test/offline DB
  }
  if (isUuid(userId)) {
    const looseDb = supabase as unknown as LooseDb;
    try {
      const pfQ = looseDb.from('profiles').select('display_name, company, phone');
      const pfEq = typeof pfQ.eq === 'function' ? pfQ.eq('id', userId) : pfQ;
      const pf = (await maybeSingleRow(pfEq)).data;
      if (pf?.display_name) brokerName = String(pf.display_name).trim() || brokerName;
      if (pf?.company) brokerCompany = String(pf.company).trim();
      if (pf?.phone) brokerPhone = String(pf.phone).trim();
      if (pf?.email) {
        brokerEmail = String(pf.email).trim();
      }
    } catch {
      // non-blocking
    }
    try {
      const bpQ = looseDb
        .from('broker_profiles')
        .select('office_address, office_reg_number, contact_email, slug');
      const bpEq = typeof bpQ.eq === 'function' ? bpQ.eq('user_id', userId) : bpQ;
      const bp = (await maybeSingleRow(bpEq)).data;
      if (bp) {
        if (bp.office_address) brokerAddress = String(bp.office_address).trim();
        if (bp.office_reg_number) brokerRegNumber = String(bp.office_reg_number).trim();
        if (bp.contact_email) brokerEmail = String(bp.contact_email).trim();
        if (bp.slug) brokerSlug = String(bp.slug).trim();
        if (brokerName === '담당 중개인' && bp.display_name) brokerName = String(bp.display_name).trim() || brokerName;
        if (!brokerCompany && bp.company) brokerCompany = String(bp.company).trim();
        if (!brokerPhone && bp.phone) brokerPhone = String(bp.phone).trim();
      }
    } catch {
      // non-blocking
    }
  }
  return { brokerName, brokerCompany, brokerPhone, brokerAddress, brokerEmail, brokerRegNumber, brokerSlug, subscriptionInfo };
}

async function checkEmailDeliveryEligibility(params: {
  supabase: ServiceSupabase;
  userId: string;
  brokerSlug: string;
  precheckedEmail: string;
  recipientRef: string | null;
}) {
  const { supabase, userId, brokerSlug, precheckedEmail, recipientRef } = params;
  const looseDb = supabase as unknown as LooseDb;
  const brokerKeys = Array.from(new Set([userId, brokerSlug].filter(Boolean)));
  const rawTargetId = (recipientRef || '').replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
  const emailHash = precheckedEmail ? hashEmailForSuppression(precheckedEmail) : '';
  let activeSubscriberRow: Record<string, unknown> | null = null;
  let hasPendingSubscriberRow = false;
  let bouncedOrComplained = false;
  let unsubscribedBySubscriber = false;

  if (precheckedEmail) {
    const suppCheck = await isEmailSuppressed(supabase, {
      email: precheckedEmail,
      brokerId: userId,
      brokerKeys,
    });
    if (suppCheck.suppressed) {
      if (suppCheck.reason === SUPPRESSION_LOOKUP_FAILED) {
        return {
          errorResponse: NextResponse.json(
            {
              ok: false,
              code: 'SUPPRESSION_CHECK_UNAVAILABLE',
              blockedReason: 'SUPPRESSION_CHECK_UNAVAILABLE',
              error: '수신거부 목록을 확인할 수 없어 안전을 위해 발송을 보류했습니다. 잠시 후 다시 시도해 주세요.',
            },
            { status: 503 }
          ),
        };
      }
      if (suppCheck.reason === 'hard_bounce' || suppCheck.reason === 'complaint') {
        bouncedOrComplained = true;
      } else {
        unsubscribedBySubscriber = true;
      }
    }
  }

  try {
    const extCols =
      'id, broker_id, subscriber_email, status, confirm_status, consent_status, unsubscribed_at, night_consent, email_delivery_status, email_bounced_at, email_bounce_reason, created_at';
    const baseCols = 'id, broker_id, subscriber_email, status, confirm_status, unsubscribed_at, created_at';
    const runSubQ = async (ext: boolean) => {
      let q = looseDb.from('magazine_subscribers').select(ext ? extCols : baseCols);
      if (typeof q.in === 'function' && brokerKeys.length > 0) q = q.in('broker_id', brokerKeys);
      else if (typeof q.eq === 'function') q = q.eq('broker_id', userId);
      return await q;
    };
    const useSubExt = getInboxSchemaCaps().subscriberExtended;
    let subRes = await runSubQ(useSubExt);
    if (useSubExt && subRes?.error && isIgnorableSchemaError(subRes.error)) {
      markInboxSchemaCapUnsupported('subscriberExtended');
      subRes = await runSubQ(false);
    }
    for (const sRaw of Array.isArray(subRes?.data) ? subRes.data : []) {
      const s = asRecord(sRaw);
      const rowBroker = String(s.broker_id || '').trim();
      if (rowBroker && brokerKeys.length > 0 && !brokerKeys.includes(rowBroker)) continue;
      const rawSubEm = s.subscriber_email ?? s.email;
      const matchesEmail = normalizeClientEmail(typeof rawSubEm === 'string' ? rawSubEm : null) === precheckedEmail;
      const matchesId = Boolean(recipientRef?.startsWith('sub_') && rawTargetId && String(s.id || '') === rawTargetId);
      if (!matchesEmail && !matchesId) continue;
      const ds = String(s.email_delivery_status ?? 'ok').toLowerCase();
      if (ds === 'bounced' || ds === 'complained') bouncedOrComplained = true;
      const st = String(s.status ?? 'active').toLowerCase();
      const cf = String(s.confirm_status ?? s.consent_status ?? 'pending').toLowerCase();
      if (st === 'unsubscribed' || st === 'inactive' || cf === 'unsubscribed' || Boolean(s.unsubscribed_at)) {
        unsubscribedBySubscriber = true;
      } else if (st === 'active' && cf === 'confirmed') {
        activeSubscriberRow = s;
      } else if (st === 'active') {
        hasPendingSubscriberRow = true;
      }
    }
    if (!bouncedOrComplained) {
      let gsQ = looseDb
        .from('magazine_subscribers')
        .select('id, subscriber_email, email_delivery_status');
      if (typeof gsQ.eq === 'function') {
        gsQ = gsQ.eq('subscriber_email', precheckedEmail);
      }
      const gsRes = await gsQ;
      if (!gsRes?.error && Array.isArray(gsRes?.data)) {
        for (const gsRaw of gsRes.data) {
          const gs = asRecord(gsRaw);
          const ds = String(gs.email_delivery_status ?? 'ok').toLowerCase();
          if (ds === 'bounced' || ds === 'complained') {
            bouncedOrComplained = true;
            break;
          }
        }
      }
    }
  } catch {
    // non-blocking
  }

  const matchesRecipientEv = (ev: Record<string, unknown>, meta: Record<string, unknown>) => {
    const evEmailHash = typeof meta.email_hash === 'string' ? meta.email_hash.trim().toLowerCase() : '';
    if (emailHash && evEmailHash && evEmailHash === emailHash) return true;
    const evEmail = normalizeClientEmail(
      String(meta.client_email || meta.subscriber_email || meta.to_email || meta.email || '')
    );
    if (evEmail && evEmail === precheckedEmail) return true;
    return Boolean(
      recipientRef &&
        (meta.client_id === recipientRef ||
          meta.thread_id === recipientRef ||
          (rawTargetId &&
            (meta.raw_client_id === rawTargetId || meta.subscriber_id === rawTargetId || ev.entity_id === rawTargetId)))
    );
  };

  if (!bouncedOrComplained) {
    try {
      const buildBounceQ = (filtered: boolean) => {
        let bQ = looseDb.from('activity_events').select('id, actor_id, entity_id, event_type, metadata, created_at');
        if (typeof bQ.in === 'function') bQ = bQ.in('event_type', ['email_bounced', 'email_complained']);
        if (filtered && typeof bQ.or === 'function') {
          const parts = [
            ...(isUuid(userId) ? [`actor_id.eq.${userId}`] : []),
            ...(emailHash ? [`metadata->>email_hash.eq.${emailHash}`] : []),
            ...(POSTGREST_SAFE_EMAIL.test(precheckedEmail)
              ? [
                  `metadata->>email.eq.${precheckedEmail}`,
                  `metadata->>to_email.eq.${precheckedEmail}`,
                  `metadata->>client_email.eq.${precheckedEmail}`,
                ]
              : []),
          ];
          if (parts.length > 0) {
            bQ = bQ.or(parts.join(','));
          }
        }
        if (typeof bQ.order === 'function') bQ = bQ.order('created_at', { ascending: false });
        if (typeof bQ.limit === 'function') bQ = bQ.limit(500);
        return bQ;
      };
      const canFilter = Boolean(emailHash || POSTGREST_SAFE_EMAIL.test(precheckedEmail));
      let bRes = await buildBounceQ(canFilter);
      if (canFilter && bRes?.error) bRes = await buildBounceQ(false);
      for (const evRaw of Array.isArray(bRes?.data) ? bRes.data : []) {
        const ev = asRecord(evRaw);
        if (ev.actor_id && String(ev.actor_id) !== userId) continue;
        const meta = asRecord(ev.metadata);
        if (matchesRecipientEv(ev, meta)) {
          bouncedOrComplained = true;
          break;
        }
      }
    } catch {
      // non-blocking
    }
  }

  let latestEventSubscribed: boolean | null = null;
  let latestUpsertOptIn: boolean | null = null;
  try {
    let evQ = looseDb.from('activity_events').select('id, actor_id, entity_id, event_type, metadata, created_at');
    if (typeof evQ.eq === 'function') evQ = evQ.eq('actor_id', userId);
    if (typeof evQ.in === 'function') {
      evQ = evQ.in('event_type', [
        'newsletter_subscription_toggled',
        'magazine_unsubscribed',
        'magazine_subscribed',
        'custom_client_upserted',
        'inbox_custom_client_upserted',
      ]);
    }
    if (typeof evQ.order === 'function') evQ = evQ.order('created_at', { ascending: true });
    const evRes = await evQ;
    const evRows = [...(Array.isArray(evRes?.data) ? evRes.data.map(asRecord) : [])].sort(
      (a, b) => Date.parse(String(a.created_at || '')) - Date.parse(String(b.created_at || ''))
    );
    for (const ev of evRows) {
      if (ev.actor_id && String(ev.actor_id) !== userId) continue;
      const meta = asRecord(ev.metadata);
      if (!matchesRecipientEv(ev, meta)) continue;
      if (ev.event_type === 'newsletter_subscription_toggled') {
        const rawSub = meta.subscribed ?? meta.newsletter_subscribed;
        const toggleConsent = String(meta.consent_status || '').toLowerCase();
        const isTogglePending =
          meta.newsletter_opt_in_pending === true ||
          toggleConsent === 'pending' ||
          toggleConsent === 'unconfirmed';
        if (rawSub === false) latestEventSubscribed = false;
        else if (rawSub === true && !isTogglePending && toggleConsent === 'confirmed') latestEventSubscribed = true;
      } else if (ev.event_type === 'magazine_unsubscribed') {
        latestEventSubscribed = false;
      } else if (ev.event_type === 'magazine_subscribed') {
        latestEventSubscribed = true;
      } else if (ev.event_type === 'custom_client_upserted' || ev.event_type === 'inbox_custom_client_upserted') {
        const upsertConsent = String(meta.consent_status || '').toLowerCase();
        const isUpsertConfirmed = upsertConsent === 'confirmed' && meta.newsletter_opt_in_pending !== true;
        if ((meta.newsletter_subscribed === true || meta.subscribed === true) && isUpsertConfirmed) {
          latestUpsertOptIn = true;
        } else if (
          meta.newsletter_subscribed === false ||
          meta.subscribed === false ||
          meta.newsletter_opt_in_pending === true ||
          upsertConsent === 'pending' ||
          upsertConsent === 'unconfirmed'
        ) {
          latestUpsertOptIn = false;
        }
      }
    }
  } catch {
    // non-blocking
  }

  let unsubscribedByClientTag = false;
  let optedInByClientTag = false;
  let hasUnconfirmedClientRow = false;
  try {
    const useExt = getInboxSchemaCaps().brokerClientsExtended;
    let cliQ = looseDb
      .from('broker_clients')
      .select(useExt ? 'id, email, tags, email_delivery_status, consent_status, unsubscribed_at' : 'id, tags');
    if (typeof cliQ.eq === 'function') cliQ = cliQ.eq('broker_id', userId);
    let cliRes = await cliQ;
    if (useExt && cliRes?.error && isIgnorableSchemaError(cliRes.error)) {
      markInboxSchemaCapUnsupported('brokerClientsExtended');
      let retryQ = looseDb.from('broker_clients').select('id, tags');
      if (typeof retryQ.eq === 'function') retryQ = retryQ.eq('broker_id', userId);
      cliRes = await retryQ;
    }
    for (const cRaw of Array.isArray(cliRes?.data) ? cliRes.data : []) {
      const c = asRecord(cRaw);
      const matchesId = Boolean(rawTargetId) && String(c.id || '') === rawTargetId;
      const matchesEmail =
        normalizeClientEmail(typeof c.email === 'string' ? c.email : null) === precheckedEmail;
      if (!matchesId && !matchesEmail) continue;
      const ds = String(c.email_delivery_status ?? 'ok').toLowerCase();
      if (ds === 'bounced' || ds === 'complained') bouncedOrComplained = true;
      const tags = Array.isArray(c.tags) ? c.tags.map(String) : [];
      const consentStatus = String(c.consent_status ?? '').trim().toLowerCase();
      if (
        consentStatus === 'unsubscribed' ||
        Boolean(c.unsubscribed_at) ||
        tags.some((t: string) => /수신거부|해지|unsub/i.test(t))
      ) {
        unsubscribedByClientTag = true;
      } else if (
        consentStatus === 'pending' ||
        consentStatus === 'unconfirmed' ||
        (consentStatus !== 'confirmed' && tags.some((t: string) => /수신확인대기/i.test(t)))
      ) {
        hasUnconfirmedClientRow = true;
      } else if (
        consentStatus !== 'pending' &&
        consentStatus !== 'unconfirmed' &&
        consentStatus !== 'unsubscribed' &&
        tags.some((t: string) => /뉴스레터구독|수신동의/i.test(t))
      ) {
        optedInByClientTag = true;
      }
    }
  } catch {
    // non-blocking
  }

  if (bouncedOrComplained) {
    return {
      errorResponse: NextResponse.json(
        {
          ok: false,
          code: 'RECIPIENT_BOUNCED_OR_COMPLAINED',
          blockedReason: 'RECIPIENT_BOUNCED_OR_COMPLAINED',
          error: '이전에 반송(수신 불가)되거나 스팸 신고된 이메일 주소이므로 발송이 자동 차단되었습니다.',
        },
        { status: 422 }
      ),
    };
  }
  const isUnsubscribed =
    unsubscribedBySubscriber ||
    latestEventSubscribed === false ||
    (unsubscribedByClientTag && latestEventSubscribed !== true);
  if (isUnsubscribed) {
    return {
      errorResponse: NextResponse.json(
        { ok: false, code: 'RECIPIENT_UNSUBSCRIBED', error: '수신거부(해지)를 요청한 고객에게는 이메일을 발송할 수 없습니다.' },
        { status: 403 }
      ),
    };
  }

  const optedInMem = (getInboxState().customClients || []).some(
    (c) =>
      c &&
      c.ownerId === userId &&
      c.newsletterSubscribed === true &&
      (normalizeClientEmail(c.clientEmail) === precheckedEmail ||
        (Boolean(recipientRef) &&
          (c.id === recipientRef || (Boolean(rawTargetId) && (c.id === rawTargetId || c.id === `custom_${rawTargetId}`)))))
  );
  const isUnconfirmedCrm = (hasUnconfirmedClientRow || hasPendingSubscriberRow) && !activeSubscriberRow;
  const hasExplicitCrmOptIn = isUnconfirmedCrm
    ? false
    : latestEventSubscribed === true ||
      optedInByClientTag ||
      optedInMem ||
      (latestUpsertOptIn === true && latestEventSubscribed === null);

  let hasVerifiedInquiryRecord = false;
  let recipientMatchesInquiry = false;
  const isCustomOrSub = !recipientRef || /^(?:custom[-_]|cli-|sub_|view_)/.test(recipientRef);
  if (!isCustomOrSub && rawTargetId) {
    const verified = await resolveVerifiedInquiryRecipient(supabase, userId, rawTargetId);
    hasVerifiedInquiryRecord = verified.ownedRecord;
    recipientMatchesInquiry = verified.ownedRecord && verified.requesterEmails.has(precheckedEmail);
  }

  return {
    errorResponse: null,
    activeSubscriberRow,
    hasVerifiedInquiryRecord,
    recipientMatchesInquiry,
    hasExplicitCrmOptIn,
    isUnconfirmedCrm,
    isCustomOrSub,
  };
}

async function isOutboundTargetLocked(params: {
  supabase: ServiceSupabase;
  buildingId: string;
  threadId: string;
  clientId: string;
  shareToken: string;
}): Promise<boolean> {
  const { supabase, buildingId, threadId, clientId, shareToken } = params;

  if (buildingId && (await isBuildingShareLinkRevokedAsync(buildingId, supabase))) {
    return true;
  }

  if (shareToken) {
    const check = await verifyShareLinkToken({
      token: shareToken,
      ...(buildingId ? { buildingId } : {}),
    });
    if (!check.valid && check.reason === 'revoked') {
      return true;
    }
  }

  const candidateThreadIds = Array.from(new Set([threadId, clientId].filter(Boolean)));
  for (const tid of candidateThreadIds) {
    if (!isUuid(tid)) continue;
    try {
      const { data: gr } = await supabase
        .from('gate_requests')
        .select('status')
        .eq('id', tid)
        .maybeSingle();
      if (gr?.status === 'revoked') return true;
    } catch {
      // non-blocking on schema gap
    }
  }

  if (candidateThreadIds.length > 0) {
    try {
      const { data: evRows } = await supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .in('event_type', ['thread_link_revoked', 'thread_link_restored', 'link_revoked', 'link_restored'])
        .order('created_at', { ascending: false })
        .limit(50);
      for (const ev of Array.isArray(evRows) ? evRows : []) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, unknown>;
        if (meta.scope === 'recipient_approval') continue;
        const evTid = String(meta.thread_id || meta.gate_request_id || ev?.entity_id || '').trim();
        if (!evTid || !candidateThreadIds.includes(evTid)) continue;
        return ev.event_type === 'thread_link_revoked' || ev.event_type === 'link_revoked';
      }
    } catch {
      // ignore if activity_events mock does not support full chain
    }
  }

  return false;
}

/**
 * 딜카드만 존재하고 아직 IM이 한 번도 생성되지 않은 매물인지 확인한다.
 * DB 테이블이나 모킹 환경에서 판단이 불가능할 때는 false(기존 동작 유지)를 반환해
 * 테스트/레거시 오차단을 방지한다.
 */
async function isDealCardOnlyWithoutIm(
  supabase: ServiceSupabase,
  userId: string,
  buildingId: string
): Promise<boolean> {
  const bid = buildingId.trim();
  if (!bid) return false;
  try {
    const quickHit = listAllQuickImRecords().find((r) => r.buildingId === bid);
    if (quickHit?.basicImDoc) return false;
  } catch {
    // non-blocking
  }
  try {
    const wsRes = await listWorkspaceItemsForOwner(supabase, { ownerId: userId, limit: 200 });
    if (wsRes.tableAvailable && Array.isArray(wsRes.items)) {
      const matching = wsRes.items.filter(
        (w) => !w.deletedAt && w.status !== 'archived' && (w.buildingId === bid || w.legacyId === bid || w.id === bid)
      );
      if (matching.some((w) => w.kind === 'im')) return false;
      if (matching.some((w) => w.kind === 'dealcard')) {
        // Confirm no document_objects IM row exists before blocking
        try {
          const docRes = await maybeSingleRow(
            (supabase as unknown as LooseDb).from('document_objects').select('id').eq?.('building_id', bid)
          );
          if (docRes.data?.id) return false;
        } catch {
          // ignore schema gap
        }
        return true;
      }
    }
  } catch {
    // non-blocking on mocked/offline DB
  }
  return false;
}

export async function handleOutboundChannelAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  clientId: string;
  shareToken: string;
  origin: string;
  body: Record<string, unknown>;
}) {
  const { action, userId, buildingId, threadId, clientId, shareToken, origin, body } = params;
  const isEmailAction = action === 'send_inbox_email' || action === 'send_client_email' || action === 'send_email';
  const isAlimtalkAction = action === 'send_inbox_alimtalk' || action === 'send_alimtalk';
  const toAbsoluteUrl = (rawUrl: string) =>
    !rawUrl ? `${origin}/magazine` : /^https?:\/\//i.test(rawUrl) ? rawUrl : `${origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

  const assetKind: 'im' | 'dealcard' | 'magazine' =
    body?.assetKind === 'dealcard' ? 'dealcard' : body?.assetKind === 'magazine' ? 'magazine' : 'im';
  const recipientRef = threadId || clientId || null;
  const clientName = String(body?.clientName || '고객').trim();
  const buildingTitle = String(body?.buildingTitle || '추천 빌딩').trim();
  const headline = typeof body?.headline === 'string' ? body.headline.trim() : '';

  const rawEmailCandidate = body?.clientEmail ?? body?.toEmail ?? body?.email;
  const precheckedEmail = isEmailAction
    ? normalizeClientEmail(typeof rawEmailCandidate === 'string' ? rawEmailCandidate : null)
    : null;
  if (isEmailAction && !precheckedEmail) {
    return NextResponse.json({ ok: false, error: '수신 가능한 이메일 주소를 먼저 등록·입력해 주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const brokerMeta = await resolveBrokerMeta(supabase, userId);

  const publishGate = await assertPublishable({
    supabase,
    userId,
    kind: assetKind === 'im' ? 'im' : assetKind === 'magazine' ? 'magazine' : 'dealcard',
    brokerMetaOverride: {
      company: brokerMeta.brokerCompany,
      office_address: brokerMeta.brokerAddress,
      phone: brokerMeta.brokerPhone,
      office_reg_number: brokerMeta.brokerRegNumber,
      representative_name: brokerMeta.brokerName,
    },
  });
  if (!publishGate.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: publishGate.code,
        error: publishGate.message,
        missingFields: publishGate.missingFields,
        missingLabels: publishGate.missingLabels,
      },
      { status: 422 }
    );
  }

  let eligibility: Awaited<ReturnType<typeof checkEmailDeliveryEligibility>> | null = null;
  if (isEmailAction && precheckedEmail) {
    eligibility = await checkEmailDeliveryEligibility({
      supabase,
      userId,
      brokerSlug: brokerMeta.brokerSlug,
      precheckedEmail,
      recipientRef,
    });
    if (eligibility.errorResponse) return eligibility.errorResponse;
  }

  const channel: ShareLinkChannel = isEmailAction ? 'email' : isAlimtalkAction ? 'alimtalk' : 'copy';
  let relShareUrl = typeof body?.shareUrl === 'string' && body.shareUrl.trim() ? body.shareUrl.trim() : '';
  let resolvedShareToken = shareToken || '';

  if (assetKind === 'magazine') {
    if (!relShareUrl || relShareUrl === '/magazine') {
      relShareUrl = brokerMeta.brokerSlug ? `/magazine/${encodeURIComponent(brokerMeta.brokerSlug)}` : '/magazine';
    }
    if (recipientRef && !relShareUrl.includes('sid=')) {
      relShareUrl = `${relShareUrl}${relShareUrl.includes('?') ? '&' : '?'}sid=${encodeURIComponent(recipientRef)}`;
    }
  } else if (buildingId) {
    if (assetKind === 'im' && (await isDealCardOnlyWithoutIm(supabase, userId, buildingId))) {
      return NextResponse.json(
        {
          ok: false,
          code: 'IM_NOT_GENERATED',
          error: '아직 상세 제안서(IM)가 생성되지 않은 매물입니다. 딜카드를 보내시거나 IM을 먼저 만들어 주세요.',
        },
        { status: 409 }
      );
    }
    if (await isOutboundTargetLocked({ supabase, buildingId, threadId, clientId, shareToken })) {
      return NextResponse.json(
        {
          ok: false,
          code: 'LINK_REVOKED_LOCKED',
          error: '잠금 처리된 스레드 또는 매물에는 공유 링크를 재발급·발송할 수 없습니다. 잠금 해제 후 다시 시도해 주세요.',
        },
        { status: 409 }
      );
    }
    const issued = await issueShareLinkToken({
      buildingId,
      brokerId: userId,
      recipientId: recipientRef,
      ttlDays: Number(body?.ttlDays) > 0 ? Number(body.ttlDays) : 30,
      kind: assetKind === 'dealcard' ? 'dealcard' : 'im',
      channel,
    });
    resolvedShareToken = issued.token;
    relShareUrl = issued.shareUrl;
  } else if (!relShareUrl) {
    relShareUrl = brokerMeta.brokerSlug ? `/magazine/${encodeURIComponent(brokerMeta.brokerSlug)}` : '/magazine';
  }
  const fullShareUrl = toAbsoluteUrl(relShareUrl);

  const logOutboundEvent = async (eventType: string, metadata: Record<string, unknown>) => {
    if (!isUuid(userId)) return;
    try {
      await supabase.from('activity_events').insert({
        actor_id: userId,
        event_type: eventType,
        entity_type: 'building',
        entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
        metadata,
      });
    } catch {
      // non-blocking
    }
  };

  if (action === 'prepare_copy_bundle') {
    const bundle = buildInboxCopyBundle({
      brokerName: brokerMeta.brokerName,
      brokerPhone: brokerMeta.brokerPhone,
      clientName,
      buildingTitle,
      shareUrl: fullShareUrl,
      headline,
      assetKind,
    });
    await logOutboundEvent('inbox_outbound_copied', {
      thread_id: recipientRef,
      building_id: buildingId || null,
      asset_kind: assetKind,
      share_token_hash: hashShareTokenForAudit(resolvedShareToken) || null,
      share_url: stripShareTokenFromUrl(relShareUrl),
    });
    return NextResponse.json({
      ok: true,
      action,
      shareToken: resolvedShareToken || undefined,
      shareUrl: relShareUrl,
      fullShareUrl,
      subject: bundle.subject,
      messageText: bundle.messageText,
    });
  }

  if (isEmailAction && eligibility) {
    const clientEmail = precheckedEmail!;
    const rawEmailBasis = normalizeTransactionalBasis(body?.transactionalBasis);
    const claimsTransactional =
      !eligibility.isCustomOrSub &&
      body?.deliveryPurpose !== 'marketing_outreach' &&
      assetKind !== 'magazine' &&
      rawEmailBasis !== 'broker_manual' &&
      (eligibility.hasVerifiedInquiryRecord ||
        rawEmailBasis === 'im_request' ||
        rawEmailBasis === 'property_inquiry' ||
        rawEmailBasis === 'tour_booking');
    const transactionalAllowed = claimsTransactional && eligibility.recipientMatchesInquiry;
    const transactionalDowngraded = claimsTransactional && !transactionalAllowed;
    const deliveryPurpose: InboxEmailDeliveryPurpose = transactionalAllowed
      ? 'transactional_reply'
      : 'marketing_outreach';

    const rawCid = (recipientRef || '').replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
    const resolvedSubId = eligibility.activeSubscriberRow?.id
      ? String(eligibility.activeSubscriberRow.id)
      : isUuid(rawCid)
        ? rawCid
        : undefined;
    const unsubUrl =
      deliveryPurpose === 'marketing_outreach'
        ? buildInboxUnsubscribeUrl({
            origin,
            brokerId: brokerMeta.brokerSlug || userId,
            subscriberId: resolvedSubId,
            toEmail: clientEmail,
          }) || null
        : null;

    const emailRes = await sendInboxClientEmail({
      toEmail: clientEmail,
      brokerName: brokerMeta.brokerName,
      brokerCompany: brokerMeta.brokerCompany,
      brokerPhone: brokerMeta.brokerPhone,
      brokerAddress: brokerMeta.brokerAddress,
      brokerEmail: brokerMeta.brokerEmail,
      brokerId: brokerMeta.brokerSlug || userId,
      subscriberId: resolvedSubId,
      clientName,
      buildingTitle,
      shareUrl: fullShareUrl,
      headline,
      assetKind,
      deliveryPurpose,
      transactionalBasis: transactionalAllowed ? rawEmailBasis : null,
      hasInquiryRecord: transactionalAllowed,
      marketingOptIn: Boolean(eligibility.activeSubscriberRow) || eligibility.hasExplicitCrmOptIn,
      nightSendConsent: Boolean(eligibility.activeSubscriberRow?.night_consent === true),
      unsubscribeUrl: unsubUrl,
    });

    if (!emailRes.ok) {
      const status =
        emailRes.blockedReason === 'INVALID_EMAIL'
          ? 400
          : emailRes.blockedReason === 'OPT_IN_REQUIRED' || emailRes.blockedReason === 'QUIET_HOURS_KST'
            ? 403
            : emailRes.blockedReason === 'UNSUBSCRIBE_LINK_UNAVAILABLE'
              ? 503
              : 502;
      const downgradeNotice =
        transactionalDowngraded &&
        (emailRes.blockedReason === 'OPT_IN_REQUIRED' || emailRes.blockedReason === 'QUIET_HOURS_KST')
          ? '수신 주소가 고객의 요청·문의 접수 시 기록된 이메일과 일치하지 않아 정보성(거래) 안내 메일로 보낼 수 없습니다. '
          : '';
      if (!emailRes.blockedReason) {
        log.error('Inbox email dispatch failed', { error: emailRes.error || 'unknown' });
      }
      return NextResponse.json(
        {
          ok: false,
          blockedReason: emailRes.blockedReason,
          code: emailRes.blockedReason,
          subject: emailRes.subject,
          transactionalDowngraded: transactionalDowngraded || undefined,
          error: emailRes.blockedReason
            ? `${downgradeNotice}${emailRes.error || ''}`.trim() || '이메일 발송에 실패했습니다.'
            : '이메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status }
      );
    }

    await logOutboundEvent('inbox_email_sent', {
      thread_id: recipientRef,
      building_id: buildingId || null,
      to_email: clientEmail,
      email_hash: hashEmailForSuppression(clientEmail),
      message_id: emailRes.messageId || null,
      asset_kind: assetKind,
      delivery_purpose: emailRes.deliveryPurpose || deliveryPurpose,
      transactional_downgraded: transactionalDowngraded || undefined,
      broker_reg_number: brokerMeta.brokerRegNumber || null,
      share_token_hash: hashShareTokenForAudit(resolvedShareToken) || null,
      simulated: Boolean(emailRes.simulated),
    });
    return NextResponse.json({
      ok: true,
      action,
      simulated: Boolean(emailRes.simulated),
      messageId: emailRes.messageId,
      deliveryPurpose: emailRes.deliveryPurpose || deliveryPurpose,
      transactionalDowngraded: transactionalDowngraded || undefined,
      toEmail: clientEmail,
      subject: emailRes.subject,
      unsubscribeUrl: emailRes.unsubscribeUrl || undefined,
      shareToken: resolvedShareToken || undefined,
      shareUrl: relShareUrl,
      fullShareUrl,
    });
  }

  const clientPhone = String(body?.clientPhone || '').trim();
  const rawBasis =
    normalizeTransactionalBasis(body?.transactionalBasis) ||
    (recipientRef && !/^(?:custom_|sub_|view_)/.test(recipientRef) ? 'im_request' : null);
  const access = evaluateInboxAlimtalkAccess({
    tier: brokerMeta.subscriptionInfo.tier,
    isPaid: brokerMeta.subscriptionInfo.isPaid,
    transactionalBasis: rawBasis,
    clientPhone,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, code: access.code, tier: brokerMeta.subscriptionInfo.tier, error: access.reason },
      { status: access.code === 'INVALID_PHONE' ? 400 : 403 }
    );
  }

  const validTpls: InboxAlimtalkTemplateId[] = [
    'TPL_INBOX_IM_APPROVED',
    'TPL_INBOX_INQUIRY_REPLY',
    'TPL_INBOX_TOUR_CONFIRMED',
    'TPL_INBOX_CORRECTION_NOTICE',
  ];
  const reqTpl = String(body?.templateId || '') as InboxAlimtalkTemplateId;
  const templateId: InboxAlimtalkTemplateId = validTpls.includes(reqTpl) ? reqTpl : 'TPL_INBOX_IM_APPROVED';

  const alimRes = await sendInboxTransactionalAlimtalk({
    recipientPhone: clientPhone,
    templateId,
    brokerName: brokerMeta.brokerName,
    brokerCompany: brokerMeta.brokerCompany,
    clientName,
    buildingTitle,
    shareUrl: fullShareUrl,
    customMessage: headline,
    transactionalBasis: rawBasis!,
  });
  if (!alimRes.ok) {
    log.error('Inbox Alimtalk dispatch failed', { error: alimRes.error || 'unknown' });
    return NextResponse.json({ ok: false, error: '카카오 알림톡 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
  if (alimRes.simulated) {
    const earlyAccessGuidance =
      'Pro 알림톡 정식 연동 오픈 예정입니다. 이메일 발송 또는 카톡 인사말+링크 1초 복사 기능을 이용해 주세요.';
    return NextResponse.json({
      ok: true,
      action,
      simulated: true,
      simulatedReason: alimRes.simulatedReason || 'LIVE_FLAG_OFF',
      earlyAccess: true,
      dispatched: false,
      messageId: null,
      message: earlyAccessGuidance,
      guidance: earlyAccessGuidance,
      templateId: alimRes.templateId,
      previewText: alimRes.previewText,
      shareToken: resolvedShareToken || undefined,
      shareUrl: relShareUrl,
      fullShareUrl,
    });
  }

  await logOutboundEvent('inbox_alimtalk_sent', {
    thread_id: recipientRef,
    building_id: buildingId || null,
    template_id: templateId,
    transactional_basis: rawBasis,
    share_token_hash: hashShareTokenForAudit(resolvedShareToken) || null,
    simulated: false,
  });
  return NextResponse.json({
    ok: true,
    action,
    simulated: false,
    earlyAccess: false,
    dispatched: true,
    messageId: alimRes.messageId,
    templateId: alimRes.templateId,
    previewText: alimRes.previewText,
    shareToken: resolvedShareToken || undefined,
    shareUrl: relShareUrl,
    fullShareUrl,
  });
}
