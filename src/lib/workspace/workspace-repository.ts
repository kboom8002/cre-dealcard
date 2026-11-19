import crypto from 'node:crypto';
import { isRealProductionRuntime } from '@/lib/env';
import { buildSanitizedDealCardPublicSnapshot } from '@/lib/deal-card/public-snapshot';

export type WorkspaceItemKind = 'dealcard' | 'im';
export type WorkspaceItemStatus = 'draft' | 'published' | 'sent' | 'revoked' | 'archived';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEMO_SEED_LEGACY_IDS = new Set([
  'bld-01',
  'bld-02',
  'bld-03',
  'im-doc-01',
  'im-doc-02',
  'im-doc-03',
]);

// WP-7.3C: sanitizer moved to a dependency-free module (shared with the backfill
// script); re-exported here so existing imports keep working unchanged.
export { buildSanitizedDealCardPublicSnapshot };

export class WorkspaceRepositoryError extends Error {
  public readonly status: number;
  public readonly code: string;
  /** Original PostgREST / Postgres error code (e.g. PGRST205, 42P01) when available. */
  public readonly pgCode?: string;
  /** Authoritative server version on 409 VERSION_CONFLICT. */
  public readonly currentVersion?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    pgCode?: string,
    currentVersion?: number
  ) {
    super(message);
    this.name = 'WorkspaceRepositoryError';
    this.status = status;
    this.code = code;
    if (pgCode) this.pgCode = pgCode;
    if (typeof currentVersion === 'number') this.currentVersion = currentVersion;
  }
}

export interface WorkspaceItemRecord {
  id: string;
  ownerId: string;
  kind: WorkspaceItemKind;
  legacyId: string | null;
  buildingId: string | null;
  status: WorkspaceItemStatus;
  title: string;
  address: string;
  priceBand: string | null;
  draftPayload: Record<string, unknown>;
  publishedSnapshot: Record<string, unknown> | null;
  correctionNotice: { message: string; updatedAt: string } | null;
  version: number;
  docHash: string | null;
  publishedAt: string | null;
  revokedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicWorkspaceProjectionResult {
  found: boolean;
  revoked: boolean;
  deleted: boolean;
  status: WorkspaceItemStatus | null;
  ownerId: string | null;
  projection: {
    id: string;
    buildingId: string | null;
    ownerId: string;
    kind: WorkspaceItemKind;
    status: 'published' | 'sent';
    title: string;
    address: string;
    priceBand: string | null;
    snapshot: Record<string, unknown>;
    correctionNotice: { message: string; updatedAt: string } | null;
    version: number;
    docHash: string | null;
    publishedAt: string | null;
    updatedAt: string;
  } | null;
}

type DbRow = Record<string, unknown>;
type DbError = { code?: string; pgCode?: string; message?: string } | null;

interface DbResult {
  data?: DbRow | DbRow[] | null;
  error?: DbError;
}

interface DbQueryLike extends PromiseLike<DbResult> {
  select?: (cols?: string) => DbQueryLike;
  insert?: (payload: DbRow | DbRow[]) => DbQueryLike;
  update?: (payload: DbRow) => DbQueryLike;
  eq?: (col: string, val: unknown) => DbQueryLike;
  in?: (col: string, vals: unknown[]) => DbQueryLike;
  is?: (col: string, val: unknown) => DbQueryLike;
  or?: (expr: string) => DbQueryLike;
  order?: (col: string, opts?: { ascending?: boolean }) => DbQueryLike;
  limit?: (n: number) => DbQueryLike;
  range?: (from: number, to: number) => DbQueryLike;
  single?: () => Promise<DbResult>;
  maybeSingle?: () => Promise<DbResult>;
}

interface DbClientLike {
  from: (table: string) => DbQueryLike;
}

function asDbClient(supabase: unknown): DbClientLike | null {
  if (
    supabase &&
    typeof supabase === 'object' &&
    typeof (supabase as { from?: unknown }).from === 'function'
  ) {
    return supabase as DbClientLike;
  }
  return null;
}

function toSingleRow(data: DbRow | DbRow[] | null | undefined): DbRow | null {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

let cachedWorkspaceTableUnavailable = false;

export function resetWorkspaceRepositoryCacheForTests(): void {
  cachedWorkspaceTableUnavailable = false;
}

function isUuidStr(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function isMissingRelationOrColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: unknown; pgCode?: unknown; message?: unknown };
  const code = String(rec.code || '');
  const pgCode = String(rec.pgCode || '');
  const msg = String(rec.message || '');
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    pgCode === 'PGRST205' ||
    pgCode === 'PGRST204' ||
    pgCode === '42P01' ||
    pgCode === '42703' ||
    /does not exist/i.test(msg) ||
    /could not find the (?:table|column)/i.test(msg) ||
    /relation .*workspace_items.* does not exist/i.test(msg)
  );
}

