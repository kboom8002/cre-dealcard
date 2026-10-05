/**
 * 방문자 해시 · sid 서명 토큰 (E-04 · S2-28 / T3-20)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashVisitorId, isHashedVisitorId, VISITOR_HASH_LIKE } from '@/lib/magazine/visitor-hash';
import { issueSidToken, verifySidToken } from '@/domain/magazine/sid-token';

const SECRET = 'test-secret-1234567890';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.MAGAZINE_SID_SECRET;
  process.env.MAGAZINE_SID_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MAGAZINE_SID_SECRET;
  else process.env.MAGAZINE_SID_SECRET = saved;
});

describe('hashVisitorId', () => {
  it('같은 입력 → 같은 해시(결정적), 다른 입력 → 다른 해시', () => {
    const a = hashVisitorId(V1)!;
    expect(a).toMatch(/^v2_[0-9a-f]{40}$/);
    expect(hashVisitorId(V1)).toBe(a);
    expect(hashVisitorId(V2)).not.toBe(a);
    expect(isHashedVisitorId(a)).toBe(true);
  });

  it('원문 ID 가 출력에 포함되지 않고, 시크릿이 다르면 해시도 다르다', () => {
    const a = hashVisitorId(V1)!;
    expect(a.includes(V1.replace(/-/g, ''))).toBe(false);
    expect(hashVisitorId(V1, 'another-secret-999')).not.toBe(a);
  });

  it('시크릿 없음/너무 짧음 → null (가짜 salt 금지)', () => {
    delete process.env.MAGAZINE_SID_SECRET;
    expect(hashVisitorId(V1)).toBeNull();
    expect(hashVisitorId(V1, 'short')).toBeNull();
  });

  it('uuid 가 아닌 입력 → null (레거시 base64 ID 도 거부)', () => {
    expect(hashVisitorId('TW96aWxsYS81LjAgKFdpbmRvd3MgTlQ')).toBeNull();
    expect(hashVisitorId(undefined)).toBeNull();
  });

  it('레거시 base64 ID 는 v2 패턴과 구분된다', () => {
    expect(isHashedVisitorId('TW96aWxsYS81LjAgKFdpbmRvd3MgTlQ')).toBe(false);
    expect(VISITOR_HASH_LIKE).toBe('v2_%');
  });
});

describe('sid 토큰', () => {
  const NOW = Date.parse('2026-10-06T00:00:00Z');

  it('발급 → 검증 round-trip (구독자·브로커 바인딩)', () => {
    const t = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a', now: NOW });
    expect(verifySidToken(t, NOW + 1000)).toEqual({ ok: true, subscriberId: SUB, brokerKey: 'broker-a' });
  });

  it('위조(서명 변조·페이로드 변조) → BAD_SIGNATURE', () => {
    const t = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a', now: NOW });
    const [p, s] = t.split('.');
    const evil = Buffer.from(`sid1.${SUB}.broker-b.${Math.floor(NOW / 1000) + 99999}`).toString('base64url');
    expect(verifySidToken(`${evil}.${s}`, NOW)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(verifySidToken(`${p}.${'A'.repeat(43)}`, NOW)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('만료 → EXPIRED (90일 기본)', () => {
    const t = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a', now: NOW });
    expect(verifySidToken(t, NOW + 89 * 86_400_000).ok).toBe(true);
    expect(verifySidToken(t, NOW + 91 * 86_400_000)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('형식 오류 → MALFORMED, 시크릿 없음 → NO_SECRET / 발급 throw', () => {
    expect(verifySidToken('abc', NOW)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(verifySidToken(undefined, NOW)).toEqual({ ok: false, reason: 'MALFORMED' });
    delete process.env.MAGAZINE_SID_SECRET;
    expect(() => issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a' })).toThrow();
    expect(verifySidToken('a.b', NOW)).toEqual({ ok: false, reason: 'NO_SECRET' });
  });

  it('다른 시크릿으로 발급한 토큰은 거부', () => {
    process.env.MAGAZINE_SID_SECRET = 'other-secret-abcdefgh';
    const t = issueSidToken({ subscriberId: SUB, brokerKey: 'broker-a', now: NOW });
    process.env.MAGAZINE_SID_SECRET = SECRET;
    expect(verifySidToken(t, NOW)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });
});
