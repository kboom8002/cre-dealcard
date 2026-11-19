import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { setBuildingRevokedState } from '@/lib/im-lite/quick-generate-store';
import { isRealProductionRuntime } from '@/lib/env';
import { createModuleLogger } from '@/lib/logger';
import { recordFunnelEvent } from '@/lib/observability/funnel-slo';
import {
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  updateWorkspaceItemState,
} from '@/lib/workspace/workspace-repository';

const log = createModuleLogger('share-link-tokens');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShareLinkKind = 'im' | 'dealcard';
export type ShareLinkChannel = 'copy' | 'email' | 'alimtalk' | 'kakao_share';

export interface IssueShareLinkInput {
  buildingId: string;
  brokerId?: string | null;
  recipientId?: string | null;
  ttlDays?: number;
  kind?: ShareLinkKind;
  channel?: ShareLinkChannel | null;
}

export interface IssuedShareLinkToken {
  token: string;
  buildingId: string;
  brokerId: string | null;
  recipientId: string | null;
  kind: ShareLinkKind;
  channel: ShareLinkChannel | null;
  status: 'active';
  expiresAt: string;
  shareUrl: string;
  toString(): string;
}

export interface RevokeShareLinkInput {
  token?: string | null;
  buildingId?: string | null;
  brokerId?: string | null;
  threadId?: string | null;
  gateRequestId?: string | null;
  reason?: string | null;
  isAdmin?: boolean;
  scope?: 'thread' | 'building';
}

export interface RevokeShareLinkResult {
  ok: boolean;
  revoked: boolean;
  status: number;
  token?: string;
  buildingId?: string;
  revokedAt?: string;
  error?: string;
}

export interface VerifyShareLinkInput {
  token: string | null | undefined;
  buildingId?: string | null;
}

export interface VerifyShareLinkResult {
  valid: boolean;
  reason?: 'revoked' | 'expired' | 'invalid' | 'lookup_failed';
  buildingId?: string;
  brokerId?: string | null;
  recipientId?: string | null;
  kind?: ShareLinkKind | null;
  channel?: ShareLinkChannel | null;
}

