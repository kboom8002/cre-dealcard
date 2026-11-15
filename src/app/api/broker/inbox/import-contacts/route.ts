import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createServiceClient } from '@/lib/supabase/service';
import { getInboxState, isUuid, saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { normalizeKrPhone, toE164Kr } from '@/lib/magazine/pii';
import { isMissingColumnError } from '@/lib/magazine/subscriber-view';
import { mergeInterestProfile } from '@/lib/magazine/tags';
import {
  MAX_BULK_IMPORT_ROWS,
  normalizeContactEmail,
  normalizeKoreanContactPhone,
  type BulkClientRole,
} from '@/lib/crm/contact-bulk-parser';

const ContactImportItemSchema = z.object({
  name: z.string().trim().min(1, '고객 이름을 입력해 주세요.').max(100),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  clientRole: z.enum(['buyer', 'seller', 'tenant', 'partner']).optional().default('buyer'),
  isVip: z.boolean().optional().default(false),
  preferredRegions: z.string().trim().max(200).optional().nullable(),
  budgetText: z.string().trim().max(120).optional().nullable(),
  // Strict opt-in: never default undefined/blank to true!
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
  hasCustomClientRow: boolean;
  memIndex: number;
  existingTags: string[];
  existingNotes: string;
  existingCompany: string;
  existingBudget: string;
  existingPreferredRegion: string;
  existingNewsletterSubscribed: boolean;
  existingTier: string;
}

const ROLE_TAG_LABEL: Readonly<Record<BulkClientRole, string>> = {
  buyer: '매수인',
  seller: '매도인',
  tenant: '임차인',
  partner: '공동중개',
};

function isIgnorableSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return true;
  const code = String(err.code || '');
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
  return /relationship|does not exist|schema cache/i.test(String(err.message || ''));
}

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
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error || !guard.user?.id) {
    return (
      guard.error ??
      NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 },
      )
    );
  }

  const userId = guard.user.id;

  const rateAllowed = await checkRateLimit(userId, 'broker_import_contacts', 20, 60_000);
  if (!rateAllowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.',
        },
      },
      { status: 429 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_JSON', message: '올바른 요청 형식이 아닙니다.' } },
      { status: 400 },
    );
  }

  const parsed = BulkImportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstMsg = parsed.error.issues[0]?.message || '입력 항목을 다시 확인해 주세요.';
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: firstMsg },
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { contacts: rawContacts, registerAsNewsletterSubscriber } = parsed.data;

  // 1. Server-side phone/email normalization + intra-batch deduplication
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

    const dupInBatch =
      (phoneDigits ? batchByPhone.get(phoneDigits) : undefined) ||
      (emailLower ? batchByEmail.get(emailLower) : undefined);

    if (dupInBatch) {
      if (!dupInBatch.phone && normPhone?.formatted) {
        dupInBatch.phone = normPhone.formatted;
        dupInBatch.phoneDigits = normPhone.digits;
      }
      if (!dupInBatch.email && emailLower) dupInBatch.email = emailLower;
      if (!dupInBatch.company && item.company) dupInBatch.company = item.company;
      if (item.isVip) dupInBatch.isVip = true;
      if (!dupInBatch.preferredRegions && item.preferredRegions) {
        dupInBatch.preferredRegions = item.preferredRegions;
      }
      if (!dupInBatch.budgetText && item.budgetText) dupInBatch.budgetText = item.budgetText;
      if (explicitConsent) dupInBatch.explicitMarketingConsent = true;
      if (!dupInBatch.memo && item.memo) dupInBatch.memo = item.memo;
      if (dupInBatch.phoneDigits) batchByPhone.set(dupInBatch.phoneDigits, dupInBatch);
      if (dupInBatch.email) batchByEmail.set(dupInBatch.email, dupInBatch);
      skippedCount += 1;
      continue;
    }

    const candidate: NormalizedImportCandidate = {
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

    batchCandidates.push(candidate);
    if (phoneDigits) batchByPhone.set(phoneDigits, candidate);
    if (emailLower) batchByEmail.set(emailLower, candidate);
  }

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  // 2. Load broker profile slug & existing CRM contacts + subscribers scoped strictly to userId
  let brokerSlug: string | null = null;
  if (supabase) {
    try {
      const bpQuery: any = supabase
        .from('broker_profiles')
        .select('slug')
        .eq('user_id', userId);
      const bpRes =
        typeof bpQuery.maybeSingle === 'function'
          ? await bpQuery.maybeSingle()
          : await bpQuery.single?.();
      if (bpRes?.data?.slug) {
        brokerSlug = String(bpRes.data.slug).trim() || null;
      }
    } catch {
      // ignore if broker_profiles unavailable in offline test
    }
  }

  const brokerKeys = Array.from(new Set([userId, brokerSlug].filter((k): k is string => Boolean(k))));

  const inboxState = getInboxState();
  const existingByPhone = new Map<string, ExistingCrmContactRef>();
  const existingByEmail = new Map<string, ExistingCrmContactRef>();
  const existingByRawId = new Map<string, ExistingCrmContactRef>();

  const registerRef = (ref: ExistingCrmContactRef, phoneRaw: unknown, emailRaw: unknown) => {
    existingByRawId.set(ref.rawId, ref);
    const normP = phoneRaw ? normalizeKoreanContactPhone(phoneRaw) : null;
    if (normP?.digits && !existingByPhone.has(normP.digits)) {
      existingByPhone.set(normP.digits, ref);
    }
    const normE = emailRaw ? normalizeContactEmail(emailRaw) : null;
    if (normE && !existingByEmail.has(normE)) {
      existingByEmail.set(normE, ref);
    }
  };

  // 2a. Existing in-memory customClients owned by this broker
  (inboxState.customClients || []).forEach((c, idx) => {
    if (!c || c.ownerId !== userId) return;
    const rawId = String(c.id || '').replace(/^(?:custom[-_]|cli-)/, '');
    if (!rawId) return;
    const ref: ExistingCrmContactRef = {
      rawId,
      hasBrokerClientRow: false,
      hasCustomClientRow: false,
      memIndex: idx,
      existingTags: c.newsletterSubscribed ? ['뉴스레터구독'] : [],
      existingNotes: '',
      existingCompany: '',
      existingBudget: c.budget || '',
      existingPreferredRegion: c.preferredRegion || '',
      existingNewsletterSubscribed: Boolean(c.newsletterSubscribed),
      existingTier: c.clientGrade === 'VIP' ? 'vip' : 'normal',
    };
    registerRef(ref, c.clientPhone, c.clientEmail);
  });

  // 2b. Existing broker_custom_clients rows in DB
  if (supabase) {
    try {
      const ccQuery: any = supabase
        .from('broker_custom_clients')
        .select('*')
        .eq('broker_id', userId);
      const ccRes = await ccQuery;
      if (!ccRes?.error && Array.isArray(ccRes?.data)) {
        for (const row of ccRes.data) {
          if (row?.broker_id && String(row.broker_id) !== userId) continue;
          const rawId = String(row?.id || '').replace(/^(?:custom[-_]|cli-)/, '');
          if (!rawId) continue;
          const normP = row.phone ? normalizeKoreanContactPhone(row.phone) : null;
          const normE = row.email ? normalizeContactEmail(row.email) : null;
          const matched =
            existingByRawId.get(rawId) ||
            (normP?.digits ? existingByPhone.get(normP.digits) : undefined) ||
            (normE ? existingByEmail.get(normE) : undefined);

          if (matched) {
            matched.hasCustomClientRow = true;
            matched.rawId = rawId;
            if (!matched.existingBudget && row.budget) matched.existingBudget = String(row.budget);
            if (!matched.existingPreferredRegion && row.preferred_region) {
              matched.existingPreferredRegion = String(row.preferred_region);
            }
            if (!matched.existingNotes && row.notes) matched.existingNotes = String(row.notes);
            registerRef(matched, row.phone, row.email);
          } else {
            const ref: ExistingCrmContactRef = {
              rawId,
              hasBrokerClientRow: false,
              hasCustomClientRow: true,
              memIndex: -1,
              existingTags: [],
              existingNotes: String(row.notes || ''),
              existingCompany: String(row.company || ''),
              existingBudget: String(row.budget || ''),
              existingPreferredRegion: String(row.preferred_region || ''),
              existingNewsletterSubscribed: Boolean(row.newsletter_subscribed),
              existingTier: String(row.tier || row.grade || 'normal').toLowerCase(),
            };
            registerRef(ref, row.phone, row.email);
          }
        }
      }
    } catch {
      // broker_custom_clients table optional in real PG schema
    }
  }

  // 2c. Existing broker_clients rows in DB (UUID broker_id)
  if (supabase && isUuid(userId)) {
    try {
      const bcQuery: any = supabase
        .from('broker_clients')
        .select('id, broker_id, display_name, company, phone, email, tier, tags, notes')
        .eq('broker_id', userId);
      let bcRes = await bcQuery;
      if (bcRes?.error && isIgnorableSchemaError(bcRes.error)) {
        const fallbackQuery: any = supabase
          .from('broker_clients')
          .select('id, broker_id, display_name, phone, tier, tags, notes')
          .eq('broker_id', userId);
        bcRes = await fallbackQuery;
      }
      if (!bcRes?.error && Array.isArray(bcRes?.data)) {
        for (const row of bcRes.data) {
          if (row?.broker_id && String(row.broker_id) !== userId) continue;
          const rawId = String(row?.id || '').trim();
          if (!rawId) continue;
          const rowTags = Array.isArray(row.tags) ? row.tags.map((t: unknown) => String(t)) : [];
          const hasSubTag =
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
            if (hasSubTag) matched.existingNewsletterSubscribed = true;
            registerRef(matched, row.phone, row.email);
          } else {
            const ref: ExistingCrmContactRef = {
              rawId,
              hasBrokerClientRow: true,
              hasCustomClientRow: false,
              memIndex: -1,
              existingTags: rowTags,
              existingNotes: String(row.notes || ''),
              existingCompany: String(row.company || ''),
              existingBudget: '',
              existingPreferredRegion: '',
              existingNewsletterSubscribed: hasSubTag,
              existingTier: String(row.tier || 'normal').toLowerCase(),
            };
            registerRef(ref, row.phone, row.email);
          }
        }
      }
    } catch {
      // ignore if broker_clients unavailable in minimal mock
    }
  }

  // 2d. Existing magazine_subscribers rows (to enforce 'unsubscribed' suppression & prevent duplicate inserts)
  const subByPhone = new Map<string, Record<string, any>>();
  const subByEmail = new Map<string, Record<string, any>>();
  const seenSubIds = new Set<string>();

  const indexSubscriberRows = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const row = r as Record<string, any>;
      const rowBrokerId = row.broker_id ? String(row.broker_id).trim() : '';
      const rowBrokerUserId = row.broker_user_id ? String(row.broker_user_id).trim() : '';
      const belongsToBroker =
        (rowBrokerUserId && rowBrokerUserId === userId) ||
        (rowBrokerId && brokerKeys.includes(rowBrokerId));
      if (!belongsToBroker) continue;

      const subId = String(row.id || '').trim();
      if (subId && seenSubIds.has(subId)) continue;
      if (subId) seenSubIds.add(subId);

      const normP = normalizeKoreanContactPhone(row.subscriber_phone || row.phone_e164);
      if (normP?.digits) {
        const prev = subByPhone.get(normP.digits);
        // Prefer 'unsubscribed' row if multiple legacy rows exist so suppression is never bypassed
        const isUnsub =
          String(row.status || '').toLowerCase() === 'unsubscribed' || Boolean(row.unsubscribed_at);
        if (!prev || isUnsub) {
          subByPhone.set(normP.digits, row);
        }
      }
      const normE = normalizeContactEmail(row.subscriber_email || row.email);
      if (normE) {
        const prev = subByEmail.get(normE);
        const isUnsub =
          String(row.status || '').toLowerCase() === 'unsubscribed' || Boolean(row.unsubscribed_at);
        if (!prev || isUnsub) {
          subByEmail.set(normE, row);
        }
      }
    }
  };

  if (supabase) {
    if (isUuid(userId)) {
      try {
        const subByUuidQ: any = supabase
          .from('magazine_subscribers')
          .select('*')
          .eq('broker_user_id', userId);
        const subByUuidRes = await subByUuidQ;
        if (!subByUuidRes?.error) {
          indexSubscriberRows(subByUuidRes?.data);
        }
      } catch {
        // broker_user_id column may not exist in older schemas
      }
    }

    try {
      let subByKeyQ: any = supabase.from('magazine_subscribers').select('*');
      if (typeof subByKeyQ.in === 'function' && brokerKeys.length > 0) {
        subByKeyQ = subByKeyQ.in('broker_id', brokerKeys);
      } else if (typeof subByKeyQ.eq === 'function') {
        subByKeyQ = subByKeyQ.eq('broker_id', brokerSlug || userId);
      }
      const subByKeyRes = await subByKeyQ;
      if (!subByKeyRes?.error) {
        indexSubscriberRows(subByKeyRes?.data);
      }
    } catch {
      // ignore if magazine_subscribers unavailable
    }
  }

  // 3. Process candidates: CRM insert/update + optional newsletter subscriber upsert
  const nowIso = new Date().toISOString();
  let importedCount = 0;
  let updatedCount = 0;
  let subscriberAddedCount = 0;
  let skippedUnsubscribedCount = 0;

  const newBrokerClientPayloads: Array<Record<string, any>> = [];
  const newCustomClientPayloads: Array<Record<string, any>> = [];

  for (const contact of batchCandidates) {
    const phoneDigits = contact.phoneDigits || '';
    const emailLower = contact.email || '';

    const matchedSub =
      (phoneDigits ? subByPhone.get(phoneDigits) : undefined) ||
      (emailLower ? subByEmail.get(emailLower) : undefined);

    const isUnsubscribed = Boolean(
      matchedSub &&
        (String(matchedSub.status || '').toLowerCase() === 'unsubscribed' ||
          String(matchedSub.status || '').toLowerCase() === 'purged' ||
          Boolean(matchedSub.unsubscribed_at)),
    );

    if (isUnsubscribed && contact.explicitMarketingConsent) {
      skippedUnsubscribedCount += 1;
    }

    // Strict opt-in invariant: blank/false consent NEVER grants marketing opt-in
    const hasValidOptIn = contact.explicitMarketingConsent === true && !isUnsubscribed;
    const crmNewsletterSubscribed = Boolean(hasValidOptIn && registerAsNewsletterSubscriber);

    const existingCrm =
      (phoneDigits ? existingByPhone.get(phoneDigits) : undefined) ||
      (emailLower ? existingByEmail.get(emailLower) : undefined);

    const roleTag = ROLE_TAG_LABEL[contact.clientRole];
    const clientType: 'seller' | 'buyer' = contact.clientRole === 'seller' ? 'seller' : 'buyer';

    if (existingCrm) {
      updatedCount += 1;
      const effectiveVip = contact.isVip || existingCrm.existingTier === 'vip';
      const tier = effectiveVip ? 'vip' : 'normal';
      const grade: 'VIP' | '일반' = effectiveVip ? 'VIP' : '일반';
      const mergedBudget = contact.budgetText || existingCrm.existingBudget || '';
      const mergedRegion = contact.preferredRegions || existingCrm.existingPreferredRegion || '';
      const mergedCompany = contact.company || existingCrm.existingCompany || '';
      const effectiveSub = isUnsubscribed
        ? false
        : crmNewsletterSubscribed || existingCrm.existingNewsletterSubscribed;

      const cleanedExistingTags = existingCrm.existingTags.filter((t) => {
        if (isUnsubscribed && /뉴스레터구독|수신동의/i.test(t)) return false;
        return true;
      });
      const nextTags = Array.from(
        new Set(
          [
            ...cleanedExistingTags,
            roleTag,
            mergedRegion,
            mergedBudget,
            hasValidOptIn ? '수신동의' : '',
            effectiveSub ? '뉴스레터구독' : '',
            isUnsubscribed ? '수신거부' : '',
          ].filter(Boolean),
        ),
      );

      const mergedNotes = buildStructuredNotes({
        budgetText: mergedBudget || undefined,
        preferredRegions: mergedRegion || undefined,
        company: mergedCompany || undefined,
        memo: contact.memo,
        existingNotes: existingCrm.existingNotes,
      });

      if (supabase && existingCrm.hasBrokerClientRow && isUuid(userId) && isUuid(existingCrm.rawId)) {
        try {
          const updPayload: Record<string, any> = {
            display_name: contact.name,
            company: mergedCompany || null,
            tier,
            tags: nextTags,
            notes: mergedNotes || null,
            ...(contact.phone ? { phone: contact.phone } : {}),
            ...(emailLower ? { email: emailLower } : {}),
          };
          const updRes = await supabase
            .from('broker_clients')
            .update(updPayload)
            .eq('id', existingCrm.rawId)
            .eq('broker_id', userId);
          if (updRes?.error && isIgnorableSchemaError(updRes.error)) {
            const { email: _e, company: _c, ...minimalPayload } = updPayload;
            await supabase
              .from('broker_clients')
              .update(minimalPayload)
              .eq('id', existingCrm.rawId)
              .eq('broker_id', userId);
          }
        } catch {
          // non-blocking
        }
      }

      if (supabase && existingCrm.hasCustomClientRow) {
        try {
          await supabase
            .from('broker_custom_clients')
            .update({
              display_name: contact.name,
              name: contact.name,
              ...(contact.phone ? { phone: contact.phone } : {}),
              ...(emailLower ? { email: emailLower } : {}),
              tier,
              grade,
              budget: mergedBudget,
              preferred_region: mergedRegion,
              notes: mergedNotes,
              newsletter_subscribed: effectiveSub,
            })
            .eq('id', existingCrm.rawId)
            .eq('broker_id', userId);
        } catch {
          // optional table
        }
      }

      // Sync in-memory inboxState.customClients
      const customId = existingCrm.rawId.startsWith('custom_')
        ? existingCrm.rawId
        : `custom_${existingCrm.rawId}`;
      const memIdx = inboxState.customClients.findIndex(
        (c) =>
          c.ownerId === userId &&
          (c.id === customId || c.id === existingCrm.rawId),
      );
      const prevMem = memIdx >= 0 ? inboxState.customClients[memIdx] : undefined;
      const updatedMemEntry = {
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
      if (memIdx >= 0) {
        inboxState.customClients[memIdx] = updatedMemEntry;
      } else {
        inboxState.customClients.unshift(updatedMemEntry);
      }
    } else {
      importedCount += 1;
      const rawId = crypto.randomUUID();
      const customId = `custom_${rawId}`;
      const tier = contact.isVip ? 'vip' : 'normal';
      const grade: 'VIP' | '일반' = contact.isVip ? 'VIP' : '일반';
      const tags = Array.from(
        new Set(
          [
            roleTag,
            contact.preferredRegions || '',
            contact.budgetText || '',
            hasValidOptIn ? '수신동의' : '',
            crmNewsletterSubscribed ? '뉴스레터구독' : '',
          ].filter(Boolean),
        ),
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
        display_name: contact.name,
        company: contact.company || null,
        phone: contact.phone || null,
        email: emailLower || null,
        tier,
        tags,
        notes: notes || null,
        linked_building_ids: [],
      });

      newCustomClientPayloads.push({
        id: rawId,
        broker_id: userId,
        display_name: contact.name,
        name: contact.name,
        phone: contact.phone || '',
        email: emailLower || null,
        company: contact.company || null,
        client_role: contact.clientRole,
        tier,
        grade,
        budget: contact.budgetText || '',
        preferred_region: contact.preferredRegions || '',
        building_id: '',
        building_title: '관심 매물 상담',
        notes,
        newsletter_subscribed: crmNewsletterSubscribed,
        marketing_consent: hasValidOptIn,
        created_at: nowIso,
      });

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
        newsletterSubscribed: crmNewsletterSubscribed,
        createdAt: nowIso,
      });

      const createdRef: ExistingCrmContactRef = {
        rawId,
        hasBrokerClientRow: true,
        hasCustomClientRow: true,
        memIndex: 0,
        existingTags: tags,
        existingNotes: notes,
        existingCompany: contact.company || '',
        existingBudget: contact.budgetText || '',
        existingPreferredRegion: contact.preferredRegions || '',
        existingNewsletterSubscribed: crmNewsletterSubscribed,
        existingTier: tier,
      };
      registerRef(createdRef, contact.phone, emailLower);
    }

    // 4. Optional newsletter subscriber sync ONLY when explicit marketingConsent === true and not unsubscribed
    if (
      supabase &&
      registerAsNewsletterSubscriber &&
      hasValidOptIn &&
      (phoneDigits || emailLower)
    ) {
      if (!matchedSub) {
        const krMobile = phoneDigits ? normalizeKrPhone(phoneDigits) : null;
        const subscriberPhone = krMobile || phoneDigits || null;
        const channel: 'kakao' | 'email' | 'both' =
          subscriberPhone && emailLower
            ? krMobile
              ? 'both'
              : 'email'
            : emailLower
              ? 'email'
              : 'kakao';

        const regionList = contact.preferredRegions
          ? contact.preferredRegions
              .split(/[,/·]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        const baseSubscriber = {
          broker_id: brokerSlug || userId,
          subscriber_phone: subscriberPhone,
          subscriber_name: contact.name,
          subscriber_email: emailLower || null,
          channel,
          status: 'active' as const,
          source: 'manual' as const,
          interest_profile: mergeInterestProfile(
            {},
            undefined,
            regionList.length > 0 ? { regions: regionList } : undefined,
          ),
          subscribed_at: nowIso,
        };

        const consentFields = {
          ...(isUuid(userId) ? { broker_user_id: userId } : {}),
          phone_e164: krMobile ? toE164Kr(krMobile) : null,
          consent_channel: 'broker_attested',
          marketing_consent_at: nowIso,
          confirm_status: 'confirmed',
          consent_version: 'v1',
        };

        try {
          let insQuery: any = supabase
            .from('magazine_subscribers')
            .insert({ ...baseSubscriber, ...consentFields });
          let insRes =
            typeof insQuery.select === 'function'
              ? await insQuery.select().single()
              : await insQuery;

          if (insRes?.error && isMissingColumnError(insRes.error)) {
            const retryQuery: any = supabase
              .from('magazine_subscribers')
              .insert(baseSubscriber);
            insRes =
              typeof retryQuery.select === 'function'
                ? await retryQuery.select().single()
                : await retryQuery;
          }

          if (!insRes?.error) {
            subscriberAddedCount += 1;
            const savedSubRow = (insRes?.data as Record<string, any>) || {
              ...baseSubscriber,
              ...consentFields,
            };
            if (phoneDigits) subByPhone.set(phoneDigits, savedSubRow);
            if (emailLower) subByEmail.set(emailLower, savedSubRow);
          }
        } catch {
          // non-blocking on offline DB mock
        }
      }
    }
  }

  // 5. Persist batch CRM inserts to DB + in-memory store
  saveInboxState(inboxState);

  if (supabase && newBrokerClientPayloads.length > 0 && isUuid(userId)) {
    for (const chunk of chunkArray(newBrokerClientPayloads, 200)) {
      try {
        const insRes = await supabase.from('broker_clients').insert(chunk);
        if (insRes?.error && isIgnorableSchemaError(insRes.error)) {
          const fallbackChunk = chunk.map(({ email: _e, company: _c, ...rest }) => rest);
          await supabase.from('broker_clients').insert(fallbackChunk);
        }
      } catch {
        // non-blocking if broker_clients unavailable in minimal mock
      }
    }
  }

  if (supabase && newCustomClientPayloads.length > 0) {
    for (const chunk of chunkArray(newCustomClientPayloads, 200)) {
      try {
        await supabase.from('broker_custom_clients').insert(chunk);
      } catch {
        // broker_custom_clients is optional in production PG schema
      }
    }
  }

  // 6. Record summary audit event in activity_events
  if (supabase) {
    try {
      await supabase.from('activity_events').insert({
        actor_id: userId,
        event_type: 'contacts_bulk_imported',
        entity_type: 'building',
        entity_id: userId,
        metadata: {
          importedCount,
          updatedCount,
          skippedCount,
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
    importedCount,
    updatedCount,
    skippedCount,
    subscriberAddedCount,
    skippedUnsubscribedCount,
  });
}
