import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  isDealCardDeleted,
  isUuid,
  listAllQuickImRecords,
} from '@/lib/im-lite/quick-generate-store';
import { getBrokerSubscriptionTier } from '@/domain/subscription/tier-gate';
import { normalizeClientEmail } from '@/domain/inbox/inbox-outbound';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import {
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import {
  formatBudgetManwonDisplay,
  normalizeClientRole,
  parseBudgetManwonInput,
  parsePreferredRegionsInput,
  resolveBuildingTitle,
  toSafeEpochMs,
  type InboxDispatchHistoryItem,
  type InboxEmailDeliveryStatus,
} from './inbox-helpers';
import {
  getInboxSchemaCaps,
  isIgnorableSchemaError,
  markInboxSchemaCapUnsupported,
} from './inbox-schema-caps';
import {
  appendGateAndInquiryThreads,
  appendViewerThreads,
  type ThreadBuildContext,
} from './inbox-lead-threads';
import {
  appendCrmAndSubscriberThreads,
  attachDispatchAndFilterThreads,
} from './inbox-client-threads';
import {
  allowMemoryFallback,
  buildOwnedEventOrClause,
  handleGetPendingCount,
  safeQ,
} from './inbox-pending-count';
import {
  mapGateAndViewAndInquiryItems,
  reduceGovernanceAndAuditEvents,
} from './inbox-query-events';

export { handleGetPendingCount };

type LooseQueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
};

type LooseQuery = PromiseLike<LooseQueryResult> & {
  eq?: (col: string, val: unknown) => LooseQuery;
  in?: (col: string, vals: unknown[]) => LooseQuery;
  or?: (expr: string) => LooseQuery;
  gte?: (col: string, val: string) => LooseQuery;
  order?: (col: string, opts?: { ascending?: boolean }) => LooseQuery;
  limit?: (n: number) => LooseQuery;
  range?: (from: number, to: number) => LooseQuery;
  maybeSingle?: () => PromiseLike<LooseQueryResult>;
  single?: () => PromiseLike<LooseQueryResult>;
};

type LooseDb = {
  from: (table: string) => {
    select: (cols?: string, opts?: { count?: 'exact' }) => LooseQuery;
  };
};

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

