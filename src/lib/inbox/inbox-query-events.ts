import { formatRelativeKo } from '@/lib/ux/lexicon';
import {
  normalizeClientEmail,
  normalizeTransactionalBasis,
} from '@/domain/inbox/inbox-outbound';
import {
  formatBudgetManwonDisplay,
  normalizeClientRole,
  normalizeKrPhoneDigits,
  parseBudgetManwonInput,
  parseGateRequestReason,
  parsePreferredRegionsInput,
  resolveBuildingTitle,
  toSafeEpochMs,
} from './inbox-helpers';

export function mapGateAndViewAndInquiryItems(params: {
  userId: string;
  limit: number;
  allOwnedBuildingIds: string[];
  forbiddenBuildingSet: Set<string>;
  deletedBuildingSet: Set<string>;
  buildingTitleById: Map<string, string>;
  quickInventory: Array<{ buildingId: string; title: string }>;
  grData: any[];
  actGateData: any[];
  viewData: any[];
  notifData: any[];
  inqData: any[];
}) {
  const {
    userId,
    limit,
    allOwnedBuildingIds,
    forbiddenBuildingSet,
    deletedBuildingSet,
    buildingTitleById,
    quickInventory,
    grData,
    actGateData,
    viewData,
    notifData,
    inqData,
  } = params;

  const nowMs = Date.now();
  const gateItems: any[] = grData
    .filter((gr: any) => {
      const bldgOwner = gr.building?.owner_id || gr.buildings?.owner_id || gr.broker_id;
      if (bldgOwner && String(bldgOwner) !== userId) return false;
      return Boolean(gr.building_id && allOwnedBuildingIds.includes(String(gr.building_id)));
    })
    .map((gr: any) => {
      const parsedReason = parseGateRequestReason(gr.reason);
      const buildingTitle = resolveBuildingTitle(
        gr.building || gr.buildings,
        buildingTitleById.get(String(gr.building_id)) ||
          quickInventory.find((q) => q.buildingId === gr.building_id)?.title ||
          '매물'
      );
      const requesterName = gr.requester?.display_name || parsedReason.requesterName || '이름 미입력 고객';
      const requesterPhone = gr.requester?.phone || parsedReason.requesterPhone || '';
      const effectiveGrStatus =
        gr.status === 'approved' && gr.expires_at && toSafeEpochMs(gr.expires_at) > 0 && toSafeEpochMs(gr.expires_at) <= nowMs
          ? 'expired'
          : gr.status;
      const isPending = effectiveGrStatus === 'submitted' || effectiveGrStatus === 'pending' || effectiveGrStatus === 'broker_review';
      return {
        id: gr.id,
        type: 'gate_request' as const,
        status: effectiveGrStatus,
        expires_at: gr.expires_at || null,
        building_id: gr.building_id,
        buildingId: gr.building_id,
        building_label: buildingTitle,
        buildingTitle,
        requester_name: requesterName,
        requesterName,
        requester_phone: requesterPhone || null,
        requesterPhone,
        requester_company: parsedReason.requesterCompany || null,
        requesterCompany: parsedReason.requesterCompany || '',
        requester_email: gr.requester?.email || parsedReason.requesterEmail || null,
        requested_level: gr.requested_level,
        reason: parsedReason.cleanMessage,
        cleanMessage: parsedReason.cleanMessage,
        created_at: gr.created_at,
        is_unread: isPending,
      };
    });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const existingGateIds = new Set(gateItems.map((g: any) => String(g.id)));
  for (const ev of actGateData) {
    const meta = (ev.metadata as Record<string, any>) || {};
    if (meta.broker_id && String(meta.broker_id) !== userId) continue;
    const bId = String(meta.building_id || ev.entity_id || '').trim();
    if (!bId || forbiddenBuildingSet.has(bId) || deletedBuildingSet.has(bId)) continue;
    if (allOwnedBuildingIds.length > 0 && UUID_RE.test(bId) && !allOwnedBuildingIds.includes(bId)) continue;
    if (!((meta.broker_id && String(meta.broker_id) === userId) || allOwnedBuildingIds.includes(bId))) continue;
    const gateId = String(meta.gate_request_id || ev.entity_id || `gr-act-${ev.id}`);
    if (existingGateIds.has(gateId)) continue;
    // Real UUID-building gate requests are authoritative in `gate_requests` (`grData`).
    // Never resurrect deleted/historical UUID audit events (or `intent.pro_im_request` telemetry
    // keyed on the building UUID itself) as fake pending rows that 404 on approval.
    if (UUID_RE.test(bId) && (!meta.gate_request_id || UUID_RE.test(gateId))) {
      continue;
    }
    existingGateIds.add(gateId);
    const rawReasonInput =
      typeof meta.reason === 'string'
        ? meta.reason
        : typeof meta.message === 'string'
          ? meta.message
          : meta.name || meta.requester_name || meta.phone || meta.contact || meta.requester_phone
            ? JSON.stringify({
                name: meta.requester_name || meta.name,
                phone: meta.requester_phone || meta.phone || meta.contact,
                company: meta.requester_company || meta.company,
                message:
                  meta.message ||
                  meta.reason ||
                  (ev.event_type === 'intent.pro_im_request'
                    ? '상세 IM 자료(Pro IM) 열람을 요청했습니다.'
                    : 'IM 열람을 요청했습니다.'),
              })
            : ev.event_type === 'intent.pro_im_request'
              ? '상세 IM 자료(Pro IM) 열람을 요청했습니다.'
              : 'IM 열람을 요청했습니다.';
    const parsedReason = parseGateRequestReason(rawReasonInput);
    const bTitle =
      buildingTitleById.get(bId) ||
      quickInventory.find((q) => q.buildingId === bId)?.title ||
      String(meta.building_title || meta.building_name || '매물');
    const rName = meta.requester_name || meta.name || parsedReason.requesterName || '이름 미입력 고객';
    const rPhone = meta.requester_phone || meta.phone || meta.contact || parsedReason.requesterPhone || '';
    const rComp = meta.requester_company || meta.company || parsedReason.requesterCompany || '';
    gateItems.push({
      id: gateId,
      type: 'gate_request' as const,
      status: 'submitted',
      building_id: bId,
      buildingId: bId,
      building_label: bTitle,
      buildingTitle: bTitle,
      requester_name: rName,
      requesterName: rName,
      requester_phone: rPhone || null,
      requesterPhone: rPhone,
      requester_company: rComp || null,
      requesterCompany: rComp,
      requester_email: meta.requester_email || meta.email || parsedReason.requesterEmail || null,
      requested_level: meta.requested_level || 'G1',
      reason: parsedReason.cleanMessage,
      cleanMessage: parsedReason.cleanMessage,
      created_at: ev.created_at,
      is_unread: true,
    });
  }

  const viewItems = viewData
    .filter((evt: any) => {
      if (evt.actor_id && String(evt.actor_id) === userId && evt.actor_role !== 'system') return false;
      const meta = (evt.metadata as Record<string, any>) || {};
      const evtBld = String(evt.entity_id || meta.building_id || '');
      if (evtBld && (forbiddenBuildingSet.has(evtBld) || deletedBuildingSet.has(evtBld))) return false;
      return (
        allOwnedBuildingIds.includes(evt.entity_id) ||
        allOwnedBuildingIds.includes(meta.building_id) ||
        meta.broker_id === userId
      );
    })
    .slice(0, limit)
    .map((evt: any) => {
      const meta = (evt.metadata as Record<string, any>) || {};
      const RAW_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const nonUuid = (val: unknown): string => {
        const s = typeof val === 'string' ? val.trim() : '';
        return s && !RAW_UUID_RE.test(s) ? s : '';
      };
      const isMagazineView =
        evt.event_type === 'magazine_view' || evt.event_type === 'magazine_section_view';
      const isVibeCardView = evt.event_type === 'vibe_card_view';
      const label =
        evt.event_type === 'mobile_im_view' || evt.event_type === 'im_lite_view'
          ? 'IM 자료를 열람했습니다'
          : evt.event_type === 'blind_teaser_view' || evt.event_type === 'deal_card_view'
            ? '딜카드를 열람했습니다'
            : isMagazineView
              ? '뉴스레터를 열람했습니다'
              : evt.event_type === 'magazine_to_im_click'
                ? '뉴스레터에서 매물 자료를 열람했습니다'
                : isVibeCardView
                  ? '프로필 카드를 열람했습니다'
                  : '상세 자료를 열람했습니다';
      const subLabel = isVibeCardView
        ? '중개사 프로필 카드'
        : isMagazineView
          ? nonUuid(meta.edition_title) ||
            nonUuid(meta.title) ||
            (nonUuid(meta.issue_date) ? `부동산뉴스 (${nonUuid(meta.issue_date)})` : '') ||
            nonUuid(meta.section) ||
            '부동산뉴스'
          : evt.event_type === 'magazine_to_im_click'
            ? nonUuid(meta.building_name) || nonUuid(meta.edition_title) || '부동산뉴스 추천 매물'
            : nonUuid(meta.building_name) || nonUuid(meta.area_signal) || '매물';
      const viewerName =
        typeof meta.viewer_name === 'string' && meta.viewer_name.trim()
          ? meta.viewer_name.trim()
          : typeof meta.viewer_email === 'string' && meta.viewer_email.trim()
            ? meta.viewer_email.trim()
            : '익명 열람객';
      const sectionName =
        typeof meta.section_name === 'string' && meta.section_name.trim()
          ? meta.section_name.trim()
          : typeof meta.section_title === 'string' && meta.section_title.trim()
            ? meta.section_title.trim()
            : undefined;
      const visitorFp = String(
        meta.visitor_fp || meta.user_agent_hash || meta.visitor_id || meta.visitor_hash || meta.ip_hash || ''
      ).trim();
      return {
        id: evt.id,
        type: 'view' as const,
        event_type: evt.event_type,
        label,
        sub_label: subLabel,
        entity_id: evt.entity_id || meta.edition_id || meta.building_id || '',
        building_id: isMagazineView || isVibeCardView ? '' : evt.entity_id || meta.building_id || '',
        viewer_info: viewerName,
        viewerName,
        visitorFp,
        sectionName,
        sectionViewed: typeof meta.section_viewed === 'string' && meta.section_viewed.trim() ? meta.section_viewed.trim() : null,
        dwellSeconds: typeof meta.dwell_seconds === 'number' && Number.isFinite(meta.dwell_seconds) ? meta.dwell_seconds : 0,
        recipientId:
          typeof meta.recipient_id === 'string' && meta.recipient_id.trim()
            ? meta.recipient_id.trim()
            : typeof meta.subscriber_id === 'string' && meta.subscriber_id.trim()
              ? meta.subscriber_id.trim()
              : null,
        gateRequestId:
          typeof meta.gate_request_id === 'string' && meta.gate_request_id.trim()
            ? meta.gate_request_id.trim()
            : typeof meta.request_id === 'string' && meta.request_id.trim()
              ? meta.request_id.trim()
              : null,
        shareToken:
          typeof meta.share_token === 'string' && meta.share_token.trim()
            ? meta.share_token.trim()
            : typeof meta.token === 'string' && meta.token.trim()
              ? meta.token.trim()
              : null,
        shareTokenChannel: typeof meta.share_token_channel === 'string' ? meta.share_token_channel : null,
        created_at: evt.created_at,
        is_unread: false,
      };
    });

  const notifItems = notifData.map((n: any) => ({
    id: n.id,
    type: 'notification' as const,
    notification_type: n.type,
    label: n.title,
    sub_label: n.body?.substring(0, 80) || '',
    link: n.link,
    building_id: n.metadata?.building_id || null,
    requester_name: n.metadata?.requester_name || null,
    requester_phone: n.metadata?.requester_phone || null,
    requester_email: n.metadata?.requester_email || null,
    is_unread: !n.is_read,
    created_at: n.created_at,
  }));

  const gateSeenIds = new Set(gateItems.map((g: any) => String(g.id)));
  const inquiryItems = inqData
    .filter((inq: any) => !gateSeenIds.has(String(inq.id)) && (!inq.building_id || !forbiddenBuildingSet.has(String(inq.building_id))))
    .map((inq: any) => {
      const parsed = parseGateRequestReason(inq.message);
      const bIdStr = inq.building_id ? String(inq.building_id) : '';
      const isDeletedBld = Boolean(bIdStr && deletedBuildingSet.has(bIdStr) && !allOwnedBuildingIds.includes(bIdStr));
      const bTitle =
        buildingTitleById.get(bIdStr) ||
        quickInventory.find((q) => q.buildingId === bIdStr)?.title ||
        (isDeletedBld ? '삭제된 매물 (과거 문의)' : '매물');
      const rName = inq.requester_name || parsed.requesterName || '매수 문의 고객';
      const rPhone = inq.requester_phone || parsed.requesterPhone || '';
      const cMsg = parsed.cleanMessage || inq.message || 'IM 열람을 요청했습니다.';
      const rawStatus = typeof inq.status === 'string' && inq.status.trim() ? inq.status.trim() : 'submitted';
      const isPending = !isDeletedBld && (rawStatus === 'submitted' || rawStatus === 'pending' || rawStatus === 'broker_review');
      return {
        id: inq.id,
        type: 'gate_request' as const,
        status: rawStatus,
        building_id: inq.building_id,
        buildingId: inq.building_id,
        building_label: bTitle,
        buildingTitle: bTitle,
        requester_name: rName,
        requesterName: rName,
        requester_phone: rPhone || null,
        requesterPhone: rPhone,
        requester_company: parsed.requesterCompany || null,
        requesterCompany: parsed.requesterCompany || '',
        requester_email: inq.requester_email || parsed.requesterEmail || null,
        requested_level: 'G2',
        reason: cMsg,
        cleanMessage: cMsg,
        created_at: inq.created_at,
        is_unread: isPending,
        is_deleted_building: isDeletedBld,
      };
    });

  return { gateItems, viewItems, notifItems, inquiryItems };
}

