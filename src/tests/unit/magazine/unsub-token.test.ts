/**
 * 수신거부 토큰 v2 (G-02) — 정상·위조·만료·타 broker 바인딩·NO_SECRET·헤더/URL
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  issueUnsubToken,
  verifyUnsubToken,
  buildUnsubscribeUrl,
  buildListUnsubscribeHeaders,
} from '@/domain/magazine/unsub-token';

const SUB = '0b8f1c52-6d4e-4f0a-9c1b-2a3d4e5f6a7b';
const BROKER_A = '11111111-1111-4111-8111-111111111111';
const BROKER_SLUG = 'kim-broker';

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'unit-test-secret-value');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('unsub-token v2', () => {
  it('정상 발급 → 검증 성공, subscriberId/brokerId 복원', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    const r = verifyUnsubToken(token);
    expect(r).toEqual({ ok: true, subscriberId: SUB, brokerId: BROKER_A });
  });

  it('slug broker도 발급·검증된다', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_SLUG });
    expect(verifyUnsubToken(token)).toEqual({ ok: true, subscriberId: SUB, brokerId: BROKER_SLUG });
  });

  it('토큰 형식: payload.signature 2조각, URL-safe(base64url)', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    expect(token.split('.')).toHaveLength(2);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    expect(payload).toMatch(new RegExp(`^v2\\.${SUB}\\.${BROKER_A}\\.\\d{10}$`));
  });

  it('위조: 서명 변조 → BAD_SIGNATURE', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    const [p, s] = token.split('.');
    const flipped = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
    expect(verifyUnsubToken(`${p}.${flipped}`)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('위조: payload의 broker를 바꾸고 기존 서명 유지 → BAD_SIGNATURE (타 broker 바인딩)', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    const [p, s] = token.split('.');
    const decoded = Buffer.from(p, 'base64url').toString('utf8').replace(BROKER_A, 'evil-broker');
    const forged = `${Buffer.from(decoded).toString('base64url')}.${s}`;
    expect(verifyUnsubToken(forged)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('위조: 다른 비밀키로 서명된 토큰 → BAD_SIGNATURE', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'another-secret');
    expect(verifyUnsubToken(token)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('구버전 포맷({sub}.{broker}.{hexsig}) 및 임의 문자열 → MALFORMED', () => {
    expect(verifyUnsubToken(`${SUB}.${BROKER_A}.deadbeef`)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(verifyUnsubToken('fake')).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(verifyUnsubToken('')).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(verifyUnsubToken('a'.repeat(700))).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('만료: ttl 경과 후 EXPIRED, 경과 전엔 성공', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A, ttlDays: 1 });
    vi.setSystemTime(new Date('2026-01-01T23:00:00Z'));
    expect(verifyUnsubToken(token).ok).toBe(true);
    vi.setSystemTime(new Date('2026-01-02T00:00:10Z'));
    expect(verifyUnsubToken(token)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('기본 만료는 365일', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    vi.setSystemTime(new Date('2026-12-31T00:00:00Z'));
    expect(verifyUnsubToken(token).ok).toBe(true);
    vi.setSystemTime(new Date('2027-01-02T00:00:00Z'));
    expect(verifyUnsubToken(token)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('NO_SECRET: 비밀키 없으면 발급은 throw, 검증은 NO_SECRET (폴백 금지)', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');
    expect(() => issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A })).toThrow(/UNSUBSCRIBE_SECRET/);
    expect(verifyUnsubToken(token)).toEqual({ ok: false, reason: 'NO_SECRET' });
  });

  it('서비스 키를 비밀로 재사용하지 않는다 (UNSUBSCRIBE_SECRET 없고 SUPABASE_SERVICE_ROLE_KEY만 있어도 throw)', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    expect(() => issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A })).toThrow();
  });

  it("발급 입력 검증: 구분자('.')·빈 값·비정상 ttl 거부", () => {
    expect(() => issueUnsubToken({ subscriberId: 'a.b', brokerId: BROKER_A })).toThrow();
    expect(() => issueUnsubToken({ subscriberId: SUB, brokerId: 'x.y' })).toThrow();
    expect(() => issueUnsubToken({ subscriberId: '', brokerId: BROKER_A })).toThrow();
    expect(() => issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A, ttlDays: 0 })).toThrow();
    expect(() => issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A, ttlDays: 99999 })).toThrow();
  });

  it('buildUnsubscribeUrl: ?t= 사용, 끝 슬래시 정규화', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: BROKER_A });
    const url = buildUnsubscribeUrl('https://credeal.net/', token);
    expect(url).toBe(`https://credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(new URL(url).searchParams.get('t')).toBe(token);
  });

  it('buildListUnsubscribeHeaders: RFC 8058 One-Click 헤더 (+mailto 옵션)', () => {
    const h1 = buildListUnsubscribeHeaders('https://credeal.net/u?t=x');
    expect(h1['List-Unsubscribe']).toBe('<https://credeal.net/u?t=x>');
    expect(h1['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const h2 = buildListUnsubscribeHeaders('https://credeal.net/u?t=x', 'unsub@credeal.net');
    expect(h2['List-Unsubscribe']).toBe('<https://credeal.net/u?t=x>, <mailto:unsub@credeal.net>');
  });
});
