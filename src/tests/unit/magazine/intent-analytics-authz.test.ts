/**
 * intent / analytics 드릴다운 인가 (S2-03, S2-04, T3-SEC-1, D2-13)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const SUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUB_A_EMPTY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  ctx: null as unknown,
  unauth: false,
  clientOwned: true,
  insertSeq: 0,
  afterCalls: 0,
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: () => { h.afterCalls += 1; } };
});
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => {
      if (h.unauth) return { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) };
      return { ctx: h.ctx, error: null };
    },
  };
});

import { POST as intentPOST } from '@/app/api/broker/magazine/subscribers/[id]/intent/route';
import { GET as analyticsGET } from '@/app/api/broker/magazine/analytics/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] };

const SUBS: Array<Record<string, unknown>> = [
  {
    id: SUB_A, broker_id: 'broker-a', client_id: 'cl-1', status: 'active', segment: 'investor', channel: 'kakao',
    subscriber_name: '내고객', subscriber_phone: '01011112222', subscriber_email: 'mine@a.com', subscribed_at: '2026-09-01T00:00:00Z',
    interest_profile: { budgetRange: { min: 2_000_000_000, max: 5_000_000_000 }, tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] } },
  },
  {
    id: SUB_A_EMPTY, broker_id: 'broker-a', client_id: null, status: 'active', segment: 'investor', channel: 'kakao',
    subscriber_name: '근거없음', subscriber_phone: '01055556666', subscriber_email: null, subscribed_at: '2026-09-01T00:00:00Z',
    interest_profile: {},
  },
  {
    id: SUB_B, broker_id: 'broker-b', client_id: 'cl-b', status: 'active', segment: 'investor', channel: 'email',
    subscriber_name: '타브로커고객', subscriber_phone: '01099998888', subscriber_email: 'secret@b.com', subscribed_at: '2026-09-01T00:00:00Z',
    interest_profile: { budgetRange: { min: 1, max: 2 }, tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] } },
  },
];

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'magazine_subscribers':
        if (call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) return { data: rowVisibleTo(SUBS, call) ?? null };
        return { data: filterRows(SUBS, call) };
      case 'buyer_intent_lite':
        if (call.op === 'insert') return { data: { id: `intent-${++h.insertSeq}`, ...(call.payload as object) } };
        return { data: [] };
      case 'broker_clients': {
        if (call.op === 'update') return { data: null };
        // broker_clients 실제 소유 컬럼은 broker_id(uuid = 로그인 user.id). owner_id 컬럼은 없다.
        const owner = call.filters.find((f) => f[0] === 'eq' && f[1] === 'broker_id')?.[2];
        return { data: h.clientOwned && owner === UA ? { id: 'cl-1', linked_buyer_intent_ids: [] } : null };
      }
      case 'magazine_editions':
        return { data: [{ id: 'ed-a', created_at: '2026-10-01T00:00:00Z' }] };
      case 'magazine_analytics_events':
        return { data: [{ id: 'ev1', event_type: 'page_view', edition_id: 'ed-a', section_id: 'market', dwell_seconds: null, created_at: '2026-10-02T00:00:00Z' }] };
      default:
        return { data: null };
    }
  }) as never;
}

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const callsOf = (table: string, op?: string) =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && (!op || c.op === op));

beforeEach(() => {
  h.unauth = false;
  h.ctx = ctxA;
  h.clientOwned = true;
  h.insertSeq = 0;
  h.afterCalls = 0;
  setupDb();
});

describe('POST /subscribers/[id]/intent', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_A));
    expect(res.status).toBe(401);
  });

  it('타 브로커 구독자 → 404, buyer_intent_lite/broker_clients 쓰기 없음 (S2-04)', async () => {
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_B));
    expect(res.status).toBe(404);
    expect(callsOf('buyer_intent_lite')).toHaveLength(0);
    expect(callsOf('broker_clients')).toHaveLength(0);
  });

  it('근거(권역·자산·예산)가 없으면 아무것도 지어내지 않고 빈 결과 (D2-13)', async () => {
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_A_EMPTY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 0, created: 0, intents: [], reason: 'NO_EVIDENCE' });
    expect(callsOf('buyer_intent_lite', 'insert')).toHaveLength(0);
  });

  it('근거가 있으면 구독자가 입력한 값으로만 생성, owner_id=ctx.userId, count==created', async () => {
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_A));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.created).toBe(json.count);
    const ins = callsOf('buyer_intent_lite', 'insert')[0].payload as Record<string, unknown>;
    expect(ins).toMatchObject({
      owner_id: UA,
      preferred_regions: ['강남'],
      asset_types: ['꼬마빌딩'],
      budget_min: 280000, // (2e9+5e9)/2 * 0.8 / 10000 만원
      budget_max: 420000,
    });
    expect(h.afterCalls).toBe(1);
  });

  it('본인 소유 client_id만 연결(broker_id=user.id 조건 포함), 타인 고객이면 연결하지 않음', async () => {
    await intentPOST(req('/x', { method: 'POST' }), params(SUB_A));
    const upd = callsOf('broker_clients', 'update')[0];
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'broker_id', UA]]));
    expect(upd.filters.some((f) => f[1] === 'owner_id')).toBe(false);

    setupDb();
    h.clientOwned = false;
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_A));
    expect(res.status).toBe(200);
    expect((await res.json()).clientLinked).toBe(false);
    expect(callsOf('broker_clients', 'update')).toHaveLength(0);
  });

  it('오류 응답의 error는 문자열 (현 클라이언트가 json.error 를 문자열로 보간)', async () => {
    h.unauth = false;
    h.db = createFakeDb(() => ({ data: SUBS[0] })) as never;
    // buyer_intent_lite 조회 실패 → 500
    h.db = createFakeDb((c) => (c.table === 'buyer_intent_lite' ? { error: { message: 'x' } } : { data: SUBS[0] })) as never;
    const res = await intentPOST(req('/x', { method: 'POST' }), params(SUB_A));
    expect(res.status).toBe(500);
    expect(typeof (await res.json()).error).toBe('string');
  });
});

describe('GET /analytics?subscriberId= (드릴다운 IDOR)', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    expect((await analyticsGET(req(`/api/broker/magazine/analytics?subscriberId=${SUB_A}`))).status).toBe(401);
    expect(h.db.calls).toHaveLength(0);
  });

  it('타 브로커 구독자 → 404 이고 PII·이벤트 조회 없음 (S2-03)', async () => {
    const res = await analyticsGET(req(`/api/broker/magazine/analytics?subscriberId=${SUB_B}`));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toMatch(/secret@b\.com|01099998888|타브로커고객/);
    expect(callsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('존재하지 않는 id · 비정상 id → 404 (타 브로커와 구분 불가)', async () => {
    const none = await analyticsGET(req('/api/broker/magazine/analytics?subscriberId=dddddddd-dddd-4ddd-8ddd-dddddddddddd'));
    const bad = await analyticsGET(req('/api/broker/magazine/analytics?subscriberId=' + encodeURIComponent('x,metadata->>a.eq.1')));
    expect(none.status).toBe(404);
    expect(bad.status).toBe(404);
    expect(callsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('소유 구독자 → 200 + 본인 PII, 이벤트는 내 에디션으로 한정', async () => {
    const res = await analyticsGET(req(`/api/broker/magazine/analytics?subscriberId=${SUB_A}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subscriber.subscriber_name).toBe('내고객');
    expect(json.analytics.totalViews).toBe(1);
    const ev = callsOf('magazine_analytics_events')[0];
    expect(ev.filters).toEqual(expect.arrayContaining([['in', 'edition_id', ['ed-a']]]));
  });

  it('대시보드 이벤트 쿼리는 내 에디션 + v2 방문자로 한정 (T3-SEC-1), activity_events actor_id는 uuid 단일값', async () => {
    const res = await analyticsGET(req('/api/broker/magazine/analytics'));
    expect(res.status).toBe(200);
    const events = callsOf('magazine_analytics_events');
    expect(events.length).toBeGreaterThanOrEqual(2); // 대시보드 집계 + 구독자 온도(loadSubscriberEvents)
    for (const ev of events) {
      expect(ev.filters).toEqual(expect.arrayContaining([['in', 'edition_id', ['ed-a']]]));
      expect(ev.filters).toEqual(expect.arrayContaining([['like', 'visitor_id', 'v2_%']]));
    }
    expect(events.some((c) => c.filters.some((f) => f[0] === 'limit' && f[1] === 10000))).toBe(true);
    const act = callsOf('activity_events')[0];
    expect(act.filters).toEqual(expect.arrayContaining([['eq', 'actor_id', UA]]));
    // 구독자 목록 쿼리도 brokerKeys 한정
    const subs = callsOf('magazine_subscribers').filter((c) => c.filters.some((f) => f[0] === 'in' && f[1] === 'broker_id'));
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(s.filters).toEqual(expect.arrayContaining([['in', 'broker_id', ['broker-a', UA]]]));
  });
});
