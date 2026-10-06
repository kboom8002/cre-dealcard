/**
 * 수신거부 라우트 (G-02) — 위조·만료·타 broker 토큰 거부(회귀 보호), One-Click, XSS, PII
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createFakeDb, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const SUB = '0b8f1c52-6d4e-4f0a-9c1b-2a3d4e5f6a7b';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  sub: null as null | Record<string, unknown>,
  displayName: '김중개' as string | null,
  /** broker_profiles.name (공개 표시명 SSOT 1순위) */
  bpName: null as string | null,
  bpNameError: null as null | { code?: string; message: string },
  updateError: null as null | { code?: string; message: string },
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));

import { GET, POST } from '@/app/api/public/magazine/unsubscribe/route';
import { issueUnsubToken } from '@/domain/magazine/unsub-token';

const BASE = 'https://credeal.net/api/public/magazine/unsubscribe';

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'broker_profiles': {
        const slug = call.filters.find((f) => f[0] === 'eq' && f[1] === 'slug')?.[2];
        const uid = call.filters.find((f) => f[0] === 'eq' && f[1] === 'user_id')?.[2];
        // 표시명 조회(.select('name'))
        if (call.filters.some((f) => f[0] === 'select' && f[1] === 'name')) {
          if (h.bpNameError) return { error: h.bpNameError };
          return { data: { name: h.bpName } };
        }
        if (slug === 'broker-a' || uid === UA) {
          return { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: [], specialty_assets: [], is_public: true } };
        }
        if (slug === 'broker-b') return { data: { user_id: '22222222-2222-4222-8222-222222222222', slug: 'broker-b', bio: null, specialty_regions: [], specialty_assets: [], is_public: true } };
        return { data: null };
      }
      case 'profiles':
        return { data: { id: UA, display_name: h.displayName, photo_url: null, company: null, tagline: null } };
      case 'magazine_subscribers':
        if (call.op === 'update') return h.updateError ? { error: h.updateError } : { data: null };
        return { data: h.sub };
      default:
        return { data: null };
    }
  }) as never;
}

const calls = (table: string, op?: string) =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && (!op || c.op === op));

const tok = (brokerId = 'broker-a', subscriberId = SUB, ttlDays?: number) => issueUnsubToken({ subscriberId, brokerId, ttlDays });

