/**
 * POST /api/public/magazine/analytics — 남용 방어·저장·알림 (E-04 · S2-08 / T3-13 / T3-14 / T3-25 / D2-25)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, type FakeCall } from './authz-fake-db';
import { __resetMemoryRateLimit } from '@/lib/magazine/public-guard';
import { issueSidToken } from '@/domain/magazine/sid-token';

const ED = '99999999-9999-4999-8999-999999999999';
const VIS = '11111111-1111-4111-8111-111111111111';
const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BROKER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET = 'test-secret-1234567890';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: Record<string, unknown>; calls: unknown[] },
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  alertCalls: [] as unknown[][],
  edition: null as null | { id: string; broker_id: string; status: string },
  /** magazine_issues.id 조회 결과 (레거시 issue id 경로) */
  issue: null as null | { id: string; broker_id: string; issue_date: string; content: unknown },
  /** magazine_editions 의 id 이외 조회(라벨/발행일/loadSubscriberEvents) 결과 */
  labelEditions: [{ id: '99999999-9999-4999-8999-999999999999' }] as Array<Record<string, unknown>>,
  dupCount: 0,
  sub: null as null | Record<string, unknown>,
  events: [] as Array<Record<string, unknown>>,
  capCount: 0,
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));
vi.mock('@/lib/magazine/resolve-broker', () => ({
  resolveBroker: async () => ({ userId: BROKER_USER, slug: 'broker-a' }),
}));
vi.mock('@/domain/notification/hot-lead-alert', () => ({
  checkAndSendHotLeadAlert: async (...args: unknown[]) => {
    h.alertCalls.push(args);
    return true;
  },
}));

import { POST } from '@/app/api/public/magazine/analytics/route';

function setupDb() {
  const db = createFakeDb((call: FakeCall) => {
    const hasEq = (col: string) => call.filters.some((f) => f[0] === 'eq' && f[1] === col);
    switch (call.table) {
      case 'magazine_editions':
        // 라우트: .eq('id').maybeSingle() → 객체 / 라벨·발행일 조회·loadSubscriberEvents: 배열
        if (hasEq('id')) return { data: h.edition };
        return { data: h.labelEditions };
      case 'magazine_issues':
        return { data: h.issue };
      case 'magazine_analytics_events':
        if (call.op === 'insert') return { data: null };
        if (call.filters.some((f) => f[0] === 'like')) return { data: h.events };
        return { data: null, count: h.dupCount };
      case 'magazine_subscribers':
        return { data: h.sub };
      case 'activity_events':
        if (call.op === 'insert') return { data: null };
        return { data: null, count: h.capCount };
      default:
        return { data: null };
    }
  });
  const client = db.client as unknown as Record<string, unknown>;
  client.rpc = async (name: string, args: unknown) => {
    h.rpcCalls.push({ name, args });
    // 레이트리밋 RPC 는 실패시켜 메모리 폴백으로 동작하게 한다
    if (name === 'magazine_rl_hit') return { data: null, error: { code: 'x', message: 'x' } };
    return { data: null, error: null };
  };
  h.db = { client, calls: db.calls };
}

const insertsOf = (table: string) => (h.db.calls as FakeCall[]).filter((c) => c.table === table && c.op === 'insert');

