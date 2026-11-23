import { formatRelativeKo } from '@/lib/ux/lexicon';
import {
  normalizeClientEmail,
  normalizeTransactionalBasis,
} from '@/domain/inbox/inbox-outbound';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import {
  buildThreadShareUrl,
  extractFreeMemoFromLegacyNotes,
  formatBudgetManwonDisplay,
  formatImSectionLabel,
  formatKrPhoneDisplay,
  normalizeClientRole,
  normalizeEmailDeliveryStatus,
  normalizeKrPhoneDigits,
  parseBudgetManwonInput,
  parseClientNotesMeta,
  parsePreferredRegionsInput,
  toDispatchHistoryEntry,
  hashShareTokenForAudit,
  toSafeEpochMs,
  type InboxCrmClientRole,
  type InboxDispatchHistoryItem,
  type InboxEmailDeliveryStatus,
} from './inbox-helpers';
import { aggregateThreadViews, type ThreadBuildContext } from './inbox-lead-threads';

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

const promoteDeliveryStatus = (
  prev: InboxEmailDeliveryStatus | undefined,
  next: InboxEmailDeliveryStatus
): InboxEmailDeliveryStatus => {
  if (prev === 'complained' || next === 'complained') return 'complained';
  if (prev === 'bounced' || next === 'bounced') return 'bounced';
  return 'ok';
};