export function canFallbackPreCutover(err: unknown): boolean {
  if (!isMissingRelationOrColumnError(err)) return false;
  if (process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1') return false;
  if (isRealProductionRuntime()) return false;
  cachedWorkspaceTableUnavailable = true;
  return true;
}

function mapRow(row: DbRow): WorkspaceItemRecord {
  const rawNotice =
    row.correction_notice && typeof row.correction_notice === 'object'
      ? (row.correction_notice as Record<string, unknown>)
      : null;
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    kind: row.kind === 'im' ? 'im' : 'dealcard',
    legacyId: row.legacy_id ? String(row.legacy_id) : null,
    buildingId: row.building_id ? String(row.building_id) : null,
    status: (row.status || 'draft') as WorkspaceItemStatus,
    title: String(row.title || ''),
    address: String(row.address || ''),
    priceBand: row.price_band ? String(row.price_band) : null,
    draftPayload:
      row.draft_payload && typeof row.draft_payload === 'object'
        ? (row.draft_payload as Record<string, unknown>)
        : {},
    publishedSnapshot:
      row.published_snapshot && typeof row.published_snapshot === 'object'
        ? (row.published_snapshot as Record<string, unknown>)
        : null,
    correctionNotice: rawNotice
      ? {
          message: String(rawNotice.message || ''),
          updatedAt: String(rawNotice.updatedAt || ''),
        }
      : null,
    version: Number(row.version || 1),
    docHash: row.doc_hash ? String(row.doc_hash) : null,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at
        ? String(row.published_at)
        : null,
    revokedAt:
      row.revoked_at instanceof Date
        ? row.revoked_at.toISOString()
        : row.revoked_at
        ? String(row.revoked_at)
        : null,
    deletedAt:
      row.deleted_at instanceof Date
        ? row.deleted_at.toISOString()
        : row.deleted_at
        ? String(row.deleted_at)
        : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at || new Date().toISOString()),
  };
}

export async function getWorkspaceItemByAnyId(
  supabase: unknown,
  idOrLegacy: string,
  kind?: WorkspaceItemKind,
  ownerId?: string
): Promise<WorkspaceItemRecord | null> {
  const cleanId = String(idOrLegacy || '').trim();
  const db = asDbClient(supabase);
  if (!cleanId || !db) return null;
  // Shared demo seed IDs (bld-01..03, im-doc-01..03) belong to every broker workspace
  // independently; an unscoped lookup without ownerId must never return an arbitrary tenant's row.
  if (DEMO_SEED_LEGACY_IDS.has(cleanId) && !ownerId) {
    return null;
  }
  if (cachedWorkspaceTableUnavailable && !isRealProductionRuntime() && process.env.REQUIRE_WORKSPACE_ITEMS_TABLE !== '1') {
    return null;
  }

  const table = db.from('workspace_items');
  let q: DbQueryLike | undefined = typeof table.select === 'function' ? table.select('*') : table;
  const isUuidKey = isUuidStr(cleanId);
  if (isUuidKey) {
    if (typeof q?.or === 'function') {
      q = q.or(`id.eq.${cleanId},building_id.eq.${cleanId},legacy_id.eq.${cleanId}`);
    } else if (typeof q?.eq === 'function') {
      q = q.eq('id', cleanId);
    }
    if (ownerId && isUuidStr(ownerId) && typeof q?.eq === 'function') {
      q = q.eq('owner_id', ownerId);
    }
  } else if (typeof q?.eq === 'function') {
    q = q.eq('legacy_id', cleanId);
    if (ownerId && isUuidStr(ownerId) && typeof q?.eq === 'function') {
      q = q.eq('owner_id', ownerId);
    }
  }
  if (kind && typeof q?.eq === 'function') {
    q = q.eq('kind', kind);
  }
  if (typeof q?.order === 'function') {
    q = q.order('updated_at', { ascending: false });
  }
  if (typeof q?.limit === 'function') {
    q = q.limit(1);
  }
  if (!q || typeof q.then !== 'function') {
    if (typeof q?.maybeSingle === 'function') {
      const mRes = await q.maybeSingle();
      const single = toSingleRow(mRes?.data);
      return single ? mapRow(single) : null;
    }
    return null;
  }

  const res = await q;
  if (res?.error) {
    if (canFallbackPreCutover(res.error)) return null;
    throw new WorkspaceRepositoryError(
      500,
      'DB_READ_FAILED',
      res.error.message || '작업 항목 조회에 실패했습니다.',
      res.error.code ? String(res.error.code) : undefined,
    );
  }

  const rows = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
}

