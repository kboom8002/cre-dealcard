import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createServiceClient } from '@/lib/supabase/service';
import { isRealProductionRuntime } from '@/lib/env';
import { getInboxState, isUuid, saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { normalizeKrPhone, toE164Kr } from '@/lib/magazine/pii';
import { isMissingColumnError } from '@/lib/magazine/subscriber-view';
import { mergeInterestProfile } from '@/lib/magazine/tags';
import { hashEmailForSuppression, loadSuppressedEmailHashesForBroker } from '@/lib/legal/email-suppression';
import { issueConfirmToken, sendOptInConfirmation } from '@/domain/magazine/consent-service';
import {
  MAX_BULK_IMPORT_ROWS,
  normalizeContactEmail,
  normalizeKoreanContactPhone,
  type BulkClientRole,
} from '@/lib/crm/contact-bulk-parser';
import {
  getInboxSchemaCaps,
  isIgnorableSchemaError,
  markInboxSchemaCapUnsupported,
} from './inbox-schema-caps';

const ContactImportItemSchema = z.object({
  name: z.string().trim().min(1, '고객 이름을 입력해 주세요.').max(100),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  clientRole: z.enum(['buyer', 'seller', 'tenant', 'partner']).optional().default('buyer'),
  isVip: z.boolean().optional().default(false),
  preferredRegions: z.string().trim().max(200).optional().nullable(),
  budgetText: z.string().trim().max(120).optional().nullable(),
  marketingConsent: z.boolean().optional(),
  memo: z.string().trim().max(1000).optional().nullable(),
});

const BulkImportRequestSchema = z.object({
  contacts: z
    .array(ContactImportItemSchema)
    .min(1, '최소 1명 이상의 고객 명단이 필요합니다.')
    .max(MAX_BULK_IMPORT_ROWS, `한 번에 최대 ${MAX_BULK_IMPORT_ROWS}명까지 등록할 수 있습니다.`),
  registerAsNewsletterSubscriber: z.boolean().optional().default(false),
});

interface NormalizedImportCandidate {
  name: string;
  phone?: string;
  phoneDigits?: string;
  email?: string;
  company?: string;
  clientRole: BulkClientRole;
  isVip: boolean;
  preferredRegions?: string;
  budgetText?: string;
  explicitMarketingConsent: boolean;
  memo?: string;
}

interface ExistingCrmContactRef {
  rawId: string;
  hasBrokerClientRow: boolean;
  memIndex: number;
  existingTags: string[];
  existingNotes: string;
  existingCompany: string;
  existingBudget: string;
  existingPreferredRegion: string;
  existingNewsletterSubscribed: boolean;
  existingTier: string;
  existingConsentStatus: string;
}

interface PendingClientUpdate {
  rawId: string;
  payload: Record<string, any>;
  minimalPayload: Record<string, any>;
}

const ROLE_TAG_LABEL: Readonly<Record<BulkClientRole, string>> = {
  buyer: '매수인',
  seller: '매도인',
  tenant: '임차인',
  partner: '공동중개',
};

function buildStructuredNotes(params: {
  budgetText?: string;
  preferredRegions?: string;
  company?: string;
  memo?: string;
  existingNotes?: string;
}): string {
  const parts: string[] = [];
  if (params.budgetText) parts.push(`예산: ${params.budgetText}`);
  if (params.preferredRegions) parts.push(`선호권역: ${params.preferredRegions}`);
  if (params.company) parts.push(`회사: ${params.company}`);
  if (params.memo) parts.push(params.memo);
  const built = parts.join(' / ').trim();
  if (!built) return params.existingNotes || '';
  if (params.existingNotes && !built.includes(params.existingNotes) && !params.existingNotes.startsWith('예산:')) {
    return `${built} / ${params.existingNotes}`;
  }
  return built;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const allowMem = () => !isRealProductionRuntime() && process.env.DISABLE_MEMORY_STORE !== '1';

export async function handleImportContacts(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error || !guard.user?.id) {
    return (
      guard.error ??
      NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } }, { status: 401 })
    );
  }
  const userId = guard.user.id;

  const rateAllowed = await checkRateLimit(userId, 'broker_import_contacts', 20, 60_000);
  if (!rateAllowed) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.' } },
      { status: 429 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_JSON', message: '올바른 요청 형식이 아닙니다.' } }, { status: 400 });
  }

  const parsed = BulkImportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstMsg = parsed.error.issues[0]?.message || '입력 항목을 다시 확인해 주세요.';
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: firstMsg }, details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { contacts: rawContacts, registerAsNewsletterSubscriber } = parsed.data;

  const batchCandidates: NormalizedImportCandidate[] = [];
  const batchByPhone = new Map<string, NormalizedImportCandidate>();
  const batchByEmail = new Map<string, NormalizedImportCandidate>();
  let skippedCount = 0;

  for (const item of rawContacts) {
    const normPhone = item.phone ? normalizeKoreanContactPhone(item.phone) : null;
    const normEmail = item.email ? normalizeContactEmail(item.email) : null;
    if (!normPhone && !normEmail) {
      skippedCount += 1;
      continue;
    }
    const explicitConsent = item.marketingConsent === true;
    const phoneDigits = normPhone?.digits;
    const emailLower = normEmail || undefined;
    const dup = (phoneDigits ? batchByPhone.get(phoneDigits) : undefined) || (emailLower ? batchByEmail.get(emailLower) : undefined);
    if (dup) {
      if (!dup.phone && normPhone?.formatted) {
        dup.phone = normPhone.formatted;
        dup.phoneDigits = normPhone.digits;
      }
      if (!dup.email && emailLower) dup.email = emailLower;
      if (!dup.company && item.company) dup.company = item.company;
      if (item.isVip) dup.isVip = true;
      if (!dup.preferredRegions && item.preferredRegions) dup.preferredRegions = item.preferredRegions;
      if (!dup.budgetText && item.budgetText) dup.budgetText = item.budgetText;
      if (explicitConsent) dup.explicitMarketingConsent = true;
      if (!dup.memo && item.memo) dup.memo = item.memo;
      if (dup.phoneDigits) batchByPhone.set(dup.phoneDigits, dup);
      if (dup.email) batchByEmail.set(dup.email, dup);
      skippedCount += 1;
      continue;
    }
    const cand: NormalizedImportCandidate = {
      name: item.name.trim(),
      phone: normPhone?.formatted,
      phoneDigits,
      email: emailLower,
      company: item.company?.trim() || undefined,
      clientRole: item.clientRole ?? 'buyer',
      isVip: Boolean(item.isVip),
      preferredRegions: item.preferredRegions?.trim() || undefined,
      budgetText: item.budgetText?.trim() || undefined,
      explicitMarketingConsent: explicitConsent,
      memo: item.memo?.trim() || undefined,
    };
    batchCandidates.push(cand);
    if (phoneDigits) batchByPhone.set(phoneDigits, cand);
    if (emailLower) batchByEmail.set(emailLower, cand);
  }

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  let brokerSlug: string | null = null;
  if (supabase) {
    try {
      const bpQ: any = supabase.from('broker_profiles').select('slug').eq('user_id', userId);
      const bpRes = typeof bpQ.maybeSingle === 'function' ? await bpQ.maybeSingle() : await bpQ.single?.();
      if (bpRes?.data?.slug) brokerSlug = String(bpRes.data.slug).trim() || null;
    } catch {
      // optional
    }
  }
  const brokerKeys = Array.from(new Set([userId, brokerSlug].filter((k): k is string => Boolean(k))));

  const useMem = allowMem();
  const inboxState = useMem ? getInboxState() : null;
  const existingByPhone = new Map<string, ExistingCrmContactRef>();
  const existingByEmail = new Map<string, ExistingCrmContactRef>();
  const existingByRawId = new Map<string, ExistingCrmContactRef>();

  const registerRef = (ref: ExistingCrmContactRef, phoneRaw: unknown, emailRaw: unknown) => {
    existingByRawId.set(ref.rawId, ref);
    const normP = phoneRaw ? normalizeKoreanContactPhone(phoneRaw) : null;
    if (normP?.digits && !existingByPhone.has(normP.digits)) existingByPhone.set(normP.digits, ref);
    const normE = emailRaw ? normalizeContactEmail(emailRaw) : null;
    if (normE && !existingByEmail.has(normE)) existingByEmail.set(normE, ref);
  };

  if (useMem && inboxState) {
    (inboxState.customClients || []).forEach((c, idx) => {
      if (!c || c.ownerId !== userId) return;
      const rawId = String(c.id || '').replace(/^(?:custom[-_]|cli-)/, '');
      if (!rawId) return;
      registerRef(
        {
          rawId,
          hasBrokerClientRow: false,
          memIndex: idx,
          existingTags: c.newsletterSubscribed ? ['뉴스레터구독'] : [],
          existingNotes: '',
          existingCompany: '',
          existingBudget: c.budget || '',
          existingPreferredRegion: c.preferredRegion || '',
          existingNewsletterSubscribed: Boolean(c.newsletterSubscribed),
          existingTier: c.clientGrade === 'VIP' ? 'vip' : 'normal',
          existingConsentStatus: c.newsletterSubscribed ? 'confirmed' : 'unconfirmed',
        },
        c.clientPhone,
        c.clientEmail
      );
    });
  }

  const subByPhone = new Map<string, Record<string, any>>();
  const subByEmail = new Map<string, Record<string, any>>();
  const seenSubIds = new Set<string>();
  const indexSubRows = (rows: unknown) => {
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || typeof r !== 'object') continue;
      const row = r as Record<string, any>;
      const rBrokerId = row.broker_id ? String(row.broker_id).trim() : '';
      const rBrokerUserId = row.broker_user_id ? String(row.broker_user_id).trim() : '';
      if (!((rBrokerUserId && rBrokerUserId === userId) || (rBrokerId && brokerKeys.includes(rBrokerId)))) continue;
      const subId = String(row.id || '').trim();
      if (subId && seenSubIds.has(subId)) continue;
      if (subId) seenSubIds.add(subId);
      const isUnsub = String(row.status || '').toLowerCase() === 'unsubscribed' || Boolean(row.unsubscribed_at);
      const normP = normalizeKoreanContactPhone(row.subscriber_phone || row.phone_e164);
      if (normP?.digits && (!subByPhone.get(normP.digits) || isUnsub)) subByPhone.set(normP.digits, row);
      const normE = normalizeContactEmail(row.subscriber_email || row.email);
      if (normE && (!subByEmail.get(normE) || isUnsub)) subByEmail.set(normE, row);
    }
  };

  if (supabase) {
    const caps = getInboxSchemaCaps();
    const cliPromise = isUuid(userId)
      ? (async () => {
          try {
            let res: any = await supabase
              .from('broker_clients')
              .select(
                caps.brokerClientsExtended
                  ? 'id, broker_id, display_name, company, phone, email, tier, tags, notes, consent_status'
                  : 'id, broker_id, display_name, phone, tier, tags, notes'
              )
              .eq('broker_id', userId);
            if (caps.brokerClientsExtended && res?.error && isIgnorableSchemaError(res.error)) {
              markInboxSchemaCapUnsupported('brokerClientsExtended');
              res = await supabase.from('broker_clients').select('id, broker_id, display_name, phone, tier, tags, notes').eq('broker_id', userId);
            }
            return res;
          } catch {
            return { data: [], error: null };
          }
        })()
      : Promise.resolve({ data: [], error: null });

    const subUuidPromise = isUuid(userId) && caps.subscriberBrokerUserId
      ? Promise.resolve(supabase.from('magazine_subscribers').select('*').eq('broker_user_id', userId)).catch(() => ({ data: [], error: null }))
      : Promise.resolve({ data: [], error: null });

    const subKeyPromise = (async () => {
      try {
        let q: any = supabase.from('magazine_subscribers').select('*');
        if (typeof q.in === 'function' && brokerKeys.length > 0) q = q.in('broker_id', brokerKeys);
        else if (typeof q.eq === 'function') q = q.eq('broker_id', brokerSlug || userId);
        return await q;
      } catch {
        return { data: [], error: null };
      }
    })();

    const [bcRes, subUuidRes, subKeyRes] = await Promise.all([cliPromise, subUuidPromise, subKeyPromise]);
    if (!bcRes?.error && Array.isArray(bcRes?.data)) {
      for (const row of bcRes.data) {
        if (row?.broker_id && String(row.broker_id) !== userId) continue;
        const rawId = String(row?.id || '').trim();
        if (!rawId) continue;
        const rowTags = Array.isArray(row.tags) ? row.tags.map(String) : [];
        const rowConsentStatus = String(row.consent_status || '').trim().toLowerCase();
        const hasSubTag =
          rowConsentStatus !== 'pending' &&
          rowConsentStatus !== 'unconfirmed' &&
          rowConsentStatus !== 'unsubscribed' &&
          rowTags.some((t: string) => /뉴스레터구독|수신동의/i.test(t)) &&
          !rowTags.some((t: string) => /수신거부|해지|unsub/i.test(t));
        const normP = row.phone ? normalizeKoreanContactPhone(row.phone) : null;
        const normE = row.email ? normalizeContactEmail(row.email) : null;
        const matched =
          existingByRawId.get(rawId) ||
          (normP?.digits ? existingByPhone.get(normP.digits) : undefined) ||
          (normE ? existingByEmail.get(normE) : undefined);
        if (matched) {
          matched.hasBrokerClientRow = true;
          matched.rawId = rawId;
          matched.existingTags = Array.from(new Set([...matched.existingTags, ...rowTags]));
          if (!matched.existingNotes && row.notes) matched.existingNotes = String(row.notes);
          if (!matched.existingCompany && row.company) matched.existingCompany = String(row.company);
          if (rowConsentStatus) matched.existingConsentStatus = rowConsentStatus;
          if (hasSubTag) matched.existingNewsletterSubscribed = true;
          registerRef(matched, row.phone, row.email);
        } else {
          registerRef(
            {
              rawId,
              hasBrokerClientRow: true,
              memIndex: -1,
              existingTags: rowTags,
              existingNotes: String(row.notes || ''),
              existingCompany: String(row.company || ''),
              existingBudget: '',
              existingPreferredRegion: '',
              existingNewsletterSubscribed: hasSubTag,
              existingTier: String(row.tier || 'normal').toLowerCase(),
              existingConsentStatus: rowConsentStatus || 'unconfirmed',
            },
            row.phone,
            row.email
          );
        }
      }
    }
    if (subUuidRes?.error && isIgnorableSchemaError(subUuidRes.error)) markInboxSchemaCapUnsupported('subscriberBrokerUserId');
    else if (!subUuidRes?.error) indexSubRows(subUuidRes?.data);
    if (!subKeyRes?.error) indexSubRows(subKeyRes?.data);
  }

  const nowIso = new Date().toISOString();
  let plannedInserts = 0;
  let plannedUpdates = 0;
  let subscriberAddedCount = 0;
  let skippedUnsubscribedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const newBrokerClientPayloads: Array<Record<string, any>> = [];
  const pendingClientUpdates: PendingClientUpdate[] = [];

  const suppressedHashes = await loadSuppressedEmailHashesForBroker(supabase, userId);

  for (const contact of batchCandidates) {
    const phoneDigits = contact.phoneDigits || '';
    const emailLower = contact.email || '';
    const emailHash = emailLower ? hashEmailForSuppression(emailLower) : '';
    const isSuppressedEmail = Boolean(emailHash && suppressedHashes.has(emailHash));
    const matchedSub =
      (phoneDigits ? subByPhone.get(phoneDigits) : undefined) || (emailLower ? subByEmail.get(emailLower) : undefined);
    const isUnsubscribed = Boolean(
      isSuppressedEmail ||
        (matchedSub &&
          (String(matchedSub.status || '').toLowerCase() === 'unsubscribed' ||
            String(matchedSub.status || '').toLowerCase() === 'purged' ||
            Boolean(matchedSub.unsubscribed_at)))
    );
    if (isUnsubscribed && contact.explicitMarketingConsent) skippedUnsubscribedCount += 1;

    const hasValidOptIn = contact.explicitMarketingConsent === true && !isUnsubscribed;
    const consentStatus: 'unsubscribed' | 'pending' | 'unconfirmed' = isUnsubscribed
      ? 'unsubscribed'
      : hasValidOptIn
        ? 'pending'
        : 'unconfirmed';
    const crmNewsletterSubscribed = Boolean(hasValidOptIn && registerAsNewsletterSubscriber);
    const existingCrm =
      (phoneDigits ? existingByPhone.get(phoneDigits) : undefined) ||
      (emailLower ? existingByEmail.get(emailLower) : undefined);
    const roleTag = ROLE_TAG_LABEL[contact.clientRole];
    const clientType: 'seller' | 'buyer' = contact.clientRole === 'seller' ? 'seller' : 'buyer';

    if (existingCrm) {
      plannedUpdates += 1;
      const effectiveVip = contact.isVip || existingCrm.existingTier === 'vip';
      const tier = effectiveVip ? 'vip' : 'normal';
      const grade: 'VIP' | '일반' = effectiveVip ? 'VIP' : '일반';
      const mergedBudget = contact.budgetText || existingCrm.existingBudget || '';
      const mergedRegion = contact.preferredRegions || existingCrm.existingPreferredRegion || '';
      const mergedCompany = contact.company || existingCrm.existingCompany || '';
      const isConfirmedCrm = !isUnsubscribed && existingCrm.existingConsentStatus === 'confirmed';
      const isPendingOptIn = !isUnsubscribed && hasValidOptIn && !isConfirmedCrm;
      const effectiveSub = isUnsubscribed
        ? false
        : isConfirmedCrm
          ? crmNewsletterSubscribed || existingCrm.existingNewsletterSubscribed
          : false;
      const cleanedTags = existingCrm.existingTags.filter(
        (t) => !((isUnsubscribed || isPendingOptIn) && /뉴스레터구독|수신동의/i.test(t))
      );
      const nextTags = Array.from(
        new Set(
          [
            ...cleanedTags,
            roleTag,
            mergedRegion,
            mergedBudget,
            isPendingOptIn ? '수신확인대기' : '',
            isConfirmedCrm && hasValidOptIn ? '수신동의' : '',
            isConfirmedCrm && effectiveSub ? '뉴스레터구독' : '',
            isUnsubscribed ? '수신거부' : '',
          ].filter(Boolean)
        )
      );
      const mergedNotes = buildStructuredNotes({
        budgetText: mergedBudget || undefined,
        preferredRegions: mergedRegion || undefined,
        company: mergedCompany || undefined,
        memo: contact.memo,
        existingNotes: existingCrm.existingNotes,
      });

      if (supabase && existingCrm.hasBrokerClientRow && isUuid(userId) && isUuid(existingCrm.rawId)) {
        const minimalPayload: Record<string, any> = {
          display_name: contact.name,
          tier,
          tags: nextTags,
          notes: mergedNotes || null,
          ...(contact.phone ? { phone: contact.phone } : {}),
        };
        const fullPayload: Record<string, any> = {
          ...minimalPayload,
          is_vip: effectiveVip,
          client_role: contact.clientRole,
          company: mergedCompany || null,
          ...(emailLower ? { email: emailLower } : {}),
          ...(isUnsubscribed
            ? { consent_status: 'unsubscribed' }
            : isPendingOptIn
              ? { consent_status: 'pending', consent_source: 'bulk_import' }
              : {}),
        };
        pendingClientUpdates.push({ rawId: existingCrm.rawId, payload: fullPayload, minimalPayload });
      }

      if (useMem && inboxState) {
        const customId = existingCrm.rawId.startsWith('custom_') ? existingCrm.rawId : `custom_${existingCrm.rawId}`;
        const memIdx = inboxState.customClients.findIndex((c) => c.ownerId === userId && (c.id === customId || c.id === existingCrm.rawId));
        const prevMem = memIdx >= 0 ? inboxState.customClients[memIdx] : undefined;
        const entry = {
          id: customId,
          ownerId: userId,
          clientName: contact.name,
          clientGrade: grade,
          clientPhone: contact.phone || prevMem?.clientPhone || '',
          clientEmail: emailLower || prevMem?.clientEmail || null,
          transactionalBasis: prevMem?.transactionalBasis ?? null,
          budget: mergedBudget,
          preferredRegion: mergedRegion,
          buildingId: prevMem?.buildingId || '',
          buildingTitle: prevMem?.buildingTitle || '관심 매물 상담',
          newsletterSubscribed: effectiveSub,
          createdAt: prevMem?.createdAt || nowIso,
        };
        if (memIdx >= 0) inboxState.customClients[memIdx] = entry;
        else inboxState.customClients.unshift(entry);
      }
    } else {
      plannedInserts += 1;
      const rawId = crypto.randomUUID();
      const customId = `custom_${rawId}`;
      const tier = contact.isVip ? 'vip' : 'normal';
      const grade: 'VIP' | '일반' = contact.isVip ? 'VIP' : '일반';
      // Pending double opt-in rows must NEVER receive '수신동의' or '뉴스레터구독' tags until confirmed
      const tags = Array.from(
        new Set(
          [
            roleTag,
            contact.preferredRegions || '',
            contact.budgetText || '',
            consentStatus === 'pending' ? '수신확인대기' : '',
            isUnsubscribed ? '수신거부' : '',
          ].filter(Boolean)
        )
      );
      const notes = buildStructuredNotes({
        budgetText: contact.budgetText,
        preferredRegions: contact.preferredRegions,
        company: contact.company,
        memo: contact.memo,
      });

      newBrokerClientPayloads.push({
        id: rawId,
        broker_id: userId,
        client_type: clientType,
        client_role: contact.clientRole,
        is_vip: contact.isVip,
        display_name: contact.name,
        company: contact.company || null,
        phone: contact.phone || null,
        email: emailLower || null,
        tier,
        tags,
        notes: notes || null,
        linked_building_ids: [],
        consent_status: consentStatus,
        consent_source: 'bulk_import',
      });

      if (useMem && inboxState) {
        inboxState.customClients.unshift({
          id: customId,
          ownerId: userId,
          clientName: contact.name,
          clientGrade: grade,
          clientPhone: contact.phone || '',
          clientEmail: emailLower || null,
          transactionalBasis: null,
          budget: contact.budgetText || '',
          preferredRegion: contact.preferredRegions || '',
          buildingId: '',
          buildingTitle: '관심 매물 상담',
          newsletterSubscribed: false,
          createdAt: nowIso,
        });
      }
      registerRef(
        {
          rawId,
          hasBrokerClientRow: true,
          memIndex: 0,
          existingTags: tags,
          existingNotes: notes,
          existingCompany: contact.company || '',
          existingBudget: contact.budgetText || '',
          existingPreferredRegion: contact.preferredRegions || '',
          existingNewsletterSubscribed: false,
          existingTier: tier,
          existingConsentStatus: consentStatus,
        },
        contact.phone,
        emailLower
      );
    }

    if (supabase && registerAsNewsletterSubscriber && hasValidOptIn && (phoneDigits || emailLower) && !matchedSub) {
      const krMobile = phoneDigits ? normalizeKrPhone(phoneDigits) : null;
      const subscriberPhone = krMobile || phoneDigits || null;
      const channel: 'kakao' | 'email' | 'both' =
        subscriberPhone && emailLower ? (krMobile ? 'both' : 'email') : emailLower ? 'email' : 'kakao';
      const regionList = contact.preferredRegions
        ? contact.preferredRegions.split(/[,/·]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const { token: confirmToken, hash: confirmTokenHash } = issueConfirmToken();
      const baseSubscriber = {
        broker_id: brokerSlug || userId,
        subscriber_phone: subscriberPhone,
        subscriber_name: contact.name,
        subscriber_email: emailLower || null,
        channel,
        status: 'active' as const,
        source: 'manual' as const,
        interest_profile: mergeInterestProfile({}, undefined, regionList.length > 0 ? { regions: regionList } : undefined),
        subscribed_at: nowIso,
      };
      const consentFields = {
        ...(isUuid(userId) ? { broker_user_id: userId } : {}),
        phone_e164: krMobile ? toE164Kr(krMobile) : null,
        consent_channel: 'broker_attested',
        marketing_consent_at: nowIso,
        confirm_status: 'pending',
        consent_status: 'pending',
        consent_source: 'bulk_import',
        confirm_token_hash: confirmTokenHash,
        consent_version: 'v1',
      };
      try {
        const insQ: any = supabase.from('magazine_subscribers').insert({ ...baseSubscriber, ...consentFields });
        let insRes = typeof insQ.select === 'function' ? await insQ.select().single() : await insQ;
        if (insRes?.error && isMissingColumnError(insRes.error)) {
          const retryQ: any = supabase.from('magazine_subscribers').insert(baseSubscriber);
          insRes = typeof retryQ.select === 'function' ? await retryQ.select().single() : await retryQ;
        }
        if (insRes?.error) {
          failedCount += 1;
          errors.push(`구독자 등록 실패 (${contact.name}): ${insRes.error.message || 'DB 오류'}`);
        } else {
          subscriberAddedCount += 1;
          const saved = (insRes?.data as Record<string, any>) || { ...baseSubscriber, ...consentFields };
          if (phoneDigits) subByPhone.set(phoneDigits, saved);
          if (emailLower) {
            subByEmail.set(emailLower, saved);
            try {
              await sendOptInConfirmation({
                channel,
                email: emailLower,
                brokerSlug: brokerSlug || userId,
                subscriberName: contact.name,
                token: confirmToken,
              });
            } catch {
              // non-blocking (D4 allowlist / dry-run safe)
            }
          }
        }
      } catch (err: any) {
        failedCount += 1;
        errors.push(`구독자 등록 예외 (${contact.name}): ${err?.message || 'DB 오류'}`);
      }
    }
  }

  if (useMem && inboxState) saveInboxState(inboxState);

  let dbUpdateFailures = 0;
  let dbInsertFailures = 0;
  let dbUpdateSuccesses = 0;
  let dbInsertSuccesses = 0;

  if (supabase && isUuid(userId)) {
    for (const chunk of chunkArray(pendingClientUpdates, 50)) {
      const results = await Promise.all(
        chunk.map(async (item) => {
          try {
            let res = await supabase
              .from('broker_clients')
              .update(item.payload)
              .eq('id', item.rawId)
              .eq('broker_id', userId);
            if (res?.error && isIgnorableSchemaError(res.error)) {
              res = await supabase
                .from('broker_clients')
                .update(item.minimalPayload)
                .eq('id', item.rawId)
                .eq('broker_id', userId);
            }
            if (res?.error) return String(res.error.message || '업데이트 실패');
            return null;
          } catch (err: any) {
            return String(err?.message || '업데이트 예외');
          }
        })
      );
      for (const errMsg of results) {
        if (errMsg) {
          dbUpdateFailures += 1;
          failedCount += 1;
          if (errors.length < 20) errors.push(`고객 수정 실패: ${errMsg}`);
        } else {
          dbUpdateSuccesses += 1;
        }
      }
    }

    for (const chunk of chunkArray(newBrokerClientPayloads, 100)) {
      try {
        let insRes = await supabase.from('broker_clients').insert(chunk);
        if (insRes?.error && isIgnorableSchemaError(insRes.error)) {
          const fallbackChunk = chunk.map(
            ({
              email: _e,
              company: _c,
              consent_status: _cs,
              consent_source: _csrc,
              is_vip: _iv,
              client_role: _cr,
              ...rest
            }) => rest
          );
          insRes = await supabase.from('broker_clients').insert(fallbackChunk);
        }
        if (insRes?.error) {
          dbInsertFailures += chunk.length;
          failedCount += chunk.length;
          if (errors.length < 20) errors.push(`고객 일괄 추가 실패: ${insRes.error.message || 'DB 오류'}`);
        } else {
          dbInsertSuccesses += chunk.length;
        }
      } catch (err: any) {
        dbInsertFailures += chunk.length;
        failedCount += chunk.length;
        if (errors.length < 20) errors.push(`고객 일괄 추가 예외: ${err?.message || 'DB 오류'}`);
      }
    }

    const totalAttemptedDb = pendingClientUpdates.length + newBrokerClientPayloads.length;
    const totalFailedDb = dbUpdateFailures + dbInsertFailures;
    const totalSucceededDb = dbUpdateSuccesses + dbInsertSuccesses;

    if (totalAttemptedDb > 0 && totalSucceededDb === 0 && totalFailedDb >= totalAttemptedDb) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'DB_WRITE_FAILED', message: '연락처 저장 중 데이터베이스 오류가 발생했습니다.' },
          importedCount: 0,
          updatedCount: 0,
          skippedCount,
          failedCount,
          partialFailure: false,
          errors,
        },
        { status: 500 }
      );
    }

    try {
      await supabase.from('activity_events').insert({
        actor_id: userId,
        event_type: 'contacts_bulk_imported',
        entity_type: 'building',
        entity_id: userId,
        metadata: {
          importedCount: Math.max(0, plannedInserts - dbInsertFailures),
          updatedCount: Math.max(0, plannedUpdates - dbUpdateFailures),
          skippedCount,
          failedCount,
          subscriberAddedCount,
          skippedUnsubscribedCount,
          registerAsNewsletterSubscriber,
        },
      });
    } catch {
      // non-blocking audit log in minimal test mocks
    }
  }

  return NextResponse.json({
    ok: true,
    importedCount: Math.max(0, plannedInserts - dbInsertFailures),
    updatedCount: Math.max(0, plannedUpdates - dbUpdateFailures),
    skippedCount,
    failedCount,
    partialFailure: failedCount > 0,
    errors,
    subscriberAddedCount,
    skippedUnsubscribedCount,
  });
}