function post(body: unknown, ip = '203.0.113.7') {
  return new NextRequest('https://credeal.net/api/public/magazine/analytics', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}
const evt = (over: Record<string, unknown> = {}) => ({
  edition_id: ED,
  visitor_id: VIS,
  event_type: 'page_view',
  metadata: { pv: 'pv123456', referrer: 'https://news.example.com/a?x=1' },
  ...over,
});

const envKeys = ['MAGAZINE_SID_SECRET', 'MAGAZINE_SEND_ENABLED', 'MAGAZINE_TRACKING_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of envKeys) saved[k] = process.env[k];
  process.env.MAGAZINE_SID_SECRET = SECRET;
  delete process.env.MAGAZINE_SEND_ENABLED;
  delete process.env.MAGAZINE_TRACKING_ENABLED;
  __resetMemoryRateLimit();
  h.rpcCalls = [];
  h.alertCalls = [];
  h.edition = { id: ED, broker_id: 'broker-a', status: 'published' };
  h.issue = null;
  h.labelEditions = [{ id: ED }];
  h.dupCount = 0;
  h.sub = null;
  h.events = [];
  h.capCount = 0;
  setupDb();
});
afterEach(() => {
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('입력 검증 · 위조 방어', () => {
  it("위조 event_type('alert') → 400, 저장·알림 모두 0 (S2-08)", async () => {
    const res = await POST(post(evt({ event_type: 'alert', score: 99, is_hot_lead: true })));
    expect(res.status).toBe(400);
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
    expect(insertsOf('activity_events')).toHaveLength(0);
    expect(h.alertCalls).toHaveLength(0);
  });

  it('edition_id 누락/비 uuid, visitor_id 형식 오류 → 400', async () => {
    expect((await POST(post(evt({ edition_id: undefined })))).status).toBe(400);
    expect((await POST(post(evt({ edition_id: 'not-uuid' })))).status).toBe(400);
    expect((await POST(post(evt({ visitor_id: 'TW96aWxsYS81LjA' })))).status).toBe(400);
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('본문 8KB 초과 → 413', async () => {
    const res = await POST(post(evt({ metadata: { referrer: 'x'.repeat(9000) } })));
    expect(res.status).toBe(413);
  });

  it('MAGAZINE_SID_SECRET 미설정 → 503, 아무것도 저장하지 않음 (가짜 salt 금지)', async () => {
    delete process.env.MAGAZINE_SID_SECRET;
    const res = await POST(post(evt()));
    expect(res.status).toBe(503);
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('MAGAZINE_TRACKING_ENABLED=false → tracked:false', async () => {
    process.env.MAGAZINE_TRACKING_ENABLED = 'false';
    const json = await (await POST(post(evt()))).json();
    expect(json).toMatchObject({ ok: true, tracked: false, reason: 'TRACKING_DISABLED' });
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });
});

describe('에디션 · 브로커 결정', () => {
  it('존재하지 않는 에디션 → 404', async () => {
    h.edition = null;
    expect((await POST(post(evt()))).status).toBe(404);
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('미발행(draft) 에디션 이벤트는 저장하지 않는다 (미리보기 서버측 방어선)', async () => {
    h.edition = { id: ED, broker_id: 'broker-a', status: 'draft' };
    const json = await (await POST(post(evt()))).json();
    expect(json).toMatchObject({ ok: true, tracked: false, reason: 'NOT_PUBLISHED' });
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
    expect(h.rpcCalls.filter((r) => r.name === 'increment_edition_views')).toHaveLength(0);
  });

  it('broker 는 에디션에서 결정 — 클라이언트 metadata.broker_id 는 저장·사용되지 않는다', async () => {
    const res = await POST(post(evt({ metadata: { pv: 'pv123456', broker_id: 'attacker-broker' } })));
    expect(res.status).toBe(200);
    const row = insertsOf('magazine_analytics_events')[0].payload as { metadata: Record<string, unknown>; edition_id: string };
    expect(JSON.stringify(row)).not.toContain('attacker-broker');
    expect(row.edition_id).toBe(ED);
    const act = insertsOf('activity_events')[0].payload as { broker_id: string; actor_id: string };
    expect(act.broker_id).toBe(BROKER_USER);
    expect(act.actor_id).toBe(BROKER_USER);
  });
});

describe('레거시 issue id 로 들어온 열람 기록 (404 로 버리지 않는다)', () => {
  const ISSUE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const issueRow = (content: unknown = {}) => ({ id: ISSUE, broker_id: 'broker-a', issue_date: '2026-10-05', content });

  it('같은 날짜의 발행 에디션이 있으면 그 에디션에 정상 기록 (+ via_issue_id, 조회수 RPC)', async () => {
    h.edition = null; // id 로는 에디션 없음
    h.issue = issueRow();
    h.labelEditions = [{ id: ED, broker_id: 'broker-a', status: 'published' }];
    const res = await POST(post(evt({ edition_id: ISSUE })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, tracked: true });
    const row = insertsOf('magazine_analytics_events')[0].payload as { edition_id: string | null; metadata: Record<string, unknown> };
    expect(row.edition_id).toBe(ED);
    expect(row.metadata.via_issue_id).toBe(ISSUE);
    expect(row.metadata.legacy_issue_id).toBeUndefined();
    expect(h.rpcCalls.filter((r) => r.name === 'increment_edition_views')[0].args).toEqual({ edition_id: ED });
  });

  it('에디션이 없는 레거시 호 → edition_id NULL + metadata.legacy_issue_id 로 기록, view_count RPC 없음', async () => {
    h.edition = null;
    h.issue = issueRow();
    h.labelEditions = [];
    const res = await POST(post(evt({ edition_id: ISSUE })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, tracked: true });
    const row = insertsOf('magazine_analytics_events')[0].payload as { edition_id: string | null; metadata: Record<string, unknown> };
    expect(row.edition_id).toBeNull();
    expect(row.metadata).toMatchObject({ v: 2, legacy_issue_id: ISSUE, legacy_issue_date: '2026-10-05' });
    expect(h.rpcCalls.filter((r) => r.name === 'increment_edition_views')).toHaveLength(0);
    // broker 는 호(issue)에서 서버가 결정 — 퍼널 이벤트도 legacy_issue_id 만 담고 edition_id 는 없다
    const act = insertsOf('activity_events')[0].payload as { broker_id: string; metadata: Record<string, unknown> };
    expect(act.broker_id).toBe(BROKER_USER);
    expect(act.metadata).toMatchObject({ legacy_issue_id: ISSUE });
    expect(act.metadata.edition_id).toBeUndefined();
  });

  it('레거시 호 page_view 중복은 legacy_issue_id 기준으로 억제 (edition_id IS NULL 조건)', async () => {
    h.edition = null;
    h.issue = issueRow();
    h.labelEditions = [];
    h.dupCount = 1;
    const json = await (await POST(post(evt({ edition_id: ISSUE })))).json();
    expect(json).toMatchObject({ ok: true, tracked: false, reason: 'DUPLICATE_VIEW' });
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
    const dup = (h.db.calls as FakeCall[]).find((c) => c.table === 'magazine_analytics_events' && c.op !== 'insert')!;
    expect(dup.filters.some((f) => f[0] === 'is' && f[1] === 'edition_id')).toBe(true);
    expect(dup.filters.some((f) => f[0] === 'eq' && f[1] === 'metadata->>legacy_issue_id' && f[2] === ISSUE)).toBe(true);
  });

  it('초안/검수대기 표시가 남은 레거시 콘텐츠는 기록하지 않는다', async () => {
    h.edition = null;
    h.issue = issueRow({ status: 'draft' });
    h.labelEditions = [];
    const json = await (await POST(post(evt({ edition_id: ISSUE })))).json();
    expect(json).toMatchObject({ ok: true, tracked: false, reason: 'NOT_PUBLISHED' });
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });

  it('에디션도 issue 도 아닌 uuid → 여전히 404', async () => {
    h.edition = null;
    h.issue = null;
    const res = await POST(post(evt({ edition_id: ISSUE })));
    expect(res.status).toBe(404);
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
  });
});

describe('저장 · 방문자 해시 · 조회수', () => {
  it('원문 방문자 ID 가 아닌 v2 해시를 저장하고, 첫 page_view 에서만 increment_edition_views RPC 1회', async () => {
    const res = await POST(post(evt()));
    expect(await res.json()).toMatchObject({ ok: true, tracked: true });
    const row = insertsOf('magazine_analytics_events')[0].payload as Record<string, unknown>;
    expect(row.visitor_id).toMatch(/^v2_[0-9a-f]{40}$/);
    expect(JSON.stringify(row)).not.toContain(VIS);
    expect((row.metadata as Record<string, unknown>).referrer_host).toBe('news.example.com');
    const rpc = h.rpcCalls.filter((r) => r.name === 'increment_edition_views');
    expect(rpc).toHaveLength(1);
    expect(rpc[0].args).toEqual({ edition_id: ED });
  });

  it('30분 내 중복 page_view → 저장·조회수 증가 모두 생략', async () => {
    h.dupCount = 1;
    const json = await (await POST(post(evt()))).json();
    expect(json).toMatchObject({ ok: true, tracked: false, reason: 'DUPLICATE_VIEW' });
    expect(insertsOf('magazine_analytics_events')).toHaveLength(0);
    expect(h.rpcCalls.filter((r) => r.name === 'increment_edition_views')).toHaveLength(0);
  });

  it('dwell/click 은 page_view 가 아니므로 조회수 RPC 를 부르지 않고, tel: 번호는 저장하지 않는다', async () => {
    await POST(post(evt({ event_type: 'dwell', dwell_seconds: 42 })));
    await POST(post(evt({ event_type: 'click', target_url: 'tel:01012345678', target_param: 'phone_click' })));
    expect(h.rpcCalls.filter((r) => r.name === 'increment_edition_views')).toHaveLength(0);
    const click = insertsOf('magazine_analytics_events')[1].payload as { target_url: string };
    expect(click.target_url).toBe('tel:');
  });
});

describe('구독자 귀속 (sid 서명 토큰)', () => {
  const subRow = { id: SUB, status: 'active', interest_profile: {}, subscribed_at: '2026-09-01T00:00:00Z' };

  it('유효한 sid → metadata.subscriber_id 기록', async () => {
    h.sub = subRow;
    const sid = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' });
    await POST(post(evt({ metadata: { pv: 'pv123456', sid } })));
    const row = insertsOf('magazine_analytics_events')[0].payload as { metadata: { subscriber_id?: string } };
    expect(row.metadata.subscriber_id).toBe(SUB);
  });

  it('위조 sid · 다른 브로커용 sid → 익명으로 저장 (subscriber_id 없음)', async () => {
    h.sub = subRow;
    const good = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' });
    const [p] = good.split('.');
    const forged = `${p}.${'A'.repeat(43)}`;
    const otherBroker = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-zzz' });
    for (const sid of [forged, otherBroker]) {
      await POST(post(evt({ metadata: { pv: 'pv123456', sid } })));
    }
    for (const ins of insertsOf('magazine_analytics_events')) {
      expect((ins.payload as { metadata: Record<string, unknown> }).metadata.subscriber_id).toBeUndefined();
    }
  });

  it('만료된 sid → 익명', async () => {
    h.sub = subRow;
    const old = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a', ttlDays: 1, now: Date.now() - 5 * 86_400_000 });
    await POST(post(evt({ metadata: { pv: 'pv123456', sid: old } })));
    const row = insertsOf('magazine_analytics_events')[0].payload as { metadata: Record<string, unknown> };
    expect(row.metadata.subscriber_id).toBeUndefined();
  });

  it('해지한 구독자의 sid → 익명', async () => {
    h.sub = { ...subRow, status: 'unsubscribed' };
    const sid = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' });
    await POST(post(evt({ metadata: { pv: 'pv123456', sid } })));
    const row = insertsOf('magazine_analytics_events')[0].payload as { metadata: Record<string, unknown> };
    expect(row.metadata.subscriber_id).toBeUndefined();
  });
});

describe('핫리드 알림 — 서버가 계산한 점수로만 (S2-08)', () => {
  const nowIso = () => new Date().toISOString();
  const hotProfile = { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩', '상가'], readArticleCount: 4, lastEngagedAt: nowIso() };
  const hotEvents = () => [
    ...[1, 2, 3].map(() => ({ event_type: 'page_view', created_at: nowIso(), metadata: { subscriber_id: SUB } })),
    ...[1, 2].map(() => ({ event_type: 'click', target_param: 'listing_click', created_at: nowIso(), metadata: { subscriber_id: SUB } })),
    { event_type: 'click', target_param: 'im_request', created_at: nowIso(), metadata: { subscriber_id: SUB } },
  ];
  const send = async () => {
    const sid = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' });
    return POST(post(evt({ event_type: 'click', target_param: 'im_request', metadata: { pv: 'pv123456', sid } })));
  };

  beforeEach(() => {
    h.sub = { id: SUB, status: 'active', interest_profile: hotProfile, subscribed_at: '2026-09-01T00:00:00Z' };
    h.events = hotEvents();
  });

  it('서버 온도가 🔥 + 발송 스위치 ON + 시간당 상한 미만 → 알림 1회 (점수는 서버 계산값)', async () => {
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    expect((await send()).status).toBe(200);
    expect(h.alertCalls).toHaveLength(1);
    const [, slug, payload, dedupKey] = h.alertCalls[0] as [unknown, string, { score: number; isHotLead: boolean }, string];
    expect(slug).toBe('broker-a');
    expect(payload.score).toBeGreaterThanOrEqual(80);
    expect(dedupKey).toBe(`sub:${SUB}`);
  });

  it('발송 마스터 스위치가 꺼져 있으면 알림 0', async () => {
    await send();
    expect(h.alertCalls).toHaveLength(0);
  });

  it('시간당 상한(5건) 도달 → 알림 0', async () => {
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    h.capCount = 5;
    await send();
    expect(h.alertCalls).toHaveLength(0);
  });

  it('서버 온도가 🔥 미만이면 클라이언트가 점수를 위조해도 알림 0', async () => {
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    h.events = [{ event_type: 'page_view', created_at: nowIso(), metadata: { subscriber_id: SUB } }];
    h.sub = { id: SUB, status: 'active', interest_profile: {}, subscribed_at: '2026-09-01T00:00:00Z' };
    const sid = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' });
    await POST(post(evt({ metadata: { pv: 'pv123456', sid }, score: 100, is_hot_lead: true })));
    expect(h.alertCalls).toHaveLength(0);
  });

  it('익명(sid 없음) 방문은 🔥 이벤트여도 알림 0', async () => {
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    await POST(post(evt({ event_type: 'click', target_param: 'im_request' })));
    expect(h.alertCalls).toHaveLength(0);
  });
});

describe('레이트리밋 (S2-08)', () => {
  it('같은 방문자 분당 120회 초과 → 429', async () => {
    h.edition = { id: ED, broker_id: 'broker-a', status: 'draft' }; // 저장 없이 가드만 소모
    let last = 200;
    let firstBlocked = -1;
    for (let i = 1; i <= 125; i++) {
      const res = await POST(post(evt({ event_type: 'dwell', dwell_seconds: 1 })));
      last = res.status;
      if (res.status === 429 && firstBlocked < 0) firstBlocked = i;
    }
    expect(firstBlocked).toBe(121);
    expect(last).toBe(429);
  });

  it('다른 방문자는 영향받지 않는다', async () => {
    h.edition = { id: ED, broker_id: 'broker-a', status: 'draft' };
    for (let i = 0; i < 121; i++) await POST(post(evt({ event_type: 'dwell', dwell_seconds: 1 })));
    const other = await POST(post(evt({ visitor_id: '22222222-2222-4222-8222-222222222222', event_type: 'dwell', dwell_seconds: 1 })));
    expect(other.status).toBe(200);
  });
});

describe('뷰어 클릭 어휘 별칭 — 서버 흡수 (E3 어휘)', () => {
  it('bottom_call → target_param=phone_click, 원문은 meta.target_raw 로 보존', async () => {
    const res = await POST(post(evt({ event_type: 'click', target_param: 'bottom_call', target_url: 'tel:01012345678' })));
    expect(res.status).toBe(200);
    const row = insertsOf('magazine_analytics_events')[0].payload as {
      target_param: string; target_url: string; metadata: { meta?: Record<string, unknown> };
    };
    expect(row.target_param).toBe('phone_click');
    expect(row.target_url).toBe('tel:');
    expect(row.metadata.meta).toEqual({ target_raw: 'bottom_call' });
  });

  it('bottom_im_request → im_request: IM 퍼널(activity_events magazine_to_im_click) 기록', async () => {
    await POST(post(evt({ event_type: 'click', target_param: 'bottom_im_request' })));
    const row = insertsOf('magazine_analytics_events')[0].payload as { target_param: string };
    expect(row.target_param).toBe('im_request');
    const act = insertsOf('activity_events')[0].payload as { event_type: string };
    expect(act.event_type).toBe('magazine_to_im_click');
  });

  it.each([
    ['bottom_kakao', 'inquiry'],
    ['bottom_contact', 'inquiry'],
    ['tax_inquiry', 'inquiry'],
    ['poll_consult', 'inquiry'],
    ['bottom_share', 'share'],
    ['referral_forward', 'share'],
  ])('%s → %s', async (raw, canonical) => {
    await POST(post(evt({ event_type: 'click', target_param: raw })));
    const row = insertsOf('magazine_analytics_events')[0].payload as { target_param: string; metadata: { meta?: Record<string, unknown> } };
    expect(row.target_param).toBe(canonical);
    expect(row.metadata.meta?.target_raw).toBe(raw);
  });
});