export async function listWorkspaceItemsForOwner(
  supabase: unknown,
  params: {
    ownerId: string;
    kind?: WorkspaceItemKind;
    isAdmin?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: WorkspaceItemRecord[]; tableAvailable: boolean }> {
  const db = asDbClient(supabase);
  if (!db) {
    return { items: [], tableAvailable: false };
  }
  if (cachedWorkspaceTableUnavailable && !isRealProductionRuntime() && process.env.REQUIRE_WORKSPACE_ITEMS_TABLE !== '1') {
    return { items: [], tableAvailable: false };
  }

  const limit = Math.min(Math.max(Number(params.limit || 200), 1), 1000);
  const offset = Math.max(Number(params.offset || 0), 0);

  const table = db.from('workspace_items');
  let q: DbQueryLike | undefined = typeof table.select === 'function' ? table.select('*') : table;

  if (typeof q?.is === 'function') {
    q = q.is('deleted_at', null);
  }
  if (!params.isAdmin && typeof q?.eq === 'function') {
    q = q.eq('owner_id', params.ownerId);
  }
  if (params.kind && typeof q?.eq === 'function') {
    q = q.eq('kind', params.kind);
  }
  if (typeof q?.order === 'function') {
    q = q.order('updated_at', { ascending: false });
  }
  if (typeof q?.range === 'function') {
    q = q.range(offset, offset + limit - 1);
  } else if (typeof q?.limit === 'function') {
    q = q.limit(limit);
  }
  if (!q || typeof q.then !== 'function') {
    return { items: [], tableAvailable: false };
  }

  const res = await q;
  if (res?.error) {
    if (canFallbackPreCutover(res.error)) {
      return { items: [], tableAvailable: false };
    }
    throw new WorkspaceRepositoryError(500, 'DB_READ_FAILED', res.error.message || '작업 목록 조회에 실패했습니다.');
  }

  const rows = Array.isArray(res?.data) ? res.data : [];
  return { items: rows.map(mapRow), tableAvailable: true };
}

export async function assertLegacyOrDbOwnership(
  supabase: unknown,
  params: {
    id: string;
    userId: string;
    isAdmin?: boolean;
    kind?: WorkspaceItemKind;
    requireExisting?: boolean;
  }
): Promise<{ existingItem: WorkspaceItemRecord | null; ownerId: string | null }> {
  const { id, userId, isAdmin = false, kind, requireExisting = false } = params;
  const existingItem = await getWorkspaceItemByAnyId(
    supabase,
    id,
    kind,
    isAdmin ? undefined : userId
  );
  if (existingItem) {
    if (!isAdmin && existingItem.ownerId !== userId) {
      throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '이 매물에 대한 권한이 없습니다.');
    }
    return { existingItem, ownerId: existingItem.ownerId };
  }

  // Cross-tenant workspace_items guard (both UUID and non-UUID, excluding shared demo seeds)
  if (!isAdmin && !DEMO_SEED_LEGACY_IDS.has(id.trim())) {
    const anyOwnerItem = await getWorkspaceItemByAnyId(supabase, id, kind).catch(() => null);
    if (anyOwnerItem && !anyOwnerItem.deletedAt && anyOwnerItem.ownerId !== userId) {
      throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '이 매물에 대한 권한이 없습니다.');
    }
  }

  // Fallback ownership check across building_ssot_lite and legacy activity_events
  const db = asDbClient(supabase);
  if (db) {
    if (isUuidStr(id)) {
      const bldQuery = db
        .from('building_ssot_lite')
        .select?.('id, owner_id')
        ?.eq?.('id', id);
      const bldRes = typeof bldQuery?.maybeSingle === 'function' ? await bldQuery.maybeSingle() : null;
      const bldRow = toSingleRow(bldRes?.data);
      const bldErr = bldRes?.error ?? null;
      if (bldErr && !isMissingRelationOrColumnError(bldErr)) {
        throw new WorkspaceRepositoryError(500, 'DB_READ_FAILED', bldErr.message || '매물 권한 확인에 실패했습니다.');
      }
      if (bldRow) {
        const owner = bldRow.owner_id ? String(bldRow.owner_id) : null;
        if (!isAdmin && (!owner || owner !== userId)) {
          throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '이 매물에 대한 권한이 없습니다.');
        }
        return { existingItem: null, ownerId: owner };
      }
    } else {
      const safeLegacyId = /^[A-Za-z0-9_.-]+$/.test(id.trim()) ? id.trim() : '';
      const buildLegacyEvQ = (filtered: boolean) => {
        const evTable = db.from('activity_events');
        let evQ: DbQueryLike | undefined =
          typeof evTable.select === 'function'
            ? evTable.select('actor_id, event_type, entity_id, metadata, created_at')
            : evTable;
        if (typeof evQ?.in === 'function') {
          evQ = evQ.in('event_type', ['dealcard_upserted', 'dealcard_restored', 'im_upserted', 'im_restored']);
        }
        // WP-7.3C P2: scope the legacy ownership scan to JSON metadata keys only — NEVER filter
        // `entity_id.eq.<non-uuid>` here because `activity_events.entity_id` is a Postgres UUID column (22P02).
        if (filtered && safeLegacyId && typeof evQ?.or === 'function') {
          evQ = evQ.or(
            [
              `metadata->>building_id.eq.${safeLegacyId}`,
              `metadata->>im_id.eq.${safeLegacyId}`,
              `metadata->im_item->>id.eq.${safeLegacyId}`,
              `metadata->im_item->>buildingId.eq.${safeLegacyId}`,
            ].join(','),
          );
        }
        if (typeof evQ?.order === 'function') {
          evQ = evQ.order('created_at', { ascending: false });
        }
        if (typeof evQ?.limit === 'function') {
          evQ = evQ.limit(200);
        }
        return evQ;
      };
      const primaryQ = buildLegacyEvQ(Boolean(safeLegacyId));
      let evRes: DbResult = primaryQ && typeof primaryQ.then === 'function' ? await primaryQ : { data: [], error: null };
      if (safeLegacyId && evRes?.error) {
        const fallbackQ = buildLegacyEvQ(false);
        evRes = fallbackQ && typeof fallbackQ.then === 'function' ? await fallbackQ : { data: [], error: null };
      }
      const evRows = Array.isArray(evRes?.data) ? evRes.data : [];
      const evErr = evRes?.error ?? null;
      if (evErr && !isMissingRelationOrColumnError(evErr)) {
        throw new WorkspaceRepositoryError(500, 'DB_READ_FAILED', evErr.message || '매물 이력 권한 확인에 실패했습니다.');
      }
      for (const ev of evRows) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, unknown>;
        const imItemMeta = (meta.im_item && typeof meta.im_item === 'object' ? meta.im_item : {}) as Record<string, unknown>;
        const evBId = String(meta.building_id || imItemMeta.buildingId || meta.im_id || ev.entity_id || '').trim();
        if (evBId === id && ev?.actor_id) {
          const owner = String(ev.actor_id);
          if (DEMO_SEED_LEGACY_IDS.has(id.trim()) && !isAdmin && owner !== userId) {
            continue;
          }
          if (!isAdmin && owner !== userId) {
            throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '이 매물에 대한 권한이 없습니다.');
          }
          return { existingItem: null, ownerId: owner };
        }
      }
    }
  }

  if (requireExisting) {
    throw new WorkspaceRepositoryError(404, 'NOT_FOUND', '대상 자료를 찾을 수 없습니다.');
  }
  return { existingItem: null, ownerId: null };
}

