import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXISTING_CLIENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const h = vi.hoisted(() => ({
  afterBehavior: 'register' as 'register' | 'throw',
  afterCallbacks: [] as Array<() => unknown>,
  rateLimitAllowed: true,
  rateLimitCalls: [] as Array<{ key: string; action: string; limit: number; windowMs: number }>,
  authState: {
    authenticated: true,
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'broker' as string | null,
  },
  personaImpl: async (_input?: unknown): Promise<any> => ({
    output: { personas: [{ name: '사옥 매수자' }] },
    model: 'gpt-4o-mini',
    promptVersion: 'v1',
    tokens: 100,
  }),
  qualifierImpl: async (_input?: unknown): Promise<any> => ({
    status: 'success',
    output: {
      fit_estimate: 'high',
      summary: '적합',
      budget_fit: 'good',
      timing_fit: 'good',
      facility_fit: 'good',
      key_concerns: [],
      recommended_next_action: '내방 안내',
      kakao_reply_draft: '안녕하세요',
      missing_info_to_ask: [],
    },
  }),
  oiticleImpl: async (): Promise<any> => {
    throw new Error('SECRET_DB_INTERNAL_CONNECTION_STRING_LEAK');
  },
  dbTables: {} as Record<string, Array<Record<string, any>>>,
  upsertCalls: [] as Array<{ table: string; payload: any; options: any }>,
  updateCalls: [] as Array<{ table: string; payload: any; filters: Array<{ op: string; col: string; val: any }> }>,
  isCalls: [] as Array<{ table: string; col: string; val: any }>,
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => {
      if (h.afterBehavior === 'throw') {
        throw new Error('`after` was called outside a request scope.');
      }
      h.afterCallbacks.push(cb);
    }),
  };
});

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(async (key: string, action: string, limit: number, windowMs: number) => {
    h.rateLimitCalls.push({ key, action, limit, windowMs });
    return h.rateLimitAllowed;
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => {
    if (!h.authState.authenticated) {
      return {
        user: null,
        role: null,
        profile: null,
        error: NextResponse.json(
          { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
          { status: 401 },
        ),
      };
    }
    return {
      user: { id: h.authState.userId, email: 'broker@credeal.kr' },
      role: h.authState.role ?? 'broker',
      profile: { role: h.authState.role ?? 'broker', display_name: '테스트 중개사' },
      error: null,
    };
  }),
  requireAdmin: vi.fn(async () => ({
    user: { id: ADMIN_ID, email: 'admin@credeal.kr' },
    role: 'admin',
    profile: { role: 'admin', display_name: '관리자' },
    error: null,
  })),
  requireRole: vi.fn(async () => ({
    user: { id: ADMIN_ID, email: 'admin@credeal.kr' },
    role: 'admin',
    profile: { role: 'admin', display_name: '관리자' },
    error: null,
  })),
}));

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: vi.fn(async () =>
    h.authState.authenticated
      ? { userId: h.authState.userId, isAdmin: h.authState.role === 'admin' }
      : { userId: null, isAdmin: false },
  ),
}));

vi.mock('@/ai/agents/ideal-buyer-persona', () => ({
  runIdealBuyerPersona: (...args: unknown[]) => h.personaImpl(args[0]),
}));

vi.mock('@/ai/agents/inquiry-qualifier-agent', () => ({
  runInquiryQualifierAgent: (...args: unknown[]) => h.qualifierImpl(args[0]),
}));

vi.mock('@/domain/pulse/oiticle-generator', () => ({
  generateOiticle: () => h.oiticleImpl(),
  generateMonthlyMarketOiticles: () => h.oiticleImpl(),
}));

vi.mock('@/lib/external/address-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/external/address-resolver')>();
  return {
    ...actual,
    resolveAddress: vi.fn(async () => ({
      pnu: '1199910100109990001',
      legalDongCode: '1199910100',
      sigunguCd: '11999',
      bjdongCd: '10100',
      platGbCd: '0' as const,
      bun: '0999',
      ji: '0001',
      roadAddress: '서울특별시 테스트구 비공개로 99',
      jibunAddress: '서울특별시 테스트구 비공개동 999-1',
      lat: 37.5,
      lng: 127.0,
      buildingMgtNo: '',
    })),
  };
});

