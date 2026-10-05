/**
 * /api/magazine/editions 인가 (P0-03: T1-03, S2-05)
 *  - GET: 공개는 published만, draft는 소유자만
 *  - POST: body.broker_id 무시(ctx.slug 사용), 비로그인 401
 *  - PATCH: 타 브로커 404(업데이트 미실행), 비로그인 401, published 잠금
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  ctx: null as unknown,
  unauth: false,
  authOpts: [] as unknown[],
  generated: [] as unknown[],
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async (_req: unknown, opts: unknown) => {
      h.authOpts.push(opts);
      if (h.unauth) return { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) };
      return { ctx: h.ctx, error: null };
    },
  };
});
vi.mock('@/domain/magazine/weekly-generator', () => ({
  generateWeeklyMagazine: async (args: unknown) => {
    h.generated.push(args);
    return { id: 'new-ed', broker_id: (args as { brokerId: string }).brokerId };
  },
}));

import { GET, PATCH, POST } from '@/app/api/magazine/editions/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] };

const EDITIONS: Array<Record<string, unknown>> = [
  { id: 'ed-a-draft', broker_id: 'broker-a', status: 'draft', edition_type: 'weekly', edition_label: 'W40-2026' },
  { id: 'ed-a-pub', broker_id: 'broker-a', status: 'published', edition_type: 'weekly', edition_label: 'W39-2026' },
  { id: 'ed-b-draft', broker_id: 'broker-b', status: 'draft', edition_type: 'weekly', edition_label: 'W40-2026' },
];

function setupDb(rows = EDITIONS) {
  h.db = createFakeDb((call: FakeCall) => {
    if (call.table === 'broker_profiles') {
      const slug = call.filters.find((f) => f[0] === 'eq' && f[1] === 'slug')?.[2];
      if (slug === 'broker-a') return { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: [], specialty_assets: [], is_public: true } };
      if (slug === 'broker-b') return { data: { user_id: UB, slug: 'broker-b', bio: null, specialty_regions: [], specialty_assets: [], is_public: true } };
      return { data: null };
    }
    if (call.table === 'profiles') return { data: { id: UA, display_name: 'A' } };
    if (call.table === 'magazine_editions') {
      if (call.op === 'update') {
        const row = rowVisibleTo(rows, call);
        return { data: row ? { ...row, ...(call.payload as object) } : null };
      }
      if (call.op === 'select' && call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) {
        return { data: rowVisibleTo(rows, call) ?? null };
      }
      return { data: filterRows(rows, call) };
    }
    return { data: null };
  }) as never;
}

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const callsOf = (table: string, op?: string) =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && (!op || c.op === op));

beforeEach(() => {
  h.unauth = false;
  h.ctx = ctxA;
  h.authOpts = [];
  h.generated = [];
  setupDb();
});

describe('PATCH /api/magazine/editions', () => {
  it('비로그인 → 401, DB 접근 없음', async () => {
    h.unauth = true;
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft', title: 'x' } }));
    expect(res.status).toBe(401);
    expect(h.db.calls).toHaveLength(0);
  });

  it('타 브로커 에디션 → 404 이고 update는 실행되지 않는다', async () => {
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-b-draft', title: 'hijack' } }));
    expect(res.status).toBe(404);
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
  });

  it('없는 id → 404 (존재 여부 비노출: 타 브로커와 동일 응답)', async () => {
    const other = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-b-draft', title: 'x' } }));
    const none = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'nope', title: 'x' } }));
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual(await other.json());
  });

  it('소유자 → 200, update는 id + broker_id IN ctx.brokerKeys 로 한정', async () => {
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft', title: '새 제목' } }));
    expect(res.status).toBe(200);
    const upd = callsOf('magazine_editions', 'update')[0];
    expect(upd.payload).toMatchObject({ title: '새 제목' });
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', 'ed-a-draft'], ['in', 'broker_id', ['broker-a', UA]]]));
  });

  it('draft → published 최초 전이 시 published_at 기록', async () => {
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft', status: 'published' } }));
    expect(res.status).toBe(200);
    const payload = callsOf('magazine_editions', 'update')[0].payload as Record<string, unknown>;
    expect(payload.status).toBe('published');
    expect(typeof payload.published_at).toBe('string');
  });

  it('published 잠금: draft 복귀 PATCH → 409 PUBLISHED_LOCKED, update 미실행', async () => {
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-pub', status: 'draft' } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PUBLISHED_LOCKED');
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
  });

  it('이미 published를 published로 재저장하면 published_at을 덮어쓰지 않는다', async () => {
    const res = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-pub', status: 'published', title: '정정' } }));
    expect(res.status).toBe(200);
    const payload = callsOf('magazine_editions', 'update')[0].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('published_at');
  });

  it('허용되지 않는 필드(broker_id)는 무시되고, 비정상 입력은 400', async () => {
    const ok = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft', title: 't', broker_id: 'broker-b' } }));
    expect(ok.status).toBe(200);
    expect(callsOf('magazine_editions', 'update')[0].payload).not.toHaveProperty('broker_id');
    const bad = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft', status: 'weird' } }));
    expect(bad.status).toBe(400);
    const noId = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { title: 'x' } }));
    expect(noId.status).toBe(400);
    const empty = await PATCH(req('/api/magazine/editions', { method: 'PATCH', body: { id: 'ed-a-draft' } }));
    expect(empty.status).toBe(400);
  });
});

describe('POST /api/magazine/editions', () => {
  it('비로그인 → 401, 생성기 미호출', async () => {
    h.unauth = true;
    const res = await POST(req('/api/magazine/editions', { method: 'POST', body: {} }));
    expect(res.status).toBe(401);
    expect(h.generated).toHaveLength(0);
  });

  it('body.broker_id를 무시하고 ctx.slug로 생성한다 (S2-05)', async () => {
    const res = await POST(req('/api/magazine/editions', { method: 'POST', body: { broker_id: 'broker-b', edition_label: 'W41-2026' } }));
    expect(res.status).toBe(201);
    expect(h.generated).toHaveLength(1);
    expect(h.generated[0]).toMatchObject({ brokerId: 'broker-a', editionLabel: 'W41-2026', editionType: 'weekly' });
  });

  it('requireSlug:true 로 컨텍스트를 요청한다 (slug 없는 계정 차단)', async () => {
    await POST(req('/api/magazine/editions', { method: 'POST', body: {} }));
    expect(h.authOpts[0]).toEqual({ requireSlug: true });
  });

  it('이미 발행된 동일 호수 재생성 → 409 (upsert 덮어쓰기 방지)', async () => {
    const res = await POST(req('/api/magazine/editions', { method: 'POST', body: { edition_label: 'W39-2026' } }));
    expect(res.status).toBe(409);
    expect(h.generated).toHaveLength(0);
  });

  it('비정상 edition_type/label → 400', async () => {
    const a = await POST(req('/api/magazine/editions', { method: 'POST', body: { edition_type: '../x' } }));
    const b = await POST(req('/api/magazine/editions', { method: 'POST', body: { edition_label: '<script>' } }));
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(h.generated).toHaveLength(0);
  });
});

describe('GET /api/magazine/editions', () => {
  it('broker_id 누락 → 400', async () => {
    const res = await GET(req('/api/magazine/editions'));
    expect(res.status).toBe(400);
  });

  it('비로그인: published만 반환 (draft 미노출)', async () => {
    h.unauth = true;
    const res = await GET(req('/api/magazine/editions?broker_id=broker-a'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.editions.map((e: { id: string }) => e.id)).toEqual(['ed-a-pub']);
    expect(json.editions.every((e: { status: string }) => e.status === 'published')).toBe(true);
  });

  it('비로그인이 status=draft 요청 → 404', async () => {
    h.unauth = true;
    const res = await GET(req('/api/magazine/editions?broker_id=broker-a&status=draft'));
    expect(res.status).toBe(404);
  });

  it('타 브로커(B) 로그인 상태에서 A의 draft 요청 → 404', async () => {
    h.ctx = { userId: UB, slug: 'broker-b', displayName: 'B', brokerKeys: ['broker-b', UB] };
    const res = await GET(req('/api/magazine/editions?broker_id=broker-a&status=draft'));
    expect(res.status).toBe(404);
  });

  it('소유자는 draft 포함 조회 가능, 타 브로커 행은 포함되지 않는다', async () => {
    const res = await GET(req('/api/magazine/editions?broker_id=broker-a'));
    const ids = (await res.json()).editions.map((e: { id: string }) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['ed-a-draft', 'ed-a-pub']));
    expect(ids).not.toContain('ed-b-draft');
    const sel = callsOf('magazine_editions', 'select')[0];
    expect(sel.filters).toEqual(expect.arrayContaining([['in', 'broker_id', ['broker-a', UA]]]));
  });

  it('없는 broker(slug) → 404, 형식 불량 broker_id → 404 (DB 열거 불가)', async () => {
    h.unauth = true;
    const ghost = await GET(req('/api/magazine/editions?broker_id=ghost-broker'));
    expect(ghost.status).toBe(404);
    const bad = await GET(req('/api/magazine/editions?broker_id=' + encodeURIComponent('a,b)')));
    expect(bad.status).toBe(404);
    expect(callsOf('magazine_editions')).toHaveLength(0);
  });
});
