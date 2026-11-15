/**
 * Wave 1 — WP-02 Security Regression Suite
 * Broker IDOR Closure & Alpha Role Auto-Upgrade Lockdown
 *
 * Covers:
 *  1. `src/lib/auth-guard.ts` — vendor/public_user/expert never upgraded (403);
 *     production NODE_ENV defaults ALLOW_ALPHA_ROLE_UPGRADE to OFF unless 'true'.
 *  2. `POST /api/broker/im-lite/quick-generate` — cross-tenant buildingId 403 (zero mutation),
 *     per-user scoped IDEMPOTENCY_CACHE isolation.
 *  3. `PATCH /api/broker/buildings/[id]/enrich-from-leasing` — cross-tenant 403, owner 200.
 *  4. `POST /api/broker/buildings/[id]/photos/upload` & `POST /api/broker/im/upload-photo` —
 *     path traversal segment 400, cross-tenant building 403.
 *  5. `PATCH` / `DELETE /api/broker/clients/[id]/contacts/[contactId]` &
 *     `GET` / `PUT /api/broker/clients/[id]` — cross-tenant 404 & foreign linked IDs stripped.
 *  6. `POST /api/broker/lease-match` — cross-tenant leaseSpaceId / tenantIntentId 403.
 *  7. `POST /api/broker/pro-grants/[id]/approve` — null owner fail-closed 403, cross-tenant 403, owner/admin 200.
 *  8. `POST /api/broker/buyer-memo/generate` — unauthenticated 401, cross-tenant 403, owner bound to guard.user.id.
 *  9. `POST /api/broker/im-lite/comps-enrich` — unauthenticated 401, rate-limited 429.
 * 10. `GET` / `POST /api/space-ai-handoffs` — unauthenticated 401, brokerId spoof 403, valid HMAC 200.
 * 11. `POST /api/gate-requests/[id]/sign` — wrong/missing phone 403, revoked status 403,
 *     valid requester phone 200 without overwriting recorded requester_name / requester_phone.
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthGuardResult } from '@/lib/auth-guard';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

const BLD_OWNED = 'a0000000-0000-4000-8000-000000000001';
const BLD_OTHER = 'a0000000-0000-4000-8000-000000000002';
const BLD_NULL_OWNER = 'a0000000-0000-4000-8000-000000000003';

const INTENT_OWNED = 'b0000000-0000-4000-8000-000000000001';
const INTENT_OTHER = 'b0000000-0000-4000-8000-000000000002';

const CLIENT_OWNED = 'c0000000-0000-4000-8000-000000000001';
const CLIENT_OTHER = 'c0000000-0000-4000-8000-000000000002';
const CONTACT_OTHER = 'c9000000-0000-4000-8000-000000000001';

const SPACE_OTHER = 'e0000000-0000-4000-8000-000000000001';
const TENANT_OTHER = 'f0000000-0000-4000-8000-000000000001';

// Tiny valid 1x1 PNG base64 for upload-photo tests
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ─── Controllable Auth & Supabase Mocks ──────────────────────────────────────
let currentProfileRole: string | null = 'broker';
let currentAuthUser: { id: string; email?: string } | null = {
  id: OWNER,
  email: 'owner@credeal.kr',
};
const profileUpserts: unknown[] = [];

let mockGuardOverride: ((req: NextRequest) => Promise<AuthGuardResult>) | null = null;
let mockVerifyOverride: ((req: NextRequest) => Promise<AuthGuardResult>) | null = null;
let mockRateLimitAllowed = true;

vi.mock('heic-convert', () => ({
  default: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff])),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    rotate: () => ({
      resize: () => ({
        jpeg: () => ({
          toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff]),
        }),
      }),
    }),
  })),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
  getServerEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: 'no cookie session' },
      }),
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () =>
        currentAuthUser
          ? { data: { user: currentAuthUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } },
      ),
    },
    from: (_table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        single: async () => ({
          data:
            currentProfileRole === null
              ? null
              : { role: currentProfileRole, display_name: 'Tester' },
          error: currentProfileRole === null ? { message: 'no rows' } : null,
        }),
        upsert: (row: unknown) => {
          profileUpserts.push(row);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
      return q;
    },
  }),
}));

vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-guard')>();
  return {
    ...actual,
    requireBroker: vi.fn((req: NextRequest) =>
      mockGuardOverride ? mockGuardOverride(req) : actual.requireBroker(req),
    ),
    verifyAuth: vi.fn((req: NextRequest) =>
      mockVerifyOverride ? mockVerifyOverride(req) : actual.verifyAuth(req),
    ),
  };
});

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(async () => mockRateLimitAllowed),
}));

const mockGenerateBuyerMemo = vi.fn(
  async (input: Record<string, unknown>, brokerId: string) => ({
    kakaoMessage: `메모:${String(input.buildingId)}`,
    fitReasons: ['입지 우수'],
    cautions: [],
    brokerId,
  }),
);
vi.mock('@/domain/buyer/buyer-memo', () => ({
  generateBuyerMemo: (...args: [Record<string, unknown>, string]) =>
    mockGenerateBuyerMemo(...args),
}));

vi.mock('@/domain/analytics/record-event', () => ({
  recordEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/external/address-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/external/address-resolver')>();
  return {
    ...actual,
    resolveAddress: vi.fn(async () => ({
      pnu: '1168010100108230033',
      lat: 37.4996,
      lng: 127.0344,
      roadAddress: '서울특별시 강남구 테헤란로14길 8',
      jibunAddress: '서울특별시 강남구 역삼동 823-33',
    })),
  };
});

// ─── Stateful In-Memory Fake Supabase Service Client ─────────────────────────
type TableRows = Record<string, Record<string, Record<string, any>>>;
interface DbMutation {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  payload?: any;
  matchedIds?: string[];
}

function makeStatefulDb(initial: TableRows) {
  const tables: TableRows = structuredClone(initial);
  const mutations: DbMutation[] = [];

  const from = vi.fn((table: string) => {
    if (!tables[table]) tables[table] = {};
    const eqFilters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    let pendingOp: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select';
    let pendingPayload: any = undefined;
    let executed = false;
    let cachedResult: { data: any; error: any } | null = null;

    const matchRows = () =>
      Object.values(tables[table] ?? {}).filter((row) => {
        const eqOk = eqFilters.every(([col, val]) => row[col] === val);
        const inOk = inFilters.every(([col, vals]) => vals.includes(row[col]));
        return eqOk && inOk;
      });

    const execute = (): { data: any; error: any } => {
      if (executed && cachedResult) return cachedResult;
      executed = true;

      if (pendingOp === 'select') {
        cachedResult = { data: matchRows().map((r) => ({ ...r })), error: null };
        return cachedResult;
      }

      if (pendingOp === 'insert') {
        const items = Array.isArray(pendingPayload) ? pendingPayload : [pendingPayload];
        const inserted = items.map((item, idx) => {
          const id = String(item?.id || `ins_${Date.now()}_${idx}`);
          const stored = { ...item, id };
          tables[table][id] = stored;
          return { ...stored };
        });
        mutations.push({
          table,
          op: 'insert',
          payload: pendingPayload,
          matchedIds: inserted.map((r) => r.id),
        });
        cachedResult = { data: inserted, error: null };
        return cachedResult;
      }

      if (pendingOp === 'upsert') {
        const items = Array.isArray(pendingPayload) ? pendingPayload : [pendingPayload];
        const upserted = items.map((item, idx) => {
          const id = String(
            item?.id ||
              `${item?.lease_space_id || 'sp'}_${item?.tenant_intent_id || idx}`,
          );
          const stored = { ...(tables[table][id] || {}), ...item, id };
          tables[table][id] = stored;
          return { ...stored };
        });
        mutations.push({
          table,
          op: 'upsert',
          payload: pendingPayload,
          matchedIds: upserted.map((r) => r.id),
        });
        cachedResult = { data: upserted, error: null };
        return cachedResult;
      }

      if (pendingOp === 'update') {
        const matched = matchRows();
        const updated = matched.map((row) => {
          const next = { ...row, ...pendingPayload };
          tables[table][String(row.id)] = next;
          return { ...next };
        });
        mutations.push({
          table,
          op: 'update',
          payload: pendingPayload,
          matchedIds: updated.map((r) => String(r.id)),
        });
        cachedResult = { data: updated, error: null };
        return cachedResult;
      }

      // delete
      const matched = matchRows();
      for (const row of matched) {
        delete tables[table][String(row.id)];
      }
      mutations.push({
        table,
        op: 'delete',
        matchedIds: matched.map((r) => String(r.id)),
      });
      cachedResult = { data: matched.map((r) => ({ ...r })), error: null };
      return cachedResult;
    };

    const q: any = {
      select(_cols?: string) {
        return q;
      },
      eq(col: string, val: unknown) {
        eqFilters.push([col, val]);
        return q;
      },
      in(col: string, vals: unknown[]) {
        inFilters.push([col, vals]);
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      insert(payload: unknown) {
        pendingOp = 'insert';
        pendingPayload = payload;
        return q;
      },
      upsert(payload: unknown) {
        pendingOp = 'upsert';
        pendingPayload = payload;
        return q;
      },
      update(payload: unknown) {
        pendingOp = 'update';
        pendingPayload = payload;
        return q;
      },
      delete() {
        pendingOp = 'delete';
        return q;
      },
      async maybeSingle() {
        const res = execute();
        const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        return { data: rows[0] ?? null, error: res.error };
      },
      async single() {
        const res = execute();
        const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        if (!rows[0]) {
          return { data: null, error: { message: 'Row not found' } };
        }
        return { data: rows[0], error: res.error };
      },
      then(
        onFulfilled?: (value: { data: any; error: any }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected);
      },
    };

    return q;
  });

  const storage = {
    listBuckets: vi.fn(async () => ({ data: [{ name: 'building_photos' }], error: null })),
    createBucket: vi.fn(async () => ({ data: { name: 'building_photos' }, error: null })),
    from: vi.fn(() => ({
      upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
      getPublicUrl: vi.fn((path: string) => ({
        data: { publicUrl: `https://cdn.credeal.test/${path}` },
      })),
      createSignedUploadUrl: vi.fn(async (path: string) => ({
        data: { signedUrl: `https://cdn.credeal.test/signed/${path}`, token: 'tok' },
        error: null,
      })),
      download: vi.fn(async () => ({ data: null, error: { message: 'missing' } })),
      remove: vi.fn(async () => ({ data: null, error: null })),
    })),
  };

  const rpc = vi.fn(async () => ({ data: null, error: null }));

  return { tables, mutations, client: { from, storage, rpc } };
}

let fakeDb = makeStatefulDb({});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => fakeDb.client,
}));

function buildBaseSeed(): TableRows {
  return {
    building_ssot_lite: {
      [BLD_OWNED]: {
        id: BLD_OWNED,
        owner_id: OWNER,
        area_signal: '강남구',
        asset_type: '오피스',
        price_band: '100억대',
        status: 'public_signal_ready',
        current_use_signal: '기존 시그널',
        fit_summary: '기존 요약',
        layers: {},
      },
      [BLD_OTHER]: {
        id: BLD_OTHER,
        owner_id: OTHER,
        area_signal: '서초구',
        asset_type: '근생',
        price_band: '50억대',
        status: 'public_signal_ready',
        current_use_signal: '타인 시그널',
        fit_summary: '타인 요약',
        layers: {},
      },
      [BLD_NULL_OWNER]: {
        id: BLD_NULL_OWNER,
        owner_id: null,
        area_signal: '마포구',
        layers: {},
      },
    },
    buyer_intent_lite: {
      [INTENT_OWNED]: {
        id: INTENT_OWNED,
        owner_id: OWNER,
        buyer_type: '법인',
        budget_display: '100억',
        preferred_regions: ['강남구'],
        purchase_purpose: '사옥',
      },
      [INTENT_OTHER]: {
        id: INTENT_OTHER,
        owner_id: OTHER,
        buyer_type: '개인',
        budget_display: '50억',
        preferred_regions: ['서초구'],
        purchase_purpose: '투자',
      },
    },
    broker_clients: {
      [CLIENT_OWNED]: {
        id: CLIENT_OWNED,
        broker_id: OWNER,
        display_name: '본인 고객',
        linked_building_ids: [BLD_OWNED, BLD_OTHER],
        linked_buyer_intent_ids: [INTENT_OWNED, INTENT_OTHER],
      },
      [CLIENT_OTHER]: {
        id: CLIENT_OTHER,
        broker_id: OTHER,
        display_name: '타인 고객',
        linked_building_ids: [BLD_OTHER],
        linked_buyer_intent_ids: [INTENT_OTHER],
      },
    },
    contact_history: {
      [CONTACT_OTHER]: {
        id: CONTACT_OTHER,
        client_id: CLIENT_OTHER,
        broker_id: OTHER,
        contact_type: 'call',
        summary: '타 중개사 통화 기록',
      },
    },
    lease_spaces: {
      [SPACE_OTHER]: {
        id: SPACE_OTHER,
        broker_id: OTHER,
        building_id: BLD_OTHER,
        floor: '3F',
        area_sqm: 120,
        space_type: 'office',
        deposit: 5000,
        monthly_rent: 450,
        is_marketplace_listed: false,
        building: { id: BLD_OTHER, owner_id: OTHER, area_signal: '서초구' },
      },
    },
    tenant_intent: {
      [TENANT_OTHER]: {
        id: TENANT_OTHER,
        broker_id: OTHER,
        business_type: 'IT',
        preferred_regions: ['서초구'],
        visibility: 'private',
      },
    },
    im_pro_grants: {
      'grant-null-owner': {
        id: 'grant-null-owner',
        broker_id: null,
        tenant_id: null,
        deal_id: null,
        building_id: null,
        status: 'pending',
      },
      'grant-other': {
        id: 'grant-other',
        broker_id: OTHER,
        tenant_id: null,
        status: 'pending',
      },
      'grant-owned': {
        id: 'grant-owned',
        broker_id: OWNER,
        tenant_id: null,
        status: 'pending',
      },
      'grant-nda-pending': {
        id: 'grant-nda-pending',
        broker_id: OWNER,
        deal_id: BLD_OWNED,
        status: 'approved',
        nda_signed_at: null,
        requester_name: '홍길동',
        requester_phone: '010-1234-5678',
      },
      'grant-nda-revoked': {
        id: 'grant-nda-revoked',
        broker_id: OWNER,
        deal_id: BLD_OWNED,
        status: 'revoked',
        nda_signed_at: null,
        requester_name: '홍길동',
        requester_phone: '010-1234-5678',
      },
    },
  };
}

function asBroker(userId: string, role: 'broker' | 'admin' = 'broker') {
  mockGuardOverride = async () => ({
    user: { id: userId, email: `${role}@credeal.kr` },
    role,
    profile: { role, display_name: 'Broker' },
    error: null,
  });
}

function jsonReq(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  fakeDb = makeStatefulDb(buildBaseSeed());
  mockGuardOverride = null;
  mockVerifyOverride = null;
  mockRateLimitAllowed = true;
  currentProfileRole = 'broker';
  currentAuthUser = { id: OWNER, email: 'owner@credeal.kr' };
  profileUpserts.length = 0;
  mockGenerateBuyerMemo.mockClear();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  delete process.env.ALLOW_ALPHA_ROLE_UPGRADE;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── 1. auth-guard: vendor/public_user/expert lockdown + production default OFF ───
describe('WP-02 [1] requireBroker — production role lock & vendor block', () => {
  function realBearerReq() {
    return new NextRequest('http://localhost/api/broker/check', {
      headers: { Authorization: 'Bearer real-jwt-token' },
    });
  }

  it.each(['vendor', 'public_user', 'expert'])(
    'denies %s with 403 even when ALLOW_ALPHA_ROLE_UPGRADE=true',
    async (role) => {
      process.env.ALLOW_ALPHA_ROLE_UPGRADE = 'true';
      currentProfileRole = role;
      const { requireBroker } = await import('@/lib/auth-guard');
      const res = await requireBroker(realBearerReq());
      expect(res.error).not.toBeNull();
      expect(res.error!.status).toBe(403);
      expect(profileUpserts).toHaveLength(0);
    },
  );

  it('defaults ALLOW_ALPHA_ROLE_UPGRADE to OFF in NODE_ENV=production when unset (403)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ALLOW_ALPHA_ROLE_UPGRADE;
    currentProfileRole = null;

    const { requireBroker } = await import('@/lib/auth-guard');
    const res = await requireBroker(realBearerReq());
    expect(res.error).not.toBeNull();
    expect(res.error!.status).toBe(403);
    expect(profileUpserts).toHaveLength(0);
  });

  it('allows missing-profile upgrade in NODE_ENV=production ONLY when ALLOW_ALPHA_ROLE_UPGRADE=true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.ALLOW_ALPHA_ROLE_UPGRADE = 'true';
    currentProfileRole = null;

    const { requireBroker } = await import('@/lib/auth-guard');
    const res = await requireBroker(realBearerReq());
    expect(res.error).toBeNull();
    expect(res.role).toBe('broker');
    expect(profileUpserts).toHaveLength(1);
  });
});

// ─── 2. quick-generate: cross-tenant buildingId 403 & user-scoped idempotency ───
describe('WP-02 [2] POST /api/broker/im-lite/quick-generate', () => {
  it('blocks Broker B with 403 when buildingId belongs to Broker A (never overwrites owner_id)', async () => {
    asBroker(OTHER);
    const { POST } = await import('@/app/api/broker/im-lite/quick-generate/route');

    const res = await POST(
      jsonReq('http://localhost/api/broker/im-lite/quick-generate', 'POST', {
        buildingId: BLD_OWNED,
        address: '서울특별시 마포구 동교동 168-4',
        askingPriceManwon: 350000,
      }),
    );

    expect(res.status).toBe(403);
    expect(fakeDb.tables.building_ssot_lite[BLD_OWNED].owner_id).toBe(OWNER);
    expect(fakeDb.mutations).toHaveLength(0);
  });

  it('scopes IDEMPOTENCY_CACHE by userId so Broker B never receives Broker A cached payload', async () => {
    const { POST } = await import('@/app/api/broker/im-lite/quick-generate/route');
    const sharedKey = `wp02-shared-idem-${Date.now()}`;
    const payload = {
      address: '서울특별시 마포구 동교동 168-4',
      askingPriceManwon: 350000,
    };

    asBroker(OWNER);
    const resA1 = await POST(
      jsonReq('http://localhost/api/broker/im-lite/quick-generate', 'POST', payload, {
        'Idempotency-Key': sharedKey,
      }),
    );
    expect(resA1.status).toBe(201);
    const bodyA1 = await resA1.json();

    const resA2 = await POST(
      jsonReq('http://localhost/api/broker/im-lite/quick-generate', 'POST', payload, {
        'Idempotency-Key': sharedKey,
      }),
    );
    expect(resA2.status).toBe(200);
    expect(resA2.headers.get('X-Cache-Lookup')).toBe('HIT');

    asBroker(OTHER);
    const resB = await POST(
      jsonReq('http://localhost/api/broker/im-lite/quick-generate', 'POST', payload, {
        'Idempotency-Key': sharedKey,
      }),
    );
    expect(resB.status).toBe(201);
    expect(resB.headers.get('X-Cache-Lookup')).toBeNull();
    const bodyB = await resB.json();
    expect(bodyB.buildingId).not.toBe(bodyA1.buildingId);
  });
});

// ─── 3. enrich-from-leasing: cross-tenant 403 & owner 200 ───
describe('WP-02 [3] PATCH /api/broker/buildings/[id]/enrich-from-leasing', () => {
  it('returns 403 for cross-tenant broker and does not update building_ssot_lite', async () => {
    asBroker(OTHER);
    const { PATCH } = await import(
      '@/app/api/broker/buildings/[id]/enrich-from-leasing/route'
    );

    const res = await PATCH(
      jsonReq(`http://localhost/api/broker/buildings/${BLD_OWNED}/enrich-from-leasing`, 'PATCH', {
        source: 'js-space-ai-page',
        leasing_signals: { inquiry_count: 7, top_tenant_types: ['의원'] },
      }),
      { params: Promise.resolve({ id: BLD_OWNED }) },
    );

    expect(res.status).toBe(403);
    expect(fakeDb.mutations).toHaveLength(0);
    expect(fakeDb.tables.building_ssot_lite[BLD_OWNED].current_use_signal).toBe('기존 시그널');
  });

  it('allows owner broker (200) to enrich building_ssot_lite', async () => {
    asBroker(OWNER);
    const { PATCH } = await import(
      '@/app/api/broker/buildings/[id]/enrich-from-leasing/route'
    );

    const res = await PATCH(
      jsonReq(`http://localhost/api/broker/buildings/${BLD_OWNED}/enrich-from-leasing`, 'PATCH', {
        source: 'js-space-ai-page',
        leasing_signals: { inquiry_count: 5, top_tenant_types: ['카페'] },
      }),
      { params: Promise.resolve({ id: BLD_OWNED }) },
    );

    expect(res.status).toBe(200);
    expect(
      fakeDb.mutations.some((m) => m.table === 'building_ssot_lite' && m.op === 'update'),
    ).toBe(true);
  });
});

// ─── 4. Photo Upload Routes: path traversal 400 & cross-tenant 403 ───
describe('WP-02 [4] Photo upload path-segment & ownership guards', () => {
  it('rejects path traversal id (..) with 400 and cross-tenant building with 403 on buildings/[id]/photos/upload', async () => {
    asBroker(OWNER);
    const { POST } = await import('@/app/api/broker/buildings/[id]/photos/upload/route');

    const traversalRes = await POST(
      new NextRequest('http://localhost/api/broker/buildings/..%2Fevil/photos/upload', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '../evil' }) },
    );
    expect(traversalRes.status).toBe(400);

    const crossTenantRes = await POST(
      new NextRequest(`http://localhost/api/broker/buildings/${BLD_OTHER}/photos/upload`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: BLD_OTHER }) },
    );
    expect(crossTenantRes.status).toBe(403);
  });

  it('rejects path traversal buildingId with 400 and cross-tenant buildingId with 403 on im/upload-photo', async () => {
    asBroker(OWNER);
    const { POST } = await import('@/app/api/broker/im/upload-photo/route');

    const traversalRes = await POST(
      jsonReq('http://localhost/api/broker/im/upload-photo', 'POST', {
        buildingId: '../traversal',
        dataUrl: TINY_PNG_DATA_URL,
      }),
    );
    expect(traversalRes.status).toBe(400);

    const crossTenantRes = await POST(
      jsonReq('http://localhost/api/broker/im/upload-photo', 'POST', {
        buildingId: BLD_OTHER,
        dataUrl: TINY_PNG_DATA_URL,
      }),
    );
    expect(crossTenantRes.status).toBe(403);
  });
});

// ─── 5. Broker Clients & Contact History IDOR closures ───
describe('WP-02 [5] Clients & contact_history cross-tenant isolation', () => {
  it('returns 404 when Broker A attempts PATCH or DELETE on Broker B contact_history', async () => {
    asBroker(OWNER);
    const { PATCH, DELETE } = await import(
      '@/app/api/broker/clients/[id]/contacts/[contactId]/route'
    );

    const patchRes = await PATCH(
      jsonReq(
        `http://localhost/api/broker/clients/${CLIENT_OTHER}/contacts/${CONTACT_OTHER}`,
        'PATCH',
        { summary: '변조 시도' },
      ),
      { params: Promise.resolve({ id: CLIENT_OTHER, contactId: CONTACT_OTHER }) },
    );
    expect(patchRes.status).toBe(404);
    expect(fakeDb.tables.contact_history[CONTACT_OTHER].summary).toBe('타 중개사 통화 기록');

    const deleteRes = await DELETE(
      new NextRequest(
        `http://localhost/api/broker/clients/${CLIENT_OTHER}/contacts/${CONTACT_OTHER}`,
        { method: 'DELETE' },
      ),
      { params: Promise.resolve({ id: CLIENT_OTHER, contactId: CONTACT_OTHER }) },
    );
    expect(deleteRes.status).toBe(404);
    expect(fakeDb.tables.contact_history[CONTACT_OTHER]).toBeDefined();
  });

  it('scopes GET hydration to owner_id and strips foreign linked IDs on PUT /api/broker/clients/[id]', async () => {
    asBroker(OWNER);
    const { GET, PUT } = await import('@/app/api/broker/clients/[id]/route');

    // Cross-tenant client -> 404
    const crossGet = await GET(
      new NextRequest(`http://localhost/api/broker/clients/${CLIENT_OTHER}`),
      { params: Promise.resolve({ id: CLIENT_OTHER }) },
    );
    expect(crossGet.status).toBe(404);

    // Own client GET -> only hydrates BLD_OWNED and INTENT_OWNED (excludes BLD_OTHER & INTENT_OTHER)
    const ownGet = await GET(
      new NextRequest(`http://localhost/api/broker/clients/${CLIENT_OWNED}`),
      { params: Promise.resolve({ id: CLIENT_OWNED }) },
    );
    expect(ownGet.status).toBe(200);
    const getBody = await ownGet.json();
    expect(getBody.data.buildings.map((b: { id: string }) => b.id)).toEqual([BLD_OWNED]);
    expect(getBody.data.buyerIntents.map((i: { id: string }) => i.id)).toEqual([INTENT_OWNED]);

    // Own client PUT -> strips foreign BLD_OTHER and INTENT_OTHER
    const putRes = await PUT(
      jsonReq(`http://localhost/api/broker/clients/${CLIENT_OWNED}`, 'PUT', {
        linked_building_ids: [BLD_OWNED, BLD_OTHER],
        linked_buyer_intent_ids: [INTENT_OWNED, INTENT_OTHER],
      }),
      { params: Promise.resolve({ id: CLIENT_OWNED }) },
    );
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.data.linked_building_ids).toEqual([BLD_OWNED]);
    expect(putBody.data.linked_buyer_intent_ids).toEqual([INTENT_OWNED]);
  });
});

// ─── 6. lease-match: cross-tenant 403 ───
describe('WP-02 [6] POST /api/broker/lease-match', () => {
  it('returns 403 when caller owns neither lease_space nor tenant_intent and never upserts lease_match_results', async () => {
    asBroker(OWNER);
    const { POST } = await import('@/app/api/broker/lease-match/route');

    const res = await POST(
      jsonReq('http://localhost/api/broker/lease-match', 'POST', {
        leaseSpaceId: SPACE_OTHER,
        tenantIntentId: TENANT_OTHER,
      }),
    );

    expect(res.status).toBe(403);
    expect(fakeDb.mutations.some((m) => m.table === 'lease_match_results')).toBe(false);
  });
});

// ─── 7. pro-grants/[id]/approve: fail-closed when broker_id & tenant_id are null ───
describe('WP-02 [7] POST /api/broker/pro-grants/[id]/approve', () => {
  it('fails CLOSED with 403 when both broker_id and tenant_id are null', async () => {
    asBroker(OWNER);
    const { POST } = await import('@/app/api/broker/pro-grants/[id]/approve/route');

    const res = await POST(
      new NextRequest('http://localhost/api/broker/pro-grants/grant-null-owner/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'grant-null-owner' }) },
    );

    expect(res.status).toBe(403);
    expect(fakeDb.tables.im_pro_grants['grant-null-owner'].status).toBe('pending');
  });

  it('returns 403 for another broker grant, 200 for owner grant, and 200 for admin on null-owner grant', async () => {
    const { POST } = await import('@/app/api/broker/pro-grants/[id]/approve/route');

    asBroker(OWNER);
    const crossRes = await POST(
      new NextRequest('http://localhost/api/broker/pro-grants/grant-other/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'grant-other' }) },
    );
    expect(crossRes.status).toBe(403);

    const ownRes = await POST(
      new NextRequest('http://localhost/api/broker/pro-grants/grant-owned/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'grant-owned' }) },
    );
    expect(ownRes.status).toBe(200);
    expect(fakeDb.tables.im_pro_grants['grant-owned'].status).toBe('approved');

    asBroker(ADMIN, 'admin');
    const adminRes = await POST(
      new NextRequest('http://localhost/api/broker/pro-grants/grant-null-owner/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'grant-null-owner' }) },
    );
    expect(adminRes.status).toBe(200);
  });
});

// ─── 8. buyer-memo/generate: unauthenticated 401, cross-tenant 403, strict user binding ───
describe('WP-02 [8] POST /api/broker/buyer-memo/generate', () => {
  it('returns 401 when unauthenticated', async () => {
    currentAuthUser = null;
    const { POST } = await import('@/app/api/broker/buyer-memo/generate/route');

    const res = await POST(
      jsonReq('http://localhost/api/broker/buyer-memo/generate', 'POST', {
        buildingId: BLD_OWNED,
        buyerIntentId: INTENT_OWNED,
      }),
    );

    expect(res.status).toBe(401);
    expect(mockGenerateBuyerMemo).not.toHaveBeenCalled();
  });

  it('returns 403 on cross-tenant building or buyerIntent, and binds strictly to guard.user.id for owner', async () => {
    asBroker(OWNER);
    const { POST } = await import('@/app/api/broker/buyer-memo/generate/route');

    const crossBuilding = await POST(
      jsonReq('http://localhost/api/broker/buyer-memo/generate', 'POST', {
        buildingId: BLD_OTHER,
        buyerIntentId: INTENT_OWNED,
      }),
    );
    expect(crossBuilding.status).toBe(403);

    const crossIntent = await POST(
      jsonReq('http://localhost/api/broker/buyer-memo/generate', 'POST', {
        buildingId: BLD_OWNED,
        buyerIntentId: INTENT_OTHER,
      }),
    );
    expect(crossIntent.status).toBe(403);
    expect(mockGenerateBuyerMemo).not.toHaveBeenCalled();

    const okRes = await POST(
      jsonReq('http://localhost/api/broker/buyer-memo/generate', 'POST', {
        buildingId: BLD_OWNED,
        buyerIntentId: INTENT_OWNED,
        tone: 'kakao',
      }),
    );
    expect(okRes.status).toBe(200);
    expect(mockGenerateBuyerMemo).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId: BLD_OWNED, buyerIntentId: INTENT_OWNED }),
      OWNER,
    );
  });
});

// ─── 9. comps-enrich: unauthenticated 401 & rate limit 429 ───
describe('WP-02 [9] POST /api/broker/im-lite/comps-enrich', () => {
  it('returns 401 when unauthenticated', async () => {
    currentAuthUser = null;
    const { POST } = await import('@/app/api/broker/im-lite/comps-enrich/route');

    const res = await POST(
      jsonReq('http://localhost/api/broker/im-lite/comps-enrich', 'POST', {
        address: '서울특별시 강남구 역삼동 823-33',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limiter rejects burst requests', async () => {
    asBroker(OWNER);
    mockRateLimitAllowed = false;
    const { POST } = await import('@/app/api/broker/im-lite/comps-enrich/route');

    const res = await POST(
      jsonReq('http://localhost/api/broker/im-lite/comps-enrich', 'POST', {
        address: '서울특별시 강남구 역삼동 823-33',
      }),
    );
    expect(res.status).toBe(429);
  });
});

// ─── 10. space-ai-handoffs: unauthenticated 401, brokerId spoof 403, HMAC 200 ───
describe('WP-02 [10] GET & POST /api/space-ai-handoffs', () => {
  it('returns 401 on unauthenticated GET and POST', async () => {
    currentAuthUser = null;
    const { GET, POST } = await import('@/app/api/space-ai-handoffs/route');

    const getRes = await GET(new NextRequest('http://localhost/api/space-ai-handoffs'));
    expect(getRes.status).toBe(401);

    const postRes = await POST(
      jsonReq('http://localhost/api/space-ai-handoffs', 'POST', {
        memoText: '강남 1층 공실 임대 테스트 메모',
      }),
    );
    expect(postRes.status).toBe(401);
  });

  it('blocks spoofing another brokerId with 403, and allows valid timingSafeEqual HMAC inter-service call', async () => {
    const { GET, POST } = await import('@/app/api/space-ai-handoffs/route');

    asBroker(OWNER);
    const spoofRes = await POST(
      jsonReq('http://localhost/api/space-ai-handoffs', 'POST', {
        memoText: '타 중개사 사칭 메모',
        brokerId: OTHER,
      }),
    );
    expect(spoofRes.status).toBe(403);

    // Valid HMAC inter-service GET without user token
    currentAuthUser = null;
    mockGuardOverride = null;
    const secret = 'super-secret-handoff-hmac-key-2026';
    process.env.SPACE_AI_HANDOFF_SECRET = secret;

    const url = `http://localhost/api/space-ai-handoffs?brokerId=${OWNER}`;
    const qs = new URL(url).searchParams.toString();
    const sig = crypto.createHmac('sha256', secret).update(qs, 'utf8').digest('hex');

    const hmacGetRes = await GET(
      new NextRequest(url, {
        headers: { 'x-handoff-signature': `sha256=${sig}` },
      }),
    );
    expect(hmacGetRes.status).toBe(200);
    delete process.env.SPACE_AI_HANDOFF_SECRET;
  });
});

// ─── 11. gate-requests/[id]/sign: requester identity verification & PII immutability ───
describe('WP-02 [11] POST /api/gate-requests/[id]/sign', () => {
  it('blocks blind signing with wrong/missing phone (403) and blocks revoked grants (403)', async () => {
    const { POST } = await import('@/app/api/gate-requests/[id]/sign/route');

    const missingPhoneRes = await POST(
      jsonReq('http://localhost/api/gate-requests/grant-nda-pending/sign', 'POST', {
        agreedToTerms: true,
        signerName: '공격자',
      }),
      { params: Promise.resolve({ id: 'grant-nda-pending' }) },
    );
    expect(missingPhoneRes.status).toBe(403);

    const wrongPhoneRes = await POST(
      jsonReq('http://localhost/api/gate-requests/grant-nda-pending/sign', 'POST', {
        agreedToTerms: true,
        signerName: '공격자',
        signerPhone: '010-9999-8888',
      }),
      { params: Promise.resolve({ id: 'grant-nda-pending' }) },
    );
    expect(wrongPhoneRes.status).toBe(403);

    const revokedRes = await POST(
      jsonReq('http://localhost/api/gate-requests/grant-nda-revoked/sign', 'POST', {
        agreedToTerms: true,
        signerName: '홍길동',
        signerPhone: '010-1234-5678',
      }),
      { params: Promise.resolve({ id: 'grant-nda-revoked' }) },
    );
    expect(revokedRes.status).toBe(403);
  });

  it('allows signing with matching requester phone and NEVER overwrites recorded requester_name / requester_phone', async () => {
    const { POST } = await import('@/app/api/gate-requests/[id]/sign/route');

    const okRes = await POST(
      jsonReq('http://localhost/api/gate-requests/grant-nda-pending/sign', 'POST', {
        agreedToTerms: true,
        signerName: '변조이름시도',
        signerPhone: '01012345678',
      }),
      { params: Promise.resolve({ id: 'grant-nda-pending' }) },
    );

    expect(okRes.status).toBe(200);
    const updatedGrant = fakeDb.tables.im_pro_grants['grant-nda-pending'];
    expect(updatedGrant.status).toBe('active');
    expect(updatedGrant.requester_name).toBe('홍길동');
    expect(updatedGrant.requester_phone).toBe('010-1234-5678');
    expect(String(updatedGrant.watermark_seed)).toContain('홍길동|5678|');
  });
});
