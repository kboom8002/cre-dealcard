import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kakaoSpy = vi.hoisted(() => vi.fn(async (_payload: { variables: Record<string, string>; templateId: string }) => true));
vi.mock('@/lib/notification/notification-service', () => ({ sendKakaoAlimtalk: kakaoSpy }));

import { appendSid } from '@/domain/magazine/send-batch';
import { verifySidToken } from '@/domain/magazine/sid-token';
import { checkAndSendHotLeadAlert } from '@/domain/notification/hot-lead-alert';

const ENV_KEYS = [
  'MAGAZINE_SID_SECRET',
  'MAGAZINE_SEND_ENABLED',
  'MAGAZINE_SEND_DRY_RUN',
  'MAGAZINE_SEND_ALLOWLIST',
  'APP_BASE_URL',
  'SOLAPI_API_KEY',
  'SOLAPI_API_SECRET',
  'SOLAPI_SENDER_PHONE',
  'SOLAPI_PFID',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  kakaoSpy.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('appendSid', () => {
  it('sid를 붙이고 토큰이 구독자·브로커에 바인딩된다', () => {
    process.env.MAGAZINE_SID_SECRET = 'sid-secret-abcdefgh';
    const out = appendSid('https://app.example.com/magazine/kim/2026-10-06', 'sub-1', 'kim');
    const sid = new URL(out).searchParams.get('sid');
    expect(sid).toBeTruthy();
    expect(verifySidToken(sid)).toEqual({ ok: true, subscriberId: 'sub-1', brokerKey: 'kim' });
  });

  it('기존 ?target= 쿼리를 보존하며 병합한다', () => {
    process.env.MAGAZINE_SID_SECRET = 'sid-secret-abcdefgh';
    const u = new URL(appendSid('https://app.example.com/magazine/kim/2026-10-06?target=im', 'sub-1', 'kim'));
    expect(u.searchParams.get('target')).toBe('im');
    expect(u.searchParams.get('sid')).toBeTruthy();
  });

  it('시크릿 없으면 sid 없이 익명 링크 그대로(정직한 degrade)', () => {
    delete process.env.MAGAZINE_SID_SECRET;
    const url = 'https://app.example.com/magazine/kim/2026-10-06';
    expect(appendSid(url, 'sub-1', 'kim')).toBe(url);
  });
});

function fakeDb(opts: { phone?: string | null } = {}) {
  const phone = opts.phone === undefined ? '010-1234-5678' : opts.phone;
  const tables: Record<string, { data: unknown; count?: number }> = {
    activity_events: { data: null, count: 0 },
    broker_profiles: { data: { user_id: 'u1' } },
    profiles: { data: { phone, display_name: '김중개' } },
  };
  const selects: Record<string, string> = {};
  return {
    selects,
    from(table: string) {
      const res = { ...tables[table], error: null };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (cols: string) => {
        selects[table] = cols;
        return chain;
      };
      for (const m of ['eq', 'filter', 'gte']) chain[m] = self;
      chain.maybeSingle = async () => res;
      chain.single = async () => res;
      chain.insert = async () => ({ error: null });
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(res);
      return chain;
    },
  };
}

const LEAD = { score: 85, isHotLead: true, touchpoints: ['magazine_view'], channelCount: 1, buildingsViewed: [] };

function enableKakao() {
  process.env.MAGAZINE_SEND_ENABLED = 'true';
  process.env.MAGAZINE_SEND_DRY_RUN = 'false';
  delete process.env.MAGAZINE_SEND_ALLOWLIST;
  process.env.APP_BASE_URL = 'https://app.example.com';
  process.env.SOLAPI_API_KEY = 'k';
  process.env.SOLAPI_API_SECRET = 's';
  process.env.SOLAPI_SENDER_PHONE = '0212345678';
  process.env.SOLAPI_PFID = 'pf';
}

describe('hot-lead-alert 발송 정책', () => {
  it('킬스위치 OFF → provider 0콜', async () => {
    enableKakao();
    delete process.env.MAGAZINE_SEND_ENABLED;
    const ok = await checkAndSendHotLeadAlert(fakeDb() as never, 'kim', LEAD, 'v1');
    expect(ok).toBe(false);
    expect(kakaoSpy).not.toHaveBeenCalled();
  });

  it('dry-run → provider 0콜', async () => {
    enableKakao();
    process.env.MAGAZINE_SEND_DRY_RUN = 'true';
    expect(await checkAndSendHotLeadAlert(fakeDb() as never, 'kim', LEAD, 'v1')).toBe(false);
    expect(kakaoSpy).not.toHaveBeenCalled();
  });

  it('allowlist 밖 수신자 → provider 0콜', async () => {
    enableKakao();
    process.env.MAGAZINE_SEND_ALLOWLIST = '01099998888';
    expect(await checkAndSendHotLeadAlert(fakeDb() as never, 'kim', LEAD, 'v1')).toBe(false);
    expect(kakaoSpy).not.toHaveBeenCalled();
  });

  it('provider 키 미설정(STUB 위험) → 발송 생략', async () => {
    enableKakao();
    delete process.env.SOLAPI_API_KEY;
    expect(await checkAndSendHotLeadAlert(fakeDb() as never, 'kim', LEAD, 'v1')).toBe(false);
    expect(kakaoSpy).not.toHaveBeenCalled();
  });

  it('APP_BASE_URL 없으면 생략, 있으면 절대 URL 대시보드 링크로 발송', async () => {
    enableKakao();
    delete process.env.APP_BASE_URL;
    expect(await checkAndSendHotLeadAlert(fakeDb() as never, 'kim', LEAD, 'v1')).toBe(false);
    expect(kakaoSpy).not.toHaveBeenCalled();

    process.env.APP_BASE_URL = 'https://app.example.com/';
    const db = fakeDb();
    expect(await checkAndSendHotLeadAlert(db as never, 'kim', LEAD, 'v2')).toBe(true);
    const call = kakaoSpy.mock.calls[0][0];
    expect(call.variables['#{dashboardUrl}']).toBe('https://app.example.com/broker/funnel');
    expect(call.variables['#{brokerName}']).toBe('김중개');
  });

  it('broker_profiles에는 존재하지 않는 name 컬럼을 조회하지 않는다', async () => {
    enableKakao();
    const db = fakeDb();
    await checkAndSendHotLeadAlert(db as never, 'kim', LEAD, 'v3');
    expect(db.selects.broker_profiles).toBe('user_id');
    expect(db.selects.profiles).toContain('display_name');
  });
});