export function appendCrmAndSubscriberThreads(
  ctx: ThreadBuildContext & {
    userId: string;
    dbClients: Array<Record<string, unknown>>;
    subscriberRows: Array<Record<string, unknown>>;
    memCustomClients: Array<Record<string, unknown>>;
    deletedClientIdSet: Set<string>;
    forbiddenBuildingSet: Set<string>;
    quickInventory: Array<{ buildingId: string; title: string }>;
  }
) {
  const {
    threads,
    seenThreadIds,
    viewItems,
    callNotesByThreadId,
    revokedByThreadId,
    issuedTokenByThreadId,
    newsletterStateByKey,
    shareLinks,
    inboxState,
    deletedBuildingSet,
    forbiddenBuildingSet,
    buildingTitleById,
    isThreadArchived,
    userId,
    dbClients,
    subscriberRows,
    memCustomClients,
    deletedClientIdSet,
    quickInventory,
  } = ctx;

  const dbClientById = new Map<string, Record<string, unknown>>();
  const deliveryStatusByEmail = new Map<string, InboxEmailDeliveryStatus>();
  const deliveryStatusById = new Map<string, InboxEmailDeliveryStatus>();

  for (const dbc of dbClients) {
    const cid = String(dbc?.id || '').trim();
    if (cid) dbClientById.set(cid, dbc);
    const ds = normalizeEmailDeliveryStatus(dbc?.email_delivery_status);
    if (cid && ds !== 'ok') {
      deliveryStatusById.set(cid, promoteDeliveryStatus(deliveryStatusById.get(cid), ds));
      deliveryStatusById.set(`custom_${cid}`, promoteDeliveryStatus(deliveryStatusById.get(`custom_${cid}`), ds));
      deliveryStatusById.set(`cli-${cid}`, promoteDeliveryStatus(deliveryStatusById.get(`cli-${cid}`), ds));
    }
    const em = normalizeClientEmail(typeof dbc?.email === 'string' ? dbc.email : null);
    if (em && ds !== 'ok') {
      deliveryStatusByEmail.set(em, promoteDeliveryStatus(deliveryStatusByEmail.get(em), ds));
    }
  }

  for (const sub of subscriberRows) {
    const sid = String(sub?.id || '').trim();
    const ds = normalizeEmailDeliveryStatus(sub?.email_delivery_status);
    if (sid && ds !== 'ok') {
      deliveryStatusById.set(sid, promoteDeliveryStatus(deliveryStatusById.get(sid), ds));
      deliveryStatusById.set(`sub_${sid}`, promoteDeliveryStatus(deliveryStatusById.get(`sub_${sid}`), ds));
    }
    const rawSubEmail = sub?.subscriber_email ?? sub?.email;
    const em = normalizeClientEmail(typeof rawSubEmail === 'string' ? rawSubEmail : null);
    if (em && ds !== 'ok') {
      deliveryStatusByEmail.set(em, promoteDeliveryStatus(deliveryStatusByEmail.get(em), ds));
    }
  }

  const seenCustomClientIdentity = new Set<string>();
  const allOwnCustomSources: Array<Record<string, unknown>> = [
    ...memCustomClients.filter((c) => Boolean(c.ownerId) && c.ownerId === userId),
    ...dbClients,
  ];

  for (const row of allOwnCustomSources) {
    const rawId = String(row.id || '');
    if (!rawId) continue;
    const tid = rawId.startsWith('custom_') || rawId.startsWith('cli-') ? rawId : `custom_${rawId}`;
    const strippedId = tid.replace(/^(?:custom[-_]|cli-)/, '');
    if (deletedClientIdSet.has(tid) || deletedClientIdSet.has(rawId) || (strippedId && deletedClientIdSet.has(strippedId))) {
      continue;
    }

    const dbSup = strippedId ? dbClientById.get(strippedId) : undefined;
    const parsedMeta = parseClientNotesMeta(row.notes ?? dbSup?.notes);
    const tags = Array.isArray(row.tags)
      ? row.tags.map(String)
      : Array.isArray(dbSup?.tags)
        ? dbSup.tags.map(String)
        : [];
    const rowGradeRaw: 'VIP' | '일반' | '잠재' =
      String(row.tier || '').toUpperCase() === 'VIP' ||
      row.clientGrade === 'VIP' ||
      String(dbSup?.tier || '').toUpperCase() === 'VIP'
        ? 'VIP'
        : row.tier === 'potential' || row.clientGrade === '잠재' || dbSup?.tier === 'potential'
          ? '잠재'
          : '일반';
    const resolvedIsVip =
      Boolean(row.isVip) ||
      Boolean(row.is_vip) ||
      Boolean(dbSup?.is_vip) ||
      rowGradeRaw === 'VIP' ||
      tags.includes('VIP');
    const resolvedClientGrade: 'VIP' | '일반' | '잠재' = resolvedIsVip
      ? 'VIP'
      : rowGradeRaw === '잠재'
        ? '잠재'
        : '일반';

    const roleFromTags: InboxCrmClientRole | null = tags.some((t: string) => /매도|소유주|seller|owner/i.test(t))
      ? 'seller'
      : tags.some((t: string) => /임차|tenant|lessee/i.test(t))
        ? 'tenant'
        : tags.some((t: string) => /공동중개|파트너|partner/i.test(t))
          ? 'partner'
          : null;
    const explicitRole = normalizeClientRole(row.clientRole ?? row.client_role ?? dbSup?.client_role);
    const legacyTypeRole = normalizeClientRole(row.client_type ?? dbSup?.client_type);
    const resolvedClientRole: InboxCrmClientRole =
      (explicitRole && explicitRole !== 'buyer' ? explicitRole : null) ||
      (legacyTypeRole && legacyTypeRole !== 'buyer' ? legacyTypeRole : null) ||
      roleFromTags ||
      explicitRole ||
      legacyTypeRole ||
      'buyer';

    const resolvedPreferredRegions = parsePreferredRegionsInput(
      row.preferredRegions ?? row.preferred_regions ?? dbSup?.preferred_regions,
      row.preferred_region || row.preferredRegion || parsedMeta.preferredRegion
    );
    const preferredRegion = String(
      row.preferred_region || row.preferredRegion || parsedMeta.preferredRegion || resolvedPreferredRegions.join(', ') || ''
    ).trim();

    const resolvedBudgetManwon = parseBudgetManwonInput(
      row.budgetManwon ?? row.budget_manwon ?? dbSup?.budget_manwon,
      row.budget || parsedMeta.budget
    );
    const budget = String(
      row.budget || parsedMeta.budget || formatBudgetManwonDisplay(resolvedBudgetManwon) || ''
    ).trim();

    const resolvedFreeMemo =
      typeof row.freeMemo === 'string'
        ? row.freeMemo
        : typeof row.free_memo === 'string'
          ? row.free_memo
          : typeof dbSup?.free_memo === 'string'
            ? dbSup.free_memo
            : extractFreeMemoFromLegacyNotes(row.notes ?? dbSup?.notes);

    if (strippedId && seenThreadIds.has(strippedId)) {
      const existingGate = threads.find((t) => t.id === strippedId);
      if (existingGate) {
        existingGate.isVip = resolvedIsVip;
        existingGate.clientGrade = resolvedClientGrade;
        existingGate.clientRole = resolvedClientRole;
        existingGate.preferredRegions = resolvedPreferredRegions;
        existingGate.preferredRegion = preferredRegion || existingGate.preferredRegion;
        existingGate.budgetManwon = resolvedBudgetManwon;
        existingGate.budget = budget || existingGate.budget;
        existingGate.freeMemo = resolvedFreeMemo;
        const rawEmailCand = row.email || row.clientEmail || dbSup?.email;
        const upEmail = normalizeClientEmail(typeof rawEmailCand === 'string' ? rawEmailCand : null);
        if (upEmail && !existingGate.clientEmail) existingGate.clientEmail = upEmail;
      }
      continue;
    }

    if (seenThreadIds.has(tid) || seenThreadIds.has(rawId) || isThreadArchived(tid)) continue;

    const name = String(row.display_name || row.name || row.clientName || dbSup?.display_name || '').trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    const phone = String(row.phone || row.clientPhone || dbSup?.phone || '').trim();
    const phoneDigits = normalizeKrPhoneDigits(phone);
    const rawEmailForIdentity = row.email || row.clientEmail || dbSup?.email;
    const emailNorm =
      normalizeClientEmail(typeof rawEmailForIdentity === 'string' ? rawEmailForIdentity : null) || '';
    const rowId = strippedId || rawId || tid;
    const identityKey = phoneDigits
      ? `${nameLower}::p:${phoneDigits}`
      : emailNorm
        ? `${nameLower}::e:${emailNorm}`
        : `${nameLower}::id:${rowId}`;
    if (seenCustomClientIdentity.has(identityKey)) continue;
    seenCustomClientIdentity.add(identityKey);
    seenThreadIds.add(tid);

    let bId = String(
      row.building_id ||
        row.buildingId ||
        (Array.isArray(row.linked_building_ids) && row.linked_building_ids[0]) ||
        (Array.isArray(dbSup?.linked_building_ids) && dbSup.linked_building_ids[0]) ||
        ''
    ).trim();
    if (bId && (forbiddenBuildingSet.has(bId) || deletedBuildingSet.has(bId))) bId = '';

    const rawBTitle = String(
      row.building_title || row.buildingTitle || parsedMeta.buildingTitle || (bId ? buildingTitleById.get(bId) : '') || ''
    ).trim();
    if (!bId && rawBTitle && rawBTitle !== '관심 매물 상담' && rawBTitle !== '관심 매물 미지정') {
      const matchedInv = quickInventory.find((q) => q.title === rawBTitle || q.buildingId === rawBTitle);
      if (matchedInv) bId = matchedInv.buildingId;
    }
    const bTitle =
      rawBTitle ||
      (bId ? buildingTitleById.get(bId) : '') ||
      (bId ? quickInventory.find((q) => q.buildingId === bId)?.title : '') ||
      '관심 매물 상담';

    const notesList =
      callNotesByThreadId.get(tid) ||
      callNotesByThreadId.get(rawId) ||
      inboxState.callNotes?.[tid] ||
      inboxState.callNotes?.[rawId] ||
      [];

    const recipientLink = shareLinks.find(
      (sl) => sl.recipient_id && (String(sl.recipient_id) === tid || String(sl.recipient_id) === rawId)
    );
    const threadRevoke = revokedByThreadId.get(tid) || revokedByThreadId.get(rawId);
    const isRevoked =
      threadRevoke?.revoked === true ||
      (threadRevoke?.revoked !== false &&
        (recipientLink?.status === 'revoked' ||
          Boolean(recipientLink?.revoked_at) ||
          Boolean(bId && inboxState.revokedBuildings?.[bId]?.revoked)));

    const resolvedHasIm =
      !bId || !ctx.imBuildingIdSet
        ? undefined
        : ctx.imBuildingIdSet.has(bId)
          ? true
          : ctx.dealCardBuildingIdSet?.has(bId)
            ? false
            : true;
    const resolvedHasDealCard =
      !bId || !ctx.dealCardBuildingIdSet
        ? undefined
        : ctx.dealCardBuildingIdSet.has(bId);
    const resolvedShareToken =
      issuedTokenByThreadId.get(tid) || issuedTokenByThreadId.get(rawId) || recipientLink?.token || threadRevoke?.shareToken || '';
    const resolvedShareUrl =
      !isRevoked && bId
        ? buildThreadShareUrl(bId, resolvedShareToken, resolvedHasIm !== false)
        : '';

    const rowConsentStatus = String(row.consent_status ?? dbSup?.consent_status ?? '').trim().toLowerCase();
    const isRowConsentPendingOrBlocked =
      rowConsentStatus === 'pending' ||
      rowConsentStatus === 'unconfirmed' ||
      rowConsentStatus === 'unsubscribed' ||
      Boolean(row.unsubscribed_at ?? dbSup?.unsubscribed_at) ||
      Boolean((row as { newsletterOptInPending?: boolean }).newsletterOptInPending);
    const hasNewsletterTag =
      !isRowConsentPendingOrBlocked &&
      tags.some((t: string) => /뉴스레터|구독|newsletter|subscribe|수신동의/i.test(t)) &&
      !tags.some((t: string) => /수신거부|해지|unsub/i.test(t));

    const nlOverride =
      newsletterStateByKey.get(tid) ||
      newsletterStateByKey.get(rawId) ||
      (strippedId ? newsletterStateByKey.get(strippedId) : undefined) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined);
    const rowCreatedMs = toSafeEpochMs(row.created_at || row.createdAt);
    const rawNewsletterSubscribed =
      nlOverride && nlOverride.createdAtMs >= rowCreatedMs
        ? nlOverride.subscribed
        : typeof row.newsletterSubscribed === 'boolean'
          ? row.newsletterSubscribed
          : hasNewsletterTag;
    const resolvedNewsletterSubscribed = isRowConsentPendingOrBlocked
      ? false
      : rawNewsletterSubscribed;

    const summaryCleanMessage =
      [budget ? `희망 예산 ${budget}` : '', preferredRegion ? `선호 권역 ${preferredRegion}` : ''].filter(Boolean).join(' · ') ||
      resolvedFreeMemo ||
      (!parsedMeta.isStructuredMeta && row.notes ? String(row.notes) : '직접 등록한 고객입니다.');

    const customViews = aggregateThreadViews(viewItems, tid, bId, false, resolvedShareToken);
    const rawRowEm = row.email || row.clientEmail || dbSup?.email;
    const resolvedClientEmail = normalizeClientEmail(typeof rawRowEm === 'string' ? rawRowEm : null) || '';
    const resolvedBasis =
      normalizeTransactionalBasis(row.transactionalBasis || parsedMeta.transactionalBasis) ||
      (resolvedShareToken ? ('im_request' as const) : null);

    const firstNote = notesList[0] ? asRecord(notesList[0]) : null;
    const baseLastActivityAt = String(firstNote?.createdAt || row.created_at || row.createdAt || '');
    const lastActivityAt =
      customViews.lastViewedAt && toSafeEpochMs(customViews.lastViewedAt) > toSafeEpochMs(baseLastActivityAt)
        ? customViews.lastViewedAt
        : baseLastActivityAt;
    const corrMsg =
      (bId && inboxState.correctionNotices?.[bId]?.message) || inboxState.correctionNotices?.[tid]?.message || '';

    threads.push({
      id: tid,
      clientName: name,
      clientPhone: phone,
      clientEmail: resolvedClientEmail,
      transactionalBasis: resolvedBasis,
      hasTransactionalBasis: Boolean(resolvedBasis),
      requesterCompany: '',
      cleanMessage: summaryCleanMessage,
      clientGrade: resolvedClientGrade,
      isVip: resolvedIsVip,
      clientRole: resolvedClientRole,
      buildingTitle: bTitle,
      buildingId: bId,
      latestEvent: notesList[0]?.description || summaryCleanMessage,
      gateStatus: 'none' as const,
      updatedAt: formatRelativeKo(lastActivityAt) || '방금',
      lastActivityAt,
      openCount: customViews.openCount,
      dwellSeconds: customViews.dwellSeconds,
      lastViewedAt: customViews.lastViewedAt,
      isRead: true,
      status: isRevoked
        ? ('revoked' as const)
        : customViews.openCount >= 3 || customViews.dwellSeconds >= 90
          ? ('high_interest' as const)
          : ('active' as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget,
      budgetManwon: resolvedBudgetManwon,
      preferredRegion,
      preferredRegions: resolvedPreferredRegions,
      freeMemo: resolvedFreeMemo,
      focusedSections: customViews.focusedSections,
      newsletterSubscribed: resolvedNewsletterSubscribed,
      ...(resolvedHasIm !== undefined ? { hasIm: resolvedHasIm } : {}),
      ...(resolvedHasDealCard !== undefined ? { hasDealCard: resolvedHasDealCard } : {}),
      events: [
        ...customViews.scopedViews.map((vRaw: unknown) => {
          const v = asRecord(vRaw);
          const dwellSec = Number(v.dwellSeconds ?? 0);
          const secViewed = typeof v.sectionViewed === 'string' ? v.sectionViewed : null;
          const secName = typeof v.sectionName === 'string' ? v.sectionName : '';
          return {
            id: `ev-view-${String(v.id || '')}`,
            eventType: dwellSec > 0 ? ('dwell' as const) : ('open' as const),
            description:
              dwellSec > 0
                ? `자료 ${dwellSec}초 열람${secViewed ? ` (${formatImSectionLabel(secViewed)})` : ''}`
                : `${secName || formatImSectionLabel(secViewed) || '추천 매물'} 링크 열람`,
            timestamp: formatRelativeKo(typeof v.created_at === 'string' ? v.created_at : '') || '방금',
            sectionName: secName || formatImSectionLabel(secViewed),
          };
        }),
        ...(notesList.length > 0
          ? notesList.map((nRaw: unknown) => {
              const n = asRecord(nRaw);
              return {
                id: String(n.id || ''),
                eventType: 'dwell' as const,
                description: String(n.description || ''),
                timestamp: String(n.timestamp || '방금'),
              };
            })
          : [
              {
                id: `ev-${tid}`,
                eventType: 'share' as const,
                description: '고객 직접 등록 완료',
                timestamp: formatRelativeKo(String(row.created_at || row.createdAt || '')) || '방금',
              },
            ]),
      ],
    });
  }

  for (const row of subscriberRows) {
    const rawSubId = String(row?.id || '').trim();
    if (!rawSubId) continue;
    const statusLower = String(row?.status || 'active').trim().toLowerCase();
    if (statusLower === 'unsubscribed' || statusLower === 'purged' || statusLower === 'deleted' || Boolean(row?.unsubscribed_at)) {
      continue;
    }

    const phoneDigits = normalizeKrPhoneDigits(row?.subscriber_phone || row?.phone_e164 || '');
    const emailNorm = String(row?.subscriber_email || '').trim().toLowerCase();
    const rawProfile = asRecord(row?.interest_profile);
    const rawTags = rawProfile.tags;
    const regions: string[] = [];
    const assetTypes: string[] = [];
    const extraTags: string[] = [];
    if (Array.isArray(rawTags)) {
      for (const t of rawTags) {
        const s = String(t || '').trim();
        if (s) extraTags.push(s);
      }
    } else if (rawTags && typeof rawTags === 'object') {
      const tagGroups = asRecord(rawTags);
      for (const r of Array.isArray(tagGroups.regions) ? tagGroups.regions : []) {
        const s = String(r || '').trim();
        if (s) regions.push(s);
      }
      for (const a of Array.isArray(tagGroups.assetTypes) ? tagGroups.assetTypes : []) {
        const s = String(a || '').trim();
        if (s) assetTypes.push(s);
      }
      for (const tp of Array.isArray(tagGroups.topics) ? tagGroups.topics : []) {
        const s = String(tp || '').trim();
        if (s) extraTags.push(s);
      }
    }
    const allSelectedTags = Array.from(new Set([...regions, ...assetTypes, ...extraTags]));

    const subTid = `sub_${rawSubId}`;
    const hasConfirmCol =
      Boolean(row) &&
      (Object.prototype.hasOwnProperty.call(row, 'confirm_status') ||
        Object.prototype.hasOwnProperty.call(row, 'consent_status'));
    const subConfirmRaw = String(
      row?.confirm_status ?? row?.consent_status ?? (hasConfirmCol ? 'pending' : '')
    )
      .trim()
      .toLowerCase();
    const isPendingConfirm = subConfirmRaw === 'pending' || subConfirmRaw === 'unconfirmed';
    const baseSubscribed = statusLower === 'active' && !isPendingConfirm;
    const nlOverride =
      newsletterStateByKey.get(subTid) ||
      newsletterStateByKey.get(rawSubId) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined) ||
      (emailNorm ? newsletterStateByKey.get(`email:${emailNorm}`) : undefined);
    const subCreatedMs = toSafeEpochMs(row?.created_at);
    const effectiveSubscribed = isPendingConfirm
      ? false
      : nlOverride && nlOverride.createdAtMs >= subCreatedMs
        ? nlOverride.subscribed
        : baseSubscribed;

    const matchedExisting = threads.find((t) => {
      const tPhoneDigits = normalizeKrPhoneDigits(t.clientPhone || '');
      if (phoneDigits.length >= 9 && tPhoneDigits === phoneDigits) return true;
      const tEmail = normalizeClientEmail(
        t.clientEmail || (String(t.clientPhone || '').includes('@') ? t.clientPhone : '')
      );
      return Boolean(emailNorm && tEmail === emailNorm);
    });
    if (matchedExisting) {
      if (effectiveSubscribed && !nlOverride) matchedExisting.newsletterSubscribed = true;
      else if (nlOverride && nlOverride.createdAtMs >= subCreatedMs && (!isPendingConfirm || !nlOverride.subscribed)) {
        matchedExisting.newsletterSubscribed = nlOverride.subscribed;
      }
      if (!matchedExisting.preferredRegion && regions.length > 0) matchedExisting.preferredRegion = regions.join(', ');
      if (Array.isArray(matchedExisting.preferredRegions) && matchedExisting.preferredRegions.length === 0 && regions.length > 0) {
        matchedExisting.preferredRegions = [...regions];
      }
      continue;
    }

    if (seenThreadIds.has(subTid) || isThreadArchived(subTid) || deletedClientIdSet.has(subTid) || deletedClientIdSet.has(rawSubId)) {
      continue;
    }
    seenThreadIds.add(subTid);

    const displayName =
      String(row?.subscriber_name || '').trim() || (emailNorm ? emailNorm.split('@')[0] : '뉴스레터 구독자');
    const rawPhoneDisplay = formatKrPhoneDisplay(row?.subscriber_phone, row?.phone_e164, '');
    const displayContact = rawPhoneDisplay.includes('@') ? '' : rawPhoneDisplay;
    const consentStatusLabel =
      nlOverride && !nlOverride.subscribed
        ? '수신 거부'
        : isPendingConfirm && !effectiveSubscribed
          ? '수신 확인 대기'
          : effectiveSubscribed
            ? '수신 동의 완료'
            : '미구독';
    const tagSummary = allSelectedTags.length > 0 ? `관심 태그: ${allSelectedTags.join(' · ')}` : '';
    const subSummaryMessage = [
      isPendingConfirm && !effectiveSubscribed
        ? `공개 뉴스레터 구독 신청 (${consentStatusLabel})`
        : `공개 뉴스레터 구독자 (${consentStatusLabel})`,
      tagSummary,
    ]
      .filter(Boolean)
      .join(' · ');

    const subNotes = callNotesByThreadId.get(subTid) || callNotesByThreadId.get(rawSubId) || [];
    const firstSubNote = subNotes[0] ? asRecord(subNotes[0]) : null;
    const lastSubActivityAt = String(firstSubNote?.createdAt || row?.created_at || '');
    const subViewStats = aggregateThreadViews(viewItems, subTid, '', false);

    threads.push({
      id: subTid,
      clientName: displayName,
      clientPhone: displayContact,
      clientEmail: emailNorm || '',
      transactionalBasis: null,
      hasTransactionalBasis: false,
      requesterCompany: '',
      cleanMessage: subSummaryMessage,
      clientGrade: '일반' as const,
      isVip: false,
      clientRole: normalizeClientRole(row?.segment) || ('buyer' as InboxCrmClientRole),
      buildingTitle: assetTypes.length > 0 ? `관심 유형: ${assetTypes.join(', ')}` : '뉴스레터 구독 고객',
      buildingId: '',
      latestEvent: subNotes[0]?.description || subSummaryMessage,
      gateStatus: 'none' as const,
      updatedAt: formatRelativeKo(lastSubActivityAt) || '방금',
      lastActivityAt: lastSubActivityAt,
      openCount: subViewStats.openCount,
      dwellSeconds: subViewStats.dwellSeconds,
      lastViewedAt: subViewStats.lastViewedAt,
      isRead: true,
      status: 'active' as const,
      shareToken: '',
      shareUrl: '',
      hasCorrectionNotice: false,
      correctionMessage: '',
      budget: '',
      budgetManwon: null as number | null,
      preferredRegion: regions.join(', '),
      preferredRegions: [...regions],
      freeMemo: '',
      tags: allSelectedTags,
      focusedSections: subViewStats.focusedSections,
      newsletterSubscribed: effectiveSubscribed,
      events: [
        ...subNotes.map((nRaw: unknown) => {
          const n = asRecord(nRaw);
          return {
            id: String(n.id || ''),
            eventType: 'dwell' as const,
            description: String(n.description || ''),
            timestamp: String(n.timestamp || '방금'),
          };
        }),
        {
          id: `ev-${subTid}`,
          eventType: 'share' as const,
          description: subSummaryMessage,
          timestamp: formatRelativeKo(typeof row?.created_at === 'string' ? row.created_at : '') || '방금',
        },
      ],
    });
  }

  return { deliveryStatusById, deliveryStatusByEmail };
}