export function extractShareTokenFromInput(raw?: string | null): string | null {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) return null;
  if (input.startsWith('slk.')) {
    return input.split(/[\s&#]/)[0] || null;
  }
  const match = input.match(/[?&]token=([^&#\s]+)/i);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

interface StoredShareTokenEntry {
  token: string;
  buildingId: string;
  brokerId: string | null;
  recipientId: string | null;
  status: 'active' | 'revoked';
  expiresAt: string;
  revokedAt?: string | null;
  revokedReason?: string | null;
  createdAt: string;
}

interface ShareTokenStoreState {
  tokens: Record<string, StoredShareTokenEntry>;
  revokedTokens: Record<
    string,
    {
      token: string;
      buildingId?: string;
      brokerId?: string | null;
      revokedAt: string;
      reason?: string | null;
    }
  >;
  revokedBuildings: Record<
    string,
    {
      buildingId: string;
      brokerId?: string | null;
      revokedAt: string;
      reason?: string | null;
    }
  >;
}

function isVitestTokenStoreEnabled(): boolean {
  return Boolean(process.env.VITEST) && process.env.DISABLE_MEMORY_STORE !== '1';
}

type ShareDbRow = Record<string, unknown>;

interface ShareDbResult {
  data?: ShareDbRow | ShareDbRow[] | null;
  error?: { code?: string; message?: string } | null;
}

interface ShareDbQueryLike extends PromiseLike<ShareDbResult> {
  select?: (cols?: string) => ShareDbQueryLike;
  insert?: (payload: ShareDbRow | ShareDbRow[]) => ShareDbQueryLike;
  update?: (payload: ShareDbRow) => ShareDbQueryLike;
  upsert?: (
    payload: ShareDbRow | ShareDbRow[],
    opts?: { onConflict?: string }
  ) => ShareDbQueryLike;
  eq?: (col: string, val: unknown) => ShareDbQueryLike;
  in?: (col: string, vals: unknown[]) => ShareDbQueryLike;
  or?: (expr: string) => ShareDbQueryLike;
  order?: (col: string, opts?: { ascending?: boolean }) => ShareDbQueryLike;
  limit?: (n: number) => ShareDbQueryLike;
  maybeSingle?: () => Promise<ShareDbResult>;
  single?: () => Promise<ShareDbResult>;
}

interface ShareDbClientLike {
  from: (table: string) => ShareDbQueryLike;
}

function asShareDbClient(client: unknown): ShareDbClientLike | null {
  if (
    client &&
    typeof client === 'object' &&
    typeof (client as { from?: unknown }).from === 'function'
  ) {
    return client as ShareDbClientLike;
  }
  return null;
}

function toFirstShareRow(
  data: ShareDbRow | ShareDbRow[] | null | undefined
): ShareDbRow | null {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function resolveCanonicalBuildingOwnerId(
  supabase: ShareDbClientLike | null,
  buildingId: string
): Promise<string | null> {
  const cleanId = buildingId.trim();
  if (!supabase || !cleanId) return null;
  try {
    const wsItem = await getWorkspaceItemByAnyId(supabase, cleanId).catch(() => null);
    if (wsItem?.ownerId) {
      return wsItem.ownerId;
    }
    if (UUID_RE.test(cleanId)) {
      const bQuery = supabase
        .from('building_ssot_lite')
        .select?.('owner_id')
        ?.eq?.('id', cleanId);
      const bRes = typeof bQuery?.maybeSingle === 'function' ? await bQuery.maybeSingle() : null;
      const bRow = toFirstShareRow(bRes?.data);
      if (bRow?.owner_id) {
        return String(bRow.owner_id);
      }
    }
  } catch {
    // non-blocking lookup
  }
  return null;
}

declare global {
  var __CRE_SHARE_LINK_TOKEN_STORE__: ShareTokenStoreState | undefined;
}

function getHmacSecret(): string {
  const shareLinkSecret = (process.env.SHARE_LINK_SECRET || '').trim();
  if (shareLinkSecret.length >= 32) {
    return shareLinkSecret;
  }
  const nextAuthSecret = (process.env.NEXTAUTH_SECRET || '').trim();
  if (nextAuthSecret.length >= 32) {
    return nextAuthSecret;
  }
  // NEVER fall back to SUPABASE_SERVICE_ROLE_KEY in ANY environment (key separation invariant)
  if (isRealProductionRuntime()) {
    throw new Error(
      'FATAL: SHARE_LINK_SECRET (or NEXTAUTH_SECRET) of at least 32 characters must be configured in production.'
    );
  }
  return 'credeal-share-link-hmac-secret-v1';
}

function createEmptyStore(): ShareTokenStoreState {
  return {
    tokens: {},
    revokedTokens: {},
    revokedBuildings: {},
  };
}

function getTokenStore(): ShareTokenStoreState {
  if (!isVitestTokenStoreEnabled()) {
    return createEmptyStore();
  }
  if (!globalThis.__CRE_SHARE_LINK_TOKEN_STORE__) {
    globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = createEmptyStore();
  }
  return globalThis.__CRE_SHARE_LINK_TOKEN_STORE__;
}

function persistTokenStore(state: ShareTokenStoreState): void {
  if (!isVitestTokenStoreEnabled()) return;
  globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = state;
}

export function resetShareLinkTokenStoreForTests(): void {
  globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = createEmptyStore();
}

interface SignedPayload {
  b: string; // buildingId
  u: string; // brokerId
  r: string; // recipientId
  k?: ShareLinkKind; // kind ('im' | 'dealcard')
  ch?: ShareLinkChannel; // channel
  exp: number; // expiresAt ms
  n: string; // nonce
}

function signPayloadB64(payloadB64: string): string {
  return crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('base64url');
}

function decodeSignedToken(
  token: string
): { validSig: boolean; payload?: SignedPayload } {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'slk') {
    return { validSig: false };
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { validSig: false };
  }

  const expectedSig = signPayloadB64(payloadB64);
  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { validSig: false };
  }

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as SignedPayload;
    if (!parsed || typeof parsed.b !== 'string' || typeof parsed.exp !== 'number') {
      return { validSig: false };
    }
    return { validSig: true, payload: parsed };
  } catch {
    return { validSig: false };
  }
}

export async function issueShareLinkToken(
  input: IssueShareLinkInput
): Promise<IssuedShareLinkToken> {
  const buildingId = String(input.buildingId || '').trim();
  if (!buildingId) {
    throw new Error('buildingId is required to issue a share link token');
  }
  const brokerId = input.brokerId ? String(input.brokerId).trim() : null;
  const recipientId = input.recipientId ? String(input.recipientId).trim() : null;
  const kind: ShareLinkKind = input.kind === 'dealcard' ? 'dealcard' : 'im';
  const channel: ShareLinkChannel | null = input.channel ?? null;
  const rawTtl =
    typeof input.ttlDays === 'number' && Number.isFinite(input.ttlDays)
      ? input.ttlDays
      : 30;
  const ttlDays = Math.min(Math.max(rawTtl, 1), 90);
  const expiresAtMs = Date.now() + ttlDays * 86_400_000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const payload: SignedPayload = {
    b: buildingId,
    u: brokerId || '',
    r: recipientId || '',
    ...(kind !== 'im' ? { k: kind } : {}),
    ...(channel ? { ch: channel } : {}),
    exp: expiresAtMs,
    n: crypto.randomBytes(6).toString('hex'),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sigB64 = signPayloadB64(payloadB64);
  const token = `slk.${payloadB64}.${sigB64}`;

  const store = getTokenStore();
  store.tokens[token] = {
    token,
    buildingId,
    brokerId,
    recipientId,
    status: 'active',
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  delete store.revokedTokens[token];
  if (buildingId && store.revokedBuildings[buildingId]) {
    delete store.revokedBuildings[buildingId];
  }
  persistTokenStore(store);

  // Persist to Supabase im_share_links when available
  try {
    const supabase = asShareDbClient(createServiceClient());
    const table = supabase?.from('im_share_links');
    if (table && typeof table.upsert === 'function') {
      const upsertRes = await table.upsert(
        {
          token,
          building_id: buildingId,
          broker_id: brokerId,
          recipient_id: recipientId,
          status: 'active',
          expires_at: expiresAt,
          revoked_at: null,
          revoked_reason: null,
        },
        { onConflict: 'token' }
      );
      if (upsertRes?.error && !isMissingRelationOrColumnError(upsertRes.error)) {
        log.warn('im_share_links upsert failed during share-link issuance', {
          code: upsertRes.error.code,
          message: upsertRes.error.message,
          buildingId,
        });
      }
    } else if (table && typeof table.insert === 'function') {
      const insertRes = await table.insert({
        token,
        building_id: buildingId,
        broker_id: brokerId,
        recipient_id: recipientId,
        status: 'active',
        expires_at: expiresAt,
      });
      if (insertRes?.error && !isMissingRelationOrColumnError(insertRes.error)) {
        log.warn('im_share_links insert failed during share-link issuance', {
          code: insertRes.error.code,
          message: insertRes.error.message,
          buildingId,
        });
      }
    }
  } catch {
    // Non-blocking fallback when DB is not configured
  }

  const shareUrl =
    kind === 'dealcard'
      ? `/dc/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(token)}`
      : `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(token)}`;
  return {
    token,
    buildingId,
    brokerId,
    recipientId,
    kind,
    channel,
    status: 'active',
    expiresAt,
    shareUrl,
    toString() {
      return token;
    },
  };
}

export async function revokeShareLinkToken(
  input: RevokeShareLinkInput
): Promise<RevokeShareLinkResult> {
  const rawToken = input.token ? String(input.token).trim() : '';
  const rawBuildingId = input.buildingId ? String(input.buildingId).trim() : '';
  const brokerId = input.brokerId ? String(input.brokerId).trim() : null;
  const rawThreadId = input.threadId ? String(input.threadId).trim() : '';
  const rawGateRequestId = input.gateRequestId
    ? String(input.gateRequestId).trim()
    : '';
  const reason = input.reason ? String(input.reason).trim() : null;
  const isAdmin = Boolean(input.isAdmin);
  const scope: 'thread' | 'building' =
    input.scope === 'thread' ? 'thread' : 'building';

  if (scope === 'thread' && !rawToken) {
    return {
      ok: false,
      revoked: false,
      status: 400,
      error: '개별 링크 잠금에는 대상 토큰이 필요합니다.',
    };
  }

  if (!rawToken && !rawBuildingId) {
    return {
      ok: false,
      revoked: false,
      status: 400,
      error: '잠글 링크 토큰 또는 매물 ID가 필요합니다.',
    };
  }

  const store = getTokenStore();
  const existingMem = rawToken ? store.tokens[rawToken] : undefined;
  const decoded = rawToken ? decodeSignedToken(rawToken) : { validSig: false };

  // Check DB record and canonical building ownership for authorization validation
  let linkBrokerId: string | null = null;
  let linkBuildingId = '';
  let canonicalBuildingOwnerId: string | null = null;
  let dbClientForCheck: ShareDbClientLike | null = null;
  try {
    dbClientForCheck = asShareDbClient(createServiceClient());
    if (rawToken && dbClientForCheck) {
      const q = dbClientForCheck
        .from('im_share_links')
        .select?.('token, building_id, broker_id, status')
        ?.eq?.('token', rawToken);
      const res =
        typeof q?.maybeSingle === 'function'
          ? await q.maybeSingle()
          : typeof q?.single === 'function'
          ? await q.single()
          : null;
      const linkRow = toFirstShareRow(res?.data);
      if (linkRow?.broker_id) {
        linkBrokerId = String(linkRow.broker_id);
      }
      if (linkRow?.building_id) {
        linkBuildingId = String(linkRow.building_id);
      }
    }
  } catch {
    // ignore DB lookup error
  }

  const resolvedBuildingId =
    rawBuildingId ||
    linkBuildingId ||
    existingMem?.buildingId ||
    (decoded.validSig && decoded.payload?.b ? decoded.payload.b : '');

  if (resolvedBuildingId && dbClientForCheck) {
    canonicalBuildingOwnerId = await resolveCanonicalBuildingOwnerId(
      dbClientForCheck,
      resolvedBuildingId
    );
  }

  const tokenOwnerId =
    canonicalBuildingOwnerId ||
    linkBrokerId ||
    existingMem?.brokerId ||
    (decoded.validSig && decoded.payload?.u ? decoded.payload.u : null);

  if (!isAdmin && brokerId) {
    if (canonicalBuildingOwnerId) {
      if (canonicalBuildingOwnerId !== brokerId) {
        return {
          ok: false,
          revoked: false,
          status: 403,
          error: '다른 개업공인중개사의 매물 링크는 잠글 수 없습니다.',
        };
      }
    } else if (tokenOwnerId && tokenOwnerId !== brokerId) {
      return {
        ok: false,
        revoked: false,
        status: 403,
        error: '다른 개업공인중개사가 발급한 공유 링크는 잠글 수 없습니다.',
      };
    } else if (!tokenOwnerId && resolvedBuildingId) {
      const byBldg = Object.values(store.tokens).filter(
        (t) => t.buildingId === resolvedBuildingId && t.brokerId
      );
      if (byBldg.length > 0 && byBldg.every((t) => t.brokerId !== brokerId)) {
        return {
          ok: false,
          revoked: false,
          status: 403,
          error: '다른 개업공인중개사의 매물 링크는 잠글 수 없습니다.',
        };
      }
    }
  }

  const revokedAt = new Date().toISOString();

  // Sync revocation to Supabase im_share_links AND activity_events (S0-4 & S1-3)
  let durablePersisted = false;
  let supabaseClientConfigured = false;
  try {
    const supabase = asShareDbClient(createServiceClient());
    if (supabase) {
      supabaseClientConfigured = true;
      const table = supabase.from('im_share_links');
      if (rawToken && table) {
        let tokenSaved = false;
        if (typeof table.update === 'function') {
          try {
            const updQ = table
              .update({
                status: 'revoked',
                revoked_at: revokedAt,
                revoked_reason: reason,
              })
              ?.eq?.('token', rawToken);
            const updRes = updQ ? await updQ : null;
            if (!updRes?.error) {
              tokenSaved = true;
              durablePersisted = true;
            }
          } catch {
            // Fall through to upsert attempt
          }
        }
        if (!tokenSaved && resolvedBuildingId && typeof table.upsert === 'function') {
          try {
            const upRes = await table.upsert(
              {
                token: rawToken,
                building_id: resolvedBuildingId,
                broker_id: brokerId,
                status: 'revoked',
                expires_at:
                  existingMem?.expiresAt ||
                  new Date(Date.now() + 86_400_000).toISOString(),
                revoked_at: revokedAt,
                revoked_reason: reason,
              },
              { onConflict: 'token' }
            );
            if (!upRes?.error) {
              durablePersisted = true;
            }
          } catch {
            // Handled below
          }
        }
      }
      if (scope !== 'thread' && resolvedBuildingId && table && typeof table.update === 'function') {
        try {
          const bldQ = table
            .update({
              status: 'revoked',
              revoked_at: revokedAt,
              revoked_reason: reason,
            })
            ?.eq?.('building_id', resolvedBuildingId);
          const bldRes = bldQ ? await bldQ : null;
          if (!bldRes?.error) {
            durablePersisted = true;
          }
        } catch {
          // Handled below
        }
      }
      const evTable = supabase.from('activity_events');
      if (evTable && typeof evTable.insert === 'function') {
        try {
          const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const actorId = brokerId && uuidRe.test(brokerId) ? brokerId : null;
          const entityId =
            resolvedBuildingId && uuidRe.test(resolvedBuildingId)
              ? resolvedBuildingId
              : rawGateRequestId && uuidRe.test(rawGateRequestId)
              ? rawGateRequestId
              : brokerId && uuidRe.test(brokerId)
              ? brokerId
              : '00000000-0000-4000-8000-000000000000';
          const evRes = await evTable.insert(
            scope === 'thread'
              ? {
                  actor_id: actorId,
                  event_type: 'thread_link_revoked',
                  entity_type: 'building',
                  entity_id: entityId,
                  metadata: {
                    scope: 'thread',
                    gate_request_id: rawGateRequestId || null,
                    thread_id: rawThreadId || null,
                    building_id: resolvedBuildingId || null,
                    share_token: rawToken || null,
                    reason,
                    revoked: true,
                  },
                }
              : {
                  actor_id: actorId,
                  event_type: 'link_revoked',
                  entity_type: 'building',
                  entity_id: entityId,
                  metadata: {
                    thread_id: rawThreadId || null,
                    building_id: resolvedBuildingId || null,
                    share_token: rawToken || null,
                    reason,
                    revoked: true,
                  },
                }
          );
          if (!evRes?.error) {
            durablePersisted = true;
          }
        } catch {
          // Handled below
        }
      }
    }
  } catch {
    // Non-blocking fallback when Supabase service client is unavailable in dev/test
  }

  if (
    scope !== 'thread' &&
    resolvedBuildingId &&
    (brokerId || isAdmin) &&
    supabaseClientConfigured &&
    dbClientForCheck
  ) {
    try {
      await updateWorkspaceItemState(dbClientForCheck, {
        id: resolvedBuildingId,
        userId: brokerId || tokenOwnerId || '',
        isAdmin,
        status: 'revoked',
      });
    } catch {
      // Ignore if building is not in workspace_items
    }
  }

  if (
    supabaseClientConfigured &&
    !durablePersisted &&
    (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1')
  ) {
    return {
      ok: false,
      revoked: false,
      status: 500,
      error: '링크 잠금 상태를 서버에 저장하지 못했습니다.',
    };
  }

  if (rawToken) {
    store.revokedTokens[rawToken] = {
      token: rawToken,
      buildingId: resolvedBuildingId || undefined,
      brokerId,
      revokedAt,
      reason,
    };
    if (store.tokens[rawToken]) {
      store.tokens[rawToken] = {
        ...store.tokens[rawToken],
        status: 'revoked',
        revokedAt,
        revokedReason: reason,
      };
    }
  }

  if (scope !== 'thread' && resolvedBuildingId) {
    store.revokedBuildings[resolvedBuildingId] = {
      buildingId: resolvedBuildingId,
      brokerId,
      revokedAt,
      reason,
    };
    // Mark all tokens of that building revoked (prevents older tokens T1 from surviving a lock — S1-3)
    for (const entry of Object.values(store.tokens)) {
      if (entry.buildingId === resolvedBuildingId) {
        entry.status = 'revoked';
        entry.revokedAt = revokedAt;
        entry.revokedReason = reason;
        store.revokedTokens[entry.token] = {
          token: entry.token,
          buildingId: resolvedBuildingId,
          brokerId,
          revokedAt,
          reason,
        };
      }
    }
    try {
      setBuildingRevokedState(resolvedBuildingId, true, rawToken || undefined);
    } catch {
      // ignore
    }
  }

  persistTokenStore(store);

  return {
    ok: true,
    revoked: true,
    status: 200,
    token: rawToken || undefined,
    buildingId: resolvedBuildingId || undefined,
    revokedAt,
  };
}

export function resolveShareTokenBuildingId(token?: string | null): string {
  const rawToken = typeof token === 'string' ? token.trim() : '';
  if (!rawToken) return '';
  const store = getTokenStore();
  if (store.tokens[rawToken]?.buildingId) {
    return store.tokens[rawToken].buildingId;
  }
  if (store.revokedTokens[rawToken]?.buildingId) {
    return String(store.revokedTokens[rawToken].buildingId);
  }
  if (rawToken.startsWith('slk.')) {
    const decoded = decodeSignedToken(rawToken);
    if (decoded.validSig && decoded.payload?.b) {
      return decoded.payload.b;
    }
  }
  return '';
}

export function clearBuildingShareLinkLock(buildingId: string): void {
  const cleanId = String(buildingId || '').trim();
  if (!cleanId) return;
  const store = getTokenStore();
  if (store.revokedBuildings[cleanId]) {
    delete store.revokedBuildings[cleanId];
    persistTokenStore(store);
  }
  try {
    setBuildingRevokedState(cleanId, false);
  } catch {
    // ignore
  }
}

export async function revokeRecipientShareLinkTokens(
  recipientId: string,
  optsOrSupabase?: { brokerId?: string | null; supabase?: unknown } | unknown
): Promise<number> {
  const cleanRecipient = String(recipientId || '').trim();
  if (!cleanRecipient) return 0;

  const rawClient = asShareDbClient(optsOrSupabase);
  const optsObj =
    !rawClient && optsOrSupabase && typeof optsOrSupabase === 'object'
      ? (optsOrSupabase as { brokerId?: string | null; supabase?: unknown })
      : null;
  const supabaseOverride = rawClient || asShareDbClient(optsObj?.supabase);
  const scopedBrokerId = optsObj?.brokerId ? String(optsObj.brokerId).trim() : null;

  const revokedAt = new Date().toISOString();
  const store = getTokenStore();
  let count = 0;

  for (const entry of Object.values(store.tokens)) {
    if (
      entry.recipientId === cleanRecipient &&
      (!scopedBrokerId || !entry.brokerId || entry.brokerId === scopedBrokerId)
    ) {
      entry.status = 'revoked';
      entry.revokedAt = revokedAt;
      entry.revokedReason = 'gate_expired';
      store.revokedTokens[entry.token] = {
        token: entry.token,
        buildingId: entry.buildingId,
        brokerId: entry.brokerId,
        revokedAt,
        reason: 'gate_expired',
      };
      count += 1;
    }
  }
  persistTokenStore(store);

  try {
    const supabase = supabaseOverride || asShareDbClient(createServiceClient());
    const table = supabase?.from('im_share_links');
    if (table && typeof table.update === 'function') {
      let updQ: ShareDbQueryLike | undefined = table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: 'gate_expired',
        })
        ?.eq?.('recipient_id', cleanRecipient);
      if (scopedBrokerId && typeof updQ?.eq === 'function') {
        updQ = updQ.eq('broker_id', scopedBrokerId);
      }
      if (typeof updQ?.select === 'function') {
        updQ = updQ.select('token');
      }
      const res = updQ ? await updQ : null;
      if (res?.error) {
        if (!isMissingRelationOrColumnError(res.error) && (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1')) {
          throw new Error(res.error.message || 'DB_REVOKE_RECIPIENT_FAILED');
        }
      } else if (Array.isArray(res?.data) && res.data.length > count) {
        count = res.data.length;
      }
    }
  } catch (err) {
    if (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1') {
      throw err;
    }
  }

  return count;
}

export async function restoreShareLinkToken(input: {
  token?: string | null;
  buildingId?: string | null;
  brokerId?: string | null;
  threadId?: string | null;
  scope?: 'thread' | 'building';
  isAdmin?: boolean;
}): Promise<{ ok: boolean; status: number; buildingId?: string; scope?: 'thread' | 'building'; error?: string }> {
  const rawToken = input.token ? String(input.token).trim() : '';
  const rawBuildingId = input.buildingId ? String(input.buildingId).trim() : '';
  const brokerId = input.brokerId ? String(input.brokerId).trim() : null;
  const rawThreadId = input.threadId ? String(input.threadId).trim() : null;
  const scope: 'thread' | 'building' = input.scope ?? (rawToken ? 'thread' : 'building');
  const isAdmin = Boolean(input.isAdmin);

  if (!rawToken && !rawBuildingId) {
    return {
      ok: false,
      status: 400,
      error: '잠금 해제할 링크 토큰 또는 매물 ID가 필요합니다.',
    };
  }

  const store = getTokenStore();
  const existingMem = rawToken ? store.tokens[rawToken] : undefined;
  const existingRevokedMem = rawToken ? store.revokedTokens[rawToken] : undefined;
  const decoded = rawToken ? decodeSignedToken(rawToken) : { validSig: false };

  let dbOwnerId: string | null = null;
  let dbBuildingId: string | null = null;
  let dbClient: ShareDbClientLike | null = null;
  try {
    dbClient = asShareDbClient(createServiceClient());
    if (rawToken && dbClient) {
      const q = dbClient
        .from('im_share_links')
        .select?.('token, building_id, broker_id, status')
        ?.eq?.('token', rawToken);
      const res =
        typeof q?.maybeSingle === 'function'
          ? await q.maybeSingle()
          : typeof q?.single === 'function'
          ? await q.single()
          : null;
      const linkRow = toFirstShareRow(res?.data);
      if (linkRow?.broker_id) {
        dbOwnerId = String(linkRow.broker_id);
      }
      if (linkRow?.building_id) {
        dbBuildingId = String(linkRow.building_id);
      }
    }
  } catch {
    // ignore DB lookup error
  }

  const resolvedBuildingId =
    rawBuildingId ||
    dbBuildingId ||
    existingMem?.buildingId ||
    existingRevokedMem?.buildingId ||
    decoded.payload?.b ||
    '';

  if (!dbOwnerId && resolvedBuildingId && dbClient) {
    try {
      const wsItem = await getWorkspaceItemByAnyId(dbClient, resolvedBuildingId).catch(() => null);
      if (wsItem?.ownerId) {
        dbOwnerId = wsItem.ownerId;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedBuildingId)) {
        const bQuery = dbClient
          .from('building_ssot_lite')
          .select?.('owner_id')
          ?.eq?.('id', resolvedBuildingId);
        const bRes = typeof bQuery?.maybeSingle === 'function' ? await bQuery.maybeSingle() : null;
        const bRow = toFirstShareRow(bRes?.data);
        if (bRow?.owner_id) {
          dbOwnerId = String(bRow.owner_id);
        }
      }
    } catch {
      // ignore
    }
  }

  const tokenOwnerId =
    dbOwnerId ||
    existingMem?.brokerId ||
    existingRevokedMem?.brokerId ||
    (decoded.validSig && decoded.payload?.u ? decoded.payload.u : null);

  if (!isAdmin && brokerId && tokenOwnerId && tokenOwnerId !== brokerId) {
    return {
      ok: false,
      status: 403,
      error: '다른 개업공인중개사가 발급한 공유 링크는 다시 열 수 없습니다.',
    };
  }

  if (!isAdmin && brokerId && !tokenOwnerId && resolvedBuildingId) {
    const revBldgOwner = store.revokedBuildings[resolvedBuildingId]?.brokerId;
    if (revBldgOwner && revBldgOwner !== brokerId) {
      return {
        ok: false,
        status: 403,
        error: '다른 개업공인중개사의 매물 링크는 다시 열 수 없습니다.',
      };
    }
    const byBldg = Object.values(store.tokens).filter(
      (t) => t.buildingId === resolvedBuildingId && t.brokerId
    );
    if (byBldg.length > 0 && byBldg.every((t) => t.brokerId !== brokerId)) {
      return {
        ok: false,
        status: 403,
        error: '다른 개업공인중개사의 매물 링크는 다시 열 수 없습니다.',
      };
    }
  }

  if (rawToken) {
    delete store.revokedTokens[rawToken];
    if (store.tokens[rawToken]) {
      store.tokens[rawToken] = {
        ...store.tokens[rawToken],
        status: 'active',
        revokedAt: null,
        revokedReason: null,
      };
    }
  }

  if (scope !== 'thread' && resolvedBuildingId) {
    delete store.revokedBuildings[resolvedBuildingId];
    if (!rawToken) {
      for (const entry of Object.values(store.tokens)) {
        if (entry.buildingId === resolvedBuildingId) {
          entry.status = 'active';
          entry.revokedAt = null;
          entry.revokedReason = null;
          delete store.revokedTokens[entry.token];
        }
      }
    }
    try {
      setBuildingRevokedState(resolvedBuildingId, false, rawToken || undefined);
    } catch {
      // ignore
    }
  }

  persistTokenStore(store);

  let durablePersisted = false;
  let supabaseConfigured = false;
  try {
    const supabase = dbClient || asShareDbClient(createServiceClient());
    if (supabase) {
      supabaseConfigured = true;
      const table = supabase.from('im_share_links');
      if (rawToken && table && typeof table.update === 'function') {
        let updQ: ShareDbQueryLike | undefined = table
          .update({
            status: 'active',
            revoked_at: null,
            revoked_reason: null,
          })
          ?.eq?.('token', rawToken);
        if (brokerId && !isAdmin && typeof updQ?.eq === 'function') {
          updQ = updQ.eq('broker_id', brokerId);
        }
        const res = updQ ? await updQ : null;
        if (!res?.error) durablePersisted = true;
      } else if (scope !== 'thread' && resolvedBuildingId && table && typeof table.update === 'function') {
        let updQ: ShareDbQueryLike | undefined = table
          .update({
            status: 'active',
            revoked_at: null,
            revoked_reason: null,
          })
          ?.eq?.('building_id', resolvedBuildingId);
        if (brokerId && !isAdmin && typeof updQ?.eq === 'function') {
          updQ = updQ.eq('broker_id', brokerId);
        }
        const res = updQ ? await updQ : null;
        if (!res?.error) durablePersisted = true;
      }
      if (scope !== 'thread' && resolvedBuildingId && (brokerId || tokenOwnerId || isAdmin)) {
        await updateWorkspaceItemState(supabase, {
          id: resolvedBuildingId,
          userId: brokerId || tokenOwnerId || '',
          isAdmin,
          status: 'published',
        }).catch(() => null);
      }
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const evTable = supabase.from('activity_events');
      const evQ =
        typeof evTable.insert === 'function'
          ? evTable.insert({
              actor_id: brokerId && uuidRe.test(brokerId) ? brokerId : null,
              event_type: 'link_restored',
              entity_type: 'building',
              entity_id: uuidRe.test(resolvedBuildingId)
                ? resolvedBuildingId
                : null,
              metadata: {
                scope,
                thread_id: rawThreadId || null,
                building_id: resolvedBuildingId || null,
                share_token: rawToken || null,
                revoked: false,
              },
            })
          : null;
      const evRes = evQ ? await evQ : null;
      if (!evRes?.error) durablePersisted = true;
    }
  } catch {
    // Handled below
  }

  if (
    supabaseConfigured &&
    !durablePersisted &&
    (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1')
  ) {
    return {
      ok: false,
      status: 500,
      error: '링크 잠금 해제 상태를 서버에 저장하지 못했습니다.',
    };
  }

  return { ok: true, status: 200, buildingId: resolvedBuildingId || undefined, scope };
}

export function isBuildingShareLinkRevoked(buildingId: string): boolean {
  if (!buildingId) return false;
  const store = getTokenStore();
  return Boolean(store.revokedBuildings[buildingId]);
}

export async function isBuildingShareLinkRevokedAsync(
  buildingId: string,
  supabaseOverride?: unknown,
  opts?: { strict?: boolean }
): Promise<boolean> {
  if (!buildingId) return false;
  if (isBuildingShareLinkRevoked(buildingId)) return true;
  const strict = Boolean(opts?.strict);

  let supabase: ShareDbClientLike | null = null;
  try {
    supabase = asShareDbClient(supabaseOverride) || asShareDbClient(createServiceClient());
  } catch (err) {
    if (strict) throw err;
    return false;
  }
  if (!supabase) return false;

  try {
    const wsItem = await getWorkspaceItemByAnyId(supabase, buildingId);
    if (wsItem && (wsItem.revokedAt || wsItem.status === 'revoked')) {
      return true;
    }
  } catch (err) {
    if (strict && !isMissingRelationOrColumnError(err)) {
      throw err;
    }
  }

  const safeToken = /^[A-Za-z0-9_.:-]+$/.test(buildingId);
  const evTable = supabase.from('activity_events');
  let evQuery: ShareDbQueryLike | undefined =
    typeof evTable.select === 'function'
      ? evTable
          .select('event_type, entity_id, metadata, created_at')
          ?.in?.('event_type', ['link_revoked', 'link_restored'])
      : evTable;
  if (typeof evQuery?.or === 'function' && safeToken) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildingId)) {
      evQuery = evQuery.or(`entity_id.eq.${buildingId},metadata->>building_id.eq.${buildingId}`);
    } else {
      evQuery = evQuery.or(`metadata->>building_id.eq.${buildingId}`);
    }
  }
  if (typeof evQuery?.order === 'function') {
    evQuery = evQuery.order('created_at', { ascending: false });
  }
  if (typeof evQuery?.limit === 'function') {
    evQuery = evQuery.limit(20);
  }
  const evRes = evQuery && typeof evQuery.then === 'function' ? await evQuery : null;
  if (evRes?.error) {
    if (strict && !isMissingRelationOrColumnError(evRes.error)) {
      throw evRes.error;
    }
    return false;
  }
  const evList = Array.isArray(evRes?.data) ? evRes.data : [];
  for (const ev of evList) {
    const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, unknown>;
    const evBId = String(meta.building_id || ev?.entity_id || '').trim();
    if (evBId !== buildingId) continue;
    if (meta.scope === 'recipient_approval' || meta.scope === 'thread') continue;
    if (ev.event_type === 'link_revoked') return true;
    if (ev.event_type === 'link_restored') return false;
  }
  return false;
}

export async function verifyShareLinkToken(
  input: VerifyShareLinkInput
): Promise<VerifyShareLinkResult> {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const expectedBuildingId = input.buildingId ? String(input.buildingId).trim() : '';

  if (!token) {
    return { valid: false, reason: 'invalid' };
  }

  // Enforce production secret configuration invariant before any verification path
  getHmacSecret();

  const store = getTokenStore();

  // 1. Immediate in-memory/test revocation check
  if (store.revokedTokens[token] || store.tokens[token]?.status === 'revoked') {
    return { valid: false, reason: 'revoked' };
  }

  // WP-7.8B Inbox P0-2: For signed `slk.*` tokens, enforce cryptographic HMAC-SHA256
  // verification BEFORE accepting any DB row so unsigned/tampered `slk.*` tokens
  // never succeed even if an `im_share_links` row exists.
  const isSignedSlk = token.startsWith('slk.');
  const slkDecoded = isSignedSlk ? decodeSignedToken(token) : null;
  if (isSignedSlk && (!slkDecoded?.validSig || !slkDecoded.payload)) {
    return { valid: false, reason: 'invalid' };
  }

  const preDecodedBuildingId = slkDecoded?.payload?.b || '';
  if (isSignedSlk && expectedBuildingId && preDecodedBuildingId !== expectedBuildingId) {
    return { valid: false, reason: 'invalid' };
  }
  const targetBuildingId = expectedBuildingId || preDecodedBuildingId;
  const failClosedLookup = (): VerifyShareLinkResult => {
    recordFunnelEvent({
      funnel: 'api_availability',
      outcome: 'failed',
      code: 'LOOKUP_FAILED',
      entityId: targetBuildingId || null,
      meta: { source: 'verifyShareLinkToken' },
    });
    const out: VerifyShareLinkResult = { valid: false, reason: 'lookup_failed' };
    return out;
  };

  // 2. Check Supabase im_share_links & activity_events tables when available (Serverless Cold-Start Resilience)
  // Kernel K1 Fail-Closed: DB outages/errors must return lookup_failed and NEVER fall through to HMAC.
  const canUseMemFallback = isVitestTokenStoreEnabled() && !isRealProductionRuntime();
  let supabase: ShareDbClientLike | null = null;
  try {
    supabase = asShareDbClient(createServiceClient());
  } catch (clientErr) {
    const errMsg = clientErr instanceof Error ? clientErr.message : String(clientErr || '');
    const isJsdomClientGuard =
      canUseMemFallback && errMsg.includes('getServerEnv must not be called on the client');
    if (!isJsdomClientGuard) {
      log.warn({ errMsg }, 'verifyShareLinkToken service client init failed (fail-closed)');
      return failClosedLookup();
    }
  }

  if (!supabase && !canUseMemFallback) {
    return failClosedLookup();
  }

  let buildingRestoredInDb = false;
  if (supabase) {
    try {
      const evTable = supabase.from('activity_events');
      let evQuery: ShareDbQueryLike | undefined =
        typeof evTable.select === 'function'
          ? evTable.select('event_type, entity_id, metadata, created_at')
          : evTable;
      if (typeof evQuery?.in === 'function') {
        evQuery = evQuery.in('event_type', ['link_revoked', 'link_restored', 'thread_link_revoked']);
      }
      const safeTarget = /^[A-Za-z0-9_.:-]+$/.test(targetBuildingId);
      if (targetBuildingId && safeTarget && typeof evQuery?.or === 'function') {
        if (UUID_RE.test(targetBuildingId)) {
          evQuery = evQuery.or(`entity_id.eq.${targetBuildingId},metadata->>building_id.eq.${targetBuildingId}`);
        } else {
          evQuery = evQuery.or(`metadata->>building_id.eq.${targetBuildingId}`);
        }
      }
      if (typeof evQuery?.order === 'function') {
        evQuery = evQuery.order('created_at', { ascending: false });
      }
      if (typeof evQuery?.limit === 'function') {
        evQuery = evQuery.limit(50);
      }
      const evRes = evQuery && typeof evQuery.then === 'function' ? await evQuery : null;
      if (evRes?.error && !isMissingRelationOrColumnError(evRes.error)) {
        log.warn({ code: evRes.error.code, message: evRes.error.message }, 'verifyShareLinkToken activity_events query failed (fail-closed)');
        return failClosedLookup();
      }

      const events = Array.isArray(evRes?.data) ? evRes.data : [];
      let buildingLockState: boolean | null = null;
      let tokenLockState: boolean | null = null;

      for (const ev of events) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, unknown>;
        if (meta.scope === 'recipient_approval') continue;
        const evToken = String(meta.share_token || meta.token || '').trim();
        const evBId = String(meta.building_id || ev?.entity_id || '').trim();
        const matchesToken = Boolean(evToken && evToken === token);
        const matchesBuilding = Boolean(targetBuildingId && evBId === targetBuildingId);
        if (!matchesToken && !matchesBuilding) continue;

        if (ev.event_type === 'thread_link_revoked') {
          if (matchesToken && tokenLockState === null) {
            tokenLockState = true;
          }
          continue;
        }
        if (ev.event_type === 'link_revoked') {
          if (meta.scope === 'thread') {
            if (matchesToken && tokenLockState === null) {
              tokenLockState = true;
            }
          } else if ((matchesToken || matchesBuilding) && buildingLockState === null) {
            buildingLockState = true;
          }
          continue;
        }
        if (ev.event_type === 'link_restored') {
          if (meta.scope === 'thread') {
            if (matchesToken && tokenLockState === null) {
              tokenLockState = false;
            }
          } else {
            if (matchesToken && tokenLockState === null) {
              tokenLockState = false;
            }
            if ((matchesBuilding || !evToken) && buildingLockState === null) {
              buildingLockState = false;
            }
          }
        }
      }

      if (buildingLockState === true || tokenLockState === true) {
        return { valid: false, reason: 'revoked' };
      }
      if (buildingLockState === false) {
        buildingRestoredInDb = true;
      }
    } catch (evThrown) {
      if (!isMissingRelationOrColumnError(evThrown)) {
        log.warn({ err: evThrown }, 'verifyShareLinkToken activity_events check threw (fail-closed)');
        return failClosedLookup();
      }
    }

    try {
      const q = supabase
        .from('im_share_links')
        .select?.('token, building_id, broker_id, created_by, recipient_id, status, expires_at, revoked_at')
        ?.eq?.('token', token);
      let res =
        typeof q?.maybeSingle === 'function'
          ? await q.maybeSingle()
          : typeof q?.single === 'function'
          ? await q.single()
          : null;
      if (res?.error && isMissingRelationOrColumnError(res.error)) {
        const fbQ = supabase
          .from('im_share_links')
          .select?.('token, building_id, broker_id, recipient_id, status, expires_at, revoked_at')
          ?.eq?.('token', token);
        res =
          typeof fbQ?.maybeSingle === 'function'
            ? await fbQ.maybeSingle()
            : typeof fbQ?.single === 'function'
            ? await fbQ.single()
            : null;
      }
      if (res?.error && !isMissingRelationOrColumnError(res.error)) {
        log.warn({ code: res.error.code, message: res.error.message }, 'verifyShareLinkToken im_share_links query failed (fail-closed)');
        return failClosedLookup();
      }

      const row = toFirstShareRow(res?.data);
      if (row) {
        const rowBuildingId = row.building_id ? String(row.building_id).trim() : '';
        if (expectedBuildingId && rowBuildingId && rowBuildingId !== expectedBuildingId) {
          return { valid: false, reason: 'invalid' };
        }
        if (isSignedSlk && slkDecoded?.payload && rowBuildingId && rowBuildingId !== slkDecoded.payload.b) {
          return { valid: false, reason: 'invalid' };
        }
        if (row.status === 'revoked' || Boolean(row.revoked_at)) {
          return { valid: false, reason: 'revoked' };
        }
        const effectiveBuildingCheck = rowBuildingId || preDecodedBuildingId || expectedBuildingId;
        if (effectiveBuildingCheck && store.revokedBuildings[effectiveBuildingCheck] && !buildingRestoredInDb) {
          return { valid: false, reason: 'revoked' };
        }
        if (row.status === 'expired') {
          return { valid: false, reason: 'expired' };
        }
        if (row.status && row.status !== 'active') {
          return { valid: false, reason: 'invalid' };
        }
        if (
          (row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now()) ||
          (isSignedSlk && slkDecoded?.payload && slkDecoded.payload.exp <= Date.now())
        ) {
          return { valid: false, reason: 'expired' };
        }

        const effectiveBuildingId = effectiveBuildingCheck;
        if (!isSignedSlk) {
          const canonicalOwnerId = effectiveBuildingId
            ? await resolveCanonicalBuildingOwnerId(supabase, effectiveBuildingId)
            : null;
          const rowBrokerId = row.broker_id
            ? String(row.broker_id)
            : row.created_by
            ? String(row.created_by)
            : null;
          if (canonicalOwnerId && (!rowBrokerId || rowBrokerId !== canonicalOwnerId)) {
            return { valid: false, reason: 'invalid' };
          }
        }

        const decodedMeta = slkDecoded?.payload;
        return {
          valid: true,
          buildingId: String(effectiveBuildingId || ''),
          brokerId: row.broker_id
            ? String(row.broker_id)
            : decodedMeta?.u || null,
          recipientId: row.recipient_id
            ? String(row.recipient_id)
            : decodedMeta?.r || null,
          kind: decodedMeta?.k || 'im',
          channel: decodedMeta?.ch || null,
        };
      }
    } catch (dbThrown) {
      if (!isMissingRelationOrColumnError(dbThrown)) {
        log.warn({ err: dbThrown }, 'verifyShareLinkToken DB lookup threw (fail-closed)');
        return failClosedLookup();
      }
    }
  }

  // 3. Verify HMAC-SHA256 signed token (slk.<payload>.<sig>)
  if (isSignedSlk && slkDecoded?.validSig && slkDecoded.payload) {
    const { b, u, r, exp, k, ch } = slkDecoded.payload;
    if (expectedBuildingId && b !== expectedBuildingId) {
      return { valid: false, reason: 'invalid' };
    }
    if (store.revokedBuildings[b] && !buildingRestoredInDb) {
      return { valid: false, reason: 'revoked' };
    }
    if (exp <= Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    return {
      valid: true,
      buildingId: b,
      brokerId: u || null,
      recipientId: r || null,
      kind: k || 'im',
      channel: ch || null,
    };
  }

  // 4. Check registered in-memory token entry if any (test/vitest fallback only)
  if (!canUseMemFallback) {
    return { valid: false, reason: 'invalid' };
  }
  const memEntry = store.tokens[token];
  if (memEntry) {
    if (expectedBuildingId && memEntry.buildingId !== expectedBuildingId) {
      return { valid: false, reason: 'invalid' };
    }
    if (memEntry.status === 'revoked' || store.revokedBuildings[memEntry.buildingId]) {
      return { valid: false, reason: 'revoked' };
    }
    if (memEntry.expiresAt && new Date(memEntry.expiresAt).getTime() <= Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    return {
      valid: true,
      buildingId: memEntry.buildingId,
      brokerId: memEntry.brokerId,
      recipientId: memEntry.recipientId,
    };
  }

  return { valid: false, reason: 'invalid' };
}
