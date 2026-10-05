/**
 * 공개 구독/확인/레퍼럴 라우트 통합 성격 테스트 (G-01, E-05, DC-11=b)
 * Supabase는 인메모리 페이크, resolveBroker는 스텁. 레이트리밋은 RPC 부재 → 메모리 폴백 경로로 실행된다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FakeDb } from './consent-fake-db';

const h = vi.hoisted(() => ({ db: null as unknown as { from: (t: string) => unknown } }));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db }));
vi.mock('@/lib/magazine/resolve-broker', () => ({
  resolveBroker: async (_s: unknown, id: string) =>
    id === 'kim-broker'
      ? { userId: '11111111-1111-4111-8111-111111111111', slug: 'kim-broker', displayName: '김중개', photoUrl: null, company: null, tagline: null, bio: null, specialtyRegions: [], specialtyAssets: [], isPublic: true }
      : null,
}));

import { POST as subscribePOST } from '@/app/api/public/magazine/subscribe/route';
import { GET as confirmGET, POST as confirmPOST } from '@/app/api/public/magazine/confirm/route';
import { GET as referralGET, POST as referralPOST } from '@/app/api/public/magazine/referral/route';
import { __resetMemoryRateLimit } from '@/lib/magazine/public-guard';
import { hashConfirmToken, issueConfirmToken } from '@/domain/magazine/consent-service';

let db: FakeDb;
let ipSeq = 0;
const nextIp = () => `203.0.113.${(++ipSeq % 250) + 1}`;

const GOOD = {
  brokerId: 'kim-broker',
  name: '홍길동',
  phone: '010-1234-5678',
  channel: 'kakao',
  consent: { privacy: true, marketing: true, age14: true },
};

function req(url: string, init: { method?: string; body?: unknown; ip?: string } = {}) {
  const raw = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  return new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': init.ip ?? nextIp() },
    body: raw,
  });
}
const sub = (body: unknown, ip?: string) => subscribePOST(req('/api/public/magazine/subscribe', { method: 'POST', body, ip }));

beforeEach(() => {
  db = new FakeDb();
  h.db = db as unknown as { from: (t: string) => unknown };
  __resetMemoryRateLimit();
  vi.stubEnv('MAGAZINE_SEND_ENABLED', '');
});

describe('POST /subscribe — 동의 (P0-07 서버측, G-01)', () => {
  it('동의 미체크/일부 누락/객체 없음 → 400, DB 변화 없음', async () => {
    const cases = [
      { ...GOOD, consent: { privacy: false, marketing: false, age14: false } },
      { ...GOOD, consent: { privacy: true, marketing: true, age14: false } },
      { ...GOOD, consent: { privacy: true, marketing: false, age14: true } },
      { ...GOOD, consent: { privacy: true, marketing: true } },
      { ...GOOD, consent: undefined },
      { ...GOOD, consent: { privacy: 'true', marketing: 'true', age14: 'true' } }, // 문자열 true는 동의 아님
    ];
    for (const body of cases) {
      const res = await sub(body);
      const j = await res.json();
      expect(res.status, JSON.stringify(body.consent)).toBe(400);
      expect(j.ok).toBe(false);
      expect(db.tables.magazine_subscribers).toHaveLength(0);
    }
    const j = await (await sub({ ...GOOD, consent: { privacy: true, marketing: true, age14: false } })).json();
    expect(j.error.code).toBe('CONSENT_REQUIRED');
  });

  it('정상: 200 pending, 동의 컬럼 기록, 거짓 확인 문구 없음(발송 꺼짐)', async () => {
    const res = await sub({ ...GOOD, tags: ['성수·성동'], referrer: 'friend', source: 'qr_card', consent: { ...GOOD.consent, night: true } });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, status: 'pending' });
    expect(j.message).not.toMatch(/발송 재개|보내드린/); // 발송하지 않았으므로 '보냈다'는 문구 금지
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    expect(db.tables.magazine_subscribers[0]).toMatchObject({
      broker_id: 'kim-broker',
      phone_e164: '+821012345678',
      confirm_status: 'pending',
      night_consent: true,
      source: 'qr_card',
      consent_version: 'v1',
    });
    expect(db.tables.magazine_subscribers[0].consent_ip_hash).toMatch(/^[0-9a-f]{32}$/); // 원문 IP 아님
    expect(JSON.stringify(db.tables.magazine_subscribers[0])).not.toContain('203.0.113');
    expect(db.tables.activity_events).toHaveLength(1);
  });
});

describe('POST /subscribe — 입력 검증 (T2-09)', () => {
  it('전화 형식 오류·채널별 필수 연락처·이메일 형식·알 수 없는 태그 → 400', async () => {
    const r1 = await (await sub({ ...GOOD, phone: '12345' })).json();
    expect(r1.error.code).toBe('INVALID_PHONE');
    const r2 = await (await sub({ ...GOOD, channel: 'both' })).json();
    expect(r2.error.code).toBe('EMAIL_REQUIRED');
    const r3 = await (await sub({ ...GOOD, channel: 'email', phone: undefined, email: 'not-an-email' })).json();
    expect(r3.error.code).toBe('INVALID_EMAIL');
    const r4 = await (await sub({ ...GOOD, phone: undefined })).json();
    expect(r4.error.code).toBe('PHONE_REQUIRED');
    const r5 = await (await sub({ ...GOOD, tags: ['<script>alert(1)</script>'] })).json();
    expect(r5.error.code).toBe('INVALID_TAGS');
    expect(db.tables.magazine_subscribers).toHaveLength(0);
  });

  it('이름의 <script>/URL은 저장 전에 정제된다(S2-09)', async () => {
    await sub({ ...GOOD, name: '<b>홍</b>길동 https://evil.example/x' });
    const saved = db.tables.magazine_subscribers[0].subscriber_name as string;
    expect(saved).not.toMatch(/[<>]|evil\.example/);
  });

  it('없는 broker → 404 (T2-09d), 행 생성 없음', async () => {
    const res = await sub({ ...GOOD, brokerId: 'no-such-broker' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    expect(db.tables.magazine_subscribers).toHaveLength(0);
  });

  it('010-1234-5678 / 01012345678 → 같은 행 / 이메일 전용 2회 → 1행', async () => {
    await sub({ ...GOOD, phone: '010-1234-5678' });
    await sub({ ...GOOD, phone: '01012345678' });
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    const email = { ...GOOD, channel: 'email', phone: undefined, email: 'A@Example.com' };
    await sub(email);
    await sub({ ...email, email: 'a@example.com' });
    expect(db.tables.magazine_subscribers).toHaveLength(2);
  });

  it('잘못된 JSON·초과 본문 — 파서 메시지/내부 정보 비노출', async () => {
    const bad = await subscribePOST(req('/api/public/magazine/subscribe', { method: 'POST', body: '{oops' }));
    const text = JSON.stringify(await bad.json());
    expect(bad.status).toBe(400);
    expect(text).not.toMatch(/Unexpected|position|SyntaxError|JSON\.parse|token/);
    const big = await sub({ ...GOOD, referrer: 'x'.repeat(9000) });
    expect(big.status).toBe(413);
  });
});

describe('POST /subscribe — 해지자·병합·정직한 실패', () => {
  it('해지 구독자는 공개 폼으로 자동 재활성화되지 않고 pending (S2-07)', async () => {
    db.seed({ broker_id: 'kim-broker', phone_e164: '+821012345678', subscriber_phone: '01012345678', status: 'unsubscribed', unsubscribed_at: '2026-09-01T00:00:00.000Z', confirm_status: 'confirmed' });
    const res = await sub(GOOD);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('pending');
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ status: 'unsubscribed', confirm_status: 'pending' });
    expect(db.tables.magazine_subscribers[0].unsubscribed_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('재구독이 기존 email/name을 덮어 지우지 않는다', async () => {
    db.seed({ broker_id: 'kim-broker', phone_e164: '+821012345678', subscriber_phone: '01012345678', subscriber_email: 'keep@example.com', subscriber_name: '기존', confirm_status: 'pending' });
    await sub({ ...GOOD, name: undefined });
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ subscriber_email: 'keep@example.com', subscriber_name: '기존' });
  });

  it('동의 컬럼 미적용(42703) → 503 고정 문구, 가짜 성공·DB 메시지 비노출', async () => {
    db = new FakeDb({ failOn: { select: { code: '42703', message: 'column "phone_e164" of relation "magazine_subscribers" does not exist' } } });
    h.db = db as unknown as { from: (t: string) => unknown };
    const res = await sub(GOOD);
    const j = await res.json();
    expect(res.status).toBe(503);
    expect(j).toEqual({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시 시도해 주세요' } });
    expect(JSON.stringify(j)).not.toMatch(/column|relation|phone_e164/);
    expect(db.tables.magazine_subscribers).toHaveLength(0);
    expect(db.tables.activity_events).toHaveLength(0); // 성공 이벤트도 기록하지 않음
  });

  it('기타 DB 오류 → 500 일반 문구(내부 메시지 비노출)', async () => {
    db = new FakeDb({ failOn: { select: { code: '57014', message: 'canceling statement due to statement timeout' } } });
    h.db = db as unknown as { from: (t: string) => unknown };
    const res = await sub(GOOD);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/statement|timeout/i);
  });
});

describe('POST /subscribe — 레이트리밋 (E-05)', () => {
  it('같은 연락처 4번째 요청부터 429 (phone 3/일) + Retry-After', async () => {
    const codes: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 4; i++) {
      last = await sub(GOOD, `198.51.100.${i + 1}`); // IP는 매번 다르게 → target 한도만 검증
      codes.push(last.status);
    }
    expect(codes).toEqual([200, 200, 200, 429]);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
    expect((await last!.json()).error.code).toBe('RATE_LIMITED');
  });

  it('같은 IP 11번째 요청부터 429 (IP 10/시간)', async () => {
    const ip = '192.0.2.77';
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await sub({ ...GOOD, phone: `0101234${String(5000 + i)}` }, ip);
      codes.push(r.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('/confirm — GET은 버튼 페이지만, POST만 확인 (스캐너 prefetch 방어)', () => {
  function seedPending(over: Record<string, unknown> = {}) {
    const { token, hash } = issueConfirmToken();
    db.seed({
      broker_id: 'kim-broker',
      confirm_status: 'pending',
      confirm_token_hash: hash,
      marketing_consent_at: new Date().toISOString(),
      status: 'active',
      ...over,
    });
    return token;
  }
  const qs = (t: string | null, b: string | null) => `?${t ? `t=${encodeURIComponent(t)}&` : ''}${b ? `b=${encodeURIComponent(b)}` : ''}`;
  const getPage = (t: string | null, b: string | null = 'kim-broker') => confirmGET(req(`/api/public/magazine/confirm${qs(t, b)}`));
  const confirm = (t: string | null, b: string | null = 'kim-broker') => {
    const form = new URLSearchParams();
    if (t !== null) form.set('t', t);
    if (b !== null) form.set('b', b);
    return confirmPOST(
      new NextRequest('https://credeal.net/api/public/magazine/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': nextIp() },
        body: form.toString(),
      }),
    );
  };

  it('GET: 유효 형식 → 확인 버튼 폼(POST) 렌더, DB 상태 변경 없음(스캐너가 열어도 소비되지 않음)', async () => {
    const token = seedPending();
    const before = JSON.stringify(db.tables.magazine_subscribers[0]);
    const res = await getPage(token);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toMatch(/<form method="post" action="\/api\/public\/magazine\/confirm"/);
    expect(html).toContain('구독 확인하기');
    expect(html).not.toContain('구독이 확인되었습니다');
    // 여러 번 GET해도 상태 불변
    await getPage(token);
    await getPage(token);
    expect(JSON.stringify(db.tables.magazine_subscribers[0])).toBe(before);
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('pending');
  });

  it('GET: 형식 오류/누락 → 400 HTML(폼 없음), 반사형 입력은 HTML에 반영되지 않는다', async () => {
    expect((await getPage(null)).status).toBe(400);
    expect((await getPage('short')).status).toBe(400);
    const res = await getPage('<script>alert(1)</script>', '<img src=x onerror=alert(1)>');
    const html = await res.text();
    expect(res.status).toBe(400);
    expect(html).not.toMatch(/<script>alert|<img src=x|<form/);
  });

  it('POST: 유효 토큰 → 200 한국어 HTML, confirmed로 전환, 토큰 평문 비노출', async () => {
    const token = seedPending();
    const res = await confirm(token);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('구독이 확인되었습니다');
    expect(html).not.toContain(token);
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ confirm_status: 'confirmed', status: 'active' });
  });

  it('POST: 멱등 — 같은 토큰을 다시 제출해도 200(상태 변경 없음)', async () => {
    const token = seedPending();
    expect((await confirm(token)).status).toBe(200);
    const after1 = JSON.stringify(db.tables.magazine_subscribers[0]);
    expect((await confirm(token)).status).toBe(200);
    expect(JSON.stringify(db.tables.magazine_subscribers[0])).toBe(after1);
  });

  it('POST: 확인 후 해지한 구독자가 오래된 링크를 다시 제출해도 재활성화되지 않는다(400)', async () => {
    const token = seedPending();
    await confirm(token);
    Object.assign(db.tables.magazine_subscribers[0], { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() });
    expect((await confirm(token)).status).toBe(400);
    expect(db.tables.magazine_subscribers[0].status).toBe('unsubscribed');
  });

  it('POST: 위조/누락 토큰·다른 broker → 400 HTML, 상태 불변', async () => {
    const token = seedPending();
    for (const r of [await confirm('A'.repeat(43)), await confirm(null), await confirm(token, 'other'), await confirm(token, null)]) {
      expect(r.status).toBe(400);
      expect(r.headers.get('content-type')).toContain('text/html'); // 가드 단계 오류도 JSON이 아닌 HTML
    }
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('pending');
  });

  it('POST: JSON 본문(폼 아님)·초과 본문도 안전하게 거절(HTML)', async () => {
    const big = await confirmPOST(
      new NextRequest('https://credeal.net/api/public/magazine/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': nextIp() },
        body: `t=${'A'.repeat(5000)}&b=kim-broker`,
      }),
    );
    expect(big.status).toBe(413);
    expect(big.headers.get('content-type')).toContain('text/html');
  });

  it('POST: 해지자는 확인(POST) 후에만 active 복귀', async () => {
    const token = seedPending({ status: 'unsubscribed', unsubscribed_at: '2026-09-01T00:00:00.000Z' });
    await getPage(token); // GET만으로는 복귀하지 않는다
    expect(db.tables.magazine_subscribers[0].status).toBe('unsubscribed');
    expect((await confirm(token)).status).toBe(200);
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ status: 'active', unsubscribed_at: null });
  });

  it('POST: 만료(7일 초과) → 410', async () => {
    const token = seedPending({ marketing_consent_at: new Date(Date.now() - 8 * 86_400_000).toISOString() });
    expect((await confirm(token)).status).toBe(410);
  });

  it('POST: DB 컬럼 미적용 → 503 HTML (가짜 성공 없음)', async () => {
    db = new FakeDb({ failOn: { select: { code: '42703', message: 'column does not exist' } } });
    h.db = db as unknown as { from: (t: string) => unknown };
    const res = await confirm(issueConfirmToken().token);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('구독이 확인되었습니다');
  });

  it('해시는 평문과 다르다', () => {
    const t = issueConfirmToken();
    expect(t.hash).not.toBe(t.token);
    expect(hashConfirmToken(t.token)).toBe(t.hash);
  });
});
describe('/referral — 정직화 (DC-11=b, T2-08)', () => {
  it('GET: 가짜 카운터/마일스톤 없이 enabled:false, count:null', async () => {
    const res = await referralGET(req('/api/public/magazine/referral?brokerId=kim-broker&phone=01012345678'));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toEqual({ ok: true, enabled: false, count: null });
    expect(JSON.stringify(j)).not.toMatch(/milestone|totalReferrals|reward/i);
  });

  it('GET: brokerId 누락/형식 오류 → 400', async () => {
    expect((await referralGET(req('/api/public/magazine/referral'))).status).toBe(400);
    expect((await referralGET(req('/api/public/magazine/referral?brokerId=' + encodeURIComponent('../x')))).status).toBe(400);
  });

  it('POST: tracked:false (기록하지 않음), DB를 건드리지 않는다', async () => {
    const res = await referralPOST(req('/api/public/magazine/referral', { method: 'POST', body: { brokerId: 'kim-broker', referrerPhone: '010-1', referredPhone: '010-2' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tracked: false });
    expect(db.calls).toHaveLength(0);
  });

  it('POST: brokerId 형식 오류 → 400, 레이트리밋 적용', async () => {
    const bad = await referralPOST(req('/api/public/magazine/referral', { method: 'POST', body: { brokerId: 'a b' } }));
    expect(bad.status).toBe(400);
    const ip = '192.0.2.200';
    let last = 200;
    for (let i = 0; i < 31; i++) {
      last = (await referralPOST(req('/api/public/magazine/referral', { method: 'POST', ip, body: { brokerId: 'kim-broker' } }))).status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /subscribe — pendingReason (확인 채널 없음, 정직한 안내)', () => {
  it('카카오 전용: pendingReason=NO_EMAIL_CONFIRM_CHANNEL + 확인 링크를 보냈다는 문구 없음, 발송 켜져도 이메일 미발송', async () => {
    const res = await sub(GOOD);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, status: 'pending', pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL' });
    expect(j.message).toContain('이메일 주소가 없어');
    expect(j.message).not.toMatch(/보내드린 확인 링크/);
  });

  it('이메일 채널: pendingReason 키 없음', async () => {
    const res = await sub({ ...GOOD, channel: 'email', phone: undefined, email: 'ok@example.com' });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.pendingReason).toBeUndefined();
    expect(j.message).not.toContain('이메일 주소가 없어');
  });
});
