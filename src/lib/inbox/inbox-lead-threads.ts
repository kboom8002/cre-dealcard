import { formatRelativeKo } from '@/lib/ux/lexicon';
import {
  normalizeClientEmail,
  type InboxTransactionalBasis,
} from '@/domain/inbox/inbox-outbound';
import {
  buildThreadShareUrl,
  formatImSectionLabel,
  normalizeKrPhoneDigits,
  toSafeEpochMs,
  type InboxCrmClientRole,
} from './inbox-helpers';
import { canonicalKrPhoneDigits } from './upsert-broker-client';

export interface ThreadBuildContext {
  threads: any[];
  seenThreadIds: Set<string>;
  viewItems: any[];
  callNotesByThreadId: Map<string, Array<{ id: string; description: string; timestamp: string; createdAt?: string }>>;
  decisionByThreadId: Map<string, { decision: 'approved' | 'rejected' | 'pending' | 'submitted'; shareToken?: string; createdAt?: string }>;
  revokedByThreadId: Map<string, { revoked: boolean; revokedAt?: string; shareToken?: string }>;
  issuedTokenByThreadId: Map<string, string>;
  newsletterStateByKey: Map<string, { subscribed: boolean; createdAtMs: number }>;
  shareLinks: any[];
  inboxState: {
    revokedBuildings: Record<string, any>;
    correctionNotices: Record<string, any>;
    callNotes: Record<string, any[]>;
  };
  allOwnedBuildingIds: string[];
  deletedBuildingSet: Set<string>;
  buildingTitleById: Map<string, string>;
  imBuildingIdSet?: Set<string>;
  dealCardBuildingIdSet?: Set<string>;
  isThreadArchived: (id: string) => boolean;
}

export function aggregateThreadViews(
  viewItems: any[],
  tid: string,
  bIdStr: string,
  allowUnscopedBuildingFallback: boolean,
  threadShareToken = ''
) {
  const strippedId = tid.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
  const taggedViews = viewItems.filter((v) => {
    if (v.recipientId && (v.recipientId === tid || (strippedId && v.recipientId === strippedId))) return true;
    if (v.gateRequestId && (v.gateRequestId === tid || (strippedId && v.gateRequestId === strippedId))) return true;
    if (threadShareToken && v.shareToken && v.shareToken === threadShareToken) return true;
    return false;
  });
  const scopedViews =
    taggedViews.length > 0
      ? taggedViews
      : allowUnscopedBuildingFallback && bIdStr
        ? viewItems.filter(
            (v) => v.building_id && String(v.building_id) === bIdStr && (!v.recipientId || v.recipientId === tid)
          )
        : [];
  const openEvents = scopedViews.filter((v) => !(v.dwellSeconds > 0));
  const openCount = scopedViews.length === 0 ? 0 : openEvents.length > 0 ? openEvents.length : scopedViews.length;
  const dwellSeconds = scopedViews.reduce(
    (acc, v) => acc + (typeof v.dwellSeconds === 'number' ? v.dwellSeconds : 0),
    0
  );
  const focusedSections = Array.from(
    new Set(
      scopedViews
        .map((v) => v.sectionName || formatImSectionLabel(v.sectionViewed))
        .filter((s): s is string => Boolean(s))
    )
  );
  return {
    scopedViews,
    openCount,
    dwellSeconds,
    focusedSections,
    lastViewedAt: scopedViews[0]?.created_at || null,
  };
}

