import {
  getInboxState,
  getQuickImRecord,
  isDealCardDeleted,
  resolveOrSynthesizeQuickImRecord,
  type StoredQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import {
  isBuildingShareLinkRevoked,
  isBuildingShareLinkRevokedAsync,
} from '@/lib/security/share-link-tokens';
import { PUBLIC_WORKSPACE_ITEM_STATUSES } from '@/domain/public-projection/visibility';
import {
  getPublicWorkspaceProjection,
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  type PublicWorkspaceProjectionResult,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('deal-public-guard');

const PROD_DISABLED_DEMO_IDS = new Set<string>([
  'bld-01',
  'bld-02',
  'bld-03',
  'f1111111-1111-4111-8111-111111111101',
  'f1111111-1111-4111-8111-111111111102',
  'f1111111-1111-4111-8111-111111111103',
  'f1111111-1111-1111-1111-111111111111',
  'f2222222-2222-2222-2222-111111111111',
  'f3333333-3333-3333-3333-111111111111',
]);

type GuardRecord = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuardSupabase = { from: (table: string) => any };

export type PublicDealGuardReason =
  | 'demo_disabled_prod'
  | 'deleted'
  | 'revoked'
  | 'not_published'
  /** WP-7.3C P1-1: unexpected workspace_items read error → fail closed. */
  | 'lookup_failed';

export interface PublicDealWorkspaceGuardResult {
  blocked: boolean;
  reason?: PublicDealGuardReason;
  ownerId: string | null;
  workspaceItemStatus: string | null;
  projection: PublicWorkspaceProjectionResult['projection'];
  draftPayloadForOwnerOnly: GuardRecord | null;
  item: WorkspaceItemRecord | null;
}

/**
 * Memory store fallback (quick-generate-store / inboxState) is allowed only in
 * non-production/unit-test environments unless explicitly disabled via
 * DISABLE_MEMORY_STORE=1 (or enabled in local staging via ALLOW_MEMORY_STORE_FALLBACK=1).
 */
export function allowDealPublicMemoryFallback(): boolean {
  if (process.env.DISABLE_MEMORY_STORE === '1') return false;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MEMORY_STORE_FALLBACK !== '1') {
    return false;
  }
  return true;
}

/**
 * Hardcoded demo seeds (bld-01..03, f1111111-..., DEMO_OG_BUILDINGS) must never
 * expose fake listings in production unless ALLOW_DEMO_SEEDS_IN_PROD=1 is set.
 */
export function isDemoSeedDisabledForProd(id: string): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.ALLOW_DEMO_SEEDS_IN_PROD === '1') return false;
  return PROD_DISABLED_DEMO_IDS.has(String(id || '').trim());
}

/**
 * Resolves workspace_items projection + durable revocation + production demo guard
 * for /dc/[id] and /api/og/deal/[id]/*.
 *
 * Public callers MUST only consume `projection?.snapshot` (`published_snapshot`),
 * never `draftPayloadForOwnerOnly`.
 */