async function executeMutationSingle(query: DbQueryLike | null | undefined): Promise<DbResult> {
  if (!query) return { data: null, error: null };
  let q = query;
  if (typeof q.select === 'function') {
    q = q.select('*');
  }
  if (typeof q.single === 'function') {
    return await q.single();
  }
  if (typeof q.maybeSingle === 'function') {
    return await q.maybeSingle();
  }
  if (typeof q.then === 'function') {
    const out = await q;
    return out || { data: null, error: null };
  }
  return { data: null, error: null };
}

export async function upsertWorkspaceItem(
  supabase: unknown,
  input: {
    id?: string | null;
    legacyId?: string | null;
    buildingId?: string | null;
    ownerId: string;
    isAdmin?: boolean;
    kind: WorkspaceItemKind;
    status?: WorkspaceItemStatus;
    title: string;
    address?: string;
    priceBand?: string | null;
    draftPayload: Record<string, unknown>;
    publishedSnapshot?: Record<string, unknown> | null;
    docHash?: string | null;
    version?: number;
    expectedVersion?: number;
  }
): Promise<{ item: WorkspaceItemRecord | null; tableAvailable: boolean }> {
  const db = asDbClient(supabase);
  if (!db) {
    if (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1') {
      throw new WorkspaceRepositoryError(500, 'DB_UNAVAILABLE', '데이터베이스 연결이 구성되지 않았습니다.');
    }
    return { item: null, tableAvailable: false };
  }
  if (cachedWorkspaceTableUnavailable && !isRealProductionRuntime() && process.env.REQUIRE_WORKSPACE_ITEMS_TABLE !== '1') {
    return { item: null, tableAvailable: false };
  }

  const lookupKey = input.id || input.legacyId || input.buildingId || '';
  const scopeOwner = input.isAdmin ? undefined : input.ownerId;
  let existing = lookupKey
    ? await getWorkspaceItemByAnyId(db, lookupKey, input.kind, scopeOwner)
    : null;
  if (!existing && input.buildingId && input.buildingId !== lookupKey) {
    existing = await getWorkspaceItemByAnyId(db, input.buildingId, input.kind, scopeOwner);
  }

  if (existing && !input.isAdmin && existing.ownerId !== input.ownerId) {
    throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '다른 개업공인중개사의 자료는 수정할 수 없습니다.');
  }

  if (
    typeof input.expectedVersion === 'number' &&
    input.expectedVersion > 0 &&
    existing &&
    existing.version !== input.expectedVersion
  ) {
    throw new WorkspaceRepositoryError(
      409,
      'VERSION_CONFLICT',
      '다른 화면에서 먼저 수정되었습니다. 새로고침 후 다시 시도해 주세요.',
      undefined,
      existing.version
    );
  }

  if (!existing && !input.isAdmin) {
    if (input.id && isUuidStr(input.id)) {
      const idCollision = await getWorkspaceItemByAnyId(db, input.id).catch(() => null);
      if (idCollision && idCollision.ownerId !== input.ownerId) {
        throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '다른 개업공인중개사의 자료는 수정할 수 없습니다.');
      }
    }
    if (input.buildingId && isUuidStr(input.buildingId)) {
      const bldCollision = await getWorkspaceItemByAnyId(db, input.buildingId, input.kind).catch(() => null);
      if (bldCollision && !bldCollision.deletedAt && bldCollision.ownerId !== input.ownerId) {
        throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '다른 개업공인중개사의 자료는 수정할 수 없습니다.');
      }
    }
  }

  const effectiveLegacyLookup =
    (input.legacyId || (!isUuidStr(lookupKey) ? lookupKey : '') || '').trim();
  if (
    !existing &&
    !input.isAdmin &&
    effectiveLegacyLookup &&
    !isUuidStr(effectiveLegacyLookup) &&
    !DEMO_SEED_LEGACY_IDS.has(effectiveLegacyLookup)
  ) {
    const collision = await getWorkspaceItemByAnyId(db, effectiveLegacyLookup, input.kind).catch(() => null);
    if (collision && !collision.deletedAt && collision.ownerId !== input.ownerId) {
      throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '이 매물에 대한 권한이 없습니다.');
    }
  }

  // Also check building_ssot_lite ownership if linking to a building UUID
  if (!existing && input.buildingId && isUuidStr(input.buildingId)) {
    const bldQuery = db
      .from('building_ssot_lite')
      .select?.('owner_id')
      ?.eq?.('id', input.buildingId);
    const bldRes = typeof bldQuery?.maybeSingle === 'function' ? await bldQuery.maybeSingle() : null;
    const bldRow = toSingleRow(bldRes?.data);
    if (bldRow?.owner_id && !input.isAdmin && String(bldRow.owner_id) !== input.ownerId) {
      throw new WorkspaceRepositoryError(403, 'FORBIDDEN', '다른 개업공인중개사의 매물에는 자료를 생성할 수 없습니다.');
    }
  }

  const canonicalId = existing?.id || (isUuidStr(input.id) ? String(input.id) : crypto.randomUUID());
  const resolvedLegacyId =
    existing?.legacyId ??
    (input.legacyId || (input.id && !isUuidStr(input.id) ? String(input.id) : null));
  const nowIso = new Date().toISOString();
  const isExplicitPublishStatus =
    input.status === 'published' || input.status === 'sent';
  const nextStatus: WorkspaceItemStatus = input.status || existing?.status || 'draft';
  const rawPublishedSnapshot =
    input.publishedSnapshot !== undefined
      ? input.publishedSnapshot
      : isExplicitPublishStatus
      ? input.draftPayload
      : existing &&
        (existing.status === 'published' || existing.status === 'sent') &&
        input.status === undefined
      ? existing.publishedSnapshot
      : nextStatus === 'published' || nextStatus === 'sent'
      ? input.draftPayload
      : existing?.publishedSnapshot ?? null;
  const nextPublishedSnapshot =
    input.kind === 'dealcard' && rawPublishedSnapshot
      ? buildSanitizedDealCardPublicSnapshot(rawPublishedSnapshot)
      : rawPublishedSnapshot;

  const rowPayload: DbRow = {
    id: canonicalId,
    owner_id: existing?.ownerId || input.ownerId,
    kind: input.kind,
    legacy_id: resolvedLegacyId,
    building_id: isUuidStr(input.buildingId) ? input.buildingId : existing?.buildingId ?? null,
    status: nextStatus,
    title: input.title,
    address: input.address ?? existing?.address ?? '',
    price_band: input.priceBand ?? existing?.priceBand ?? null,
    draft_payload: input.draftPayload,
    published_snapshot: nextPublishedSnapshot,
    version: input.version ?? (existing ? existing.version + 1 : 1),
    doc_hash: input.docHash ?? existing?.docHash ?? null,
    published_at:
      nextStatus === 'published' || nextStatus === 'sent'
        ? existing?.publishedAt || nowIso
        : existing?.publishedAt ?? null,
    revoked_at: nextStatus === 'revoked' ? existing?.revokedAt || nowIso : null,
    deleted_at: null,
    updated_at: nowIso,
  };

  const baseTable = db.from('workspace_items');
  const writeQ = existing
    ? typeof baseTable.update === 'function'
      ? baseTable.update(rowPayload)?.eq?.('id', existing.id)
      : null
    : typeof baseTable.insert === 'function'
    ? baseTable.insert(rowPayload)
    : null;
  const res = await executeMutationSingle(writeQ);

  if (res?.error) {
    if (canFallbackPreCutover(res.error)) {
      return { item: null, tableAvailable: false };
    }
    throw new WorkspaceRepositoryError(500, 'DB_WRITE_FAILED', res.error.message || '작업 항목 저장에 실패했습니다.');
  }

  const savedRow = toSingleRow(res?.data);
  return {
    item: savedRow ? mapRow(savedRow) : mapRow({ ...rowPayload, created_at: existing?.createdAt || nowIso }),
    tableAvailable: true,
  };
}