export function appendGateAndInquiryThreads(
  ctx: ThreadBuildContext & { gateItems: any[]; inquiryItems: any[] }
) {
  const {
    threads,
    seenThreadIds,
    viewItems,
    callNotesByThreadId,
    decisionByThreadId,
    revokedByThreadId,
    issuedTokenByThreadId,
    newsletterStateByKey,
    shareLinks,
    inboxState,
    allOwnedBuildingIds,
    deletedBuildingSet,
    isThreadArchived,
    gateItems,
    inquiryItems,
  } = ctx;

  for (const gr of [...gateItems, ...inquiryItems]) {
    const tid = String(gr.id);
    if (!tid || seenThreadIds.has(tid) || isThreadArchived(tid)) continue;
    seenThreadIds.add(tid);

    const bIdStr = String(gr.building_id || '');
    const isDeletedBuilding =
      Boolean(gr.is_deleted_building) ||
      Boolean(bIdStr && deletedBuildingSet.has(bIdStr) && !allOwnedBuildingIds.includes(bIdStr));

    const decisionOverride = decisionByThreadId.get(tid);
    const effectiveStatus =
      gr.status === 'expired' ? 'expired' : decisionOverride ? decisionOverride.decision : gr.status;

    const isPending =
      !isDeletedBuilding &&
      (effectiveStatus === 'submitted' || effectiveStatus === 'pending' || effectiveStatus === 'broker_review');
    const isApproved = effectiveStatus === 'approved';
    const isRejected = effectiveStatus === 'rejected' || effectiveStatus === 'expired';
    gr.status = effectiveStatus;
    gr.is_unread = isPending;

    const recipientLink = shareLinks.find((sl) => sl.recipient_id && String(sl.recipient_id) === tid);
    const threadRevokeState = revokedByThreadId.get(tid);
    const isRevoked =
      threadRevokeState?.revoked === true ||
      (threadRevokeState?.revoked !== false &&
        (gr.status === 'revoked' ||
          recipientLink?.status === 'revoked' ||
          Boolean(recipientLink?.revoked_at) ||
          Boolean(gr.building_id && inboxState.revokedBuildings?.[String(gr.building_id)]?.revoked)));

    const resolvedShareToken =
      isApproved && !isRevoked
        ? decisionOverride?.shareToken || issuedTokenByThreadId.get(tid) || recipientLink?.token || ''
        : isRevoked
          ? recipientLink?.token || threadRevokeState?.shareToken || decisionOverride?.shareToken || ''
          : '';
    const resolvedHasIm =
      !bIdStr || !ctx.imBuildingIdSet
        ? undefined
        : ctx.imBuildingIdSet.has(bIdStr)
          ? true
          : ctx.dealCardBuildingIdSet?.has(bIdStr)
            ? false
            : true;
    const resolvedHasDealCard =
      !bIdStr || !ctx.dealCardBuildingIdSet
        ? undefined
        : ctx.dealCardBuildingIdSet.has(bIdStr);
    const resolvedShareUrl =
      isApproved && !isRevoked && bIdStr && (resolvedHasIm === false || Boolean(resolvedShareToken))
        ? buildThreadShareUrl(bIdStr, resolvedShareToken, resolvedHasIm !== false)
        : '';

    const viewStats = aggregateThreadViews(viewItems, tid, String(gr.building_id || ''), false, resolvedShareToken);
    const threadCallNotes = callNotesByThreadId.get(tid) || [];
    const baseRequestMsg = gr.cleanMessage || gr.reason || 'IM 열람을 요청했습니다.';
    const threadEvents: any[] = [
      ...threadCallNotes.map((n) => ({
        id: n.id,
        eventType: 'dwell' as const,
        description: n.description,
        timestamp: n.timestamp,
      })),
    ];
    if (isApproved) {
      threadEvents.push({
        id: `ev-approve-${tid}`,
        eventType: 'gate_request' as const,
        description: 'IM 열람 요청을 승인하고 전용 링크를 발급했습니다.',
        timestamp: formatRelativeKo(decisionOverride?.createdAt || gr.created_at) || '방금',
      });
    } else if (effectiveStatus === 'expired') {
      threadEvents.push({
        id: `ev-expired-${tid}`,
        eventType: 'gate_request' as const,
        description: 'IM 열람 유효기간이 만료되었습니다.',
        timestamp: formatRelativeKo(gr.expires_at || gr.created_at) || '방금',
      });
    } else if (isRejected) {
      threadEvents.push({
        id: `ev-reject-${tid}`,
        eventType: 'gate_request' as const,
        description: 'IM 열람 요청을 거절했습니다.',
        timestamp: formatRelativeKo(decisionOverride?.createdAt || gr.created_at) || '방금',
      });
    }
    threadEvents.push({
      id: `ev-${tid}`,
      eventType: 'gate_request' as const,
      description: baseRequestMsg,
      timestamp: formatRelativeKo(gr.created_at) || '방금',
    });

    const latestEventText =
      threadCallNotes[0]?.description ||
      (isApproved
        ? 'IM 열람 요청을 승인하고 전용 링크를 전달했습니다.'
        : effectiveStatus === 'expired'
          ? 'IM 열람 유효기간이 만료되었습니다.'
          : isRejected
            ? 'IM 열람 요청을 거절했습니다.'
            : baseRequestMsg);

    const lastActivityAt =
      threadCallNotes[0]?.createdAt || decisionOverride?.createdAt || gr.created_at || '';

    const phoneDigits = canonicalKrPhoneDigits(gr.requesterPhone || gr.requester_phone || '');
    const emailNorm = normalizeClientEmail(gr.requester_email || gr.requesterEmail) || '';
    const nlDecision =
      newsletterStateByKey.get(tid) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined) ||
      (emailNorm ? newsletterStateByKey.get(`email:${emailNorm}`) : undefined);
    const corrMsg =
      (bIdStr && inboxState.correctionNotices?.[bIdStr]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      '';
    const rawBuildingTitle = gr.buildingTitle || gr.building_label || '';
    const resolvedBuildingTitle = isDeletedBuilding
      ? !rawBuildingTitle || rawBuildingTitle === '매물'
        ? '삭제된 매물 (과거 문의)'
        : rawBuildingTitle.includes('삭제된 매물')
          ? rawBuildingTitle
          : `${rawBuildingTitle} (삭제된 매물)`
      : rawBuildingTitle || '매물';

    const resolvedName = gr.requesterName || gr.requester_name || '이름 미입력 고객';
    const resolvedPhone = gr.requesterPhone || gr.requester_phone || '';
    const resolvedCompany = gr.requesterCompany || gr.requester_company || '';

    const duplicateLead = threads.find((t) => {
      if (String(t.id || '').startsWith('view_')) return false;
      const tBld = String(t.buildingId || '');
      const sameScopeBuilding = !bIdStr || !tBld || tBld === bIdStr;
      if (!sameScopeBuilding) return false;
      const tPhone = canonicalKrPhoneDigits(t.clientPhone || '');
      if (phoneDigits.length >= 9 && tPhone === phoneDigits) return true;
      const tEmail = normalizeClientEmail(t.clientEmail || '');
      return Boolean(emailNorm && tEmail === emailNorm);
    });

    if (duplicateLead) {
      if (
        resolvedName &&
        resolvedName !== '이름 미입력 고객' &&
        (!duplicateLead.clientName || duplicateLead.clientName === '이름 미입력 고객')
      ) {
        duplicateLead.clientName = resolvedName;
      }
      if (resolvedPhone && !canonicalKrPhoneDigits(duplicateLead.clientPhone)) {
        duplicateLead.clientPhone = resolvedPhone;
      }
      if (emailNorm && !normalizeClientEmail(duplicateLead.clientEmail)) {
        duplicateLead.clientEmail = emailNorm;
      }
      if (resolvedCompany && !duplicateLead.clientCompany) {
        duplicateLead.clientCompany = resolvedCompany;
        if (!duplicateLead.requesterCompany) duplicateLead.requesterCompany = resolvedCompany;
      }
      if (!duplicateLead.buildingId && bIdStr) {
        duplicateLead.buildingId = bIdStr;
        if (resolvedBuildingTitle && resolvedBuildingTitle !== '매물') {
          duplicateLead.buildingTitle = resolvedBuildingTitle;
        }
      }
      if (isApproved && !duplicateLead.shareToken && resolvedShareToken) {
        duplicateLead.shareToken = resolvedShareToken;
        duplicateLead.shareUrl = resolvedShareUrl;
        duplicateLead.gateStatus = 'approved';
        if (!isRevoked) duplicateLead.status = 'active';
      } else if (isPending && duplicateLead.gateStatus === 'none') {
        duplicateLead.gateStatus = 'pending';
        if (duplicateLead.status !== 'revoked') duplicateLead.status = 'pending_gate';
        duplicateLead.isRead = false;
      }
      if (nlDecision && !duplicateLead.newsletterSubscribed) {
        duplicateLead.newsletterSubscribed = Boolean(nlDecision.subscribed);
        duplicateLead.newsletterStatus = nlDecision.subscribed ? 'active' : 'unsubscribed';
      }
      const existingEvents = Array.isArray(duplicateLead.events) ? duplicateLead.events : [];
      for (const ev of threadEvents) {
        if (!existingEvents.some((e: any) => e?.id === ev.id)) {
          existingEvents.push(ev);
        }
      }
      duplicateLead.events = existingEvents;
      duplicateLead.openCount = Math.max(Number(duplicateLead.openCount ?? 0), viewStats.openCount);
      duplicateLead.dwellSeconds = Math.max(Number(duplicateLead.dwellSeconds ?? 0), viewStats.dwellSeconds);
      if (
        lastActivityAt &&
        toSafeEpochMs(lastActivityAt) > toSafeEpochMs(duplicateLead.lastActivityAt)
      ) {
        duplicateLead.lastActivityAt = lastActivityAt;
        duplicateLead.updatedAt = formatRelativeKo(lastActivityAt) || duplicateLead.updatedAt;
        duplicateLead.latestEvent = latestEventText;
      }
      continue;
    }

    threads.push({
      id: tid,
      clientName: resolvedName,
      clientPhone: resolvedPhone,
      clientEmail: emailNorm,
      transactionalBasis: (gr.type === 'gate_request' ? 'im_request' : 'property_inquiry') as InboxTransactionalBasis,
      hasTransactionalBasis: true,
      clientCompany: resolvedCompany,
      requesterCompany: resolvedCompany,
      cleanMessage: baseRequestMsg,
      clientGrade: '일반' as const,
      isVip: false,
      clientRole: 'buyer' as InboxCrmClientRole,
      buildingTitle: resolvedBuildingTitle,
      buildingId: bIdStr,
      latestEvent: latestEventText,
      detail:
        effectiveStatus === 'expired'
          ? 'IM 열람 유효기간이 만료되었습니다.'
          : isRejected
            ? 'IM 열람 요청을 거절했습니다.'
            : baseRequestMsg,
      gateStatus: isPending
        ? ('pending' as const)
        : isApproved
          ? ('approved' as const)
          : isRejected
            ? ('rejected' as const)
            : ('none' as const),
      updatedAt: formatRelativeKo(lastActivityAt || gr.created_at) || '방금',
      lastActivityAt,
      openCount: viewStats.openCount,
      dwellSeconds: viewStats.dwellSeconds,
      lastViewedAt: viewStats.lastViewedAt,
      isRead: !gr.is_unread,
      status: isRevoked ? ('revoked' as const) : isPending ? ('pending_gate' as const) : ('active' as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget: '',
      budgetManwon: null as number | null,
      preferredRegion: '',
      preferredRegions: [] as string[],
      freeMemo: '',
      focusedSections: viewStats.focusedSections,
      newsletterSubscribed: Boolean(nlDecision?.subscribed),
      newsletterStatus: nlDecision
        ? nlDecision.subscribed
          ? ('active' as const)
          : ('unsubscribed' as const)
        : ('none' as const),
      ...(resolvedHasIm !== undefined ? { hasIm: resolvedHasIm } : {}),
      ...(resolvedHasDealCard !== undefined ? { hasDealCard: resolvedHasDealCard } : {}),
      events: threadEvents,
    });
  }
}

export function appendViewerThreads(ctx: ThreadBuildContext) {
  const {
    threads,
    seenThreadIds,
    viewItems,
    callNotesByThreadId,
    revokedByThreadId,
    issuedTokenByThreadId,
    newsletterStateByKey,
    inboxState,
    buildingTitleById,
    isThreadArchived,
  } = ctx;

  const ownedShareTokenSet = new Set<string>(
    threads.map((t) => String(t.shareToken || '').trim()).filter(Boolean)
  );
  const viewGroups = new Map<string, any[]>();
  for (const v of viewItems) {
    if (v.recipientId && seenThreadIds.has(v.recipientId)) continue;
    if (v.gateRequestId && seenThreadIds.has(v.gateRequestId)) continue;
    if (v.shareToken && ownedShareTokenSet.has(v.shareToken)) continue;
    const isAnon = !v.viewerName || v.viewerName === '익명 열람객';
    const groupEntityId = String(v.building_id || v.entity_id || 'b');
    const key = isAnon
      ? `${groupEntityId}::익명 열람객::${v.visitorFp || 'anon_nofp'}`
      : `${groupEntityId}::${v.viewerName}`;
    const list = viewGroups.get(key) || [];
    list.push(v);
    viewGroups.set(key, list);
  }

  const RAW_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const [, group] of viewGroups.entries()) {
    const first = group[0];
    const isAnon = !first.viewerName || first.viewerName === '익명 열람객';
    const isNonBuildingView =
      first.event_type === 'magazine_view' ||
      first.event_type === 'magazine_section_view' ||
      first.event_type === 'vibe_card_view';
    const groupEntityId = String(first.building_id || first.entity_id || 'b');
    const safeFp = isAnon
      ? String(first.visitorFp || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)
      : '';
    const tid =
      isAnon && safeFp
        ? `view_${groupEntityId}_anon_${safeFp}`
        : `view_${groupEntityId}_${encodeURIComponent(first.viewerName || 'anon')}`;
    if (seenThreadIds.has(tid) || isThreadArchived(tid)) continue;
    if (
      first.viewerName !== '익명 열람객' &&
      !isNonBuildingView &&
      threads.some((t) => t.buildingId === String(first.building_id) && t.clientName === first.viewerName)
    ) {
      continue;
    }
    seenThreadIds.add(tid);

    const bIdStr = isNonBuildingView ? '' : String(first.building_id || '');
    const focusedSections = Array.from(
      new Set(group.map((g) => g.sectionName).filter((s): s is string => Boolean(s)))
    );
    const threadRevokeState = revokedByThreadId.get(tid);
    const isRevoked =
      threadRevokeState?.revoked === true ||
      (threadRevokeState?.revoked !== false &&
        Boolean(bIdStr && inboxState.revokedBuildings?.[bIdStr]?.revoked));
    const corrMsg =
      (bIdStr && inboxState.correctionNotices?.[bIdStr]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      '';
    const resolvedHasIm =
      !bIdStr || !ctx.imBuildingIdSet
        ? undefined
        : ctx.imBuildingIdSet.has(bIdStr)
          ? true
          : ctx.dealCardBuildingIdSet?.has(bIdStr)
            ? false
            : true;
    const resolvedHasDealCard =
      !bIdStr || !ctx.dealCardBuildingIdSet
        ? undefined
        : ctx.dealCardBuildingIdSet.has(bIdStr);
    const resolvedShareToken = issuedTokenByThreadId.get(tid) || threadRevokeState?.shareToken || '';
    const resolvedShareUrl =
      !isRevoked && bIdStr && (resolvedHasIm === false || Boolean(resolvedShareToken))
        ? buildThreadShareUrl(bIdStr, resolvedShareToken, resolvedHasIm !== false)
        : '';
    const viewCallNotes = callNotesByThreadId.get(tid) || [];

    const viewOpenEvents = group.filter((g) => !(g.dwellSeconds > 0));
    const viewOpenCount = viewOpenEvents.length > 0 ? viewOpenEvents.length : group.length;
    const viewDwellSeconds = group.reduce(
      (sum, g) => sum + (typeof g.dwellSeconds === 'number' ? g.dwellSeconds : 0),
      0
    );

    threads.push({
      id: tid,
      clientName: first.viewerName || '익명 열람객',
      clientPhone: '',
      clientEmail: '',
      transactionalBasis: null,
      hasTransactionalBasis: false,
      requesterCompany: '',
      cleanMessage: '상세 자료를 열람했습니다',
      clientGrade: '일반' as const,
      isVip: false,
      clientRole: 'buyer' as InboxCrmClientRole,
      buildingTitle: (() => {
        const rawTitle = String(
          (bIdStr ? buildingTitleById.get(bIdStr) : '') ||
            first.sub_label ||
            (isNonBuildingView ? '부동산뉴스' : '매물')
        ).trim();
        if (!rawTitle || RAW_UUID_RE.test(rawTitle)) {
          return isNonBuildingView ? '부동산뉴스' : '관심 매물 미지정';
        }
        return rawTitle;
      })(),
      buildingId: bIdStr,
      latestEvent:
        viewCallNotes[0]?.description ||
        (isRevoked
          ? '보낸 링크를 잠갔습니다.'
          : focusedSections.length > 0
            ? `${focusedSections.join(' · ')} 열람`
            : first.label || '상세 자료를 열람했습니다'),
      gateStatus: 'none' as const,
      updatedAt: formatRelativeKo(first.created_at) || '방금',
      lastActivityAt: first.created_at || '',
      openCount: viewOpenCount,
      dwellSeconds: viewDwellSeconds,
      lastViewedAt: first.created_at || null,
      isRead: true,
      status: isRevoked
        ? ('revoked' as const)
        : viewOpenCount >= 3 || viewDwellSeconds >= 90
          ? ('high_interest' as const)
          : ('active' as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget: '',
      budgetManwon: null as number | null,
      preferredRegion: '',
      preferredRegions: [] as string[],
      freeMemo: '',
      focusedSections,
      newsletterSubscribed: Boolean(newsletterStateByKey.get(tid)?.subscribed),
      ...(resolvedHasIm !== undefined ? { hasIm: resolvedHasIm } : {}),
      ...(resolvedHasDealCard !== undefined ? { hasDealCard: resolvedHasDealCard } : {}),
      events: [
        ...viewCallNotes.map((n) => ({
          id: n.id,
          eventType: 'dwell' as const,
          description: n.description,
          timestamp: n.timestamp,
        })),
        ...group.map((g) => ({
          id: `ev-${g.id}`,
          eventType: 'open' as const,
          description: g.sectionName ? `${g.sectionName} 열람` : g.label || '상세 자료를 열람했습니다',
          timestamp: formatRelativeKo(g.created_at) || '방금',
          sectionName: g.sectionName,
        })),
      ],
    });
  }
}

export { toSafeEpochMs };