export async function handleGetInbox(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const userId = guard.user?.id || null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(req.url);
  const filter = (url.searchParams.get('filter') || 'all').trim().toLowerCase();
  const includeArchived = url.searchParams.get('includeArchived') === '1';
  const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
  const parsedOffset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const parsedCliOffset = Number.parseInt(url.searchParams.get('clientOffset') || '0', 10);
  const clientOffset = Number.isFinite(parsedCliOffset) ? Math.max(parsedCliOffset, 0) : 0;
  const parsedCliSize = Number.parseInt(url.searchParams.get('clientPageSize') || '200', 10);
  const clientPageSize = Number.isFinite(parsedCliSize) ? Math.min(Math.max(parsedCliSize, 1), 1000) : 200;

  const allowMem = allowMemoryFallback();
  const rawInboxState = allowMem ? getInboxState() : null;
  const ownCustomClients = allowMem
    ? (rawInboxState?.customClients || []).filter((c) => Boolean(c.ownerId) && c.ownerId === userId)
    : [];
  const inboxState: ReturnType<typeof getInboxState> = {
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [...ownCustomClients],
    deletedDealCardIds: {},
    sentDealCardIds: {},
  };

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabase = createServiceClient();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err || '');
    if (process.env.NODE_ENV === 'test' && errMsg.includes('getServerEnv must not be called on the client')) {
      return NextResponse.json({
        ok: true,
        userId,
        items: [],
        threads: ownCustomClients.map((c) => {
          const cm = asRecord(c);
          const grade = c.clientGrade || 'VIP';
          const isVip = typeof cm.isVip === 'boolean' ? cm.isVip : grade === 'VIP';
          const preferredRegions = parsePreferredRegionsInput(cm.preferredRegions, c.preferredRegion);
          const budgetManwon = parseBudgetManwonInput(cm.budgetManwon, c.budget);
          const tid = c.id.startsWith('custom_') ? c.id : `custom_${c.id}`;
          return {
            id: tid,
            clientName: c.clientName,
            clientGrade: grade,
            isVip,
            clientRole: normalizeClientRole(cm.clientRole) || 'buyer',
            clientPhone: c.clientPhone || '',
            clientEmail: normalizeClientEmail(c.clientEmail) || '',
            budget: c.budget || formatBudgetManwonDisplay(budgetManwon),
            budgetManwon,
            preferredRegion: c.preferredRegion || preferredRegions.join(', '),
            preferredRegions,
            freeMemo: typeof cm.freeMemo === 'string' ? cm.freeMemo : '',
            emailDeliveryStatus: 'ok' as InboxEmailDeliveryStatus,
            dispatchHistory: [] as InboxDispatchHistoryItem[],
            buildingId: c.buildingId || '',
            buildingTitle: c.buildingTitle || '관심 매물 상담',
            shareUrl: c.buildingId ? `/im-lite/${encodeURIComponent(c.buildingId)}` : '',
            shareToken: '',
            status: 'active',
            gateStatus: 'none',
            newsletterSubscribed: Boolean(c.newsletterSubscribed),
            openCount: 0,
            dwellTime: '-',
            lastViewedAt: '-',
            createdAt: c.createdAt,
            events: [],
          };
        }),
        inventory: [],
        gateRequests: [],
        inquiries: [],
        activityEvents: [],
        inboxState,
        counts: { total: ownCustomClients.length, pending: 0, hot: 0 },
      });
    }
    return NextResponse.json({ ok: false, error: '데이터베이스 연결을 초기화할 수 없습니다.' }, { status: 503 });
  }
  if (!supabase) {
    return NextResponse.json({ ok: false, error: '데이터베이스 연결을 초기화할 수 없습니다.' }, { status: 503 });
  }

  const looseDb = supabase as unknown as LooseDb;
  const caps = getInboxSchemaCaps();

  const buildActivityQ = (types: string[], rowLimit: number, withActor = true) => {
    let q = looseDb.from('activity_events').select('id, actor_id, event_type, entity_id, metadata, created_at');
    if (withActor && typeof q.eq === 'function') q = q.eq('actor_id', userId);
    if (typeof q.in === 'function') q = q.in('event_type', types);
    if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
    if (typeof q.limit === 'function') q = q.limit(rowLimit);
    return q;
  };

  const cliCols = caps.brokerClientsExtended
    ? 'id, broker_id, display_name, phone, email, client_type, client_role, tier, is_vip, preferred_regions, budget_manwon, free_memo, consent_status, unsubscribed_at, email_delivery_status, email_bounced_at, email_bounce_reason, tags, notes, linked_building_ids, created_at'
    : 'id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids, created_at';
  const buildClientsQ = (cols: string) => {
    let q = looseDb.from('broker_clients').select(cols, { count: 'exact' });
    if (typeof q.eq === 'function') q = q.eq('broker_id', userId);
    if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
    if (typeof q.range === 'function') q = q.range(clientOffset, clientOffset + clientPageSize - 1);
    else if (typeof q.limit === 'function') q = q.limit(clientPageSize);
    return q;
  };

  const inqCols = caps.inquiryStatusCol
    ? 'id, building_id, status, requester_name, requester_phone, requester_email, message, created_at'
    : 'id, building_id, requester_name, requester_phone, requester_email, message, created_at';
  const buildInqQ = (cols: string) => {
    let q = looseDb.from('im_inquiry_requests').select(cols);
    if (typeof q.eq === 'function') q = q.eq('broker_user_id', userId);
    if (typeof q.order === 'function') {
      q = q.order('created_at', { ascending: false });
      if (typeof q.limit === 'function') q = q.limit(limit);
    }
    return q;
  };

  const notifQ = (() => {
    let q = looseDb
      .from('in_app_notifications')
      .select('id, type, title, body, link, metadata, is_read, created_at');
    if (typeof q.eq === 'function') q = q.eq('user_id', userId);
    if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
    if (typeof q.limit === 'function') q = q.limit(limit);
    return q;
  })();

  const slQ = (() => {
    let q = looseDb
      .from('im_share_links')
      .select('token, building_id, broker_id, recipient_id, status, expires_at, revoked_at, created_at');
    if (typeof q.eq === 'function') q = q.eq('broker_id', userId);
    if (typeof q.order === 'function') {
      q = q.order('created_at', { ascending: false });
      if (typeof q.limit === 'function') q = q.limit(100);
    }
    return q;
  })();

  let bpQ = looseDb.from('broker_profiles').select('user_id, slug');
  if (typeof bpQ.eq === 'function') bpQ = bpQ.eq('user_id', userId);
  const bpPromise = safeQ<LooseQueryResult>(
    typeof bpQ.maybeSingle === 'function' ? bpQ.maybeSingle() : typeof bpQ.single === 'function' ? bpQ.single() : bpQ,
    { data: null }
  );

  let bldgQ = looseDb
    .from('building_ssot_lite')
    .select('id, owner_id, status, area_signal, asset_type, price_band, fit_summary');
  if (typeof bldgQ.eq === 'function') bldgQ = bldgQ.eq('owner_id', userId);

  const [
    subscriptionInfo,
    wsRes,
    bldgRes,
    ownedActsRes,
    bpRes,
    cliResInitial,
    notifRes,
    inqResInitial,
    slRes,
    govActsRes,
    noteActsRes,
    ownDispRes,
  ] = await Promise.all([
    getBrokerSubscriptionTier(supabase, userId).catch(() => ({ tier: 'free' as const, isPaid: false, status: 'free' })),
    listWorkspaceItemsForOwner(supabase, { ownerId: userId, limit: 200 }).catch(() => ({
      items: [] as WorkspaceItemRecord[],
      tableAvailable: false,
    })),
    safeQ<LooseQueryResult>(bldgQ, { data: [] }),
    safeQ<LooseQueryResult>(
      buildActivityQ(['im_upserted', 'im_restored', 'im_deleted', 'dealcard_upserted', 'dealcard_restored', 'dealcard_deleted', 'deal_deleted'], 120),
      { data: [] }
    ),
    bpPromise,
    isUuid(userId) ? safeQ<LooseQueryResult>(buildClientsQ(cliCols), { data: [], count: 0 }) : Promise.resolve<LooseQueryResult>({ data: [], count: 0 }),
    safeQ<LooseQueryResult>(notifQ, { data: [] }),
    safeQ<LooseQueryResult>(buildInqQ(inqCols), { data: [] }),
    safeQ<LooseQueryResult>(slQ, { data: [] }),
    safeQ<LooseQueryResult>(
      buildActivityQ([
        'gate_request_approved',
        'gate_request_rejected',
        'gate_request_reset',
        'inbox_thread_archived',
        'inbox_thread_unarchived',
        'im_link_sent',
        'link_revoked',
        'link_restored',
        'thread_link_revoked',
        'thread_link_restored',
        'correction_notice_published',
        'correction_notice_cleared',
        'custom_client_upserted',
        'custom_client_deleted',
        'newsletter_subscription_toggled',
        'magazine_subscribed',
        'magazine_unsubscribed',
      ], 220),
      { data: [] }
    ),
    safeQ<LooseQueryResult>(buildActivityQ(['call_note_recorded'], 100), { data: [] }),
    safeQ<LooseQueryResult>(
      buildActivityQ([
        'inbox_email_sent',
        'inbox_outbound_copied',
        'inbox_alimtalk_sent',
        'magazine_sent',
        'dealcard_sent',
        'im_link_sent',
        'email_delivered',
        'email_bounced',
        'email_complained',
        'contacts_bulk_imported',
      ], 250),
      { data: [] }
    ),
  ]);

  let cliRes = cliResInitial;
  if (isUuid(userId) && cliRes?.error && isIgnorableSchemaError(cliRes.error) && caps.brokerClientsExtended) {
    markInboxSchemaCapUnsupported('brokerClientsExtended');
    cliRes = await safeQ<LooseQueryResult>(
      buildClientsQ('id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids, created_at'),
      { data: [], count: 0 }
    );
  }
  let inqRes = inqResInitial;
  if (inqRes?.error && caps.inquiryStatusCol) {
    markInboxSchemaCapUnsupported('inquiryStatusCol');
    inqRes = await safeQ<LooseQueryResult>(
      buildInqQ('id, building_id, requester_name, requester_phone, requester_email, message, created_at'),
      { data: [] }
    );
  }

  const quickRecords = allowMem
    ? listAllQuickImRecords().filter((r) => Boolean(r.ownerId) && r.ownerId === userId && !isDealCardDeleted(r.buildingId))
    : [];
  let quickInventory = quickRecords.map((r) => ({
    buildingId: r.buildingId,
    title: r.buildingName || `${r.card4.region} ${r.card4.use}`.trim(),
    region: r.card4.region || r.address,
    priceBand: r.card4.priceBand,
    askingPriceManwon: r.askingPriceManwon,
    capRatePct: r.basicImDoc?.facts?.valuation?.capRatePct ?? null,
    posture: r.posture,
  }));

  let buildingIds: string[] = [];
  const verifiedOwnedUuidSet = new Set<string>();
  const forbiddenBuildingSet = new Set<string>();
  const deletedBuildingSet = new Set<string>();
  const buildingTitleById = new Map<string, string>();

  for (const wsItem of wsRes.items || []) {
    const keys = [wsItem.buildingId, wsItem.legacyId, wsItem.id].filter((x): x is string => Boolean(x));
    if (wsItem.status === 'archived' || wsItem.deletedAt) {
      keys.forEach((k) => deletedBuildingSet.add(k));
      continue;
    }
    const primaryBId = wsItem.buildingId || wsItem.legacyId || wsItem.id;
    verifiedOwnedUuidSet.add(wsItem.id);
    if (wsItem.buildingId) verifiedOwnedUuidSet.add(wsItem.buildingId);
    if (!buildingIds.includes(primaryBId)) buildingIds.push(primaryBId);
    if (wsItem.title && !buildingTitleById.has(primaryBId)) buildingTitleById.set(primaryBId, wsItem.title);
  }

  for (const bRaw of Array.isArray(bldgRes?.data) ? bldgRes.data : []) {
    const b = asRecord(bRaw);
    if (!b.id) continue;
    const bIdStr = String(b.id);
    if (b.status === 'archived' || (allowMem && isDealCardDeleted(bIdStr))) {
      deletedBuildingSet.add(bIdStr);
      continue;
    }
    verifiedOwnedUuidSet.add(bIdStr);
    if (!buildingIds.includes(bIdStr)) buildingIds.push(bIdStr);
    const title = resolveBuildingTitle(b);
    buildingTitleById.set(bIdStr, title);
    if (!quickInventory.some((q) => q.buildingId === bIdStr)) {
      quickInventory.push({
        buildingId: bIdStr,
        title,
        region: String(b.area_signal || ''),
        priceBand: String(b.price_band || '가격 협의'),
        askingPriceManwon: 0,
        capRatePct: 0,
        posture: String(b.asset_type || 'general'),
      });
    }
  }

  const seenLatestActPerBuilding = new Set<string>();
  for (const actRaw of Array.isArray(ownedActsRes?.data) ? ownedActsRes.data : []) {
    const act = asRecord(actRaw);
    const meta = asRecord(act.metadata);
    const imItem = asRecord(meta.im_item);
    const card4 = asRecord(meta.card4);
    const bIdStr = String(meta.building_id || imItem.buildingId || imItem.id || act.entity_id || '').trim();
    if (!bIdStr || bIdStr === userId || seenLatestActPerBuilding.has(bIdStr)) continue;
    seenLatestActPerBuilding.add(bIdStr);

    if (
      act.event_type === 'im_deleted' ||
      act.event_type === 'dealcard_deleted' ||
      act.event_type === 'deal_deleted' ||
      (allowMem && isDealCardDeleted(bIdStr))
    ) {
      deletedBuildingSet.add(bIdStr);
      continue;
    }
    if (deletedBuildingSet.has(bIdStr)) continue;
    if (!buildingIds.includes(bIdStr)) buildingIds.push(bIdStr);
    const titleCandidate = String(
      imItem.title || imItem.buildingName || card4.headline || `${card4.region || ''} ${card4.use || ''}`.trim() || imItem.address || ''
    ).trim();
    if (titleCandidate && !buildingTitleById.has(bIdStr)) buildingTitleById.set(bIdStr, titleCandidate);
    if (!quickInventory.some((q) => q.buildingId === bIdStr)) {
      quickInventory.push({
        buildingId: bIdStr,
        title: titleCandidate || '보유 매물',
        region: String(card4.region || imItem.address || ''),
        priceBand: String(
          card4.priceBand || (imItem.askingPriceManwon ? `${Math.round(Number(imItem.askingPriceManwon) / 10000)}억` : '가격 협의')
        ),
        askingPriceManwon: Number(imItem.askingPriceManwon || 0),
        capRatePct: Number(imItem.grossYieldPct || 0),
        posture: String(imItem.investmentPosture || card4.posture || 'income'),
      });
    }
  }

  const candidateAllIds = Array.from(new Set([...buildingIds, ...quickInventory.map((q) => String(q.buildingId)).filter(Boolean)]));
  const unverifiedUuids = candidateAllIds.filter((id) => isUuid(id) && !verifiedOwnedUuidSet.has(id));
  if (unverifiedUuids.length > 0) {
    let checkQ = looseDb.from('building_ssot_lite').select('id, owner_id, status');
    if (typeof checkQ.in === 'function') checkQ = checkQ.in('id', unverifiedUuids);
    const checkRes = await safeQ<LooseQueryResult>(checkQ, { data: [] });
    for (const rowRaw of Array.isArray(checkRes?.data) ? checkRes.data : []) {
      const row = asRecord(rowRaw);
      const rId = String(row.id || '');
      if (!rId) continue;
      if ((row.owner_id && String(row.owner_id) !== userId) || row.status === 'archived') forbiddenBuildingSet.add(rId);
    }
  }

  buildingIds = buildingIds.filter((id) => !forbiddenBuildingSet.has(id) && !deletedBuildingSet.has(id));
  quickInventory = quickInventory.filter((q) => !forbiddenBuildingSet.has(String(q.buildingId)) && !deletedBuildingSet.has(String(q.buildingId)));
  const allOwnedBuildingIds = Array.from(new Set([...buildingIds, ...quickInventory.map((q) => String(q.buildingId)).filter(Boolean)]));

  const uuidOwnedIds = isUuid(userId) ? allOwnedBuildingIds.filter((id) => isUuid(id)) : allOwnedBuildingIds;
  const bpData = asRecord(bpRes?.data);
  const brokerSlug = bpData.slug ? String(bpData.slug).trim() : '';
  const brokerKeys = Array.from(new Set([userId, brokerSlug].filter(Boolean)));
  const scopedOrExpr = buildOwnedEventOrClause(allOwnedBuildingIds, userId);
  const subCols = caps.subscriberExtended
    ? 'id, broker_id, subscriber_name, subscriber_email, subscriber_phone, phone_e164, status, confirm_status, consent_status, unsubscribed_at, interest_profile, segment, email_delivery_status, email_bounced_at, email_bounce_reason, created_at'
    : '*';

  const fetchAllSubscribersPaged = async (
    col: 'broker_id' | 'broker_user_id',
    cols: string
  ): Promise<{ data: Array<Record<string, unknown>>; error?: unknown }> => {
    const pageSize = 500;
    const allRows: Array<Record<string, unknown>> = [];
    const seenIds = new Set<string>();
    let pageOffset = 0;
    let lastError: unknown = null;
    while (pageOffset < 10_000) {
      let q = looseDb.from('magazine_subscribers').select(cols);
      if (col === 'broker_id' && brokerKeys.length > 0 && typeof q.in === 'function') {
        q = q.in('broker_id', brokerKeys);
      } else if (typeof q.eq === 'function') {
        q = q.eq(col, userId);
      }
      if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
      const hasRange = typeof q.range === 'function';
      if (hasRange && typeof q.range === 'function') q = q.range(pageOffset, pageOffset + pageSize - 1);
      else if (typeof q.limit === 'function') q = q.limit(pageSize);

      const res = await safeQ<LooseQueryResult>(q, { data: [] });
      if (res?.error) {
        lastError = res.error;
        break;
      }
      const page = Array.isArray(res?.data) ? res.data.map(asRecord) : [];
      let addedThisPage = 0;
      for (const r of page) {
        const rid = String(r.id || '');
        if (rid && seenIds.has(rid)) continue;
        if (rid) seenIds.add(rid);
        allRows.push(r);
        addedThisPage += 1;
      }
      if (!hasRange || page.length < pageSize || addedThisPage === 0) break;
      pageOffset += pageSize;
    }
    return { data: allRows, error: lastError };
  };

  const [grRes, actGateRes, viewRes, subKeyResInit, subUuidResInit] = await Promise.all([
    filter !== 'views' && uuidOwnedIds.length > 0
      ? (() => {
          let q = looseDb
            .from('gate_requests')
            .select('id, building_id, requester_id, requested_level, requested_fields, reason, status, expires_at, created_at');
          if (typeof q.in === 'function') q = q.in('building_id', uuidOwnedIds);
          if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
          if (typeof q.limit === 'function') q = q.limit(limit);
          return safeQ<LooseQueryResult>(q, { data: [] });
        })()
      : Promise.resolve<LooseQueryResult>({ data: [] }),
    filter !== 'views'
      ? (() => {
          let q = looseDb.from('activity_events').select('id, event_type, entity_id, metadata, created_at, actor_id');
          if (typeof q.in === 'function') q = q.in('event_type', ['gate_request_created', 'intent.pro_im_request']);
          if (scopedOrExpr && typeof q.or === 'function') q = q.or(scopedOrExpr);
          if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
          if (typeof q.limit === 'function') q = q.limit(limit * 2);
          return safeQ<LooseQueryResult>(q, { data: [] });
        })()
      : Promise.resolve<LooseQueryResult>({ data: [] }),
    filter !== 'requests'
      ? (() => {
          const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
          let q = looseDb
            .from('activity_events')
            .select('id, event_type, entity_id, entity_type, metadata, created_at, actor_id, actor_role');
          if (typeof q.in === 'function') {
            q = q.in('event_type', [
              'mobile_im_view',
              'blind_teaser_view',
              'deal_card_view',
              'magazine_view',
              'magazine_section_view',
              'magazine_to_im_click',
              'vibe_card_view',
              'im_lite_view',
            ]);
          }
          if (scopedOrExpr && typeof q.or === 'function') q = q.or(scopedOrExpr);
          if (typeof q.gte === 'function') q = q.gte('created_at', thirtyDaysAgoIso);
          if (typeof q.order === 'function') q = q.order('created_at', { ascending: false });
          if (typeof q.limit === 'function') q = q.limit(limit * 2);
          return safeQ<LooseQueryResult>(q, { data: [] });
        })()
      : Promise.resolve<LooseQueryResult>({ data: [] }),
    brokerKeys.length > 0
      ? fetchAllSubscribersPaged('broker_id', subCols)
      : Promise.resolve<{ data: Array<Record<string, unknown>>; error?: unknown }>({ data: [] }),
    isUuid(userId) && caps.subscriberBrokerUserId
      ? fetchAllSubscribersPaged('broker_user_id', subCols)
      : Promise.resolve<{ data: Array<Record<string, unknown>>; error?: unknown }>({ data: [] }),
  ]);

  let subKeyRes = subKeyResInit;
  if (subKeyRes?.error && caps.subscriberExtended && isIgnorableSchemaError(subKeyRes.error)) {
    markInboxSchemaCapUnsupported('subscriberExtended');
    subKeyRes = await fetchAllSubscribersPaged('broker_id', '*');
  }
  const subscriberRows: Array<Record<string, unknown>> = [];
  const seenSubIds = new Set<string>();
  const pushSubs = (rows: unknown) => {
    for (const rRaw of Array.isArray(rows) ? rows : []) {
      const r = asRecord(rRaw);
      const id = String(r.id || '').trim();
      if (!id || seenSubIds.has(id)) continue;
      seenSubIds.add(id);
      subscriberRows.push(r);
    }
  };
  pushSubs(subKeyRes?.data);
  if (subUuidResInit?.error && isIgnorableSchemaError(subUuidResInit.error)) {
    markInboxSchemaCapUnsupported('subscriberBrokerUserId');
  } else {
    pushSubs(subUuidResInit?.data);
  }

  const mappedItems = mapGateAndViewAndInquiryItems({
    userId,
    limit,
    allOwnedBuildingIds,
    forbiddenBuildingSet,
    deletedBuildingSet,
    buildingTitleById,
    quickInventory,
    grData: Array.isArray(grRes?.data) ? grRes.data : [],
    actGateData: Array.isArray(actGateRes?.data) ? actGateRes.data : [],
    viewData: Array.isArray(viewRes?.data) ? viewRes.data : [],
    notifData: Array.isArray(notifRes?.data) ? notifRes.data : [],
    inqData: Array.isArray(inqRes?.data) ? inqRes.data : [],
  });
  let gateItems = mappedItems.gateItems as Array<Record<string, unknown>>;
  let inquiryItems = mappedItems.inquiryItems as Array<Record<string, unknown>>;
  const viewItems = mappedItems.viewItems as Array<Record<string, unknown>>;
  const notifItems = mappedItems.notifItems as Array<Record<string, unknown>>;

  const dbClients = Array.isArray(cliRes?.data)
    ? cliRes.data.map(asRecord).filter((r) => !r.broker_id || String(r.broker_id) === userId)
    : [];
  const totalClients = typeof cliRes?.count === 'number' ? cliRes.count : dbClients.length;
  const shareLinks = Array.isArray(slRes?.data) ? slRes.data.map(asRecord) : [];

  const ownedThreadKeySet = new Set<string>([
    ...allOwnedBuildingIds,
    ...gateItems.map((g) => String(g.id || '')),
    ...gateItems.map((g) => `srv-${String(g.id || '')}`),
    ...inquiryItems.map((i) => String(i.id || '')),
    ...inquiryItems.map((i) => `srv-${String(i.id || '')}`),
    ...ownCustomClients.map((c) => String(c.id || '')),
    ...dbClients.map((c) => String(c.id || '')),
    ...dbClients.map((c) => `cli-${String(c.id || '')}`),
    ...dbClients.map((c) => `custom_${String(c.id || '')}`),
    ...subscriberRows.map((s) => String(s.id || '')),
    ...subscriberRows.map((s) => `sub_${String(s.id || '')}`),
  ]);

  const threadEmailSet = new Set<string>();
  const threadEmailHashSet = new Set<string>();
  const addThreadEmail = (raw: unknown) => {
    const clean = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (clean && clean.includes('@')) {
      threadEmailSet.add(clean);
      const hash = hashEmailForSuppression(clean);
      if (hash) threadEmailHashSet.add(hash);
    }
  };
  for (const c of dbClients) addThreadEmail(c.email);
  for (const s of subscriberRows) addThreadEmail(s.subscriber_email);
  for (const c of ownCustomClients) addThreadEmail(c.clientEmail);
  for (const g of gateItems) addThreadEmail(g.requester_email);
  for (const i of inquiryItems) addThreadEmail(i.requester_email);

  const safeEmailOrTerms = Array.from(threadEmailSet)
    .filter((em) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(em))
    .slice(0, 80)
    .flatMap((em) => [`metadata->>email.eq.${em}`, `metadata->>to_email.eq.${em}`, `metadata->>client_email.eq.${em}`]);
  const safeEmailHashOrTerms = Array.from(threadEmailHashSet)
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
    .slice(0, 80)
    .map((h) => `metadata->>email_hash.eq.${h}`);
  const safeThreadOrTerms = Array.from(ownedThreadKeySet)
    .filter((tid) => /^[A-Za-z0-9_.:-]+$/.test(tid))
    .slice(0, 60)
    .map((tid) => `metadata->>thread_id.eq.${tid}`);
  const webhookOrParts = Array.from(
    new Set([
      ...(isUuid(userId) ? [`actor_id.eq.${userId}`] : []),
      ...allOwnedBuildingIds
        .filter((bId) => isUuid(bId))
        .slice(0, 30)
        .map((bId) => `entity_id.eq.${bId}`),
      ...safeEmailHashOrTerms,
      ...safeEmailOrTerms,
      ...safeThreadOrTerms,
    ])
  );

  let scopedWebhookDispRows: Array<Record<string, unknown>> = [];
  if (webhookOrParts.length > 0) {
    let whQ = looseDb
      .from('activity_events')
      .select('id, actor_id, event_type, entity_id, metadata, created_at');
    if (typeof whQ.in === 'function') {
      whQ = whQ.in('event_type', ['email_delivered', 'email_bounced', 'email_complained']);
    }
    if (typeof whQ.or === 'function') {
      whQ = whQ.or(webhookOrParts.join(','));
    }
    if (typeof whQ.order === 'function') {
      whQ = whQ.order('created_at', { ascending: false });
    }
    if (typeof whQ.limit === 'function') {
      whQ = whQ.limit(200);
    }
    const webhookDispRes = await safeQ<LooseQueryResult>(whQ, { data: [] });
    const ownedBldSet = new Set(allOwnedBuildingIds);
    scopedWebhookDispRows = (Array.isArray(webhookDispRes?.data) ? webhookDispRes.data.map(asRecord) : []).filter(
      (ev) => {
        if (ev.actor_id && String(ev.actor_id) === userId) return true;
        // WP-7.3E P2-7: webhook events attributed to another broker are never shown, even when
        // the recipient email/thread matches one of ours. Only unattributed events fall through.
        if (ev.actor_id && String(ev.actor_id) !== userId) return false;
        const meta = asRecord(ev.metadata);
        const evEmail = String(meta.email || meta.to_email || meta.client_email || '').trim().toLowerCase();
        const evEmailHash = typeof meta.email_hash === 'string' ? meta.email_hash.trim().toLowerCase() : '';
        const evThreadId = String(meta.thread_id || '').trim();
        const evEntityId = ev.entity_id ? String(ev.entity_id).trim() : '';
        return Boolean(
          (evEmailHash && threadEmailHashSet.has(evEmailHash)) ||
            (evEmail && threadEmailSet.has(evEmail)) ||
            (evThreadId && ownedThreadKeySet.has(evThreadId)) ||
            (evEntityId && ownedBldSet.has(evEntityId))
        );
      }
    );
  }

  const reduced = reduceGovernanceAndAuditEvents({
    userId,
    allOwnedBuildingIds,
    ownedThreadKeySet,
    rawInboxState,
    inboxState,
    govActs: Array.isArray(govActsRes?.data) ? govActsRes.data : [],
    noteActs: Array.isArray(noteActsRes?.data) ? noteActsRes.data : [],
    ownDispRows: Array.isArray(ownDispRes?.data) ? ownDispRes.data : [],
    webhookDispRows: scopedWebhookDispRows,
  });

  const isThreadArchived = (id: string) => {
    if (includeArchived || !id) return false;
    const raw = id.replace(/^srv-/, '');
    return reduced.archivedThreadIds.has(id) || reduced.archivedThreadIds.has(raw) || reduced.archivedThreadIds.has(`srv-${raw}`);
  };
  if (!includeArchived && reduced.archivedThreadIds.size > 0) {
    gateItems = gateItems.filter((g) => !isThreadArchived(String(g.id || '')));
    inquiryItems = inquiryItems.filter((i) => !isThreadArchived(String(i.id || '')));
  }

  const threads: Array<Record<string, unknown>> = [];
  const seenThreadIds = new Set<string>();
  const buildCtx: ThreadBuildContext = {
    threads,
    seenThreadIds,
    viewItems,
    callNotesByThreadId: reduced.callNotesByThreadId,
    decisionByThreadId: reduced.decisionByThreadId,
    revokedByThreadId: reduced.revokedByThreadId,
    issuedTokenByThreadId: reduced.issuedTokenByThreadId,
    newsletterStateByKey: reduced.newsletterStateByKey,
    shareLinks,
    inboxState,
    allOwnedBuildingIds,
    deletedBuildingSet,
    buildingTitleById,
    isThreadArchived,
  };

  appendGateAndInquiryThreads({ ...buildCtx, gateItems, inquiryItems });
  const { deliveryStatusById, deliveryStatusByEmail } = appendCrmAndSubscriberThreads({
    ...buildCtx,
    userId,
    dbClients,
    subscriberRows,
    memCustomClients: (inboxState.customClients || []).map(asRecord),
    deletedClientIdSet: reduced.deletedClientIdSet,
    forbiddenBuildingSet,
    quickInventory,
  });
  appendViewerThreads(buildCtx);
  const filteredThreads = attachDispatchAndFilterThreads({
    threads,
    rawDispatchAuditEvents: reduced.rawDispatchAuditEvents,
    deliveryStatusById,
    deliveryStatusByEmail,
    filter,
  });

  const allItems = [...gateItems, ...inquiryItems, ...viewItems, ...notifItems]
    .sort((a, b) => toSafeEpochMs(b.created_at) - toSafeEpochMs(a.created_at))
    .slice(offset, offset + limit);
  const unreadCount =
    gateItems.filter((i) => Boolean(i.is_unread)).length +
    inquiryItems.filter((i) => Boolean(i.is_unread)).length +
    notifItems.filter((i) => Boolean(i.is_unread)).length;

  return NextResponse.json({
    ok: true,
    userId,
    subscription: { tier: subscriptionInfo.tier, isPaid: subscriptionInfo.isPaid, status: subscriptionInfo.status },
    threads: filteredThreads,
    items: allItems,
    gateRequests: gateItems,
    activityEvents: viewItems,
    notifications: notifItems,
    total: gateItems.length + inquiryItems.length + viewItems.length + notifItems.length,
    unread_count: unreadCount,
    inboxState,
    inventory: quickInventory,
    clients: dbClients,
    pagination: {
      clientOffset,
      clientPageSize,
      totalClients,
      hasMoreClients: clientOffset + dbClients.length < totalClients,
    },
  });
}
