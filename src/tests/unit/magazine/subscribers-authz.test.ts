/**
 * 구독자 CRUD 인가·무결성 (P0-03 + I-03: S2-07, T2-10, T2-11, T2-24c, S2-04)
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
  consentColumnsMissing: false,
  clientsOwned: true,
}));

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

import { GET as listGET, POST as listPOST } from '@/app/api/broker/magazine/subscribers/route';
import { PATCH as itemPATCH, DELETE as itemDELETE } from '@/app/api/broker/magazine/subscribers/[id]/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] };

const PROFILE = {
  budgetRange: { min: 2_000_000_000, max: 5_000_000_000 },
  readArticleCount: 4,
  tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'], topics: ['세금'] },
};
const SUBS: Array<Record<string, unknown>> = [
  { id: 'sub-a1', broker_id: 'broker-a', status: 'active', unsubscribed_at: null, channel: 'kakao', subscriber_email: null, subscriber_phone: '01011112222', subscriber_name: '가나다', interest_profile: PROFILE, client_id: null, confirm_token_hash: 'HASH', consent_ip_hash: 'IPHASH' },
  { id: 'sub-a-unsub', broker_id: 'broker-a', status: 'unsubscribed', unsubscribed_at: '2026-01-01T00:00:00Z', channel: 'kakao', subscriber_email: null, subscriber_phone: '01033334444', subscriber_name: '해지자', interest_profile: {}, client_id: null },
  { id: 'sub-a-pending', broker_id: 'broker-a', status: 'active', unsubscribed_at: null, channel: 'kakao', subscriber_email: null, subscriber_phone: '01055556666', subscriber_name: '확인전', interest_profile: {}, client_id: null, confirm_status: 'pending' },
  { id: 'sub-b1', broker_id: 'broker-b', status: 'active', unsubscribed_at: null, channel: 'email', subscriber_email: 'secret@b.com', subscriber_phone: '01099998888', subscriber_name: '타브로커고객', interest_profile: {}, client_id: null },
];

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    if (call.table === 'broker_clients') {
      return { data: h.clientsOwned ? { id: 'cl-1' } : null };
    }
    if (call.table !== 'magazine_subscribers') return { data: null };

    if (call.op === 'insert') {
      const payload = call.payload as Record<string, unknown>;
      if (h.consentColumnsMissing && 'consent_channel' in payload) {
        return { error: { code: 'PGRST204', message: "Could not find the 'consent_channel' column of 'magazine_subscribers' in the schema cache" } };
      }
      return { data: { id: 'new-sub', ...payload } };
    }
    if (call.op === 'update') {
      const row = rowVisibleTo(SUBS, call);
      return { data: row ? { ...row, ...(call.payload as object) } : null };
    }
    if (call.op === 'delete') {
      const id = call.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
      const keys = (call.filters.find((f) => f[0] === 'in' && f[1] === 'broker_id')?.[2] ?? []) as string[];
      return { data: SUBS.filter((r) => r.id === id && keys.includes(String(r.broker_id))).map((r) => ({ id: r.id })) };
    }
    // select
    if (call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) return { data: rowVisibleTo(SUBS, call) ?? null };
    const rows = filterRows(SUBS, call);
    return { data: rows, count: rows.length };
  }) as never;
}

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const callsOf = (op: string, table = 'magazine_subscribers') =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  h.unauth = false;
  h.ctx = ctxA;
  h.consentColumnsMissing = false;
  h.clientsOwned = true;
  setupDb();
});

describe('GET /subscribers', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    expect((await listGET(req('/api/broker/magazine/subscribers'))).status).toBe(401);
    expect(h.db.calls).toHaveLength(0);
  });

  it('ctx.brokerKeys 로만 조회, 타 브로커 구독자·내부 해시 컬럼 미노출', async () => {
    const res = await listGET(req('/api/broker/magazine/subscribers'));
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.subscribers.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['sub-a1', 'sub-a-unsub']));
    expect(ids).not.toContain('sub-b1');
    expect(JSON.stringify(json)).not.toMatch(/HASH|secret@b\.com|타브로커고객/);
    expect(callsOf('select')[0].filters).toEqual(expect.arrayContaining([['in', 'broker_id', ['broker-a', UA]]]));
  });

  it('확인 전(pending)이고 확인 채널(이메일)이 없는 구독자만 pendingReason=NO_EMAIL_CONFIRM_CHANNEL (B2 연동)', async () => {
    const res = await listGET(req('/api/broker/magazine/subscribers'));
    const json = await res.json();
    const byId = new Map<string, { pendingReason: string | null }>(json.subscribers.map((s: { id: string; pendingReason: string | null }) => [s.id, s]));
    expect(byId.get('sub-a-pending')?.pendingReason).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(byId.get('sub-a1')?.pendingReason).toBeNull();
  });
});

describe('DELETE /subscribers/[id]', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    const res = await itemDELETE(req('/x', { method: 'DELETE' }), params('sub-a1'));
    expect(res.status).toBe(401);
  });

  it('타 브로커 구독자 → 404, delete 미실행', async () => {
    const res = await itemDELETE(req('/x', { method: 'DELETE' }), params('sub-b1'));
    expect(res.status).toBe(404);
    expect(callsOf('delete')).toHaveLength(0);
  });

  it('본인 구독자 → 200, delete는 id + broker_id IN brokerKeys 조건 (T2-11: user.id 단일 비교 오류 제거)', async () => {
    const res = await itemDELETE(req('/x', { method: 'DELETE' }), params('sub-a1'));
    expect(res.status).toBe(200);
    const del = callsOf('delete')[0];
    expect(del.filters).toEqual(expect.arrayContaining([['eq', 'id', 'sub-a1'], ['in', 'broker_id', ['broker-a', UA]]]));
    expect(del.filters.some((f) => f[0] === 'eq' && f[1] === 'broker_id')).toBe(false);
  });

  it('삭제된 행이 0이면 성공으로 위장하지 않고 404', async () => {
    // 소유권 확인은 통과하지만 delete가 0행인 경합 상황
    h.db = createFakeDb((call) => {
      if (call.op === 'delete') return { data: [] };
      return { data: SUBS[0] };
    }) as never;
    const res = await itemDELETE(req('/x', { method: 'DELETE' }), params('sub-a1'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /subscribers/[id]', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { channel: 'kakao' } }), params('sub-a1'));
    expect(res.status).toBe(401);
  });

  it('타 브로커 구독자 → 404, update 미실행', async () => {
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_name: 'hack' } }), params('sub-b1'));
    expect(res.status).toBe(404);
    expect(callsOf('update')).toHaveLength(0);
  });

  it('수신거부자를 status:active 로 재활성화 금지 → 409 UNSUBSCRIBED (S2-07), update 미실행', async () => {
    for (const status of ['active', 'paused']) {
      const res = await itemPATCH(req('/x', { method: 'PATCH', body: { status } }), params('sub-a-unsub'));
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('UNSUBSCRIBED');
    }
    expect(callsOf('update')).toHaveLength(0);
  });

  it('활성 구독자를 unsubscribed 로 바꾸면 unsubscribed_at 기록', async () => {
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { status: 'unsubscribed' } }), params('sub-a1'));
    expect(res.status).toBe(200);
    const payload = callsOf('update')[0].payload as Record<string, unknown>;
    expect(payload.status).toBe('unsubscribed');
    expect(typeof payload.unsubscribed_at).toBe('string');
  });

  it('태그 저장은 interest_profile 병합 — 기존 예산·다른 태그 그룹 보존 (T2-10), interest_tags 입력 수용', async () => {
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { interest_tags: { regions: ['마포', '성수'] } } }), params('sub-a1'));
    expect(res.status).toBe(200);
    const payload = callsOf('update')[0].payload as { interest_profile: Record<string, unknown> };
    expect(payload.interest_profile.budgetRange).toEqual(PROFILE.budgetRange);
    expect(payload.interest_profile.readArticleCount).toBe(4);
    expect(payload.interest_profile.tags).toEqual({ regions: ['마포', '성수'], assetTypes: ['꼬마빌딩'], topics: ['세금'] });
  });

  it('채널 both/email 인데 이메일 없음 → 400 (T2-24c), update 미실행', async () => {
    for (const channel of ['both', 'email']) {
      const res = await itemPATCH(req('/x', { method: 'PATCH', body: { channel } }), params('sub-a1'));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('EMAIL_REQUIRED');
    }
    expect(callsOf('update')).toHaveLength(0);
  });

  it('이메일을 함께 주면 both 허용, 전화는 정규화, 잘못된 이메일/전화 400', async () => {
    const ok = await itemPATCH(
      req('/x', { method: 'PATCH', body: { channel: 'both', subscriber_email: 'A@B.com', subscriber_phone: '010-5555-6666' } }),
      params('sub-a1'),
    );
    expect(ok.status).toBe(200);
    const payload = callsOf('update')[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ channel: 'both', subscriber_email: 'a@b.com', subscriber_phone: '01055556666' });
    const badMail = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_email: 'not-an-email' } }), params('sub-a1'));
    expect(badMail.status).toBe(400);
    const badPhone = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_phone: '123' } }), params('sub-a1'));
    expect(badPhone.status).toBe(400);
  });

  it('비정상 status 값 → 400', async () => {
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { status: 'deleted' } }), params('sub-a1'));
    expect(res.status).toBe(400);
  });
});

describe('POST /subscribers (수동 추가)', () => {
  const body = { name: '홍길동', phone: '010-1234-5678', channel: 'kakao', consentAttested: true, interest_tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] } };

  it('동의 보증(consentAttested) 없이는 추가 불가 → 400 CONSENT_REQUIRED, insert 없음', async () => {
    const { consentAttested: _omit, ...noConsent } = body;
    void _omit;
    const res = await listPOST(req('/x', { method: 'POST', body: noConsent }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('CONSENT_REQUIRED');
    const res2 = await listPOST(req('/x', { method: 'POST', body: { ...body, consentAttested: false } }));
    expect(res2.status).toBe(400);
    expect(callsOf('insert')).toHaveLength(0);
  });

  it('비로그인 → 401', async () => {
    h.unauth = true;
    expect((await listPOST(req('/x', { method: 'POST', body }))).status).toBe(401);
  });

  it('ctx 기반 broker, 전화 정규화, 동의는 broker_attested 로 기록, consentRecorded:true', async () => {
    const res = await listPOST(req('/x', { method: 'POST', body: { ...body, broker_id: 'broker-b' } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.consentRecorded).toBe(true);
    const payload = callsOf('insert')[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      broker_id: 'broker-a', // body.broker_id 무시
      subscriber_phone: '01012345678',
      source: 'manual',
      status: 'active',
      consent_channel: 'broker_attested',
      confirm_status: 'confirmed',
      consent_version: 'v1',
      broker_user_id: UA,
    });
    expect(typeof payload.marketing_consent_at).toBe('string');
    expect((payload.interest_profile as { tags: unknown }).tags).toEqual({ regions: ['강남'], assetTypes: ['꼬마빌딩'] });
  });

  it('동의 컬럼 미적용 DB → 동의 필드 없이 재시도하고 consentRecorded:false 로 정직하게 알린다', async () => {
    h.consentColumnsMissing = true;
    const res = await listPOST(req('/x', { method: 'POST', body }));
    expect(res.status).toBe(201);
    expect((await res.json()).consentRecorded).toBe(false);
    const inserts = callsOf('insert');
    expect(inserts).toHaveLength(2);
    expect(inserts[1].payload).not.toHaveProperty('consent_channel');
    expect(inserts[1].payload).toMatchObject({ broker_id: 'broker-a', subscriber_phone: '01012345678' });
  });

  it('수신거부자와 같은 번호 → 409 UNSUBSCRIBED, 재활성화(insert/update) 없음', async () => {
    const res = await listPOST(req('/x', { method: 'POST', body: { ...body, phone: '010-3333-4444' } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('UNSUBSCRIBED');
    expect(callsOf('insert')).toHaveLength(0);
    expect(callsOf('update')).toHaveLength(0);
    expect(callsOf('upsert')).toHaveLength(0);
  });

  it('이미 있는 활성 구독자 → 200 existing:true, 신규 insert 없음', async () => {
    const res = await listPOST(req('/x', { method: 'POST', body: { ...body, phone: '010-1111-2222' } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.existing).toBe(true);
    expect(json.subscriber.id).toBe('sub-a1');
    expect(JSON.stringify(json)).not.toMatch(/HASH/);
    expect(callsOf('insert')).toHaveLength(0);
  });

  it('잘못된 전화/이메일, 이메일 없는 email 채널 → 400', async () => {
    expect((await listPOST(req('/x', { method: 'POST', body: { ...body, phone: '123' } }))).status).toBe(400);
    expect((await listPOST(req('/x', { method: 'POST', body: { ...body, email: 'nope' } }))).status).toBe(400);
    expect((await listPOST(req('/x', { method: 'POST', body: { ...body, channel: 'email' } }))).status).toBe(400);
    expect(callsOf('insert')).toHaveLength(0);
  });

  it('타 브로커의 client_id 연결 시도 → 404, insert 없음', async () => {
    h.clientsOwned = false;
    const res = await listPOST(req('/x', { method: 'POST', body: { ...body, client_id: 'foreign-client' } }));
    expect(res.status).toBe(404);
    expect(callsOf('insert')).toHaveLength(0);
  });

  it('본인 client_id 는 broker_id=user.id(uuid) 로 조회하고 slug 를 섞지 않는다(22P02 방지), 연결된 채 저장', async () => {
    const res = await listPOST(req('/x', { method: 'POST', body: { ...body, client_id: 'cl-1' } }));
    expect(res.status).toBe(201);
    const lookup = callsOf('select', 'broker_clients')[0];
    expect(lookup.filters).toEqual(expect.arrayContaining([['eq', 'id', 'cl-1'], ['eq', 'broker_id', UA]]));
    expect(lookup.filters.some((f) => f[1] === 'owner_id')).toBe(false);
    expect((callsOf('insert')[0].payload as Record<string, unknown>).client_id).toBe('cl-1');
  });
});
