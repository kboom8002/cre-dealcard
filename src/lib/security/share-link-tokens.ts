import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/service';
import { setBuildingRevokedState } from '@/lib/im-lite/quick-generate-store';

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
  reason?: string | null;
  isAdmin?: boolean;
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
  reason?: 'revoked' | 'expired' | 'invalid';
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

const SHARE_TOKEN_STORE_FILE = path.join(os.tmpdir(), 'cre-v4-share-link-tokens.json');

declare global {
  // eslint-disable-next-line no-var
  var __CRE_SHARE_LINK_TOKEN_STORE__: ShareTokenStoreState | undefined;
}

function getHmacSecret(): string {
  return (
    process.env.SHARE_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'credeal-share-link-hmac-secret-v1'
  );
}

function createEmptyStore(): ShareTokenStoreState {
  return {
    tokens: {},
    revokedTokens: {},
    revokedBuildings: {},
  };
}

function getTokenStore(): ShareTokenStoreState {
  if (!globalThis.__CRE_SHARE_LINK_TOKEN_STORE__) {
    globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = createEmptyStore();
    try {
      if (fs.existsSync(SHARE_TOKEN_STORE_FILE)) {
        const raw = fs.readFileSync(SHARE_TOKEN_STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ShareTokenStoreState>;
        globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = {
          tokens: parsed.tokens || {},
          revokedTokens: parsed.revokedTokens || {},
          revokedBuildings: parsed.revokedBuildings || {},
        };
      }
    } catch {
      // ignore disk read failure in serverless/test
    }
  }
  return globalThis.__CRE_SHARE_LINK_TOKEN_STORE__;
}

function persistTokenStore(state: ShareTokenStoreState): void {
  globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = state;
  try {
    fs.writeFileSync(SHARE_TOKEN_STORE_FILE, JSON.stringify(state), 'utf-8');
  } catch {
    // ignore disk write failure
  }
}

export function resetShareLinkTokenStoreForTests(): void {
  const empty = createEmptyStore();
  globalThis.__CRE_SHARE_LINK_TOKEN_STORE__ = empty;
  try {
    if (fs.existsSync(SHARE_TOKEN_STORE_FILE)) {
      fs.unlinkSync(SHARE_TOKEN_STORE_FILE);
    }
  } catch {
    // ignore
  }
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
    const supabase = createServiceClient();
    const table: any = supabase.from('im_share_links');
    if (table && typeof table.upsert === 'function') {
      await table.upsert(
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
    } else if (table && typeof table.insert === 'function') {
      await table.insert({
        token,
        building_id: buildingId,
        broker_id: brokerId,
        recipient_id: recipientId,
        status: 'active',
        expires_at: expiresAt,
      });
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
  const reason = input.reason ? String(input.reason).trim() : null;
  const isAdmin = Boolean(input.isAdmin);

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
  const resolvedBuildingId =
    rawBuildingId || existingMem?.buildingId || decoded.payload?.b || '';

  // Check DB record if available for ownership validation
  let dbOwnerId: string | null = null;
  try {
    const supabase = createServiceClient();
    if (rawToken) {
      const q: any = supabase
        .from('im_share_links')
        .select('token, building_id, broker_id, status')
        .eq('token', rawToken);
      const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
      if (res?.data?.broker_id) {
        dbOwnerId = String(res.data.broker_id);
      }
    }
  } catch {
    // ignore DB lookup error
  }

  const tokenOwnerId =
    dbOwnerId ||
    existingMem?.brokerId ||
    (decoded.validSig && decoded.payload?.u ? decoded.payload.u : null);

  if (!isAdmin && brokerId && tokenOwnerId && tokenOwnerId !== brokerId) {
    return {
      ok: false,
      revoked: false,
      status: 403,
      error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.',
    };
  }

  // If no token owner was known on the token itself, check building owner in memory/store
  if (!isAdmin && brokerId && !tokenOwnerId && resolvedBuildingId) {
    const byBldg = Object.values(store.tokens).filter(
      (t) => t.buildingId === resolvedBuildingId && t.brokerId
    );
    if (byBldg.length > 0 && byBldg.every((t) => t.brokerId !== brokerId)) {
      return {
        ok: false,
        revoked: false,
        status: 403,
        error: '다른 중개인의 매물 링크는 잠글 수 없습니다.',
      };
    }
  }

  const revokedAt = new Date().toISOString();

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

  if (resolvedBuildingId) {
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

  // Sync revocation to Supabase im_share_links AND activity_events (S0-4 & S1-3)
  try {
    const supabase = createServiceClient();
    const table: any = supabase.from('im_share_links');
    if (rawToken && table && typeof table.update === 'function') {
      await table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: reason,
        })
        .eq('token', rawToken);
    }
    if (resolvedBuildingId && table && typeof table.update === 'function') {
      await table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: reason,
        })
        .eq('building_id', resolvedBuildingId);
    }
    const evTable: any = supabase.from('activity_events');
    if (evTable && typeof evTable.insert === 'function') {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const entityId =
        resolvedBuildingId && uuidRe.test(resolvedBuildingId)
          ? resolvedBuildingId
          : brokerId && uuidRe.test(brokerId)
          ? brokerId
          : '00000000-0000-4000-8000-000000000000';
      await evTable.insert({
        actor_id: brokerId && uuidRe.test(brokerId) ? brokerId : entityId,
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
      });
    }
  } catch {
    // Non-blocking fallback
  }

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
  supabaseOverride?: any
): Promise<number> {
  const cleanRecipient = String(recipientId || '').trim();
  if (!cleanRecipient) return 0;

  const revokedAt = new Date().toISOString();
  const store = getTokenStore();
  let count = 0;

  for (const entry of Object.values(store.tokens)) {
    if (entry.recipientId === cleanRecipient) {
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
    const supabase = supabaseOverride || createServiceClient();
    const table: any = supabase.from('im_share_links');
    if (table && typeof table.update === 'function') {
      await table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: 'gate_expired',
        })
        .eq('recipient_id', cleanRecipient);
    }
  } catch {
    // Non-blocking fallback
  }

  return count;
}

