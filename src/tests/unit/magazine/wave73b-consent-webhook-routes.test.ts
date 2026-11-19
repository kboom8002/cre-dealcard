/**
 * WP-7.3B — 뉴스레터 동의·웹훅·수신거부·발송 라우트 하드닝
 *  P1-3 연락처 변경 시 동의 리셋 + DOI 재발송 / P2-6 수동 추가 DOI 발신자 정보
 *  P1-4 웹훅 감사 이벤트 평문 이메일 제거(해시+마스킹) / P2-4 대상 조회(테넌트 스캔 제거) / svix 중복 검사 경계
 *  P2-2 미발행 에디션 발송 409 / P2-3 emh_ 수신거부 영속성 확인 / P2-5 SECURITY DEFINER RPC REVOKE
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall, type FakeResult } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const EDITION_ID = 'eeeeeeee-1111-4111-8111-111111111111';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  ctx: null as unknown,
  sendOptIn: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return { ...actual, requireBrokerContext: async () => ({ ctx: h.ctx, error: null }) };
});
vi.mock('@/domain/magazine/consent-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/magazine/consent-service')>();
  const { vi: v } = await import('vitest');
  h.sendOptIn = v.fn(async () => ({ sent: true }));
  return { ...actual, sendOptInConfirmation: (...args: unknown[]) => (h.sendOptIn as (...a: unknown[]) => unknown)(...args) };
});

import { PATCH as itemPATCH } from '@/app/api/broker/magazine/subscribers/[id]/route';
import { POST as listPOST } from '@/app/api/broker/magazine/subscribers/route';
import { POST as distributePOST } from '@/app/api/broker/magazine/distribute/route';
import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';
import { POST as unsubscribePOST } from '@/app/api/public/magazine/unsubscribe/route';
import { hashConfirmToken } from '@/domain/magazine/consent-service';
import { evaluateGate } from '@/domain/magazine/send-gate';
import { issueUnsubToken } from '@/domain/magazine/unsub-token';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';

type Row = Record<string, unknown>;
const ctxA = { userId: UA, slug: 'broker-a', displayName: '김중개', brokerKeys: ['broker-a', UA] };
const PROFILE = { id: UA, display_name: '김중개', company: '에이스공인', phone: '010-1234-5678' };

const calls = (table: string, op?: string) =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && (!op || c.op === op));
const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  h.ctx = ctxA;
  (h.sendOptIn as unknown as { mockClear: () => void; mockResolvedValue: (v: unknown) => void }).mockClear();
  (h.sendOptIn as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ sent: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ─────────────────────────── P1-3 / P2-6 ───────────────────────────
describe('P1-3: 확인(confirmed) 구독자의 이메일 수신 대상 변경 → 동의 리셋 + DOI 재발송, 재확인 전 발송 차단', () => {
  const baseSubs = (): Row[] => [
    {
      id: 'sub-conf', broker_id: 'broker-a', status: 'active', unsubscribed_at: null, channel: 'email',
      subscriber_email: 'old@a.com', subscriber_name: '홍길동', confirm_status: 'confirmed', consent_status: 'confirmed',
      marketing_consent_at: '2026-01-01T00:00:00.000Z', night_consent: false, interest_profile: {},
    },
    {
      id: 'sub-kakao', broker_id: 'broker-a', status: 'active', unsubscribed_at: null, channel: 'kakao',
      subscriber_email: 'k@a.com', subscriber_phone: '01011112222', subscriber_name: '카카오', confirm_status: 'confirmed',
      consent_status: 'confirmed', marketing_consent_at: '2026-01-01T00:00:00.000Z', interest_profile: {},
    },
  ];

  function setup(opts: { subs?: Row[]; updateError?: (payload: Row) => FakeResult['error'] | null; suppressedHash?: string } = {}) {
    const subs = opts.subs ?? baseSubs();
    h.db = createFakeDb((call: FakeCall) => {
      if (call.table === 'profiles') return { data: PROFILE };
      if (call.table === 'email_suppressions') {
        const hash = call.filters.find((f) => f[0] === 'eq' && f[1] === 'email_hash')?.[2];
        return { data: opts.suppressedHash && hash === opts.suppressedHash ? [{ scope: 'global', broker_id: null, reason: 'complaint' }] : [] };
      }
      if (call.table === 'broker_clients') return { data: [] };
      if (call.table !== 'magazine_subscribers') return { data: null };
      if (call.op === 'update') {
        const err = opts.updateError?.(call.payload as Row);
        if (err) return { error: err };
        const row = rowVisibleTo(subs, call);
        return { data: row ? { ...row, ...(call.payload as Row) } : null };
      }
      if (call.op === 'insert') return { data: { id: 'new-sub', ...(call.payload as Row) } };
      if (call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) return { data: rowVisibleTo(subs, call) ?? null };
      const rows = filterRows(subs, call);
      return { data: rows, count: rows.length };
    }) as never;
    return subs;
  }

  it('이메일 변경 → confirm_status/consent_status=pending, 새 확인 토큰, DOI(발신자 정보 포함) 재발송, sendGate 는 PENDING_CONFIRM 차단', async () => {
    const subs = setup();
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_email: 'New@A.com' } }), params('sub-conf'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, reconfirmRequired: true, confirmEmailSent: true });
    expect(JSON.stringify(json)).not.toMatch(/confirm_token_hash/);

    const payload = calls('magazine_subscribers', 'update')[0].payload as Row;
    expect(payload).toMatchObject({
      subscriber_email: 'new@a.com',
      confirm_status: 'pending',
      consent_status: 'pending',
      consented_at: null,
      consent_channel: 'broker_attested',
    });
    expect(payload.confirm_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload.marketing_consent_at).toBe('string');

    expect(h.sendOptIn).toHaveBeenCalledTimes(1);
    const sendArgs = (h.sendOptIn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Row;
    expect(sendArgs).toMatchObject({
      channel: 'email',
      email: 'new@a.com',
      brokerSlug: 'broker-a', // confirmOptIn 은 구독자 행 broker_id 로 토큰을 찾는다
      brokerName: '김중개',
      brokerContact: '에이스공인 · 010-1234-5678',
    });
    expect(hashConfirmToken(String(sendArgs.token))).toBe(payload.confirm_token_hash);

    // 재확인 전까지 발송 게이트가 막는다
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    const updated = { ...subs[0], ...payload };
    const verdict = evaluateGate(
      {
        subscriber: updated as never,
        channel: 'email',
        editionKey: 'broker-a:2026-11-18:weekly',
        brokerId: 'broker-a',
        kind: 'weekly',
        rendered: { subject: '(광고) 주간', body: 'x', hasAdLabel: true, hasUnsubscribeLink: true, senderName: '김중개', senderContact: '010' },
      },
      new Date('2026-11-18T01:00:00Z'),
      true,
    );
    expect(verdict).toEqual({ blocked: 'PENDING_CONFIRM' });
  });

  it('카카오 → both(기존 이메일로 이메일 채널 신규 추가)도 동의 리셋 + DOI', async () => {
    setup();
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { channel: 'both' } }), params('sub-kakao'));
    expect(res.status).toBe(200);
    expect(calls('magazine_subscribers', 'update')[0].payload).toMatchObject({ channel: 'both', confirm_status: 'pending' });
    expect(h.sendOptIn).toHaveBeenCalledTimes(1);
  });

  it('이름만 바꾸면 동의를 건드리지 않고 DOI 도 보내지 않는다', async () => {
    setup();
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_name: '새이름' } }), params('sub-conf'));
    expect(res.status).toBe(200);
    const payload = calls('magazine_subscribers', 'update')[0].payload as Row;
    expect(payload).toEqual({ subscriber_name: '새이름' });
    expect(h.sendOptIn).not.toHaveBeenCalled();
  });

  it('수신거부·차단 이력이 있는 주소로 변경 → 409, update 없음', async () => {
    setup({ suppressedHash: hashEmailForSuppression('blocked@a.com') });
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_email: 'blocked@a.com' } }), params('sub-conf'));
    expect(res.status).toBe(409);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
    expect(h.sendOptIn).not.toHaveBeenCalled();
  });

  it('사전 컷오버(consent_status/consented_at 없음): 해당 컬럼만 빼고 재시도하되 confirm_status=pending 리셋은 유지', async () => {
    setup({
      updateError: (p) => ('consent_status' in p || 'consented_at' in p ? { code: '42703', message: 'column "consent_status" does not exist' } : null),
    });
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_email: 'new@a.com' } }), params('sub-conf'));
    expect(res.status).toBe(200);
    const updates = calls('magazine_subscribers', 'update');
    expect(updates).toHaveLength(2);
    const last = updates[1].payload as Row;
    expect(last).not.toHaveProperty('consent_status');
    expect(last).not.toHaveProperty('consented_at');
    expect(last).toMatchObject({ confirm_status: 'pending', subscriber_email: 'new@a.com' });
  });

  it('동의 컬럼 자체가 없으면 동의 리셋 없이 연락처만 바꾸지 않는다(fail closed, 503)', async () => {
    setup({ updateError: (p) => ('confirm_status' in p ? { code: '42703', message: 'column "confirm_status" does not exist' } : null) });
    const res = await itemPATCH(req('/x', { method: 'PATCH', body: { subscriber_email: 'new@a.com' } }), params('sub-conf'));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('CONSENT_SCHEMA_UNAVAILABLE');
    expect(h.sendOptIn).not.toHaveBeenCalled();
  });

  it('P2-6: 수동 추가(POST) DOI 확인 메일에도 brokerName/brokerContact 를 싣는다', async () => {
    setup();
    const res = await listPOST(req('/x', { method: 'POST', body: { name: '신규', email: 'fresh@a.com', channel: 'email', consentAttested: true } }));
    expect(res.status).toBe(201);
    expect(h.sendOptIn).toHaveBeenCalledTimes(1);
    expect((h.sendOptIn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toMatchObject({
      email: 'fresh@a.com',
      brokerName: '김중개',
      brokerContact: '에이스공인 · 010-1234-5678',
    });
  });
});

// ─────────────────────────── P2-2 ───────────────────────────
describe('P2-2: 미발행 에디션 발송 차단', () => {
  it('editionId 가 draft 면 409 EDITION_NOT_PUBLISHED, 발송 경로 미진입', async () => {
    h.db = createFakeDb((call: FakeCall) => {
      if (call.table === 'magazine_editions') return { data: { id: EDITION_ID, status: 'draft' } };
      return { data: null };
    }) as never;
    const res = await distributePOST(req('/api/broker/magazine/distribute', { method: 'POST', body: { editionId: EDITION_ID, title: '주간' } }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('EDITION_NOT_PUBLISHED');
    expect(json.error.message).toContain('발행');
    expect(calls('magazine_subscribers')).toHaveLength(0);
    expect(calls('magazine_dispatch_logs')).toHaveLength(0);
  });
});

// ─────────────────────────── P1-4 / P2-4 / svix ───────────────────────────
describe('P1-4 · P2-4: Resend 웹훅 — 평문 이메일 미보존, 대상 조회, 경계 있는 svix 중복 검사', () => {
  const SECRET = `whsec_${Buffer.from('wave73b-webhook-secret-bytes').toString('base64')}`;

  function signed(payload: Row, svixId: string) {
    const rawBody = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto
      .createHmac('sha256', Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64'))
      .update(`${svixId}.${ts}.${rawBody}`, 'utf8')
      .digest('base64');
    return new NextRequest('https://credeal.net/api/webhooks/resend', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'svix-id': svixId, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
      body: rawBody,
    });
  }

  it('bounce 감사 이벤트 metadata 에 email/to_email 평문이 없고 email_hash(+마스킹)만 남는다 · 대소문자 다른 레거시 행도 ilike 대상 조회로 매칭', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
    const subs: Row[] = [
      { id: 'sub-1', broker_id: 'broker-a', broker_user_id: UA, subscriber_email: 'Bounce@X.com', status: 'active' },
      { id: 'sub-other', broker_id: 'broker-b', broker_user_id: '22222222-2222-4222-8222-222222222222', subscriber_email: 'other@y.com', status: 'active' },
    ];
    h.db = createFakeDb((call: FakeCall) => {
      if (call.table === 'magazine_subscribers' && call.op === 'select') {
        const eqEmail = call.filters.find((f) => f[0] === 'eq' && f[1] === 'subscriber_email')?.[2];
        const ilikeEmail = call.filters.find((f) => f[0] === 'ilike' && f[1] === 'subscriber_email')?.[2];
        if (eqEmail !== undefined) return { data: subs.filter((s) => s.subscriber_email === eqEmail) };
        if (ilikeEmail !== undefined) return { data: subs.filter((s) => String(s.subscriber_email).toLowerCase() === String(ilikeEmail).toLowerCase()) };
        return { data: subs }; // 대상 필터 없는 스캔이면 전부 노출 (회귀 감지용)
      }
      if (call.table === 'broker_clients' && call.op === 'select') return { data: [] };
      if (call.table === 'activity_events' && call.op === 'select') return { data: [] };
      return { data: null };
    }) as never;

    const svixId = `msg_wave73b_${crypto.randomUUID().replace(/-/g, '')}`;
    const res = await resendWebhookPOST(signed({ type: 'email.bounced', created_at: new Date().toISOString(), data: { to: ['bounce@x.com'], email_id: 're_1', bounce: { message: '550 <bounce@x.com> mailbox unavailable' } } }, svixId));
    expect(res.status).toBe(200);

    const bounceEvents = calls('activity_events', 'insert').filter((c) => (c.payload as Row).event_type === 'email_bounced');
    expect(bounceEvents.length).toBeGreaterThanOrEqual(1);
    for (const ev of bounceEvents) {
      const meta = (ev.payload as { metadata: Row }).metadata;
      expect(meta).not.toHaveProperty('email');
      expect(meta).not.toHaveProperty('to_email');
      expect(meta.email_hash).toBe(hashEmailForSuppression('bounce@x.com'));
      expect(meta.email_masked).toBe('b***@x.com');
      expect(meta.svix_id).toBe(svixId);
      expect(JSON.stringify(ev.payload).toLowerCase()).not.toContain('bounce@x.com');
      expect((ev.payload as Row).actor_id).toBe(UA);
    }

    // 대소문자 다른 레거시 행이 매칭되어 bounced 로 갱신, 타 테넌트 행은 미접촉
    const subUpdates = calls('magazine_subscribers', 'update');
    expect(subUpdates.map((c) => c.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2])).toEqual(['sub-1']);

    // P2-4: 구독자/고객 조회는 모두 이메일 대상 필터 + limit, select('*') 스캔 없음
    for (const table of ['magazine_subscribers', 'broker_clients']) {
      for (const c of calls(table, 'select')) {
        const sel = c.filters.find((f) => f[0] === 'select')?.[1];
        expect(sel, `${table} select`).not.toBe('*');
        expect(c.filters.some((f) => (f[0] === 'eq' || f[0] === 'ilike') && /email/.test(String(f[1]))), `${table} targeted`).toBe(true);
        expect(c.filters.some((f) => f[0] === 'limit'), `${table} bounded`).toBe(true);
      }
    }

    // svix 중복 검사: svix_id 대상 + 최근 창(gte created_at) + limit
    const dupQueries = calls('activity_events', 'select').filter((c) =>
      c.filters.some((f) => f[0] === 'in' && Array.isArray(f[2]) && (f[2] as string[]).includes('email_bounced')),
    );
    expect(dupQueries.length).toBeGreaterThanOrEqual(1);
    for (const q of dupQueries) {
      expect(q.filters.some((f) => f[0] === 'gte' && f[1] === 'created_at')).toBe(true);
      expect(q.filters.some((f) => f[0] === 'limit')).toBe(true);
    }
    expect(dupQueries.some((q) => q.filters.some((f) => f[0] === 'eq' && f[1] === 'metadata->>svix_id' && f[2] === svixId))).toBe(true);
  });
});

// ─────────────────────────── P2-3 ───────────────────────────
describe('P2-3: emh_ 수신거부 — 영속 여부 확인 · 경계 있는 스캔 · 성공 위장 금지', () => {
  const EMAIL = 'inbox-recipient@client.test';
  const HASH = hashEmailForSuppression(EMAIL);

  function setup(opts: { subs?: Row[]; auditFails?: boolean } = {}) {
    h.db = createFakeDb((call: FakeCall) => {
      switch (call.table) {
        case 'broker_profiles':
          return { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: [], specialty_assets: [], is_public: true } };
        case 'profiles':
          return { data: { id: UA, display_name: '김중개', photo_url: null, company: null, tagline: null } };
        case 'email_suppressions':
          // 사전 컷오버: 테이블 없음
          return { error: { code: '42P01', message: 'relation "public.email_suppressions" does not exist' } };
        case 'magazine_subscribers':
          if (call.op === 'update') return { data: null };
          return { data: opts.subs ?? [] };
        case 'broker_clients':
          return { data: [] };
        case 'activity_events':
          if (call.op === 'insert' && opts.auditFails) return { error: { code: 'XX000', message: 'insert failed' } };
          return { data: null };
        default:
          return { data: null };
      }
    }) as never;
  }

  const form = (token: string) =>
    new Request('https://credeal.net/api/public/magazine/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `t=${encodeURIComponent(token)}`,
    });

  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'wave73b-unsub-route-secret');
  });

  it('억제 테이블 없음 + 일치 행 없음 → 수신거부 요청을 브로커 감사 이벤트(해시만)로 남기고 200', async () => {
    setup();
    const res = await unsubscribePOST(form(issueUnsubToken({ subscriberId: `emh_${HASH}`, brokerId: UA })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('수신 거부가 완료');
    const ev = calls('activity_events', 'insert').find((c) => (c.payload as Row).event_type === 'magazine_unsubscribed');
    expect(ev).toBeDefined();
    expect((ev!.payload as { metadata: Row }).metadata).toMatchObject({ email_hash: HASH, source: 'one_click_inbox' });
    expect(JSON.stringify(ev!.payload)).not.toContain(EMAIL);

    // 해시 매칭 스캔은 브로커 범위 + 페이지(range) 경계
    const scan = calls('magazine_subscribers', 'select')[0];
    expect(scan.filters.some((f) => f[0] === 'in' && f[1] === 'broker_id')).toBe(true);
    expect(scan.filters.some((f) => f[0] === 'range')).toBe(true);
  });

  it('어디에도 기록하지 못하면(억제 테이블 없음 + 일치 행 없음 + 감사 기록 실패) 성공을 위장하지 않고 503', async () => {
    setup({ auditFails: true });
    const res = await unsubscribePOST(form(issueUnsubToken({ subscriberId: `emh_${HASH}`, brokerId: UA })));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('수신 거부가 완료');
  });

  it('일치하는 구독자 행이 있으면 그 행을 unsubscribed 로 갱신(영속) → 200', async () => {
    setup({ subs: [{ id: 'sub-x', status: 'active', subscriber_email: EMAIL }, { id: 'sub-y', status: 'active', subscriber_email: 'other@z.com' }] });
    const res = await unsubscribePOST(form(issueUnsubToken({ subscriberId: `emh_${HASH}`, brokerId: UA })));
    expect(res.status).toBe(200);
    const upd = calls('magazine_subscribers', 'update');
    expect(upd.map((c) => c.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2])).toEqual(['sub-x']);
  });
});

// ─────────────────────────── P2-5 ───────────────────────────
describe('P2-5: SECURITY DEFINER RPC 권한', () => {
  it('get_monthly_regional_tx_stats 는 PUBLIC/anon 에서 REVOKE 후 authenticated/service_role 에만 GRANT', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261117000003_dispatch_queue_and_monthly_stats_rpc.sql'),
      'utf8',
    );
    const revokeIdx = sql.search(
      /REVOKE ALL ON FUNCTION public\.get_monthly_regional_tx_stats\(text\[\], text\[\], int, text\) FROM PUBLIC, anon;/,
    );
    const grantIdx = sql.search(/GRANT EXECUTE ON FUNCTION public\.get_monthly_regional_tx_stats\(text\[\], text\[\], int, text\)\s+TO service_role, authenticated;/);
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
    expect(sql).toMatch(/SECURITY DEFINER/);
  });
});