export async function softDeleteWorkspaceItem(
  supabase: unknown,
  params: {
    id: string;
    userId: string;
    isAdmin?: boolean;
    kind?: WorkspaceItemKind;
    requireExisting?: boolean;
  }
): Promise<{ deleted: boolean; item: WorkspaceItemRecord | null; tableAvailable: boolean }> {
  const db = asDbClient(supabase);
  if (!db) {
    return { deleted: false, item: null, tableAvailable: false };
  }
  const { existingItem } = await assertLegacyOrDbOwnership(db, {
    id: params.id,
    userId: params.userId,
    isAdmin: params.isAdmin,
    kind: params.kind,
    requireExisting: params.requireExisting,
  });
  if (!existingItem) {
    return { deleted: false, item: null, tableAvailable: !cachedWorkspaceTableUnavailable };
  }

  const nowIso = new Date().toISOString();
  const baseTable = db.from('workspace_items');
  const writeQ = typeof baseTable.update === 'function'
    ? baseTable.update({ status: 'archived', deleted_at: nowIso, updated_at: nowIso })?.eq?.('id', existingItem.id)
    : null;
  const res = await executeMutationSingle(writeQ);
  if (res?.error) {
    if (canFallbackPreCutover(res.error)) {
      return { deleted: false, item: null, tableAvailable: false };
    }
    throw new WorkspaceRepositoryError(500, 'DB_WRITE_FAILED', res.error.message || '삭제 처리에 실패했습니다.');
  }
  const savedRow = toSingleRow(res?.data);
  return { deleted: true, item: savedRow ? mapRow(savedRow) : null, tableAvailable: true };
}