export async function restoreShareLinkToken(input: {
  token?: string | null;
  buildingId?: string | null;
  brokerId?: string | null;
  isAdmin?: boolean;
}): Promise<{ ok: boolean; status: number; buildingId?: string; error?: string }> {
  const rawToken = input.token ? String(input.token).trim() : '';
  const rawBuildingId = input.buildingId ? String(input.buildingId).trim() : '';
  const brokerId = input.brokerId ? String(input.brokerId).trim() : null;
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
  try {
    const supabase = createServiceClient();
    if (rawToken) {
      const q: any = supabase
        .from('im_share_links')
        .select('token, building_id, broker_id, status')
        .eq('token', rawToken);
      const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
      if (res?.data?.broker_id) {
        dbOwnerId = String(res.data.broker_id);
      }
      if (res?.data?.building_id) {
        dbBuildingId = String(res.data.building_id);
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

  const tokenOwnerId =
    dbOwnerId ||
    existingMem?.brokerId ||
    existingRevokedMem?.brokerId ||
    (decoded.validSig && decoded.payload?.u ? decoded.payload.u : null);

  if (!isAdmin && brokerId && tokenOwnerId && tokenOwnerId !== brokerId) {
    return {
      ok: false,
      status: 403,
      error: '다른 중개인이 발급한 공유 링크는 다시 열 수 없습니다.',
    };
  }

  if (!isAdmin && brokerId && !tokenOwnerId && resolvedBuildingId) {
    const revBldgOwner = store.revokedBuildings[resolvedBuildingId]?.brokerId;
    if (revBldgOwner && revBldgOwner !== brokerId) {
      return {
        ok: false,
        status: 403,
        error: '다른 중개인의 매물 링크는 다시 열 수 없습니다.',
      };
    }
    const byBldg = Object.values(store.tokens).filter(
      (t) => t.buildingId === resolvedBuildingId && t.brokerId
    );
    if (byBldg.length > 0 && byBldg.every((t) => t.brokerId !== brokerId)) {
      return {
        ok: false,
        status: 403,
        error: '다른 중개인의 매물 링크는 다시 열 수 없습니다.',
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

  if (resolvedBuildingId) {
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

  try {
    const supabase = createServiceClient();
    const table: any = supabase.from('im_share_links');
    if (rawToken && table && typeof table.update === 'function') {
      await table
        .update({
          status: 'active',
          revoked_at: null,
          revoked_reason: null,
        })
        .eq('token', rawToken);
    } else if (resolvedBuildingId && table && typeof table.update === 'function') {
      await table
        .update({
          status: 'active',
          revoked_at: null,
          revoked_reason: null,
        })
        .eq('building_id', resolvedBuildingId);
    }
  } catch {
    // Non-blocking fallback
  }

  return { ok: true, status: 200, buildingId: resolvedBuildingId || undefined };
}

export function isBuildingShareLinkRevoked(buildingId: string): boolean {
  if (!buildingId) return false;
  const store = getTokenStore();
  return Boolean(store.revokedBuildings[buildingId]);
}

export async function verifyShareLinkToken(
  input: VerifyShareLinkInput
): Promise<VerifyShareLinkResult> {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const expectedBuildingId = input.buildingId ? String(input.buildingId).trim() : '';

  if (!token) {
    return { valid: false, reason: 'invalid' };
  }

  const store = getTokenStore();

  // 1. Immediate in-memory/file revocation check
  if (store.revokedTokens[token] || store.tokens[token]?.status === 'revoked') {
    return { valid: false, reason: 'revoked' };
  }

  const preDecodedBuildingId = token.startsWith('slk.')
    ? decodeSignedToken(token).payload?.b || ''
    : '';
  const targetBuildingId = expectedBuildingId || preDecodedBuildingId;

  // 2. Check Supabase im_share_links & activity_events tables when available (Serverless Cold-Start Resilience)
  try {
    const supabase = createServiceClient();
    try {
      let evQuery: any = supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at');
      if (typeof evQuery.in === 'function') {
        evQuery = evQuery.in('event_type', ['link_revoked', 'link_restored']);
      }
      if (typeof evQuery.order === 'function') {
        evQuery = evQuery.order('created_at', { ascending: false });
      }
      if (typeof evQuery.limit === 'function') {
        evQuery = evQuery.limit(200);
      }
      const evRes = await evQuery;
      const events = Array.isArray(evRes?.data) ? evRes.data : [];
      for (const ev of events) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
        const evToken = String(meta.share_token || meta.token || '').trim();
        const evBId = String(meta.building_id || ev?.entity_id || '').trim();
        const matchesToken = Boolean(evToken && evToken === token);
        const matchesBuilding = Boolean(targetBuildingId && evBId === targetBuildingId);
        if (!matchesToken && !matchesBuilding) continue;

        if (ev.event_type === 'link_revoked') {
          return { valid: false, reason: 'revoked' };
        }
        if (ev.event_type === 'link_restored') {
          if (matchesToken || meta.scope !== 'recipient_approval') {
            break;
          }
        }
      }
    } catch {
      // non-blocking if activity_events unavailable
    }

    const q: any = supabase
      .from('im_share_links')
      .select('token, building_id, broker_id, recipient_id, status, expires_at, revoked_at')
      .eq('token', token);
    const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
    const row = res?.data;
    if (row) {
      if (expectedBuildingId && row.building_id && String(row.building_id) !== expectedBuildingId) {
        return { valid: false, reason: 'invalid' };
      }
      if (row.status === 'revoked' || Boolean(row.revoked_at)) {
        return { valid: false, reason: 'revoked' };
      }
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        return { valid: false, reason: 'expired' };
      }
      const decodedMeta = token.startsWith('slk.') ? decodeSignedToken(token).payload : undefined;
      return {
        valid: true,
        buildingId: row.building_id,
        brokerId: row.broker_id || null,
        recipientId: row.recipient_id || null,
        kind: decodedMeta?.k || 'im',
        channel: decodedMeta?.ch || null,
      };
    }
  } catch {
    // Fall through to HMAC & in-memory verification
  }

  // 3. Verify HMAC-SHA256 signed token (slk.<payload>.<sig>)
  if (token.startsWith('slk.')) {
    const decoded = decodeSignedToken(token);
    if (!decoded.validSig || !decoded.payload) {
      return { valid: false, reason: 'invalid' };
    }
    const { b, u, r, exp, k, ch } = decoded.payload;
    if (expectedBuildingId && b !== expectedBuildingId) {
      return { valid: false, reason: 'invalid' };
    }
    if (store.revokedBuildings[b]) {
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

  // 4. Check registered in-memory token entry if any
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
