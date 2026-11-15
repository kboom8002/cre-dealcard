/**
 * Wave 1 — WP-01 Security Regression Suite
 * Public Events Allowlist, Vendor/Agora Session Auth, Spaces Ownership, IoT Fail-Closed Key Check
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const OWNER_ID = '11111111-1111-1111-4111-811111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUILDING_LINKED_SPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING_SPACE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BUILDING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VENDOR_OWN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VENDOR_OTHER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

type Row = Record<string, any>;
type Filter = { op: 'eq' | 'neq'; col: string; val: unknown };

interface RecordedWrite {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  payload?: any;
  filters: Filter[];
}

function createFakeSupabase(
  initialTables: Record<string, Row[]>,
  opts: { errorOnTable?: Record<string, string> } = {},
) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(initialTables));
  const writes: RecordedWrite[] = [];

  const matchFilters = (rows: Row[], filters: Filter[]) =>
    rows.filter((r) =>
      filters.every((f) => (f.op === 'eq' ? r[f.col] === f.val : r[f.col] !== f.val)),
    );

  const from = vi.fn((table: string) => {
    const filters: Filter[] = [];
    let pendingOp: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let pendingPayload: any = null;
    let isCountHead = false;

    const getTableError = () => {
      const msg = opts.errorOnTable?.[table];
      return msg ? { message: msg, code: 'XX000' } : null;
    };

    const executeWriteOrRead = () => {
      const forcedErr = getTableError();
      if (forcedErr) {
        return { data: null, error: forcedErr, count: null };
      }

      if (pendingOp === 'insert') {
        writes.push({ table, op: 'insert', payload: pendingPayload, filters: [...filters] });
        const items = Array.isArray(pendingPayload) ? pendingPayload : [pendingPayload];
        const inserted = items.map((item, idx) => ({
          id: item.id ?? `${table}-new-${idx + 1}`,
          ...item,
        }));
        tables[table] = [...(tables[table] ?? []), ...inserted];
        return {
          data: Array.isArray(pendingPayload) ? inserted : inserted[0],
          error: null,
          count: inserted.length,
        };
      }

      if (pendingOp === 'update') {
        writes.push({ table, op: 'update', payload: pendingPayload, filters: [...filters] });
        const targets = matchFilters(tables[table] ?? [], filters);
        for (const row of targets) {
          Object.assign(row, pendingPayload);
        }
        return { data: targets, error: null, count: targets.length };
      }

      if (pendingOp === 'upsert') {
        writes.push({ table, op: 'upsert', payload: pendingPayload, filters: [...filters] });
        const row = { id: pendingPayload.id ?? `${table}-upserted-1`, ...pendingPayload };
        tables[table] = [...(tables[table] ?? []), row];
        return { data: row, error: null, count: 1 };
      }

      if (pendingOp === 'delete') {
        writes.push({ table, op: 'delete', filters: [...filters] });
        const remaining = (tables[table] ?? []).filter(
          (r) => !matchFilters([r], filters).length,
        );
        tables[table] = remaining;
        return { data: null, error: null, count: 0 };
      }

      const matched = matchFilters(tables[table] ?? [], filters);
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
      neq(col: string, val: unknown) {
        filters.push({ op: 'neq', col, val });
        return builder;
      },
      ilike() {
        return builder;
      },
      gte() {
        return builder;
      },
      contains() {
        return builder;
      },
      or() {
        return builder;
      },
      order() {
        return builder;
      },
      range() {
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        const res = executeWriteOrRead();
        if (res.error) return { data: null, error: res.error };
        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
        return { data: row, error: null };
      },
      async single() {
        const res = executeWriteOrRead();
        if (res.error) return { data: null, error: res.error };
        const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
        if (!row) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        return { data: row, error: null };
      },
      then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
        return Promise.resolve(executeWriteOrRead()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  });

  return { tables, writes, client: { from } };
}

let fakeDb = createFakeSupabase({});
let sessionUser: { id: string; email?: string } | null = null;
let rateLimitAllowed = true;
const mockRequireBroker = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => fakeDb.client,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () =>
        sessionUser
          ? { data: { user: sessionUser }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing' } },
    },
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(async () => rateLimitAllowed),
}));

vi.mock('@/ai/agents/leasing-page-writer-agent', () => ({
  runLeasingPageWriterAgent: vi.fn(async () => ({
    status: 'success',
    output: {
      title: '강남 오피스 임대 안내',
      subtitle: '역세권 업무공간',
      answer_hero: '확인된 전용면적 기준 안내입니다.',
      boundary_note: '세부 조건은 협의 필요',
      seo: {},
      sections: [],
    },
  })),
}));

vi.mock('@/ai/agents/campaign-copy-agent', () => ({
  runCampaignCopyAgent: vi.fn(async () => ({ status: 'success', output: { copies: [] } })),
}));

vi.mock('@/ai/agents/tenant-fit-agent', () => ({
  runTenantFitAgent: vi.fn(async () => ({
    status: 'success',
    confidence: 'memo_based_inference',
    output: { tenant_fit_results: [] },
  })),
}));

vi.mock('@/ai/agents/visual-classification-agent', () => ({
  runVisualClassificationAgent: vi.fn(async () => ({ status: 'success', output: { albums: [] } })),
}));

vi.mock('@/ai/agents/inquiry-qualifier-agent', () => ({
  runInquiryQualifierAgent: vi.fn(async () => ({ status: 'failed', output: null })),
}));

function setUnauthenticatedBrokerGuard() {
  mockRequireBroker.mockResolvedValue({
    user: null,
    role: null,
    profile: null,
    error: NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    ),
  });
}

function setBrokerGuard(userId: string, role: 'broker' | 'admin' = 'broker') {
  mockRequireBroker.mockResolvedValue({
    user: { id: userId, email: `${role}@credeal.kr` },
    role,
    profile: { role, display_name: null },
    error: null,
  });
}

function makeJsonReq(
  url: string,
  method: 'GET' | 'POST',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function seedDefaultDb(errorOnTable?: Record<string, string>) {
  return createFakeSupabase(
    {
      activity_events: [],
      content_share_events: [],
      profiles: [
        { id: OWNER_ID, role: 'broker' },
        { id: ADMIN_ID, role: 'admin' },
        { id: OTHER_ID, role: 'public_user' },
      ],
      vendor_profiles: [
        {
          id: VENDOR_OWN_ID,
          user_id: OWNER_ID,
          vendor_category: 'interior',
          company_name: '소유자 파트너',
          vendor_tier: 'basic',
          vendor_subscriptions: [],
        },
        {
          id: VENDOR_OTHER_ID,
          user_id: OTHER_ID,
          vendor_category: 'legal',
          company_name: '타인 파트너',
          vendor_tier: 'basic',
          vendor_subscriptions: [],
        },
      ],
      service_cards: [],
      agora_threads: [],
      building_ssot_lite: [
        { id: BUILDING_ID, owner_id: OWNER_ID, area_signal: '강남구', status: 'active' },
      ],
      spaces: [
        { id: SPACE_ID, created_by: OWNER_ID, display_name: '본인 리싱 공간', status: 'draft' },
        {
          id: BUILDING_LINKED_SPACE_ID,
          created_by: null,
          building_ssot_lite_id: BUILDING_ID,
          display_name: '매물 연동 공간',
          status: 'draft',
        },
      ],
      lease_spaces: [],
      leasing_pages: [],
      leasing_page_sections: [],
      tenant_fit_results: [],
      vibe_fit_results: [],
      leasing_inquiries: [
        {
          id: 'inq-1',
          space_id: SPACE_ID,
          status: 'submitted',
          source_channel: 'leasing_page',
          question_text: '임대 조건 문의',
          prospect: {
            display_name: '문의자',
            contact_internal: { phone: '010-0000-0000', email: 'lead@example.com' },
          },
          requirement: {},
          created_at: '2026-11-15T00:00:00Z',
        },
      ],
      iot_data_stream: [],
    },
    { errorOnTable },
  );
}

beforeEach(() => {
  fakeDb = seedDefaultDb();
  sessionUser = null;
  rateLimitAllowed = true;
  setUnauthenticatedBrokerGuard();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /api/public/events
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/public/events — strict allowlist & anonymous actor binding', () => {
  it.each([
    'link_restored',
    'im_deleted',
    'dealcard_upserted',
    'dealcard_deleted',
    'newsletter_subscription_toggled',
    'link_revoked',
  ])('blocks privileged/internal eventType "%s" with 400 and zero DB writes', async (blockedType) => {
    const { POST } = await import('@/app/api/public/events/route');
    const res = await POST(
      makeJsonReq('http://localhost/api/public/events', 'POST', {
        eventType: blockedType,
        entityType: 'im',
        entityId: BUILDING_ID,
        viewerId: OWNER_ID,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('허용되지 않은 이벤트 유형입니다.');
    expect(fakeDb.writes).toEqual([]);
  });

  it('blocks disallowed entityType, oversized metadata, and empty/oversized entityId (400)', async () => {
    const { POST } = await import('@/app/api/public/events/route');

    const badEntity = await POST(
      makeJsonReq('http://localhost/api/public/events', 'POST', {
        eventType: 'im_section_viewed',
        entityType: 'gate_request',
        entityId: BUILDING_ID,
      }),
    );
    expect(badEntity.status).toBe(400);

    const hugeMeta = await POST(
      makeJsonReq('http://localhost/api/public/events', 'POST', {
        eventType: 'im_section_viewed',
        entityType: 'im',
        entityId: BUILDING_ID,
        metadata: { blob: 'x'.repeat(4200) },
      }),
    );
    expect(hugeMeta.status).toBe(400);

    const longId = await POST(
      makeJsonReq('http://localhost/api/public/events', 'POST', {
        eventType: 'im_section_viewed',
        entityType: 'im',
        entityId: 'a'.repeat(129),
      }),
    );
    expect(longId.status).toBe(400);
    expect(fakeDb.writes).toEqual([]);
  });

  it('allows im_section_viewed and forces actor_id: null & actor_role: "anonymous"', async () => {
    const { POST } = await import('@/app/api/public/events/route');
    const res = await POST(
      makeJsonReq('http://localhost/api/public/events', 'POST', {
        eventType: 'im_section_viewed',
        entityType: 'im',
        entityId: BUILDING_ID,
        viewerId: OWNER_ID,
        actorId: ADMIN_ID,
        actor_id: ADMIN_ID,
        actorRole: 'admin',
        metadata: { section: 'financials', ratio: 0.75 },
      }),
    );

    expect(res.status).toBe(200);
    const insertWrite = fakeDb.writes.find((w) => w.table === 'activity_events' && w.op === 'insert');
    expect(insertWrite).toBeDefined();
    expect(insertWrite!.payload).toMatchObject({
      actor_id: null,
      actor_role: 'anonymous',
      event_type: 'im_section_viewed',
      entity_type: 'im',
      entity_id: BUILDING_ID,
      metadata: { section: 'financials', ratio: 0.75 },
    });
  });

  it('enforces IP rate limiting (429)', async () => {
    rateLimitAllowed = false;
    const { POST } = await import('@/app/api/public/events/route');
    const res = await POST(
      makeJsonReq(
        'http://localhost/api/public/events',
        'POST',
        { eventType: 'im_viewed', entityType: 'im', entityId: BUILDING_ID },
        { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
      ),
    );
    expect(res.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /api/vendor/profile, /api/vendor/service-cards, /api/agora/threads
// ─────────────────────────────────────────────────────────────────────────────
describe('Vendor & Agora session authentication & role downgrade protection', () => {
  it('GET /api/vendor/profile ignores forged x-user-id + Authorization without Supabase session (401)', async () => {
    sessionUser = null;
    const { GET } = await import('@/app/api/vendor/profile/route');
    const res = await GET(
      makeJsonReq('http://localhost/api/vendor/profile', 'GET', undefined, {
        Authorization: 'Bearer forged-jwt-token',
        'x-user-id': OWNER_ID,
      }),
    );

    expect(res.status).toBe(401);
    expect(fakeDb.client.from).not.toHaveBeenCalled();
  });

  it('GET /api/vendor/profile queries strictly for authenticated session user.id even if x-user-id differs', async () => {
    sessionUser = { id: OWNER_ID, email: 'owner@credeal.kr' };
    const { GET } = await import('@/app/api/vendor/profile/route');
    const res = await GET(
      makeJsonReq('http://localhost/api/vendor/profile', 'GET', undefined, {
        'x-user-id': OTHER_ID,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendor.user_id).toBe(OWNER_ID);
  });

  it('POST /api/vendor/profile rejects unauthenticated callers (401) and mismatched body.userId (403)', async () => {
    const { POST } = await import('@/app/api/vendor/profile/route');

    sessionUser = null;
    const unauthRes = await POST(
      makeJsonReq('http://localhost/api/vendor/profile', 'POST', {
        userId: ADMIN_ID,
        vendorCategory: 'interior',
        companyName: '공격자 업체',
      }),
    );
    expect(unauthRes.status).toBe(401);
    expect(fakeDb.writes).toEqual([]);

    sessionUser = { id: OTHER_ID, email: 'other@credeal.kr' };
    const mismatchRes = await POST(
      makeJsonReq('http://localhost/api/vendor/profile', 'POST', {
        userId: ADMIN_ID,
        vendorCategory: 'interior',
        companyName: '타인 사칭 업체',
      }),
    );
    expect(mismatchRes.status).toBe(403);
    expect(fakeDb.writes).toEqual([]);
  });

  it.each([
    ['broker', OWNER_ID],
    ['admin', ADMIN_ID],
  ])('POST /api/vendor/profile never downgrades existing "%s" role to vendor', async (expectedRole, uid) => {
    sessionUser = { id: uid, email: `${expectedRole}@credeal.kr` };
    const { POST } = await import('@/app/api/vendor/profile/route');
    const res = await POST(
      makeJsonReq('http://localhost/api/vendor/profile', 'POST', {
        vendorCategory: 'interior',
        companyName: '정상 파트너사',
      }),
    );

    expect(res.status).toBe(201);
    const profileUpdates = fakeDb.writes.filter((w) => w.table === 'profiles' && w.op === 'update');
    expect(profileUpdates).toEqual([]);
    const storedProfile = fakeDb.tables.profiles.find((p) => p.id === uid);
    expect(storedProfile?.role).toBe(expectedRole);
  });

  it('POST /api/vendor/profile masks raw DB errors on failure (500)', async () => {
    fakeDb = seedDefaultDb({ vendor_profiles: 'DETAIL: secret pg constraint vendor_profiles_pkey' });
    sessionUser = { id: OTHER_ID, email: 'other@credeal.kr' };
    const { POST } = await import('@/app/api/vendor/profile/route');
    const res = await POST(
      makeJsonReq('http://localhost/api/vendor/profile', 'POST', {
        vendorCategory: 'interior',
        companyName: '테스트 파트너',
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('vendor_profiles_pkey');
  });

  it('POST /api/vendor/service-cards requires session (401) and blocks foreign vendorId (403)', async () => {
    const { POST } = await import('@/app/api/vendor/service-cards/route');

    sessionUser = null;
    const unauth = await POST(
      makeJsonReq(
        'http://localhost/api/vendor/service-cards',
        'POST',
        {
          vendorId: VENDOR_OWN_ID,
          serviceCategory: 'interior',
          title: '오피스 인테리어',
          description: '시공 안내',
        },
        { Authorization: 'Bearer fake-header-only' },
      ),
    );
    expect(unauth.status).toBe(401);

    sessionUser = { id: OTHER_ID, email: 'other@credeal.kr' };
    const forbidden = await POST(
      makeJsonReq('http://localhost/api/vendor/service-cards', 'POST', {
        vendorId: VENDOR_OWN_ID,
        serviceCategory: 'interior',
        title: '타인 벤더 도용',
        description: '시공 안내',
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(fakeDb.writes).toEqual([]);
  });

  it('POST /api/agora/threads requires session (401) and binds author_id to session user.id', async () => {
    const { POST } = await import('@/app/api/agora/threads/route');

    sessionUser = null;
    const unauth = await POST(
      makeJsonReq(
        'http://localhost/api/agora/threads',
        'POST',
        { title: '질문', content: '내용', category: 'market', authorId: ADMIN_ID },
        { Authorization: 'Bearer fake-header-only' },
      ),
    );
    expect(unauth.status).toBe(401);

    sessionUser = { id: OTHER_ID, email: 'user@credeal.kr' };
    const created = await POST(
      makeJsonReq('http://localhost/api/agora/threads', 'POST', {
        title: '강남 공실률 문의',
        content: '최근 동향이 궁금합니다.',
        category: 'market',
        authorId: ADMIN_ID, // spoofed — must be ignored!
      }),
    );
    expect(created.status).toBe(201);
    const threadInsert = fakeDb.writes.find((w) => w.table === 'agora_threads' && w.op === 'insert');
    expect(threadInsert?.payload.author_id).toBe(OTHER_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /api/spaces/[spaceId]/** Auth & Ownership Lockdown
// ─────────────────────────────────────────────────────────────────────────────
describe('/api/spaces/[spaceId]/** — broker auth & space ownership lockdown', () => {
  it('rejects unauthenticated callers (401) on GET inquiries and POST generate-leasing-page / copy / fit / photos', async () => {
    setUnauthenticatedBrokerGuard();
    const params = Promise.resolve({ spaceId: SPACE_ID });

    const { GET: getInquiries } = await import('@/app/api/spaces/[spaceId]/inquiries/route');
    const { POST: postLeasingPage } = await import(
      '@/app/api/spaces/[spaceId]/generate-leasing-page/route'
    );
    const { POST: postCopy } = await import(
      '@/app/api/spaces/[spaceId]/generate-campaign-copy/route'
    );
    const { POST: postFit } = await import('@/app/api/spaces/[spaceId]/evaluate-fit/route');
    const { POST: postPhotos } = await import('@/app/api/spaces/[spaceId]/classify-photos/route');

    expect(
      (await getInquiries(makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'GET'), { params }))
        .status,
    ).toBe(401);
    expect(
      (
        await postLeasingPage(
          makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/generate-leasing-page`, 'POST', {}),
          { params },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postCopy(
          makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/generate-campaign-copy`, 'POST', {}),
          { params },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postFit(
          makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/evaluate-fit`, 'POST', {}),
          { params },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postPhotos(
          makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/classify-photos`, 'POST', {}),
          { params },
        )
      ).status,
    ).toBe(401);
  });

  it('rejects non-owning brokers with 403 and missing spaceId with 404, while allowing owning broker (200)', async () => {
    const { GET: getInquiries } = await import('@/app/api/spaces/[spaceId]/inquiries/route');
    const { POST: postLeasingPage } = await import(
      '@/app/api/spaces/[spaceId]/generate-leasing-page/route'
    );

    // Non-owner broker → 403 on direct space AND building-linked space
    setBrokerGuard(OTHER_ID, 'broker');
    expect(
      (
        await getInquiries(makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'GET'), {
          params: Promise.resolve({ spaceId: SPACE_ID }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await postLeasingPage(
          makeJsonReq(`http://localhost/api/spaces/${BUILDING_LINKED_SPACE_ID}/generate-leasing-page`, 'POST', {}),
          { params: Promise.resolve({ spaceId: BUILDING_LINKED_SPACE_ID }) },
        )
      ).status,
    ).toBe(403);

    // Missing space → 404
    setBrokerGuard(OWNER_ID, 'broker');
    expect(
      (
        await getInquiries(
          makeJsonReq(`http://localhost/api/spaces/${MISSING_SPACE_ID}/inquiries`, 'GET'),
          { params: Promise.resolve({ spaceId: MISSING_SPACE_ID }) },
        )
      ).status,
    ).toBe(404);

    // Owner broker → 200 on both direct space and building_ssot_lite-linked space
    const okInq = await getInquiries(
      makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'GET'),
      { params: Promise.resolve({ spaceId: SPACE_ID }) },
    );
    expect(okInq.status).toBe(200);

    const okGen = await postLeasingPage(
      makeJsonReq(`http://localhost/api/spaces/${BUILDING_LINKED_SPACE_ID}/generate-leasing-page`, 'POST', {}),
      { params: Promise.resolve({ spaceId: BUILDING_LINKED_SPACE_ID }) },
    );
    expect(okGen.status).toBe(200);
  });

  it('keeps public POST /api/spaces/[spaceId]/inquiries working with rate-limit (429) and length bounds (400)', async () => {
    const { POST: postInquiry } = await import('@/app/api/spaces/[spaceId]/inquiries/route');
    const params = Promise.resolve({ spaceId: SPACE_ID });

    const validRes = await postInquiry(
      makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'POST', {
        prospect: { display_name: '임차 희망자', company_name: '클리닉' },
        requirement: { tenant_category: 'clinic', move_in_timing: '3개월 이내' },
        question_text: '주차 대수 문의드립니다.',
        consent: { privacy_consent_given: true },
      }),
      { params },
    );
    expect(validRes.status).toBe(200);

    const oversizedQuestion = await postInquiry(
      makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'POST', {
        prospect: { display_name: '임차 희망자' },
        requirement: {},
        question_text: '가'.repeat(2005),
        consent: { privacy_consent_given: true },
      }),
      { params },
    );
    expect(oversizedQuestion.status).toBe(400);

    rateLimitAllowed = false;
    const rateLimited = await postInquiry(
      makeJsonReq(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, 'POST', {
        prospect: { display_name: '임차 희망자' },
        requirement: {},
        consent: { privacy_consent_given: true },
      }),
      { params },
    );
    expect(rateLimited.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/iot/ingest — Fail-Closed API Key & timingSafeEqual
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/iot/ingest — fail-closed API key authentication', () => {
  const ORIGINAL_IOT_KEY = process.env.IOT_INGEST_API_KEY;

  afterEach(() => {
    if (ORIGINAL_IOT_KEY === undefined) {
      delete process.env.IOT_INGEST_API_KEY;
    } else {
      process.env.IOT_INGEST_API_KEY = ORIGINAL_IOT_KEY;
    }
  });

  const validIotBody = {
    device_id: 'sensor-01',
    building_id: BUILDING_ID,
    metrics: [
      {
        metric_type: 'footfall',
        value: 140,
        floor: '1F',
        recorded_at: '2026-11-15T00:00:00Z',
      },
    ],
  };

  it('fails closed with 503 when IOT_INGEST_API_KEY is unset or whitespace', async () => {
    const { POST } = await import('@/app/api/iot/ingest/route');

    delete process.env.IOT_INGEST_API_KEY;
    const unsetRes = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody),
    );
    expect(unsetRes.status).toBe(503);
    expect((await unsetRes.json()).error).toBe('IoT 수집 키가 설정되지 않았습니다.');

    process.env.IOT_INGEST_API_KEY = '   ';
    const blankRes = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody, {
        'x-iot-api-key': 'anything',
      }),
    );
    expect(blankRes.status).toBe(503);
    expect(fakeDb.writes).toEqual([]);
  });

  it('rejects missing or wrong keys (different length & same byte length) with 401, and accepts valid key (200)', async () => {
    process.env.IOT_INGEST_API_KEY = 'super-secret-iot-key-32bytes-ok!';
    const { POST } = await import('@/app/api/iot/ingest/route');

    const missingKey = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody),
    );
    expect(missingKey.status).toBe(401);

    // Different byte length — must not throw in timingSafeEqual
    const shortKey = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody, {
        'x-iot-api-key': 'short',
      }),
    );
    expect(shortKey.status).toBe(401);

    // Identical byte length, wrong key
    const sameLenWrongKey = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody, {
        'x-iot-api-key': 'super-secret-iot-key-32bytes-NO!',
      }),
    );
    expect(sameLenWrongKey.status).toBe(401);
    expect(fakeDb.writes).toEqual([]);

    // Exact valid key → 200
    const validRes = await POST(
      makeJsonReq('http://localhost/api/iot/ingest', 'POST', validIotBody, {
        'x-iot-api-key': 'super-secret-iot-key-32bytes-ok!',
      }),
    );
    expect(validRes.status).toBe(200);
    expect(await validRes.json()).toEqual({ ok: true, ingested: 1 });
  });
});