export async function restoreWorkspaceItem(
  supabase: unknown,
  params: {
    id: string;
    userId: string;
    isAdmin?: boolean;
    kind?: WorkspaceItemKind;
    requireExisting?: boolean;
  }
): Promise<{ restored: boolean; item: WorkspaceItemRecord | null; tableAvailable: boolean }> {
  const db = asDbClient(supabase);
  if (!db) {
    return { restored: false, item: null, tableAvailable: false };
  }
  const { existingItem } = await assertLegacyOrDbOwnership(db, {
    id: params.id,
    userId: params.userId,
    isAdmin: params.isAdmin,
    kind: params.kind,
    requireExisting: params.requireExisting,
  });
  if (!existingItem) {
    return { restored: false, item: null, tableAvailable: !cachedWorkspaceTableUnavailable };
  }

  const restoredStatus: WorkspaceItemStatus = existingItem.publishedSnapshot ? 'published' : 'draft';
  const baseTable = db.from('workspace_items');
  const writeQ = typeof baseTable.update === 'function'
    ? baseTable
        .update({
          status: restoredStatus,
          deleted_at: null,
          revoked_at: null,
          updated_at: new Date().toISOString(),
        })
        ?.eq?.('id', existingItem.id)
    : null;
  const res = await executeMutationSingle(writeQ);
  if (res?.error) {
    if (canFallbackPreCutover(res.error)) {
      return { restored: false, item: null, tableAvailable: false };
    }
    throw new WorkspaceRepositoryError(500, 'DB_WRITE_FAILED', res.error.message || '복구 처리에 실패했습니다.');
  }
  const savedRow = toSingleRow(res?.data);
  return { restored: true, item: savedRow ? mapRow(savedRow) : null, tableAvailable: true };
}