const form = (token: string, extraQuery = '', body?: string) =>
  new Request(`${BASE}${extraQuery}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body ?? `t=${encodeURIComponent(token)}`,
  });

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'route-test-secret');
  h.sub = { id: SUB, broker_id: 'broker-a', status: 'active' };
  h.displayName = '김중개';
  h.bpName = null;
  h.bpNameError = null;
  h.updateError = null;
  setupDb();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /unsubscribe (확인 페이지)', () => {
  it('유효 토큰 → 200 HTML, 상태 변경 없음, 접근성·대비·터치타깃 요건', async () => {
    const token = tok();
    const res = await GET(new Request(`${BASE}?t=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<html lang="ko">');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('name="viewport"');
    expect(html).toContain('border: 1px solid #e5e7eb'); // 깨진 CSS(`1px border-border`) 제거
    expect(html).not.toContain('border-border');
    expect(html).toContain('#dc2626'); // 해지 버튼 대비
    expect(html).toContain('min-height: 44px'); // 터치 타깃
    expect(html).toContain(`name="t" value="${token}"`);
    expect(html).toContain('김중개 매거진'); // 브랜드/중개인 표시
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
  });

  it('구 파라미터명 ?token= 도 수용', async () => {
    const res = await GET(new Request(`${BASE}?token=${encodeURIComponent(tok())}`));
    expect(res.status).toBe(200);
  });

  it('중개인 표시명의 HTML은 이스케이프된다 (반사/저장 XSS 방지)', async () => {
    h.displayName = '<script>alert(1)</script>';
    const html = await (await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`))).text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('토큰 누락·위조·구버전 포맷 → 400 (회귀 보호), DB 미접근, 입력 미반사', async () => {
    const evil = '"><img src=x onerror=alert(1)>';
    for (const q of ['', `?t=${encodeURIComponent(evil)}`, '?t=fake', `?token=${SUB}.broker-a.deadbeef`]) {
      const res = await GET(new Request(`${BASE}${q}`));
      expect(res.status, q).toBe(400);
      const html = await res.text();
      expect(html).not.toContain('onerror=alert(1)');
      expect(html).toContain('<html lang="ko">');
    }
    expect(h.db.calls).toHaveLength(0);
  });

  it('서명 변조 → 400', async () => {
    const [p, s] = tok().split('.');
    const res = await GET(new Request(`${BASE}?t=${p}.${s.slice(0, -2)}${s.endsWith('AA') ? 'BB' : 'AA'}`));
    expect(res.status).toBe(400);
  });

  it('만료 토큰 → 410', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = tok('broker-a', SUB, 1);
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    const res = await GET(new Request(`${BASE}?t=${encodeURIComponent(token)}`));
    expect(res.status).toBe(410);
  });

  it('비밀키 미설정 → 503 (폴백 서명 없음)', async () => {
    const token = tok();
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');
    const res = await GET(new Request(`${BASE}?t=${encodeURIComponent(token)}`));
    expect(res.status).toBe(503);
  });
});

describe('POST /unsubscribe (해지 실행)', () => {
  it('폼 POST → 200 HTML, status=unsubscribed + unsubscribed_at', async () => {
    const res = await POST(form(tok()));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('수신 거부가 완료');
    const upd = calls('magazine_subscribers', 'update')[0];
    expect(upd.payload).toMatchObject({ status: 'unsubscribed' });
    expect(typeof (upd.payload as { unsubscribed_at: string }).unsubscribed_at).toBe('string');
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', SUB]]));
  });

  it('RFC 8058 One-Click: ?t= 쿼리 + 본문 List-Unsubscribe=One-Click → 해지', async () => {
    const token = tok();
    const res = await POST(form(token, `?t=${encodeURIComponent(token)}`, 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(200);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(1);
  });

  it('JSON POST({token}) → JSON {ok:true}', async () => {
    const res = await POST(
      new Request(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok() }) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('위조·구버전·누락 토큰 → 400, update 미실행 (회귀 보호)', async () => {
    const forged = createHmac('sha256', 'whatever').update('x').digest('hex');
    for (const t of ['fake', `${SUB}.broker-a.${forged}`, '']) {
      const res = await POST(form(t));
      expect(res.status, t).toBe(400);
    }
    const jsonFake = await POST(
      new Request(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'fake' }) }),
    );
    expect(jsonFake.status).toBe(400);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
  });

  it('깨진 JSON 본문 → 400 (500 아님)', async () => {
    const res = await POST(new Request(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('만료 토큰 → 410, update 미실행', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = tok('broker-a', SUB, 1);
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    const res = await POST(form(token));
    expect(res.status).toBe(410);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
  });

  it('타 broker 바인딩 토큰(서명은 유효하지만 구독자 broker와 불일치) → 400, update 미실행', async () => {
    const res = await POST(form(tok('broker-b')));
    expect(res.status).toBe(400);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
  });

  it('발송측이 발급하는 uuid(broker user id) 토큰도 slug로 저장된 구독자와 매칭된다', async () => {
    const res = await POST(form(tok(UA)));
    expect(res.status).toBe(200);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(1);
  });

  it('구독자가 없으면 404, 이미 해지면 멱등 200(추가 update 없음)', async () => {
    h.sub = null;
    setupDb();
    expect((await POST(form(tok()))).status).toBe(404);

    h.sub = { id: SUB, broker_id: 'broker-a', status: 'unsubscribed' };
    setupDb();
    const res = await POST(form(tok()));
    expect(res.status).toBe(200);
    expect(calls('magazine_subscribers', 'update')).toHaveLength(0);
  });

  it('unsubscribed_at 컬럼이 없는 DB → status만으로 재시도', async () => {
    h.updateError = { code: '42703', message: 'column "unsubscribed_at" does not exist' };
    let n = 0;
    h.db = createFakeDb((call) => {
      if (call.table === 'magazine_subscribers' && call.op === 'update') {
        n += 1;
        return n === 1 ? { error: h.updateError! } : { data: null };
      }
      if (call.table === 'broker_profiles') return { data: { user_id: UA, slug: 'broker-a' } };
      if (call.table === 'magazine_subscribers') return { data: h.sub };
      return { data: null };
    }) as never;
    const res = await POST(form(tok()));
    expect(res.status).toBe(200);
    const updates = calls('magazine_subscribers', 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toEqual({ status: 'unsubscribed' });
  });

  it('DB 오류 → 503(고정 문구), 오류 원문·PII 미노출', async () => {
    h.updateError = { code: 'XX000', message: 'secret internal 010-1234-5678 failure' };
    const res = await POST(form(tok()));
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).not.toMatch(/secret internal|010-1234-5678/);
  });

  it('활동 이벤트에 PII(전화/이름/이메일)를 싣지 않는다', async () => {
    await POST(form(tok()));
    const ev = calls('activity_events', 'insert')[0];
    expect(ev).toBeDefined();
    const payload = ev.payload as { actor_id: string; metadata: Record<string, unknown> };
    expect(payload.actor_id).toBe(UA); // uuid 컬럼에 slug가 들어가지 않는다
    expect(JSON.stringify(payload)).not.toMatch(/phone|email|name|010/i);
  });
});

describe('중개사 표시명 SSOT · 한글 줄바꿈 (Part2 골든)', () => {
  const brand = async (res: Response) => (await res.text()).match(/<p class="brand">([^<]*)<\/p>/)?.[1] ?? null;

  it('broker_profiles.name 이 있으면 profiles.display_name 보다 우선 (확인·완료 화면 모두)', async () => {
    h.bpName = '공개 중개사명';
    h.displayName = '에디터 표시명';
    expect(await brand(await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`)))).toBe('공개 중개사명 매거진');
    expect(await brand(await POST(form(tok())))).toBe('공개 중개사명 매거진');
  });

  it('broker_profiles.name 이 비어 있으면 display_name 으로 폴백 (공백만 있는 값 포함)', async () => {
    h.bpName = '   ';
    h.displayName = '에디터 표시명';
    expect(await brand(await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`)))).toBe('에디터 표시명 매거진');
  });

  it('name 조회가 실패(컬럼 없음 등)해도 display_name 으로 보여 주고 해지는 정상 처리', async () => {
    h.bpNameError = { code: '42703', message: 'column broker_profiles.name does not exist' };
    h.displayName = '에디터 표시명';
    const res = await POST(form(tok()));
    expect(res.status).toBe(200);
    expect(await brand(res)).toBe('에디터 표시명 매거진');
    expect(calls('magazine_subscribers', 'update')).toHaveLength(1);
  });

  it('이름이 전혀 없으면 브랜드 줄을 만들지 않는다(가짜 기본값 금지)', async () => {
    h.bpName = null;
    h.displayName = null;
    const html = await (await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`))).text();
    expect(html).not.toContain('class="brand"');
  });

  it('공개 표시명도 이스케이프된다 (broker_profiles.name XSS)', async () => {
    h.bpName = '<img src=x onerror=alert(1)>';
    const html = await (await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`))).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('한글은 단어 중간에서 끊지 않고(keep-all) 긴 영문·URL 은 anywhere 로 줄바꿈', async () => {
    const html = await (await GET(new Request(`${BASE}?t=${encodeURIComponent(tok())}`))).text();
    expect(html).toContain('word-break: keep-all');
    expect(html).toContain('overflow-wrap: anywhere');
  });

  it('위조 토큰은 표시명 조회 전에 400 으로 끝난다 (DB 미접근, 회귀 보호)', async () => {
    h.bpName = '공개 중개사명';
    const res = await GET(new Request(`${BASE}?t=fake`));
    expect(res.status).toBe(400);
    expect(await brand(res)).toBeNull();
    expect(h.db.calls).toHaveLength(0);
    const post = await POST(form('fake'));
    expect(post.status).toBe(400);
    expect(h.db.calls).toHaveLength(0);
  });
});