export async function resolvePublicDealWorkspaceGuard(params: {
  id: string;
  supabase: GuardSupabase | unknown;
}): Promise<PublicDealWorkspaceGuardResult> {
  const cleanId = String(params.id || '').trim();

  if (!cleanId || isDemoSeedDisabledForProd(cleanId)) {
    return {
      blocked: true,
      reason: 'demo_disabled_prod',
      ownerId: null,
      workspaceItemStatus: 'archived',
      projection: null,
      draftPayloadForOwnerOnly: null,
      item: null,
    };
  }

  const memoryFallbackAllowed = allowDealPublicMemoryFallback();
  if (memoryFallbackAllowed) {
    if (isDealCardDeleted(cleanId)) {
      return {
        blocked: true,
        reason: 'deleted',
        ownerId: null,
        workspaceItemStatus: 'archived',
        projection: null,
        draftPayloadForOwnerOnly: null,
        item: null,
      };
    }
    const inboxRevoked = Boolean(getInboxState().revokedBuildings?.[cleanId]?.revoked);
    if (inboxRevoked || isBuildingShareLinkRevoked(cleanId)) {
      return {
        blocked: true,
        reason: 'revoked',
        ownerId: null,
        workspaceItemStatus: 'revoked',
        projection: null,
        draftPayloadForOwnerOnly: null,
        item: null,
      };
    }
  }

  let dbRevoked = false;
  try {
    dbRevoked = await isBuildingShareLinkRevokedAsync(cleanId, params.supabase);
  } catch (err) {
    log.warn('[deal-public-guard] share-link revocation lookup failed', {
      id: cleanId,
      error: err instanceof Error ? err.message : String(err),
    });
    dbRevoked = false;
  }

  // WP-7.3C P1-1: never swallow workspace_items lookup errors. Only the known
  // pre-cutover "table/column missing" condition falls back to legacy (item=null);
  // any other DB error fails closed (blocked, not public).
  let item: WorkspaceItemRecord | null = null;
  try {
    item = await getWorkspaceItemByAnyId(params.supabase, cleanId, 'dealcard');
  } catch (err) {
    if (isMissingRelationOrColumnError(err)) {
      log.warn('[deal-public-guard] workspace_items unavailable (pre-cutover) — legacy fallback', {
        id: cleanId,
        error: err instanceof Error ? err.message : String(err),
      });
      item = null;
    } else {
      log.error('[deal-public-guard] workspace_items lookup failed — failing closed', {
        id: cleanId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        blocked: true,
        reason: 'lookup_failed',
        ownerId: null,
        workspaceItemStatus: 'archived',
        projection: null,
        draftPayloadForOwnerOnly: null,
        item: null,
      };
    }
  }
  let projectionRes: PublicWorkspaceProjectionResult | null = null;
  if (item) {
    try {
      projectionRes = await getPublicWorkspaceProjection(params.supabase, cleanId, 'dealcard');
    } catch (err) {
      // projection=null below → not_published (fail closed)
      log.error('[deal-public-guard] public projection lookup failed — failing closed', {
        id: cleanId,
        error: err instanceof Error ? err.message : String(err),
      });
      projectionRes = null;
    }
  }

  if (dbRevoked) {
    return {
      blocked: true,
      reason: 'revoked',
      ownerId: item?.ownerId ?? null,
      workspaceItemStatus: 'revoked',
      projection: null,
      draftPayloadForOwnerOnly: item?.draftPayload ?? null,
      item,
    };
  }

  if (item) {
    if (item.deletedAt || item.status === 'archived') {
      return {
        blocked: true,
        reason: 'deleted',
        ownerId: item.ownerId,
        workspaceItemStatus: 'archived',
        projection: null,
        draftPayloadForOwnerOnly: null,
        item,
      };
    }

    if (item.revokedAt || item.status === 'revoked') {
      return {
        blocked: true,
        reason: 'revoked',
        ownerId: item.ownerId,
        workspaceItemStatus: 'revoked',
        projection: null,
        draftPayloadForOwnerOnly: item.draftPayload,
        item,
      };
    }

    const isPublished =
      Boolean(projectionRes?.projection?.snapshot) &&
      (item.status === 'published' || item.status === 'sent');

    if (!isPublished) {
      return {
        blocked: true,
        reason: 'not_published',
        ownerId: item.ownerId,
        workspaceItemStatus: item.status || 'draft',
        projection: null,
        draftPayloadForOwnerOnly: item.draftPayload,
        item,
      };
    }

    return {
      blocked: false,
      ownerId: item.ownerId,
      workspaceItemStatus: item.status,
      projection: projectionRes!.projection,
      draftPayloadForOwnerOnly: item.draftPayload,
      item,
    };
  }

  return {
    blocked: false,
    ownerId: null,
    workspaceItemStatus: null,
    projection: null,
    draftPayloadForOwnerOnly: null,
    item: null,
  };
}

export interface OgDealGuardResult {
  blocked: boolean;
  quickRec: StoredQuickImRecord | null;
  snapshot: GuardRecord | null;
  snapshotCard4: GuardRecord | null;
  demoAllowed: boolean;
}

/** Extracts published-snapshot card4 fields without exposing draft payloads. */
export function extractSnapshotCard4(
  projection: PublicWorkspaceProjectionResult['projection'] | null | undefined
): GuardRecord | null {
  const snap = projection?.snapshot;
  if (!snap || typeof snap !== 'object') return null;
  if (snap.card4 && typeof snap.card4 === 'object') return snap.card4 as GuardRecord;
  return snap;
}

/** Shared fail-closed public guard for all 4 OG deal image routes. */
export async function resolveOgDealGuard(
  id: string,
  supabase: GuardSupabase | unknown
): Promise<OgDealGuardResult> {
  const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
  const isNonPublicWorkspaceItem =
    Boolean(guard.workspaceItemStatus) &&
    !PUBLIC_WORKSPACE_ITEM_STATUSES.includes(guard.workspaceItemStatus!);

  if (guard.blocked || isNonPublicWorkspaceItem) {
    return {
      blocked: true,
      quickRec: null,
      snapshot: null,
      snapshotCard4: null,
      demoAllowed: false,
    };
  }

  let quickRec: StoredQuickImRecord | null = null;
  if (allowDealPublicMemoryFallback()) {
    quickRec =
      getQuickImRecord(id) ||
      (await resolveOrSynthesizeQuickImRecord(id, supabase).catch(() => undefined)) ||
      null;
    if (quickRec?.isRevoked) {
      return {
        blocked: true,
        quickRec: null,
        snapshot: null,
        snapshotCard4: null,
        demoAllowed: false,
      };
    }
  }

  return {
    blocked: false,
    quickRec,
    snapshot: guard.projection?.snapshot ?? null,
    snapshotCard4: extractSnapshotCard4(guard.projection),
    demoAllowed: !isDemoSeedDisabledForProd(id),
  };
}