export async function updateWorkspaceItemState(
  supabase: unknown,
  params: {
    id: string;
    userId: string;
    isAdmin?: boolean;
    kind?: WorkspaceItemKind;
    status?: WorkspaceItemStatus;
    publishedSnapshot?: Record<string, unknown> | null;
    correctionNotice?: { message: string; updatedAt: string } | null;
    requireExisting?: boolean;
  }
): Promise<{ item: WorkspaceItemRecord | null; tableAvailable: boolean }> {
  const db = asDbClient(supabase);
  if (!db) {
    return { item: null, tableAvailable: false };
  }
  const { existingItem } = await assertLegacyOrDbOwnership(db, {
    id: params.id,
    userId: params.userId,
    isAdmin: params.isAdmin,
    kind: params.kind,
    requireExisting: params.requireExisting,
  });
  if (!existingItem) {
    return { item: null, tableAvailable: !cachedWorkspaceTableUnavailable };
  }

  const buildRowPatch = (targetItem: WorkspaceItemRecord, nowIso: string): DbRow => {
    const patch: DbRow = { updated_at: nowIso };
    const effectiveKind = params.kind || targetItem.kind;
    if (params.status) {
      if (params.status === 'revoked') {
        patch.status = 'revoked';
        patch.revoked_at = nowIso;
      } else if (params.status === 'published' || params.status === 'sent') {
        if (!targetItem.publishedSnapshot && !params.publishedSnapshot) {
          // DC P0-1: NEVER auto-promote an unpublished 'draft' item without publish gates.
          patch.status = targetItem.status === 'revoked' ? 'draft' : targetItem.status;
          patch.revoked_at = null;
        } else {
          patch.status =
            effectiveKind === 'dealcard' && params.status === 'published' && !params.kind
              ? 'sent'
              : params.status;
          patch.published_at = targetItem.publishedAt || nowIso;
          patch.revoked_at = null;
          patch.deleted_at = null;
        }
      } else {
        patch.status = params.status;
      }
    }
    if (params.publishedSnapshot !== undefined) {
      patch.published_snapshot = params.publishedSnapshot;
    }
    if (effectiveKind === 'dealcard' && patch.published_snapshot && typeof patch.published_snapshot === 'object') {
      patch.published_snapshot = buildSanitizedDealCardPublicSnapshot(
        patch.published_snapshot as Record<string, unknown>
      );
    }
    if (params.correctionNotice !== undefined) {
      patch.correction_notice = params.correctionNotice;
    }
    return patch;
  };

  let targetItems: WorkspaceItemRecord[] = [existingItem];
  if (!params.kind) {
    const cleanId = String(params.id || '').trim();
    try {
      const matchTable = db.from('workspace_items');
      let matchQ: DbQueryLike | undefined =
        typeof matchTable.select === 'function' ? matchTable.select('*') : matchTable;
      if (isUuidStr(cleanId)) {
        if (typeof matchQ?.or === 'function') {
          matchQ = matchQ.or(`id.eq.${cleanId},building_id.eq.${cleanId},legacy_id.eq.${cleanId}`);
        } else if (typeof matchQ?.eq === 'function') {
          matchQ = matchQ.eq('id', cleanId);
        }
      } else if (typeof matchQ?.eq === 'function') {
        matchQ = matchQ.eq('legacy_id', cleanId);
      }
      if (existingItem.ownerId && typeof matchQ?.eq === 'function') {
        matchQ = matchQ.eq('owner_id', existingItem.ownerId);
      }
      if (typeof matchQ?.is === 'function') {
        matchQ = matchQ.is('deleted_at', null);
      }
      if (matchQ && typeof matchQ.then === 'function') {
        const matchRes = await matchQ;
        if (!matchRes?.error && Array.isArray(matchRes?.data) && matchRes.data.length > 0) {
          const mapped = matchRes.data
            .map(mapRow)
            .filter((item: WorkspaceItemRecord) => !item.deletedAt && item.status !== 'archived');
          if (mapped.length > 0) {
            const byId = new Map<string, WorkspaceItemRecord>();
            for (const item of mapped) byId.set(item.id, item);
            if (!existingItem.deletedAt && existingItem.status !== 'archived' && !byId.has(existingItem.id)) {
              byId.set(existingItem.id, existingItem);
            }
            targetItems = Array.from(byId.values());
          }
        }
      }
    } catch {
      targetItems = [existingItem];
    }
  }

  const nowIso = new Date().toISOString();
  let primaryUpdated: WorkspaceItemRecord | null = null;
  for (const targetItem of targetItems) {
    const patch = buildRowPatch(targetItem, nowIso);
    const baseTable = db.from('workspace_items');
    const writeQ = typeof baseTable.update === 'function'
      ? baseTable.update(patch)?.eq?.('id', targetItem.id)
      : null;
    const res = await executeMutationSingle(writeQ);
    if (res?.error) {
      if (canFallbackPreCutover(res.error)) {
        return { item: null, tableAvailable: false };
      }
      throw new WorkspaceRepositoryError(500, 'DB_WRITE_FAILED', res.error.message || '상태 업데이트에 실패했습니다.');
    }
    const savedRow = toSingleRow(res?.data);
    const updatedItem = savedRow ? mapRow(savedRow) : null;
    if (!primaryUpdated) {
      primaryUpdated = updatedItem;
    }
  }

  return { item: primaryUpdated, tableAvailable: true };
}

