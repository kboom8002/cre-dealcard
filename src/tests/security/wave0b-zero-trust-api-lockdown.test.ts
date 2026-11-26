/**
 * Wave 0 Track 0B — Edge Proxy Boundary & Critical API Security Lockdown Suite
 *
 * Verifies:
 *  1. proxy.ts matcher covers /api/*, strips untrusted internal headers before forwarding,
 *     returns JSON 404 for dormant/experimental /api/* routes, and skips remote auth getUser() on /api/*.
 *  2. SHA-256 + timingSafeEqual secret verification in qa-gate.ts and inter-service-auth.ts.
 *  3. /api/identity/{party,condition,bind} requireBroker (401/403) + owner_broker_id scoping + error masking.
 *  4. /api/onboarding/save-profile blocks public_user -> broker escalation in real production & preserves admin.
 *  5. /api/public/transactions removes unauthenticated POST ETL trigger & sanitizes GET 500 errors.
 *  6. /api/full-im-handoffs enforces requireBroker + building/document ownership + trusted base URL,
 *     and GET /api/full-im-handoffs/[id] enforces validateInterServiceRequest across all envs.
 *  7. circle-service / circle-sharing-service / circle-matching-service enforce active membership,
 *     asset ownership, and PostgREST .or() filter sanitization.
 *  8. /api/funding/** (analytics admin-only, kyc_verified never trusted from non-admin, strict Zod PUT allowlist),
 *     /api/broker/prediction/cluster-buyers admin-only, and qa-workbench probe draft 403 + QA_PORTAL_PASSCODE.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const BROKER_A = '11111111-1111-4111-8111-111111111111';
const BROKER_B = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const PUBLIC_USER_ID = '33333333-3333-4333-8333-333333333333';
const PARTY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BLD_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BLD_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DOC_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DOC_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CIRCLE_1 = '12121212-1212-4212-8212-121212121212';

type Row = Record<string, any>;
type Filter = { op: 'eq' | 'in'; col: string; val: any };

interface RecordedOp {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: any;
  filters: Filter[];
  orExprs: string[];
}

function createFakeDb(
  seed: Record<string, Row[]>,
  opts: { errorOnTable?: Record<string, string> } = {},
) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const ops: RecordedOp[] = [];

  const applyFilters = (rows: Row[], filters: Filter[]) =>
    rows.filter((row) =>
      filters.every((f) => {
        if (f.op === 'eq') return row[f.col] === f.val;
        if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(row[f.col]);
        return true;
      }),
    );

  const from = vi.fn((table: string) => {
    const filters: Filter[] = [];
    const orExprs: string[] = [];
    let pendingOp: RecordedOp['op'] = 'select';
    let pendingPayload: any;
    let isCountHead = false;

    const execute = () => {
      ops.push({
        table,
        op: pendingOp,
        payload: pendingPayload,
        filters: [...filters],
        orExprs: [...orExprs],
      });

      const forcedMsg = opts.errorOnTable?.[table];
      if (forcedMsg) {
        return { data: null, error: { message: forcedMsg, code: 'XX000' }, count: null };
      }

      const currentRows = tables[table] ?? [];

      if (pendingOp === 'insert') {
        const arr = Array.isArray(pendingPayload) ? pendingPayload : [pendingPayload];
        const inserted = arr.map((item, idx) => ({
          id: item.id ?? `${table}-id-${idx + 1}`,
          handoff_token: item.handoff_token ?? 'tok_handoff_001',
          expires_at: item.expires_at ?? new Date(Date.now() + 3600_000).toISOString(),
          ...item,
        }));
        tables[table] = [...currentRows, ...inserted];
        return {
          data: Array.isArray(pendingPayload) ? inserted : inserted[0],
          error: null,
          count: inserted.length,
        };
      }

      if (pendingOp === 'update') {
        const matched = applyFilters(currentRows, filters);
        for (const r of matched) {
          Object.assign(r, pendingPayload);
        }
        return { data: matched, error: null, count: matched.length };
      }

      if (pendingOp === 'upsert') {
        const row = { id: pendingPayload?.id ?? `${table}-upsert-1`, ...pendingPayload };
        tables[table] = [...currentRows, row];
        return { data: row, error: null, count: 1 };
      }

      if (pendingOp === 'delete') {
        const matchedSet = new Set(applyFilters(currentRows, filters));
        tables[table] = currentRows.filter((r) => !matchedSet.has(r));
        return { data: null, error: null, count: matchedSet.size };
      }

      let matched = applyFilters(currentRows, filters);
      if (orExprs.length > 0) {
        matched = matched.filter((row) =>
          orExprs.every((expr) =>
            expr.split(',').some((clause) => {
              const m = clause.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
              return m ? String(row[m[1]] ?? '') === m[2] : false;
            }),
          ),
        );
      }
      if (isCountHead) {
        return { data: null, error: null, count: matched.length };
      }
      return { data: matched, error: null, count: matched.length };
    };

    const builder: any = {
      select(_cols?: string, selectOpts?: { count?: string; head?: boolean }) {
        if (selectOpts?.head) isCountHead = true;
        return builder;
      },
      insert(payload: any) {
        pendingOp = 'insert';
        pendingPayload = payload;
        return builder;
      },
      update(payload: any) {
        pendingOp = 'update';
        pendingPayload = payload;
        return builder;
      },
      upsert(payload: any) {
        pendingOp = 'upsert';
        pendingPayload = payload;
        return builder;
      },
      delete() {
        pendingOp = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ op: 'eq', col, val });
        return builder;
      },
      in(col: string, val: unknown[]) {
        filters.push({ op: 'in', col, val });
        return builder;
      },
      or(expr: string) {
        orExprs.push(expr);
        return builder;
      },
      gte() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
        return { data: row, error: null };
      },
      async single() {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
        if (!row) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        return { data: row, error: null };
      },
      then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  });

  return { tables, ops, client: { from } };
}

const hoisted = vi.hoisted(() => ({
  getUserSpy: vi.fn(async () => ({ data: { user: null }, error: null })),
  mockVerifyAuth: vi.fn(),
  mockRequireBroker: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockFetchMolitTransactions: vi.fn(),
  mockGetWorkspaceItemByAnyId: vi.fn(),
}));

let fakeDb = createFakeDb({});
let serverSessionUser: { id: string; email?: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: hoisted.getUserSpy,
    },
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => fakeDb.client,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: serverSessionUser }, error: null }),
    },
    from: fakeDb.client.from,
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  verifyAuth: (...args: unknown[]) => hoisted.mockVerifyAuth(...args),
  requireBroker: (...args: unknown[]) => hoisted.mockRequireBroker(...args),
  requireAdmin: (...args: unknown[]) => hoisted.mockRequireAdmin(...args),
}));

vi.mock('@/domain/prediction/price-prediction', () => ({
  fetchMolitTransactions: (...args: unknown[]) => hoisted.mockFetchMolitTransactions(...args),
}));

vi.mock('@/lib/notifications/in-app', () => ({
  createNotification: vi.fn(async () => true),
}));

vi.mock('@/lib/workspace/workspace-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/workspace-repository')>();
  return {
    ...actual,
    getWorkspaceItemByAnyId: (...args: unknown[]) => hoisted.mockGetWorkspaceItemByAnyId(...args),
  };
});

import { config as proxyConfig, proxy } from '@/proxy';
import {
  constantTimeEqualStr,
  resolveQaKeyFromRequest,
} from '@/lib/security/qa-gate';
import { validateInterServiceRequest } from '@/lib/inter-service-auth';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';

function setAuthState(
  user: { id: string; email?: string } | null,
  role: 'broker' | 'admin' | 'public_user' | null,
) {
  serverSessionUser = user;

  if (!user) {
    const unauthErr = () =>
      NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 },
      );
    hoisted.mockVerifyAuth.mockImplementation(async () => ({
      user: null,
      role: null,
      profile: null,
      error: unauthErr(),
    }));
    hoisted.mockRequireBroker.mockImplementation(async () => ({
      user: null,
      role: null,
      profile: null,
      error: unauthErr(),
    }));
    hoisted.mockRequireAdmin.mockImplementation(async () => ({
      user: null,
      role: null,
      profile: null,
      error: unauthErr(),
    }));
    return;
  }

  hoisted.mockVerifyAuth.mockImplementation(async () => ({
    user,
    role,
    profile: role ? { role, display_name: '테스트 사용자' } : null,
    error: null,
  }));

  if (role === 'broker' || role === 'admin') {
    hoisted.mockRequireBroker.mockImplementation(async () => ({
      user,
      role,
      profile: { role, display_name: '테스트 브로커' },
      error: null,
    }));
  } else {
    hoisted.mockRequireBroker.mockImplementation(async () => ({
      user,
      role,
      profile: role ? { role, display_name: '일반 사용자' } : null,
      error: NextResponse.json(
        { ok: false, error: { code: 'FORBIDDEN', message: '중개사 권한이 필요합니다.' } },
        { status: 403 },
      ),
    }));
  }

  if (role === 'admin') {
    hoisted.mockRequireAdmin.mockImplementation(async () => ({
      user,
      role: 'admin',
      profile: { role: 'admin', display_name: '관리자' },
      error: null,
    }));
  } else {
    hoisted.mockRequireAdmin.mockImplementation(async () => ({
      user,
      role,
      profile: role ? { role, display_name: '비관리자' } : null,
      error: NextResponse.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'admin 권한이 필요합니다.' } },
        { status: 403 },
      ),
    }));
  }
}

function seedDefaultTables(errorOnTable?: Record<string, string>) {
  return createFakeDb(
    {
      profiles: [
        { id: BROKER_A, role: 'broker', display_name: '브로커A', phone: '010-1111-1111' },
        { id: BROKER_B, role: 'broker', display_name: '브로커B', phone: '010-2222-2222' },
        { id: ADMIN_ID, role: 'admin', display_name: '관리자', phone: '010-9999-9999' },
        { id: PUBLIC_USER_ID, role: 'public_user', display_name: '일반인', phone: '010-3333-3333' },
      ],
      broker_profiles: [],
      onboarding_sessions: [
        {
          session_token: 'sess-valid-001',
          photo_url: null,
          vibe_vector: null,
        },
      ],
      party: [
        {
          id: PARTY_A,
          tenant_id: BROKER_A,
          owner_broker_id: BROKER_A,
          name: '고객A',
          phone_e164: '+821012345678',
          entity_type: 'individual',
          consent_version: 'v1',
          consent_at: '2026-11-20T00:00:00Z',
          retention_until: '2027-11-20',
          created_at: '2026-11-20T00:00:00Z',
        },
        {
          id: PARTY_B,
          tenant_id: BROKER_B,
          owner_broker_id: BROKER_B,
          name: '고객B',
          phone_e164: '+821087654321',
          entity_type: 'corp',
          consent_version: 'v1',
          consent_at: '2026-11-20T00:00:00Z',
          retention_until: '2027-11-20',
          created_at: '2026-11-20T00:00:00Z',
        },
      ],
      buyer_condition: [],
      recipient: [
        { id: 'rec-a', tenant_id: BROKER_A, broker_id: BROKER_A, label: '수신자A', party_id: null },
        { id: 'rec-b', tenant_id: BROKER_B, broker_id: BROKER_B, label: '수신자B', party_id: null },
      ],
      track_event: [],
      activity_events: [],
      building_ssot_lite: [
        { id: BLD_A, owner_id: BROKER_A, area_signal: '강남구 역삼동', status: 'active' },
        { id: BLD_B, owner_id: BROKER_B, area_signal: '서초구 서초동', status: 'active' },
      ],
      buyer_intent_lite: [
        { id: 'intent-b', owner_id: BROKER_B, buyer_type: '법인', budget_display: '100억' },
      ],
      document_objects: [
        { id: DOC_A, owner_id: BROKER_A, building_id: BLD_A, source_id: BLD_A, status: 'published' },
        { id: DOC_B, owner_id: BROKER_B, building_id: BLD_B, source_id: BLD_B, status: 'published' },
      ],
      full_im_handoffs: [],
      broker_circles: [
        {
          id: CIRCLE_1,
          name: '강남 탑티어 서클',
          description: null,
          created_by: BROKER_A,
          avatar_emoji: '🤝',
          invite_code: 'SECRET-INVITE-999',
          max_members: 10,
          is_active: true,
          created_at: '2026-11-20T00:00:00Z',
          updated_at: '2026-11-20T00:00:00Z',
        },
      ],
      broker_circle_members: [
        {
          id: 'mem-owner-a',
          circle_id: CIRCLE_1,
          broker_id: BROKER_A,
          role: 'owner',
          status: 'active',
          invited_by: null,
          joined_at: '2026-11-20T00:00:00Z',
          created_at: '2026-11-20T00:00:00Z',
          profile: { display_name: '브로커A', company: '알파중개', phone: '010-1111-1111' },
        },
      ],
      circle_shared_assets: [],
      circle_match_results: [],
      funding_projects: [
        {
          id: 'proj-a',
          operator_id: BROKER_A,
          project_name: '역삼 STO 1호',
          asset_type: 'real_estate',
          target_amount: 1_000_000_000,
          current_amount: 0,
          investor_count: 0,
          status: 'draft',
          is_public: false,
        },
      ],
      funding_failure_logs: [],
      investor_profiles: [],
    },
    { errorOnTable },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimitBuckets();
  fakeDb = seedDefaultTables();
  setAuthState(null, null);
  hoisted.mockGetWorkspaceItemByAnyId.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Edge Proxy Boundary (/api/* header stripping & dormant/experimental 404)
// ─────────────────────────────────────────────────────────────────────────────
describe('1. proxy.ts /api/* header stripping, dormant/experimental 404 & zero auth round-trips', () => {
  it('includes /api/* in config.matcher and strips spoofed internal headers with zero auth getUser() calls', async () => {
    expect(proxyConfig.matcher).toEqual([
      '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
    ]);

    const spoofedApiReq = new NextRequest('https://www.credeal.net/api/broker/deal-card', {
      headers: {
        'x-cre-proxy-secret': 'forged-secret',
        'x-cre-verified-user': encodeURIComponent(JSON.stringify({ id: ADMIN_ID })),
        'x-qa-gate-verified': '1',
        'x-trace-id': 'keep-trace-123',
      },
    });

    const res = await proxy(spoofedApiReq);
    expect(res.status).toBe(200);
    expect(spoofedApiReq.headers.get('x-cre-proxy-secret')).toBeNull();
    expect(spoofedApiReq.headers.get('x-cre-verified-user')).toBeNull();
    expect(spoofedApiReq.headers.get('x-qa-gate-verified')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-cre-proxy-secret')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-cre-verified-user')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-qa-gate-verified')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-trace-id')).toBe('keep-trace-123');
    expect(hoisted.getUserSpy).not.toHaveBeenCalled();
  });

  it('returns JSON 404 + noindex for dormant & disabled experimental /api/* prefixes, and opens experimental when flag=1', async () => {
    vi.stubEnv('CRE_ENABLE_EXPERIMENTAL_VERTICALS', '');

    for (const apiPath of [
      '/api/agora/threads',
      '/api/vendor/profile',
      '/api/public/building-radar/generate',
      '/api/funding/match',
      '/api/broker/circles',
      '/api/broker/schedule/slots',
      '/api/onboarding/save-profile',
    ]) {
      const res = await proxy(new NextRequest(`https://www.credeal.net${apiPath}`));
      expect(res.status, `${apiPath} should 404`).toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(await res.json()).toEqual({ ok: false, error: 'Not Found' });
    }

    vi.stubEnv('CRE_ENABLE_EXPERIMENTAL_VERTICALS', '1');
    for (const expPath of ['/api/funding/match', '/api/broker/circles', '/api/onboarding/save-profile']) {
      const openRes = await proxy(new NextRequest(`https://www.credeal.net${expPath}`));
      expect(openRes.status).toBe(200);
    }
    // Dormant API routes remain 404 even when experimental flag is enabled
    const dormantStillBlocked = await proxy(
      new NextRequest('https://www.credeal.net/api/agora/threads'),
    );
    expect(dormantStillBlocked.status).toBe(404);
  });

  it('verifies QA keys (including QA_PORTAL_PASSCODE) and inter-service keys via constant-time SHA-256 digests', () => {
    expect(constantTimeEqualStr('alpha-secret', 'alpha-secret')).toBe(true);
    expect(constantTimeEqualStr('alpha-secret', 'short')).toBe(false);
    expect(constantTimeEqualStr('', 'alpha-secret')).toBe(false);

    const passReq = new NextRequest('https://www.credeal.net/api/public/qa-sample-kit', {
      headers: { 'x-qa-passcode': 'portal-pass-2026' },
    });
    expect(
      resolveQaKeyFromRequest(passReq, { QA_PORTAL_PASSCODE: 'portal-pass-2026' }),
    ).toEqual({ role: 'master', allowed: true, queryKey: '' });

    vi.stubEnv('INTER_SERVICE_API_KEY', '   ');
    expect(
      validateInterServiceRequest(
        new Request('http://localhost/test', { headers: { 'x-service-api-key': '   ' } }),
      ),
    ).toBe(false);

    vi.stubEnv('INTER_SERVICE_API_KEY', 'svc-shared-secret-2026');
    expect(
      validateInterServiceRequest(
        new Request('http://localhost/test', {
          headers: { 'x-service-api-key': 'svc-shared-secret-2026' },
        }),
      ),
    ).toBe(true);
    expect(
      validateInterServiceRequest(
        new Request('http://localhost/test', { headers: { 'x-service-api-key': 'wrong' } }),
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /api/identity/{party,condition,bind} Auth & Owner Scoping
// ─────────────────────────────────────────────────────────────────────────────
describe('2. /api/identity/{party,condition,bind} — requireBroker & owner_broker_id scoping', () => {
  it('enforces 401 unauthenticated, 403 non-broker, and 403 cross-broker IDOR on party/condition/bind', async () => {
    const { POST: postParty, DELETE: delParty } = await import('@/app/api/identity/party/route');
    const { GET: getCond, POST: postCond } = await import('@/app/api/identity/condition/route');
    const { POST: postBind } = await import('@/app/api/identity/bind/route');

    // 1) Unauthenticated -> 401
    setAuthState(null, null);
    expect(
      (
        await postParty(
          new NextRequest('http://localhost/api/identity/party', {
            method: 'POST',
            body: JSON.stringify({ name: '홍길동', phone: '010-5555-6666' }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await delParty(new NextRequest(`http://localhost/api/identity/party?id=${PARTY_B}`, { method: 'DELETE' })))
        .status,
    ).toBe(401);

    // 2) public_user -> 403
    setAuthState({ id: PUBLIC_USER_ID, email: 'pub@credeal.kr' }, 'public_user');
    expect(
      (
        await postParty(
          new NextRequest('http://localhost/api/identity/party', {
            method: 'POST',
            body: JSON.stringify({ name: '홍길동', phone: '010-5555-6666' }),
          }),
        )
      ).status,
    ).toBe(403);

    // 3) Broker A spoofing ownerBrokerId = Broker B -> 403
    setAuthState({ id: BROKER_A, email: 'a@credeal.kr' }, 'broker');
    const spoofOwnerRes = await postParty(
      new NextRequest('http://localhost/api/identity/party', {
        method: 'POST',
        body: JSON.stringify({
          ownerBrokerId: BROKER_B,
          tenantId: BROKER_B,
          name: '홍길동',
          phone: '010-5555-6666',
          entityType: 'individual',
          consentVersion: 'v1',
        }),
      }),
    );
    expect(spoofOwnerRes.status).toBe(403);

    // 4) Broker A deleting Broker B's party -> 403 and party_B remains intact
    const crossDeleteRes = await delParty(
      new NextRequest(`http://localhost/api/identity/party?id=${PARTY_B}`, { method: 'DELETE' }),
    );
    expect(crossDeleteRes.status).toBe(403);
    expect(fakeDb.tables.party.some((p) => p.id === PARTY_B)).toBe(true);

    // 5) Broker A reading/inserting condition or binding on Broker B's party -> 403
    expect(
      (await getCond(new NextRequest(`http://localhost/api/identity/condition?partyId=${PARTY_B}`))).status,
    ).toBe(403);
    expect(
      (
        await postCond(
          new NextRequest('http://localhost/api/identity/condition', {
            method: 'POST',
            body: JSON.stringify({ partyId: PARTY_B, source: 'broker_note', confidence: 'low' }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postBind(
          new NextRequest('http://localhost/api/identity/bind', {
            method: 'POST',
            body: JSON.stringify({ type: 'recipient', recipientId: 'rec-b', partyId: PARTY_A }),
          }),
        )
      ).status,
    ).toBe(403);

    // 6) Raw DB error messages are never leaked on 500
    fakeDb = seedDefaultTables({ party: 'PG_SECRET_CONSTRAINT_PARTY_PKEY' });
    const errRes = await postParty(
      new NextRequest('http://localhost/api/identity/party', {
        method: 'POST',
        body: JSON.stringify({
          name: '신규매수자',
          phone: '010-7777-8888',
          entityType: 'individual',
          consentVersion: 'v1',
        }),
      }),
    );
    expect(errRes.status).toBe(500);
    expect(JSON.stringify(await errRes.json())).not.toContain('PG_SECRET_CONSTRAINT_PARTY_PKEY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /api/onboarding/save-profile Role Escalation & Admin Preservation
// ─────────────────────────────────────────────────────────────────────────────
describe('3. POST /api/onboarding/save-profile — blocks public_user->broker & preserves admin', () => {
  it('returns 403 FORBIDDEN for public_user in real production when ALLOW_ALPHA_ROLE_UPGRADE is not true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod-project.supabase.co');
    vi.stubEnv('ALLOW_ALPHA_ROLE_UPGRADE', '');

    setAuthState({ id: PUBLIC_USER_ID, email: 'user@credeal.kr' }, 'public_user');

    const { POST } = await import('@/app/api/onboarding/save-profile/route');
    const res = await POST(
      new NextRequest('https://www.credeal.net/api/onboarding/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: 'sess-valid-001', user_name: '공격자' }),
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(fakeDb.tables.profiles.find((p) => p.id === PUBLIC_USER_ID)?.role).toBe('public_user');
  });

  it('never overwrites profiles.role === "admin" to "broker"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod-project.supabase.co');

    setAuthState({ id: ADMIN_ID, email: 'admin@credeal.kr' }, 'admin');

    const { POST } = await import('@/app/api/onboarding/save-profile/route');
    const res = await POST(
      new NextRequest('https://www.credeal.net/api/onboarding/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: 'sess-valid-001', user_name: '슈퍼관리자' }),
      }),
    );

    expect(res.status).toBe(200);
    const adminRow = fakeDb.tables.profiles.find((p) => p.id === ADMIN_ID);
    expect(adminRow?.role).toBe('admin');
    expect(adminRow?.display_name).toBe('슈퍼관리자');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. /api/public/transactions — No POST Export & Sanitized 500
// ─────────────────────────────────────────────────────────────────────────────
describe('4. /api/public/transactions — POST removed & GET sanitized', () => {
  it('does not export POST and masks internal errors on GET 500', async () => {
    const mod = (await import('@/app/api/public/transactions/route')) as Record<string, unknown>;
    expect(mod.POST).toBeUndefined();
    expect(typeof mod.GET).toBe('function');

    hoisted.mockFetchMolitTransactions.mockRejectedValueOnce(
      new Error('MOLIT_SECRET_SERVICE_KEY_LEAK_999'),
    );
    const res = await (mod.GET as (r: NextRequest) => Promise<Response>)(
      new NextRequest(
        'http://localhost/api/public/transactions?districtCode=11680&yearMonth=202506',
      ),
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('MOLIT_SECRET_SERVICE_KEY_LEAK_999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. /api/full-im-handoffs & /api/full-im-handoffs/[id]
// ─────────────────────────────────────────────────────────────────────────────
describe('5. /api/full-im-handoffs — auth, ownership, trusted base URL & inter-service key', () => {
  it('enforces 401/403 on POST, blocks foreign document_objects, and ignores untrusted full_im_studio_base_url', async () => {
    vi.stubEnv('FULL_IM_STUDIO_BASE_URL', 'https://studio.credeal.net');
    const { POST } = await import('@/app/api/full-im-handoffs/route');

    // 1) Unauthenticated -> 401
    setAuthState(null, null);
    const unauthRes = await POST(
      new NextRequest('http://localhost/api/full-im-handoffs', {
        method: 'POST',
        body: JSON.stringify({
          source_building_ssot_lite_id: BLD_A,
          requested_output: 'buyer_ready_full_im',
        }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    // 2) Broker A attempting handoff on Broker B's building -> 403
    setAuthState({ id: BROKER_A, email: 'a@credeal.kr' }, 'broker');
    const foreignBldRes = await POST(
      new NextRequest('http://localhost/api/full-im-handoffs', {
        method: 'POST',
        body: JSON.stringify({
          source_building_ssot_lite_id: BLD_B,
          requested_output: 'buyer_ready_full_im',
        }),
      }),
    );
    expect(foreignBldRes.status).toBe(403);

    // 3) Broker A attaching Broker B's document_objects to own building -> 403
    const foreignDocRes = await POST(
      new NextRequest('http://localhost/api/full-im-handoffs', {
        method: 'POST',
        body: JSON.stringify({
          source_building_ssot_lite_id: BLD_A,
          source_document_ids: [DOC_B],
          requested_output: 'buyer_ready_full_im',
        }),
      }),
    );
    expect(foreignDocRes.status).toBe(403);

    // 4) Valid owner handoff ignores untrusted body full_im_studio_base_url
    const okRes = await POST(
      new NextRequest('http://localhost/api/full-im-handoffs', {
        method: 'POST',
        body: JSON.stringify({
          source_building_ssot_lite_id: BLD_A,
          source_document_ids: [DOC_A],
          requested_output: 'buyer_ready_full_im',
          full_im_studio_base_url: 'https://evil-phishing.example.com',
        }),
      }),
    );
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.ok).toBe(true);
    expect(okJson.data.handoff_url.startsWith('https://studio.credeal.net/im-projects/import?')).toBe(
      true,
    );
    expect(okJson.data.handoff_url).not.toContain('evil-phishing');
  });

  it('enforces validateInterServiceRequest across all envs on GET /api/full-im-handoffs/[id]', async () => {
    vi.stubEnv('INTER_SERVICE_API_KEY', 'inter-service-key-xyz');
    const { GET } = await import('@/app/api/full-im-handoffs/[id]/route');

    // Without key in test/dev -> 401
    vi.stubEnv('NODE_ENV', 'development');
    const devUnauth = await GET(new Request('http://localhost/api/full-im-handoffs/tok-1'), {
      params: Promise.resolve({ id: 'tok-1' }),
    });
    expect(devUnauth.status).toBe(401);

    // x-test-bypass is REJECTED outside NODE_ENV === 'test'
    const bypassInDev = await GET(
      new Request('http://localhost/api/full-im-handoffs/tok-1', {
        headers: { 'x-test-bypass': '1' },
      }),
      { params: Promise.resolve({ id: 'tok-1' }) },
    );
    expect(bypassInDev.status).toBe(401);

    // Valid x-service-api-key passes auth (404 when token does not exist)
    const authedMissing = await GET(
      new Request('http://localhost/api/full-im-handoffs/tok-missing', {
        headers: { 'x-service-api-key': 'inter-service-key-xyz' },
      }),
      { params: Promise.resolve({ id: 'tok-missing' }) },
    );
    expect(authedMissing.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Circles Membership, Asset Ownership & PostgREST Filter Injection Protection
// ─────────────────────────────────────────────────────────────────────────────
describe('6. circle-service — active membership, asset ownership & PostgREST injection stripping', () => {
  it('blocks non-members across getCircleDetail, getSharedAssets, getCircleMatches, runFullCircleMatch, inviteMember', async () => {
    const { getCircleDetail, inviteMember, CircleAccessError } = await import(
      '@/domain/team/circle-service'
    );
    const { getSharedAssets, shareAssetToCircle } = await import(
      '@/domain/team/circle-sharing-service'
    );
    const { getCircleMatches, runFullCircleMatch } = await import(
      '@/domain/team/circle-matching-service'
    );

    // Non-member Broker B cannot read invite_code or member phones
    await expect(getCircleDetail(CIRCLE_1, BROKER_B)).rejects.toBeInstanceOf(CircleAccessError);
    await expect(getSharedAssets(CIRCLE_1, BROKER_B)).rejects.toBeInstanceOf(CircleAccessError);
    await expect(getCircleMatches(CIRCLE_1, BROKER_B)).rejects.toBeInstanceOf(CircleAccessError);
    await expect(runFullCircleMatch(CIRCLE_1, BROKER_B)).rejects.toBeInstanceOf(CircleAccessError);
    await expect(
      inviteMember({
        circleId: CIRCLE_1,
        inviterBrokerId: BROKER_B,
        inviteeIdentifier: '010-3333-3333',
      }),
    ).rejects.toBeInstanceOf(CircleAccessError);

    // Member Broker A cannot share Broker B's building or buyer_intent
    await expect(
      shareAssetToCircle({
        circleId: CIRCLE_1,
        brokerId: BROKER_A,
        assetType: 'building',
        assetId: BLD_B,
      }),
    ).rejects.toBeInstanceOf(CircleAccessError);

    await expect(
      shareAssetToCircle({
        circleId: CIRCLE_1,
        brokerId: BROKER_A,
        assetType: 'buyer_intent',
        assetId: 'intent-b',
      }),
    ).rejects.toBeInstanceOf(CircleAccessError);
  });

  it('strips commas, parentheses, and spaces from inviteeIdentifier before PostgREST .or()', async () => {
    const { inviteMember, sanitizeInviteeIdentifier } = await import(
      '@/domain/team/circle-service'
    );

    const malicious = '010-2222-2222,role.eq.admin,(id.neq.0) ';
    expect(sanitizeInviteeIdentifier(malicious)).toBe('010-2222-2222role.eq.adminid.neq.0');
    expect(sanitizeInviteeIdentifier(malicious)).not.toMatch(/[,()\s]/);

    await inviteMember({
      circleId: CIRCLE_1,
      inviterBrokerId: BROKER_A,
      inviteeIdentifier: malicious,
    });

    const profileSelectOp = fakeDb.ops.find(
      (o) => o.table === 'profiles' && o.orExprs.length > 0,
    );
    expect(profileSelectOp).toBeDefined();
    const orExpr = profileSelectOp!.orExprs[0];
    expect(orExpr).not.toContain('(');
    expect(orExpr).not.toContain(')');
    expect(orExpr).not.toContain(' ');
    // Only the two phone.eq clauses exist, never a third injected clause
    expect(orExpr.split(',')).toHaveLength(2);
    expect(orExpr.split(',').every((c) => c.startsWith('phone.eq.'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Funding, Cluster-Buyers & QA Draft Probe Hardening
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Funding lockdown, cluster-buyers admin guard & QA draft probe protection', () => {
  it('enforces admin-only on /api/funding/analytics and /api/broker/prediction/cluster-buyers, blocks client kyc_verified, and validates PUT project schema', async () => {
    const { GET: getFundingAnalytics } = await import('@/app/api/funding/analytics/route');
    const { POST: postInvestorProfile } = await import('@/app/api/funding/investor/profile/route');
    const { POST: postGateVerify } = await import('@/app/api/funding/gate/verify/route');
    const { PUT: putFundingProject } = await import('@/app/api/funding/project/[id]/route');
    const { POST: postClusterBuyers } = await import(
      '@/app/api/broker/prediction/cluster-buyers/route'
    );

    // Broker (non-admin) denied on analytics & cluster-buyers
    setAuthState({ id: BROKER_A, email: 'a@credeal.kr' }, 'broker');
    expect(
      (await getFundingAnalytics(new NextRequest('http://localhost/api/funding/analytics'))).status,
    ).toBe(403);
    expect(
      (
        await postClusterBuyers(
          new NextRequest('http://localhost/api/broker/prediction/cluster-buyers', {
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(403);

    // Non-admin client sending kycVerified: true stays kyc_verified: false
    const invRes = await postInvestorProfile(
      new NextRequest('http://localhost/api/funding/investor/profile', {
        method: 'POST',
        body: JSON.stringify({ investorType: 'qualified', kycVerified: true, kyc_verified: true }),
      }),
    );
    expect(invRes.status).toBe(200);
    expect((await invRes.json()).data.kyc_verified).toBe(false);

    const gateRes = await postGateVerify(
      new NextRequest('http://localhost/api/funding/gate/verify', {
        method: 'POST',
        body: JSON.stringify({ targetType: 'professional', kycVerified: true }),
      }),
    );
    expect(gateRes.status).toBe(200);
    expect((await gateRes.json()).data.kyc_verified).toBe(false);

    // PUT /api/funding/project/[id] rejects unallowlisted fields (operator_id / current_amount)
    const massAssignRes = await putFundingProject(
      new NextRequest('http://localhost/api/funding/project/proj-a', {
        method: 'PUT',
        body: JSON.stringify({ operator_id: BROKER_B, current_amount: 999_999_999 }),
      }),
      { params: Promise.resolve({ id: 'proj-a' }) },
    );
    expect(massAssignRes.status).toBe(400);
  });

  it('blocks probing unpublished draft DealCards with 403 (without leaking addressBlindPass or offendingCount) when !ownsDealCard && qaRole !== "master"', async () => {
    vi.stubEnv('QA_ACCESS_KEY', 'master-qa-key-2026');
    vi.stubEnv('QA_TESTER_ACCESS_KEY', 'tester-qa-key-2026');

    hoisted.mockGetWorkspaceItemByAnyId.mockResolvedValue({
      id: 'ws-draft-1',
      ownerId: BROKER_B,
      kind: 'dealcard',
      status: 'draft',
      title: '역삼동 724-12 비공개 초안',
      address: '강남구 역삼동 724-12',
      draftPayload: { headline: '역삼동 724-12 초안 매물' },
      publishedSnapshot: null,
      deletedAt: null,
    });

    setAuthState({ id: BROKER_A, email: 'a@credeal.kr' }, 'broker');
    const { POST: postQaWorkbench } = await import('@/app/api/public/qa-workbench/route');

    // Tester key + non-owner broker probing unpublished draft -> 403 without oracle leak
    const blockedProbe = await postQaWorkbench(
      new NextRequest('http://localhost/api/public/qa-workbench', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-qa-access-key': 'tester-qa-key-2026',
        },
        body: JSON.stringify({
          mode: 'probe',
          dealCardUrl: '/dc/ws-draft-1',
          customForbiddenTokens: ['724-12'],
        }),
      }),
    );
    expect(blockedProbe.status).toBe(403);
    const blockedBody = await blockedProbe.json();
    expect(blockedBody.addressBlindPass).toBeUndefined();
    expect(blockedBody.offendingCount).toBeUndefined();
    expect(blockedBody.dealCardCheck).toBeUndefined();

    // Master QA key is allowed to probe
    const masterProbe = await postQaWorkbench(
      new NextRequest('http://localhost/api/public/qa-workbench', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-qa-access-key': 'master-qa-key-2026',
        },
        body: JSON.stringify({
          mode: 'probe',
          dealCardUrl: '/dc/ws-draft-1',
        }),
      }),
    );
    expect(masterProbe.status).toBe(200);
  });
});
