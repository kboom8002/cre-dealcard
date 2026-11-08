import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/service';
import { setBuildingRevokedState } from '@/lib/im-lite/quick-generate-store';

export interface IssueShareLinkInput {
  buildingId: string;
  brokerId?: string | null;
  recipientId?: string | null;
  ttlDays?: number;
}

export interface IssuedShareLinkToken {
  token: string;
  buildingId: string;
  brokerId: string | null;
  recipientId: string | null;
  status: 'active';
  expiresAt: string;
  shareUrl: string;
  toString(): string;
}

export interface RevokeShareLinkInput {
  token?: string | null;
  buildingId?: string | null;
  brokerId?: string | null;
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
  const ttlDays = typeof input.ttlDays === 'number' ? input.ttlDays : 30;
  const expiresAtMs = Date.now() + ttlDays * 86_400_000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const payload: SignedPayload = {
    b: buildingId,
    u: brokerId || '',
    r: recipientId || '',
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

  const shareUrl = `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(token)}`;
  return {
    token,
    buildingId,
    brokerId,
    recipientId,
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
    // If revoking by buildingId without a specific token, mark all tokens of that building revoked
    if (!rawToken) {
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
    }
    try {
      setBuildingRevokedState(resolvedBuildingId, true, rawToken || undefined);
    } catch {
      // ignore
    }
  }

  persistTokenStore(store);

  // Sync revocation to Supabase im_share_links
  try {
    const supabase = createServiceClient();
    const table: any = supabase.from('im_share_links');
    if (rawToken && table && typeof table.update === 'function') {
      const q = table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: reason,
        })
        .eq('token', rawToken);
      await q;
    } else if (resolvedBuildingId && table && typeof table.update === 'function') {
      const q = table
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
          revoked_reason: reason,
        })
        .eq('building_id', resolvedBuildingId);
      await q;
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

export async function restoreShareLinkToken(input: {
  token?: string | null;
  buildingId?: string | null;
  brokerId?: string | null;
}): Promise<{ ok: boolean; status: number }> {
  const rawToken = input.token ? String(input.token).trim() : '';
  const rawBuildingId = input.buildingId ? String(input.buildingId).trim() : '';
  const store = getTokenStore();

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

  if (rawBuildingId) {
    delete store.revokedBuildings[rawBuildingId];
    for (const entry of Object.values(store.tokens)) {
      if (entry.buildingId === rawBuildingId) {
        entry.status = 'active';
        entry.revokedAt = null;
        entry.revokedReason = null;
        delete store.revokedTokens[entry.token];
      }
    }
    try {
      setBuildingRevokedState(rawBuildingId, false, rawToken || undefined);
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
    } else if (rawBuildingId && table && typeof table.update === 'function') {
      await table
        .update({
          status: 'active',
          revoked_at: null,
          revoked_reason: null,
        })
        .eq('building_id', rawBuildingId);
    }
  } catch {
    // Non-blocking fallback
  }

  return { ok: true, status: 200 };
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

  // 2. Check Supabase im_share_links table when available
  try {
    const supabase = createServiceClient();
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
      return {
        valid: true,
        buildingId: row.building_id,
        brokerId: row.broker_id || null,
        recipientId: row.recipient_id || null,
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
    const { b, u, r, exp } = decoded.payload;
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