export function reduceGovernanceAndAuditEvents(params: {
  userId: string;
  allOwnedBuildingIds: string[];
  ownedThreadKeySet: Set<string>;
  rawInboxState: any;
  inboxState: any;
  govActs: any[];
  noteActs: any[];
  ownDispRows: any[];
  webhookDispRows: any[];
}) {
  const {
    userId,
    allOwnedBuildingIds,
    ownedThreadKeySet,
    rawInboxState,
    inboxState,
    govActs,
    noteActs,
    ownDispRows,
    webhookDispRows,
  } = params;

  if (rawInboxState) {
    for (const bId of allOwnedBuildingIds) {
      if (rawInboxState.revokedBuildings?.[bId]) inboxState.revokedBuildings[bId] = { ...rawInboxState.revokedBuildings[bId] };
      if (rawInboxState.correctionNotices?.[bId]) inboxState.correctionNotices[bId] = { ...rawInboxState.correctionNotices[bId] };
    }
  }

  const decisionByThreadId = new Map<string, { decision: 'approved' | 'rejected' | 'pending' | 'submitted'; shareToken?: string; createdAt?: string }>();
  const callNotesByThreadId = new Map<string, Array<{ id: string; description: string; timestamp: string; createdAt?: string }>>();
  const revokedByThreadId = new Map<string, { revoked: boolean; revokedAt?: string; shareToken?: string }>();
  const issuedTokenByThreadId = new Map<string, string>();
  const newsletterStateByKey = new Map<string, { subscribed: boolean; createdAtMs: number }>();
  const deletedClientIdSet = new Set<string>();
  const archivedThreadIds = new Set<string>();

  if (rawInboxState) {
    for (const [k, v] of Object.entries(rawInboxState.gateDecisions || {})) {
      const decBld = (v as any)?.buildingId ? String((v as any).buildingId) : '';
      if ((ownedThreadKeySet.has(k) || (decBld && allOwnedBuildingIds.includes(decBld))) && (v as any)?.status) {
        inboxState.gateDecisions[k] = { ...(v as any) };
        decisionByThreadId.set(k, {
          decision: (v as any).status,
          shareToken: (v as any).shareToken,
          createdAt: (v as any).updatedAt,
        });
      }
    }
    for (const [k, list] of Object.entries(rawInboxState.callNotes || {})) {
      if (ownedThreadKeySet.has(k) && Array.isArray(list) && list.length > 0) {
        inboxState.callNotes[k] = [...list];
        callNotesByThreadId.set(
          k,
          list.map((n: any) => ({
            id: String(n.id || `note-${Date.now()}`),
            description: String(n.description || ''),
            timestamp: String(n.timestamp || '방금'),
          }))
        );
      }
    }
  }

  const seenDbDecisionKeys = new Set<string>();
  const seenArchiveDecision = new Set<string>();
  const seenRevokeBuilding = new Set<string>();
  const seenRevokeThread = new Set<string>();
  const seenCorrectionDecision = new Set<string>();
  const seenClientLifecycle = new Set<string>();

  const recordNl = (key: string, subscribed: boolean, createdAt?: string) => {
    if (!key) return;
    const ts = toSafeEpochMs(createdAt);
    const ex = newsletterStateByKey.get(key);
    if (!ex || ts >= ex.createdAtMs) newsletterStateByKey.set(key, { subscribed, createdAtMs: ts });
  };

  for (const act of govActs) {
    const meta = (act.metadata as Record<string, any>) || {};
    const tKey = String(meta.thread_id || meta.gate_request_id || meta.request_id || '').trim();
    const rawKey = String(meta.gate_request_id || meta.request_id || meta.raw_client_id || '').trim();
    const bKey = String(meta.building_id || (act.entity_id !== userId ? act.entity_id : '') || '').trim();

    if (act.event_type === 'custom_client_deleted') {
      const delId = String(meta.client_id || '').trim();
      const rawDel = String(meta.raw_client_id || delId.replace(/^(?:custom[-_]|cli-)/, '')).trim();
      for (const k of [delId, rawDel, rawDel ? `custom_${rawDel}` : ''].filter(Boolean)) {
        if (!seenClientLifecycle.has(k)) {
          seenClientLifecycle.add(k);
          deletedClientIdSet.add(k);
        }
      }
    } else if (act.event_type === 'custom_client_upserted' && meta.client_name) {
      const cId = String(meta.client_id || `custom_${act.id}`);
      const rawCId = cId.replace(/^(?:custom[-_]|cli-)/, '');
      if (seenClientLifecycle.has(cId) || deletedClientIdSet.has(cId)) continue;
      seenClientLifecycle.add(cId);
      if (rawCId) seenClientLifecycle.add(rawCId);
      const cName = String(meta.client_name).trim();
      const cPhone = String(meta.client_phone || '').trim();
      const phoneDigits = cPhone.replace(/\D/g, '');
      if (typeof meta.newsletter_subscribed === 'boolean') {
        recordNl(cId, meta.newsletter_subscribed, act.created_at);
        if (rawCId) recordNl(rawCId, meta.newsletter_subscribed, act.created_at);
        if (phoneDigits) recordNl(`tel:${phoneDigits}`, meta.newsletter_subscribed, act.created_at);
      }
      const existingIdx = inboxState.customClients.findIndex(
        (c: any) => c.id === cId || (c.clientName === cName && c.clientPhone === cPhone)
      );
      const resolvedGrade: 'VIP' | '일반' | '잠재' =
        meta.client_grade === '일반' || meta.client_grade === '잠재' ? meta.client_grade : meta.is_vip === false ? '일반' : 'VIP';
      const resolvedRegions = parsePreferredRegionsInput(meta.preferred_regions, meta.preferred_region);
      const resolvedBudget = parseBudgetManwonInput(meta.budget_manwon, meta.budget);
      const upsertedObj = {
        id: cId,
        ownerId: userId,
        clientName: cName,
        clientGrade: resolvedGrade,
        isVip: typeof meta.is_vip === 'boolean' ? meta.is_vip : resolvedGrade === 'VIP',
        clientRole: normalizeClientRole(meta.client_role) || 'buyer',
        clientPhone: cPhone,
        clientEmail: normalizeClientEmail(meta.client_email) || undefined,
        transactionalBasis: normalizeTransactionalBasis(meta.transactional_basis) || undefined,
        budget: String(meta.budget || formatBudgetManwonDisplay(resolvedBudget)),
        budgetManwon: resolvedBudget,
        preferredRegion: String(meta.preferred_region || resolvedRegions.join(', ')),
        preferredRegions: resolvedRegions,
        freeMemo: typeof meta.free_memo === 'string' ? meta.free_memo : '',
        buildingId: String(meta.building_id || ''),
        buildingTitle: String(meta.building_title || '관심 매물 상담'),
        newsletterSubscribed: Boolean(meta.newsletter_subscribed),
        createdAt: act.created_at || new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        if (toSafeEpochMs(act.created_at) >= toSafeEpochMs(inboxState.customClients[existingIdx].createdAt)) {
          inboxState.customClients[existingIdx] = upsertedObj;
        }
      } else {
        inboxState.customClients.push(upsertedObj);
      }
    } else if (act.event_type === 'newsletter_subscription_toggled') {
      const toggleConsent = String(meta.consent_status || '').trim().toLowerCase();
      const togglePending =
        meta.newsletter_opt_in_pending === true || toggleConsent === 'pending' || toggleConsent === 'unconfirmed';
      const subVal = Boolean(meta.newsletter_subscribed ?? meta.subscribed) && !togglePending;
      const cId = String(meta.client_id || meta.thread_id || '').trim();
      const rawCId = String(meta.raw_client_id || cId.replace(/^(?:custom[-_]|cli-|sub_)/, '')).trim();
      const phoneDigits = normalizeKrPhoneDigits(meta.client_phone || meta.phone || '');
      const emailNorm = String(meta.client_email || meta.email || '').trim().toLowerCase();
      if (cId) recordNl(cId, subVal, act.created_at);
      for (const pfx of ['', 'custom_', 'cli-', 'sub_']) if (rawCId) recordNl(`${pfx}${rawCId}`, subVal, act.created_at);
      if (phoneDigits) recordNl(`tel:${phoneDigits}`, subVal, act.created_at);
      if (emailNorm) recordNl(`email:${emailNorm}`, subVal, act.created_at);
    } else if (act.event_type === 'magazine_subscribed' || act.event_type === 'magazine_unsubscribed') {
      const subVal = act.event_type === 'magazine_subscribed';
      const phoneDigits = normalizeKrPhoneDigits(meta.subscriber_phone || meta.phone || '');
      const emailNorm = String(meta.subscriber_email || meta.email || '').trim().toLowerCase();
      if (phoneDigits) recordNl(`tel:${phoneDigits}`, subVal, act.created_at);
      if (emailNorm) recordNl(`email:${emailNorm}`, subVal, act.created_at);
    } else if (act.event_type === 'inbox_thread_archived' || act.event_type === 'inbox_thread_unarchived') {
      const isArch = act.event_type === 'inbox_thread_archived';
      for (const k of [tKey, rawKey].filter(Boolean)) {
        if (!seenArchiveDecision.has(k)) {
          seenArchiveDecision.add(k);
          if (isArch) archivedThreadIds.add(k);
          else archivedThreadIds.delete(k);
        }
      }
    } else if (act.event_type === 'im_link_sent') {
      const tok = typeof meta.share_token === 'string' ? meta.share_token.trim() : '';
      if (tok && tKey && !issuedTokenByThreadId.has(tKey)) issuedTokenByThreadId.set(tKey, tok);
    } else if (
      (act.event_type === 'gate_request_approved' || act.event_type === 'gate_request_rejected' || act.event_type === 'gate_request_reset') &&
      (tKey || rawKey)
    ) {
      const dec: 'approved' | 'rejected' | 'submitted' =
        act.event_type === 'gate_request_approved' ? 'approved' : act.event_type === 'gate_request_rejected' ? 'rejected' : 'submitted';
      const tok = typeof meta.share_token === 'string' ? meta.share_token : undefined;
      if (tok && tKey && !issuedTokenByThreadId.has(tKey)) issuedTokenByThreadId.set(tKey, tok);
      for (const k of [tKey, rawKey].filter(Boolean)) {
        if (!seenDbDecisionKeys.has(k)) {
          seenDbDecisionKeys.add(k);
          const existing = decisionByThreadId.get(k);
          if (!existing || toSafeEpochMs(act.created_at) >= toSafeEpochMs(existing.createdAt)) {
            decisionByThreadId.set(k, { decision: dec, shareToken: dec === 'approved' ? tok : undefined, createdAt: act.created_at });
          }
        }
      }
    } else if (
      act.event_type === 'thread_link_revoked' ||
      act.event_type === 'thread_link_restored' ||
      act.event_type === 'link_revoked' ||
      act.event_type === 'link_restored'
    ) {
      const isRev = act.event_type === 'thread_link_revoked' || act.event_type === 'link_revoked';
      const tok = typeof meta.share_token === 'string' ? meta.share_token : undefined;
      if (!isRev && tok && tKey && !issuedTokenByThreadId.has(tKey)) issuedTokenByThreadId.set(tKey, tok);
      for (const k of new Set([tKey, rawKey].filter(Boolean))) {
        if (!seenRevokeThread.has(k)) {
          seenRevokeThread.add(k);
          revokedByThreadId.set(k, { revoked: isRev, revokedAt: act.created_at, shareToken: tok });
        }
      }
      if ((act.event_type === 'link_revoked' || act.event_type === 'link_restored') && bKey && !tok && !seenRevokeBuilding.has(bKey)) {
        seenRevokeBuilding.add(bKey);
        const existingRev = inboxState.revokedBuildings[bKey];
        if (!existingRev || toSafeEpochMs(act.created_at) >= toSafeEpochMs(existingRev?.revokedAt)) {
          inboxState.revokedBuildings[bKey] = { revoked: isRev, revokedAt: act.created_at, shareToken: tok };
        }
      }
    } else if ((act.event_type === 'correction_notice_published' || act.event_type === 'correction_notice_cleared') && (bKey || tKey)) {
      const corrTarget = bKey || tKey;
      if (!seenCorrectionDecision.has(corrTarget)) {
        seenCorrectionDecision.add(corrTarget);
        const exNotice = inboxState.correctionNotices[corrTarget];
        if (!exNotice || toSafeEpochMs(act.created_at) >= toSafeEpochMs(exNotice?.updatedAt)) {
          if (act.event_type === 'correction_notice_published' && meta.message) {
            inboxState.correctionNotices[corrTarget] = { message: String(meta.message), updatedAt: act.created_at };
          } else if (act.event_type === 'correction_notice_cleared') {
            delete inboxState.correctionNotices[corrTarget];
          }
        }
      }
    }
  }

  for (const act of noteActs) {
    const meta = (act.metadata as Record<string, any>) || {};
    if (!meta.note) continue;
    const tKey = String(meta.thread_id || meta.request_id || act.entity_id || '').trim();
    const rawKey = String(meta.request_id || meta.raw_client_id || '').trim();
    const noteItem = {
      id: `ev-note-${act.id}`,
      description: String(meta.note),
      timestamp: formatRelativeKo(act.created_at) || '방금',
      createdAt: act.created_at,
    };
    for (const k of new Set([tKey, rawKey].filter(Boolean))) {
      const existing = callNotesByThreadId.get(k) || [];
      if (!existing.some((e) => e.description === noteItem.description)) {
        existing.push(noteItem);
        callNotesByThreadId.set(k, existing);
      }
    }
  }

  const rawDispatchAuditEvents: Array<Record<string, any>> = [];
  const seenDispIds = new Set<string>();
  const pushDispatchRows = (rows: unknown, allowNullActor: boolean) => {
    for (const ev of Array.isArray(rows) ? rows : []) {
      const id = String((ev as any)?.id || '');
      if (!id || seenDispIds.has(id)) continue;
      const actor = (ev as any)?.actor_id ? String((ev as any).actor_id) : null;
      if ((actor && actor !== userId) || (!actor && !allowNullActor)) continue;
      seenDispIds.add(id);
      rawDispatchAuditEvents.push(ev as Record<string, any>);
    }
  };
  pushDispatchRows(ownDispRows, false);
  pushDispatchRows(webhookDispRows, true);

  return {
    decisionByThreadId,
    callNotesByThreadId,
    revokedByThreadId,
    issuedTokenByThreadId,
    newsletterStateByKey,
    deletedClientIdSet,
    archivedThreadIds,
    rawDispatchAuditEvents,
  };
}