export async function getPublicWorkspaceProjection(
  supabase: unknown,
  idOrLegacy: string,
  kind?: WorkspaceItemKind
): Promise<PublicWorkspaceProjectionResult> {
  const empty: PublicWorkspaceProjectionResult = {
    found: false,
    revoked: false,
    deleted: false,
    status: null,
    ownerId: null,
    projection: null,
  };
  let activeItem: WorkspaceItemRecord | null = null;
  const cleanId = String(idOrLegacy || '').trim();
  const db = asDbClient(supabase);
  if (cleanId && db && !cachedWorkspaceTableUnavailable) {
    try {
      const pubTable = db.from('workspace_items');
      let pq: DbQueryLike | undefined =
        typeof pubTable.select === 'function' ? pubTable.select('*') : pubTable;
      if (isUuidStr(cleanId)) {
        pq = typeof pq?.or === 'function'
          ? pq.or(`id.eq.${cleanId},building_id.eq.${cleanId},legacy_id.eq.${cleanId}`)
          : pq?.eq?.('id', cleanId);
      } else {
        pq = pq?.eq?.('legacy_id', cleanId);
      }
      if (kind && typeof pq?.eq === 'function') pq = pq.eq('kind', kind);
      if (typeof pq?.in === 'function') pq = pq.in('status', ['published', 'sent']);
      if (typeof pq?.is === 'function') pq = pq.is('deleted_at', null).is?.('revoked_at', null) ?? pq;
      if (typeof pq?.order === 'function') pq = pq.order('updated_at', { ascending: false });
      if (typeof pq?.limit === 'function') pq = pq.limit(1);
      if (pq && typeof pq.then === 'function') {
        const res = await pq;
        if (!res?.error && Array.isArray(res?.data) && res.data.length > 0 && res.data[0]?.published_snapshot) {
          activeItem = mapRow(res.data[0]);
        }
      }
    } catch {
      activeItem = null;
    }
  }
  const item = activeItem || (await getWorkspaceItemByAnyId(supabase, idOrLegacy, kind).catch(() => null));
  if (!item) return empty;

  const isRevoked = Boolean(item.revokedAt) || item.status === 'revoked';
  const isDeleted = Boolean(item.deletedAt) || item.status === 'archived';
  const isPublicStatus = item.status === 'published' || item.status === 'sent';

  if (isDeleted || isRevoked || !isPublicStatus || !item.publishedSnapshot) {
    return {
      found: true,
      revoked: isRevoked,
      deleted: isDeleted,
      status: item.status,
      ownerId: item.ownerId,
      projection: null,
    };
  }

  return {
    found: true,
    revoked: false,
    deleted: false,
    status: item.status,
    ownerId: item.ownerId,
    projection: {
      id: item.id,
      buildingId: item.buildingId,
      ownerId: item.ownerId,
      kind: item.kind,
      status: item.status as 'published' | 'sent',
      title: item.title,
      address: item.address,
      priceBand: item.priceBand,
      snapshot: item.publishedSnapshot,
      correctionNotice: item.correctionNotice,
      version: item.version,
      docHash: item.docHash,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt,
    },
  };
}