vi.mock('@/lib/external/building-register-api', () => ({
  fetchBuildingRegister: vi.fn(async () => null),
  fetchBuildingAttachedLots: vi.fn(async () => []),
}));

vi.mock('@/lib/external/land-use-api', () => ({
  fetchLandUsePlan: vi.fn(async () => null),
}));

vi.mock('@/lib/external/land-price-api', () => ({
  fetchLandPrice: vi.fn(async () => null),
}));

function buildFakeSupabase() {
  let seq = 1;
  return {
    from(table: string) {
      const filters: Array<{ op: string; col: string; val: any }> = [];
      let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
      let payload: any = null;
      let upsertOptions: any = null;

      const matchRows = (rows: Array<Record<string, any>>) =>
        rows.filter((r) =>
          filters.every((f) => {
            if (f.op === 'eq') return String(r[f.col] ?? '') === String(f.val ?? '');
            if (f.op === 'is') return f.val === null ? r[f.col] === null || r[f.col] === undefined : r[f.col] === f.val;
            return true;
          }),
        );

      const execute = () => {
        const rows = (h.dbTables[table] ??= []);
        if (op === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload];
          const inserted = list.map((item) => {
            const created = { id: item.id ?? `${table}-${seq++}`, ...item };
            rows.push(created);
            return created;
          });
          return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
        }
        if (op === 'upsert') {
          h.upsertCalls.push({ table, payload, options: upsertOptions });
          if (upsertOptions?.ignoreDuplicates && upsertOptions?.onConflict === 'broker_id,phone') {
            const dup = rows.find(
              (r) => r.broker_id === payload.broker_id && r.phone === payload.phone,
            );
            if (dup) {
              // Simulate PostgREST Prefer: resolution=ignore-duplicates (0 rows returned, existing row untouched)
              return { data: null, error: null };
            }
          }
          const created = { id: payload.id ?? `${table}-${seq++}`, ...payload };
          rows.push(created);
          return { data: created, error: null };
        }
        if (op === 'update') {
          h.updateCalls.push({ table, payload, filters: [...filters] });
          const matched = matchRows(rows);
          for (const r of matched) Object.assign(r, payload);
          return { data: matched, error: null };
        }
        return { data: matchRows(rows), error: null };
      };

      const chain: any = {
        select: () => chain,
        insert(p: any) {
          op = 'insert';
          payload = p;
          return chain;
        },
        update(p: any) {
          op = 'update';
          payload = p;
          return chain;
        },
        upsert(p: any, opts?: any) {
          op = 'upsert';
          payload = p;
          upsertOptions = opts;
          return chain;
        },
        delete() {
          op = 'delete';
          return chain;
        },
        eq(col: string, val: any) {
          filters.push({ op: 'eq', col, val });
          return chain;
        },
        is(col: string, val: any) {
          filters.push({ op: 'is', col, val });
          h.isCalls.push({ table, col, val });
          return chain;
        },
        lt: () => chain,
        or: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        async maybeSingle() {
          const res = execute();
          const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
          return { data: row, error: res.error };
        },
        async single() {
          const res = execute();
          const row = Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null);
          if (!row) return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
          return { data: row, error: null };
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => buildFakeSupabase(),
}));