export function attachDispatchAndFilterThreads(params: {
  threads: Array<Record<string, unknown>>;
  rawDispatchAuditEvents: Array<Record<string, unknown>>;
  deliveryStatusById: Map<string, InboxEmailDeliveryStatus>;
  deliveryStatusByEmail: Map<string, InboxEmailDeliveryStatus>;
  filter: string;
}) {
  const { threads, rawDispatchAuditEvents, deliveryStatusById, deliveryStatusByEmail, filter } = params;

  for (const t of threads) {
    const tid = String(t.id || '');
    const strippedTid = tid.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
    const rawThreadContact = String(t.clientEmail || (String(t.clientPhone || '').includes('@') ? t.clientPhone : ''));
    const tEmail = normalizeClientEmail(rawThreadContact);
    const tEmailHash = tEmail ? hashEmailForSuppression(tEmail) : '';
    const tShareToken = String(t.shareToken || '').trim();

    let deliveryStatus: InboxEmailDeliveryStatus = 'ok';
    if (tid && deliveryStatusById.has(tid)) {
      deliveryStatus = promoteDeliveryStatus(deliveryStatus, deliveryStatusById.get(tid)!);
    }
    if (strippedTid && deliveryStatusById.has(strippedTid)) {
      deliveryStatus = promoteDeliveryStatus(deliveryStatus, deliveryStatusById.get(strippedTid)!);
    }
    if (tEmail && deliveryStatusByEmail.has(tEmail)) {
      deliveryStatus = promoteDeliveryStatus(deliveryStatus, deliveryStatusByEmail.get(tEmail)!);
    }

    const matchedDispatches: InboxDispatchHistoryItem[] = [];
    for (const ev of rawDispatchAuditEvents) {
      const meta = asRecord(ev?.metadata);
      const evType = String(ev?.event_type || '');
      const evThreadId = String(
        meta.thread_id || meta.request_id || meta.client_id || meta.recipient_id || meta.subscriber_id || ''
      ).trim();
      const evRawId = String(meta.raw_client_id || evThreadId.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '')).trim();
      const rawEvEmail = meta.to_email ?? meta.email ?? meta.client_email ?? meta.subscriber_email;
      const evEmail = normalizeClientEmail(typeof rawEvEmail === 'string' ? rawEvEmail : null);
      const evEmailHash = typeof meta.email_hash === 'string' ? meta.email_hash.trim().toLowerCase() : '';
      const evToken = String(meta.share_token || '').trim();
      const evTokenHash = String(meta.share_token_hash || '').trim();

      const matchesById =
        Boolean(evThreadId && evThreadId === tid) ||
        Boolean(
          strippedTid &&
            (evThreadId === strippedTid || evRawId === strippedTid || (ev?.entity_id && String(ev.entity_id) === strippedTid))
        );
      const matchesByEmail =
        Boolean(tEmailHash && evEmailHash && evEmailHash === tEmailHash) ||
        Boolean(tEmail && evEmail && evEmail === tEmail);
      const matchesByToken = Boolean(
        tShareToken &&
          ((evToken && evToken === tShareToken) ||
            (evTokenHash && evTokenHash === hashShareTokenForAudit(tShareToken)))
      );

      let matchesBroadcastOrImport = false;
      if (!matchesById && !matchesByEmail && !matchesByToken) {
        if (
          evType === 'magazine_sent' &&
          !evThreadId &&
          meta.dispatched !== false &&
          t.newsletterSubscribed === true
        ) {
          const seg = String(meta.segment || 'all').toLowerCase();
          if (
            seg === 'all' ||
            (seg === 'vip' && t.isVip === true) ||
            (seg === 'seller' && t.clientRole === 'seller') ||
            (seg === 'buyer' && t.clientRole === 'buyer')
          ) {
            matchesBroadcastOrImport = true;
          }
        } else if (evType === 'contacts_bulk_imported') {
          const importedIds = Array.isArray(meta.client_ids) ? meta.client_ids.map(String) : [];
          const importedEmails = Array.isArray(meta.emails)
            ? meta.emails.map((x: unknown) => normalizeClientEmail(typeof x === 'string' ? x : null)).filter(Boolean)
            : [];
          if (
            importedIds.includes(tid) ||
            (strippedTid && importedIds.includes(strippedTid)) ||
            (tEmail && importedEmails.includes(tEmail))
          ) {
            matchesBroadcastOrImport = true;
          }
        }
      }

      if (!matchesById && !matchesByEmail && !matchesByToken && !matchesBroadcastOrImport) continue;
      if (evType === 'email_complained') deliveryStatus = promoteDeliveryStatus(deliveryStatus, 'complained');
      else if (evType === 'email_bounced') deliveryStatus = promoteDeliveryStatus(deliveryStatus, 'bounced');
      matchedDispatches.push(toDispatchHistoryEntry(ev));
    }

    matchedDispatches.sort((a, b) => toSafeEpochMs(b.createdAt) - toSafeEpochMs(a.createdAt));
    t.emailDeliveryStatus = deliveryStatus;
    t.dispatchHistory = matchedDispatches;
  }

  threads.sort((a, b) => toSafeEpochMs(b.lastActivityAt) - toSafeEpochMs(a.lastActivityAt));

  return threads.filter((t) => {
    const isAnonView = String(t.id || '').startsWith('view_');
    const openCount = Number(t.openCount ?? 0);
    const dwellSeconds = Number(t.dwellSeconds ?? 0);
    switch (filter) {
      case 'all':
      case '':
        return true;
      case 'todo':
      case 'requests':
        return t.status === 'pending_gate' || t.gateStatus === 'pending' || !t.isRead;
      case 'viewed':
      case 'views':
        return openCount > 0 || dwellSeconds > 0 || t.status === 'high_interest' || isAnonView;
      case 'vip':
        return t.isVip === true || t.clientGrade === 'VIP';
      case 'buyer':
        return !isAnonView && t.clientRole === 'buyer';
      case 'seller':
        return !isAnonView && t.clientRole === 'seller';
      case 'newsletter':
        return !isAnonView && (t.newsletterSubscribed === true || String(t.id || '').startsWith('sub_'));
      case 'tenant':
        return !isAnonView && t.clientRole === 'tenant';
      case 'partner':
        return !isAnonView && t.clientRole === 'partner';
      case 'emailable':
        return !isAnonView && Boolean(t.clientEmail) && t.emailDeliveryStatus === 'ok';
      default:
        return true;
    }
  });
}
