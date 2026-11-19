import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  isDealCardDeleted,
  isUuid,
  listAllQuickImRecords,
} from '@/lib/im-lite/quick-generate-store';
import { isRealProductionRuntime } from '@/lib/env';
import {
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('inbox-pending-count');

export const allowMemoryFallback = () =>
  !isRealProductionRuntime() && process.env.DISABLE_MEMORY_STORE !== '1';

export const safeQ = <T>(q: any, fallback: T): Promise<T> =>
  !q || typeof q.then !== 'function' ? Promise.resolve(fallback) : Promise.resolve(q).catch(() => fallback);

export function buildOwnedEventOrClause(ownedIds: string[], userId: string): string {
  const clauses: string[] = [];
  const uuidIds = ownedIds.filter((id) => isUuid(id));
  const safeMetaIds = ownedIds.filter((id) => /^[a-zA-Z0-9_-]{1,80}$/.test(id));
  if (uuidIds.length > 0) clauses.push(`entity_id.in.(${uuidIds.join(',')})`);
  if (safeMetaIds.length > 0) clauses.push(`metadata->>building_id.in.(${safeMetaIds.join(',')})`);
  if (/^[a-zA-Z0-9_-]{1,80}$/.test(userId)) clauses.push(`metadata->>broker_id.eq.${userId}`);
  return clauses.join(',');
}

export async function handleGetPendingCount(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) {
      // Per IB-28 / SEC-G02 contract, unauthenticated (401) polling returns count: 0 cleanly
      // without leaking tenant data, while non-401 errors (e.g., 403) propagate fail-closed.
      if (guard.error.status === 401) {
        return NextResponse.json({ ok: true, count: 0 });
      }
      return guard.error;
    }
    if (!guard.user?.id) {
      return NextResponse.json({ ok: true, count: 0 });
    }
    const userId = guard.user.id;
    const supabase = createServiceClient();
    const allowMem = allowMemoryFallback();
    const gateDecisions: Record<string, { status?: string }> = allowMem
      ? getInboxState().gateDecisions || {}
      : {};
    const decidedIds = new Set<string>(
      Object.entries(gateDecisions)
        .filter(([, v]) => v?.status === 'approved' || v?.status === 'rejected')
        .map(([k]) => k)
    );

    const verifiedOwnedUuids = new Set<string>();
    const forbiddenBuildings = new Set<string>();
    const deletedBuildings = new Set<string>();
    const ownedIds = new Set<string>();
    if (allowMem) {
      for (const rec of listAllQuickImRecords()) {
        if (rec.ownerId === userId && rec.buildingId && !isDealCardDeleted(rec.buildingId)) {
          ownedIds.add(String(rec.buildingId));
        }
      }
    }

    const ownedActQ = (() => {
      let q: any = supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .eq('actor_id', userId)
        .in('event_type', [
          'im_upserted',
          'im_restored',
          'im_deleted',
          'dealcard_upserted',
          'dealcard_restored',
          'dealcard_deleted',
          'deal_deleted',
        ]);
      if (typeof q?.order === 'function') q = q.order('created_at', { ascending: false });
      if (typeof q?.limit === 'function') q = q.limit(100);
      return q;
    })();

    const [wsRes, bldgRes, ownedActRes] = await Promise.all([
      listWorkspaceItemsForOwner(supabase, { ownerId: userId, limit: 200 }).catch(() => ({
        items: [] as WorkspaceItemRecord[],
      })),
      safeQ<any>(supabase.from('building_ssot_lite').select('id, status').eq('owner_id', userId), { data: [] }),
      isUuid(userId) ? safeQ<any>(ownedActQ, { data: [] }) : Promise.resolve({ data: [] }),
    ]);

    for (const wsItem of wsRes.items || []) {
      const keys = [wsItem.buildingId, wsItem.legacyId, wsItem.id].filter((x): x is string => Boolean(x));
      if (wsItem.status === 'archived' || wsItem.deletedAt) {
        keys.forEach((k) => {
          deletedBuildings.add(k);
          ownedIds.delete(k);
        });
      } else {
        verifiedOwnedUuids.add(wsItem.id);
        if (wsItem.buildingId) verifiedOwnedUuids.add(wsItem.buildingId);
        ownedIds.add(wsItem.buildingId || wsItem.legacyId || wsItem.id);
      }
    }
    for (const b of bldgRes?.data || []) {
      const idStr = b?.id ? String(b.id) : '';
      if (!idStr) continue;
      if (b.status === 'archived' || (allowMem && isDealCardDeleted(idStr))) {
        deletedBuildings.add(idStr);
        ownedIds.delete(idStr);
      } else {
        verifiedOwnedUuids.add(idStr);
        ownedIds.add(idStr);
      }
    }
    const seenBldg = new Set<string>();
    for (const act of ownedActRes?.data || []) {
      const meta = (act.metadata as Record<string, any>) || {};
      const bId = String(
        meta.building_id || (meta.im_item as any)?.buildingId || (meta.im_item as any)?.id || act.entity_id || ''
      ).trim();
      if (!bId || bId === userId || seenBldg.has(bId)) continue;
      seenBldg.add(bId);
      if (
        act.event_type === 'im_deleted' ||
        act.event_type === 'dealcard_deleted' ||
        act.event_type === 'deal_deleted' ||
        (allowMem && isDealCardDeleted(bId))
      ) {
        deletedBuildings.add(bId);
        ownedIds.delete(bId);
      } else if (!deletedBuildings.has(bId)) {
        ownedIds.add(bId);
      }
    }

    const unverifiedUuids = Array.from(ownedIds).filter((id) => isUuid(id) && !verifiedOwnedUuids.has(id));
    if (unverifiedUuids.length > 0) {
      let checkQ: any = supabase.from('building_ssot_lite').select('id, owner_id, status');
      if (typeof checkQ?.in === 'function') checkQ = checkQ.in('id', unverifiedUuids);
      const checkRes = await safeQ<any>(checkQ, { data: [] });
      for (const row of checkRes?.data || []) {
        const rId = String(row?.id || '');
        if (rId && ((row.owner_id && String(row.owner_id) !== userId) || row.status === 'archived')) {
          forbiddenBuildings.add(rId);
          ownedIds.delete(rId);
        }
      }
    }

    const buildingIds = Array.from(ownedIds);
    if (buildingIds.length === 0) return NextResponse.json({ ok: true, count: 0, pendingCount: 0 });

    const archivedThreadIds = new Set<string>();
    if (isUuid(userId)) {
      let actQ: any = supabase
        .from('activity_events')
        .select('event_type, metadata, created_at')
        .eq('actor_id', userId)
        .in('event_type', [
          'gate_request_approved',
          'gate_request_rejected',
          'gate_request_reset',
          'inbox_thread_archived',
          'inbox_thread_unarchived',
        ]);
      if (typeof actQ?.order === 'function') actQ = actQ.order('created_at', { ascending: false });
      if (typeof actQ?.limit === 'function') actQ = actQ.limit(200);
      const actRes = await safeQ<any>(actQ, { data: [] });
      const seenDecisionKeys = new Set<string>();
      const seenArchiveKeys = new Set<string>();
      for (const ev of actRes?.data || []) {
        const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        const keys = [meta.request_id, meta.thread_id].filter(Boolean).map(String);
        if (ev.event_type === 'inbox_thread_archived' || ev.event_type === 'inbox_thread_unarchived') {
          for (const k of keys) {
            if (seenArchiveKeys.has(k)) continue;
            seenArchiveKeys.add(k);
            if (ev.event_type === 'inbox_thread_archived') archivedThreadIds.add(k);
            else archivedThreadIds.delete(k);
          }
          continue;
        }
        for (const k of keys) {
          if (seenDecisionKeys.has(k)) continue;
          seenDecisionKeys.add(k);
          if (ev.event_type === 'gate_request_reset') decidedIds.delete(k);
          else decidedIds.add(k);
        }
      }
    }

    const isUndecided = (rawId: string) =>
      Boolean(rawId) &&
      !decidedIds.has(rawId) &&
      !decidedIds.has(`srv-${rawId}`) &&
      !decidedIds.has(`thread_${rawId}`) &&
      !archivedThreadIds.has(rawId) &&
      !archivedThreadIds.has(`srv-${rawId}`) &&
      !archivedThreadIds.has(`thread_${rawId}`);

    const uuidBuildingIds = buildingIds.filter((id) => isUuid(id));
    const scopedOrExpr = buildOwnedEventOrClause(buildingIds, userId);
    const pendingIdSet = new Set<string>();

    const [grRes, inqResInit, evRes] = await Promise.all([
      uuidBuildingIds.length > 0
        ? (() => {
            let q: any = supabase.from('gate_requests').select('id, building_id, status');
            if (typeof q?.in === 'function') q = q.in('status', ['submitted', 'broker_review']).in('building_id', uuidBuildingIds);
            return safeQ<any>(q, { data: [] });
          })()
        : Promise.resolve({ data: [] }),
      safeQ<any>(supabase.from('im_inquiry_requests').select('id, building_id, status').eq('broker_user_id', userId), { data: [] }),
      (() => {
        let q: any = supabase
          .from('activity_events')
          .select('id, entity_id, metadata, created_at')
          .in('event_type', ['gate_request_created', 'intent.pro_im_request']);
        if (scopedOrExpr && typeof q?.or === 'function') q = q.or(scopedOrExpr);
        if (typeof q?.limit === 'function') q = q.limit(100);
        return safeQ<any>(q, { data: [] });
      })(),
    ]);

    for (const row of grRes?.data || []) {
      const rId = String(row?.id || '');
      const bId = String(row?.building_id || '');
      if (rId && uuidBuildingIds.includes(bId) && (row.status === 'submitted' || row.status === 'broker_review') && isUndecided(rId)) {
        pendingIdSet.add(rId);
      }
    }

    let inqRes = inqResInit;
    if (inqRes?.error) {
      inqRes = await safeQ<any>(supabase.from('im_inquiry_requests').select('id, building_id').eq('broker_user_id', userId), { data: [] });
    }
    for (const row of inqRes?.data || []) {
      const rId = String(row?.id || '');
      const bId = row?.building_id ? String(row.building_id) : '';
      if (bId && (forbiddenBuildings.has(bId) || deletedBuildings.has(bId))) continue;
      const st = typeof row?.status === 'string' ? row.status.trim() : '';
      if (rId && (!st || st === 'submitted' || st === 'pending' || st === 'broker_review') && isUndecided(rId)) {
        pendingIdSet.add(rId);
      }
    }

    for (const ev of evRes?.data || []) {
      const meta = (ev?.metadata as Record<string, any>) || {};
      if (meta.broker_id && String(meta.broker_id) !== userId) continue;
      const bId = String(meta.building_id || ev.entity_id || '').trim();
      if (!bId || forbiddenBuildings.has(bId) || deletedBuildings.has(bId)) continue;
      if (!((meta.broker_id && String(meta.broker_id) === userId) || ownedIds.has(bId))) continue;
      const gateId = String(meta.gate_request_id || ev.entity_id || `gr-act-${ev.id}`);
      if (isUndecided(gateId)) pendingIdSet.add(gateId);
    }

    return NextResponse.json({ ok: true, count: pendingIdSet.size, pendingCount: pendingIdSet.size });
  } catch (err) {
    log.error('GET /api/broker/inbox/pending-count failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json(
      { ok: false, error: '미확인 요청 건수를 조회하지 못했습니다.' },
      { status: 500 }
    );
  }
}