describe('Wave 2 Track 2B — Serverless after() Lifecycle, maxDuration SSOT & Upload/Lookup Hardening', () => {
  beforeEach(() => {
    h.afterBehavior = 'register';
    h.afterCallbacks = [];
    h.rateLimitAllowed = true;
    h.rateLimitCalls = [];
    h.authState = { authenticated: true, userId: OWNER_ID, role: 'broker' };
    h.dbTables = {};
    h.upsertCalls = [];
    h.updateCalls = [];
    h.isCalls = [];
    h.personaImpl = async () => ({
      output: { personas: [{ name: '사옥 매수자' }] },
      model: 'gpt-4o-mini',
      promptVersion: 'v1',
      tokens: 100,
    });
  });

  it('(1) runAfterResponse registers with next/server after() inside request scope and falls back cleanly outside request scope', async () => {
    const { runAfterResponse } = await import('@/lib/server/after-safe');

    // Inside request scope: registers callback with after() without executing synchronously
    let ranInScope = false;
    h.afterBehavior = 'register';
    runAfterResponse('test-in-scope', async () => {
      ranInScope = true;
    });

    expect(h.afterCallbacks).toHaveLength(1);
    expect(ranInScope).toBe(false);
    await h.afterCallbacks[0]();
    expect(ranInScope).toBe(true);

    // Outside request scope (after() throws): falls back cleanly to void wrapped() and swallows inner rejection
    let ranFallback = false;
    h.afterBehavior = 'throw';
    runAfterResponse('test-outside-scope', async () => {
      ranFallback = true;
      throw new Error('simulated background failure');
    });

    await vi.waitFor(() => expect(ranFallback).toBe(true));
  });

  it('(2) ideal-buyer-persona marks ai_runs as "failed" when LLM throws inside after() and masks 500 error details', async () => {
    const { POST } = await import('@/app/api/broker/ideal-buyer-persona/route');
    h.personaImpl = async () => {
      throw new Error('OPENAI_UPSTREAM_SECRET_TRACE_999');
    };

    const asyncReq = new NextRequest('http://localhost/api/broker/ideal-buyer-persona', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dealId: 'deal-w2b',
        areaSignal: '강남구 역삼동',
        assetType: '업무시설',
        isAsync: true,
      }),
    });

    const res = await POST(asyncReq);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.isAsync).toBe(true);
    expect(typeof json.jobId).toBe('string');

    expect(h.dbTables.ai_runs).toHaveLength(1);
    expect(h.dbTables.ai_runs[0].status).toBe('started');
    expect(h.afterCallbacks).toHaveLength(1);

    // Execute scheduled after() callback — must NOT return dead NextResponse, must update ai_runs.status = 'failed'
    await h.afterCallbacks[0]();

    expect(h.dbTables.ai_runs[0].status).toBe('failed');
    expect(h.dbTables.ai_runs[0].error).toContain('OPENAI_UPSTREAM_SECRET_TRACE_999');

    // Sync failure path also masks raw error message from HTTP response
    const syncRes = await POST(
      new NextRequest('http://localhost/api/broker/ideal-buyer-persona', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dealId: 'deal-w2b-sync', isAsync: false }),
      }),
    );
    expect(syncRes.status).toBe(500);
    const syncBodyText = JSON.stringify(await syncRes.json());
    expect(syncBodyText).not.toContain('OPENAI_UPSTREAM_SECRET_TRACE_999');
  });

  it('(3) spaces/[spaceId]/inquiries passes ignoreDuplicates: true on broker_clients upsert and preserves private CRM fields', async () => {
    h.dbTables.spaces = [
      { id: SPACE_ID, created_by: OWNER_ID, display_name: '테헤란로 오피스 3층' },
    ];
    h.dbTables.broker_clients = [
      {
        id: EXISTING_CLIENT_ID,
        broker_id: OWNER_ID,
        display_name: '김회장 (VIP 기존고객)',
        company: '한강홀딩스',
        phone: '010-9999-8888',
        tier: 'VIP',
        tags: ['핵심매수자', '100억대'],
      },
    ];
    h.dbTables.leasing_inquiries = [];
    h.dbTables.inquiry_qualifications = [];
    h.dbTables.tenant_intent = [];
    h.dbTables.lease_spaces = [];

    const { POST } = await import('@/app/api/spaces/[spaceId]/inquiries/route');
    const res = await POST(
      new NextRequest(`http://localhost/api/spaces/${SPACE_ID}/inquiries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect: {
            display_name: '공격자 덮어쓰기 시도',
            company_name: '가짜회사',
            contact_internal: { phone: '010-9999-8888', email: 'spoof@example.com' },
          },
          requirement: {
            tenant_category: 'clinic',
            move_in_timing: '3개월 이내',
          },
          question_text: '임대 문의합니다.',
          consent: { privacy_consent_given: true },
        }),
      }),
      { params: Promise.resolve({ spaceId: SPACE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(h.afterCallbacks).toHaveLength(1);
    await h.afterCallbacks[0]();

    const brokerClientUpsert = h.upsertCalls.find((c) => c.table === 'broker_clients');
    expect(brokerClientUpsert).toBeDefined();
    expect(brokerClientUpsert?.options).toEqual({
      onConflict: 'broker_id,phone',
      ignoreDuplicates: true,
    });

    // Existing private CRM record MUST remain untouched
    expect(h.dbTables.broker_clients[0]).toMatchObject({
      id: EXISTING_CLIENT_ID,
      display_name: '김회장 (VIP 기존고객)',
      company: '한강홀딩스',
      tier: 'VIP',
      tags: ['핵심매수자', '100억대'],
    });

    // Fallback lookup still links tenant_intent to EXISTING_CLIENT_ID
    expect(h.dbTables.tenant_intent).toHaveLength(1);
    expect(h.dbTables.tenant_intent[0].client_id).toBe(EXISTING_CLIENT_ID);
  });

  it('(4) memo/voice and onboarding/analyze-photo reject >4.4 MB payloads with 413 PAYLOAD_TOO_LARGE', async () => {
    const { POST: voicePost } = await import('@/app/api/broker/memo/voice/route');
    const { POST: photoPost } = await import('@/app/api/onboarding/analyze-photo/route');

    const overLimitBytes = Math.floor(4.4 * 1024 * 1024) + 1024;
    const oversizedBlob = new Blob([new Uint8Array(overLimitBytes)], { type: 'audio/webm' });
    const voiceForm = new FormData();
    voiceForm.append('audio', oversizedBlob, 'memo.webm');

    const voiceRes = await voicePost(
      new NextRequest('http://localhost/api/broker/memo/voice', {
        method: 'POST',
        body: voiceForm,
      }),
    );
    expect(voiceRes.status).toBe(413);
    const voiceJson = await voiceRes.json();
    expect(voiceJson).toMatchObject({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: expect.any(String),
    });

    const oversizedPhoto = new File([new Uint8Array(overLimitBytes)], 'avatar.jpg', {
      type: 'image/jpeg',
    });
    const photoForm = new FormData();
    photoForm.append('photo', oversizedPhoto);

    const photoRes = await photoPost(
      new NextRequest('http://localhost/api/onboarding/analyze-photo', {
        method: 'POST',
        body: photoForm,
      }),
    );
    expect(photoRes.status).toBe(413);
    const photoJson = await photoRes.json();
    expect(photoJson).toMatchObject({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: expect.any(String),
    });
  });

  it('(5) all 10 heavy routes (plus 4 async lifecycle routes) export explicit maxDuration >= 60', async () => {
    const routeSpecs = [
      { name: 'public/im-lite/tts', loader: () => import('@/app/api/public/im-lite/[buildingId]/tts/route'), expected: 120 },
      { name: 'public/im-lite/translate', loader: () => import('@/app/api/public/im-lite/[buildingId]/translate/route'), expected: 120 },
      { name: 'oiticle/generate', loader: () => import('@/app/api/oiticle/generate/route'), expected: 120 },
      { name: 'broker/memo/voice', loader: () => import('@/app/api/broker/memo/voice/route'), expected: 60 },
      { name: 'broker/buyer-intents/from-memo', loader: () => import('@/app/api/broker/buyer-intents/from-memo/route'), expected: 60 },
      { name: 'broker/basic-im-studio/ai-text', loader: () => import('@/app/api/broker/basic-im-studio/[id]/ai-text/route'), expected: 60 },
      { name: 'broker/deal-card/ai-copy', loader: () => import('@/app/api/broker/deal-card/ai-copy/route'), expected: 60 },
      { name: 'buildings/lookup', loader: () => import('@/app/api/buildings/lookup/route'), expected: 60 },
      { name: 'broker/inbox/import-contacts', loader: () => import('@/app/api/broker/inbox/import-contacts/route'), expected: 60 },
      { name: 'onboarding/analyze-photo', loader: () => import('@/app/api/onboarding/analyze-photo/route'), expected: 60 },
      { name: 'admin/etl/molit', loader: () => import('@/app/api/admin/etl/molit/route'), expected: 300 },
      { name: 'spaces/[spaceId]/inquiries', loader: () => import('@/app/api/spaces/[spaceId]/inquiries/route'), expected: 60 },
      { name: 'broker/ideal-buyer-persona', loader: () => import('@/app/api/broker/ideal-buyer-persona/route'), expected: 60 },
      { name: 'broker/im-lite/generate-async', loader: () => import('@/app/api/broker/im-lite/generate-async/route'), expected: 300 },
    ] as const;

    expect(routeSpecs.length).toBeGreaterThanOrEqual(10);

    for (const spec of routeSpecs) {
      const mod = (await spec.loader()) as Record<string, unknown>;
      expect(typeof mod.maxDuration, `${spec.name} maxDuration typeof`).toBe('number');
      expect(mod.maxDuration as number, `${spec.name} maxDuration >= 60`).toBeGreaterThanOrEqual(60);
      expect(mod.maxDuration, `${spec.name} exact maxDuration`).toBe(spec.expected);
    }
  });

  it('(6) buildings/lookup enforces IP rate limit (30/min), blocks private building_ssot_lite leakage to unauth/non-owner, and allows owner fallback', async () => {
    h.dbTables.building_ssot_lite = [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        owner_id: OWNER_ID,
        pnu: '1199910100109990001',
        raw_address: '서울특별시 테스트구 비공개동 999-1',
        raw_input: '비공개 메모',
        layers: {
          ssot_summary: {
            total_area_sqm: 1850.5,
            land_area_sqm: 410.2,
            zoning: '일반상업지역',
            building_name: '비공개 브로커 전용 타워',
          },
        },
      },
    ];

    const { GET } = await import('@/app/api/buildings/lookup/route');
    const url = `http://localhost/api/buildings/lookup?address=${encodeURIComponent('서울특별시 테스트구 비공개동 999-1')}`;

    // 1. Unauthenticated caller -> 404 (no public register & private building_ssot_lite withheld)
    h.authState = { authenticated: false, userId: '', role: null };
    const unauthRes = await GET(new NextRequest(url, { headers: { 'x-forwarded-for': '203.0.113.77' } }));
    expect(unauthRes.status).toBe(404);
    expect(h.rateLimitCalls[0]).toMatchObject({
      key: '203.0.113.77',
      action: 'buildings_lookup',
      limit: 30,
      windowMs: 60_000,
    });

    // 2. Authenticated non-owning broker -> 404 (cannot read OWNER_ID's building_ssot_lite)
    h.authState = { authenticated: true, userId: OTHER_ID, role: 'broker' };
    const otherBrokerRes = await GET(new NextRequest(url));
    expect(otherBrokerRes.status).toBe(404);

    // 3. Authenticated owning broker -> 200 (receives own building_ssot_lite fallback)
    h.authState = { authenticated: true, userId: OWNER_ID, role: 'broker' };
    const ownerRes = await GET(new NextRequest(url));
    expect(ownerRes.status).toBe(200);
    const ownerData = await ownerRes.json();
    expect(ownerData.buildingName).toBe('비공개 브로커 전용 타워');
    expect(ownerData.gfaSqm).toBe(1850.5);

    // 4. Rate limited -> 429
    h.rateLimitAllowed = false;
    const rateLimitedRes = await GET(new NextRequest(url));
    expect(rateLimitedRes.status).toBe(429);
  });

  it('(7) expireStaleApprovals filters .is("expired_at", null) and oiticle/generate masks 500 error strings', async () => {
    const { expireStaleApprovals } = await import('@/domain/team/circle-matching-service');
    await expireStaleApprovals();
    expect(h.isCalls).toContainEqual({
      table: 'circle_match_results',
      col: 'identity_revealed_at',
      val: null,
    });
    expect(h.isCalls).toContainEqual({
      table: 'circle_match_results',
      col: 'expired_at',
      val: null,
    });

    const { POST: oiticlePost } = await import('@/app/api/oiticle/generate/route');
    const oiticleRes = await oiticlePost(
      new NextRequest('http://localhost/api/oiticle/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'auto', type: 'market_pulse' }),
      }),
    );
    expect(oiticleRes.status).toBe(500);
    const oiticleJson = await oiticleRes.json();
    expect(JSON.stringify(oiticleJson)).not.toContain('SECRET_DB_INTERNAL_CONNECTION_STRING_LEAK');
  });
});
