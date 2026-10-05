/**
 * src/domain/magazine/unsub-token.ts — 수신거부 토큰 v2 (G-02, T2-03/T2-27/S2-25)
 *
 * 포맷:  base64url(payload) + '.' + base64url(HMAC-SHA256(secret, payloadB64))
 *        payload = `v2.{subscriberId}.{brokerId}.{expUnixSec}`
 *
 * 원칙
 *  - 비밀키는 `UNSUBSCRIBE_SECRET` 필수. 없으면 발급은 throw, 검증은 NO_SECRET. 폴백(service key 재사용 등) 금지.
 *  - 서명 비교는 crypto.timingSafeEqual.
 *  - subscriberId/brokerId에 구분자('.')가 들어갈 수 없다(발급 시 거부) → 필드 경계 모호성 제거.
 *  - 토큰은 구독자 + 브로커에 바인딩된다. 호출부(unsubscribe route)는 구독자 행의 broker와 토큰 broker 일치를 추가 확인한다.
 *  - 이 모듈은 PII를 다루지 않는다(구독자 uuid만).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v2';
const DEFAULT_TTL_DAYS = 365;
const MAX_TTL_DAYS = 3650;

export type UnsubVerifyFailure = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NO_SECRET';
export type UnsubVerifyResult =
  | { ok: true; subscriberId: string; brokerId: string }
  | { ok: false; reason: UnsubVerifyFailure };

function getSecret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/; // uuid(하이픈 포함) · slug 모두 허용, '.'는 불가

function sign(secret: string, payloadB64: string): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/** 해지 토큰 발급. UNSUBSCRIBE_SECRET이 없으면 throw(폴백 금지). */
export function issueUnsubToken(input: { subscriberId: string; brokerId: string; ttlDays?: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is required to issue unsubscribe tokens');

  const { subscriberId, brokerId } = input;
  if (!ID_RE.test(subscriberId ?? '') || !ID_RE.test(brokerId ?? '')) {
    throw new Error('subscriberId/brokerId must be non-empty and must not contain "." or whitespace');
  }
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > MAX_TTL_DAYS) {
    throw new Error('ttlDays out of range');
  }
  const exp = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86400);
  const payloadB64 = b64urlEncode(`${TOKEN_VERSION}.${subscriberId}.${brokerId}.${exp}`);
  return `${payloadB64}.${b64urlEncode(sign(secret, payloadB64))}`;
}

/** 해지 토큰 검증 (서명 → 형식 → 만료 순). */
export function verifyUnsubToken(token: string): UnsubVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'NO_SECRET' };
  if (typeof token !== 'string' || token.length === 0 || token.length > 600) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'MALFORMED' };
  const [payloadB64, sigB64] = parts;
  if (!B64URL_RE.test(payloadB64) || !B64URL_RE.test(sigB64)) return { ok: false, reason: 'MALFORMED' };

  const expected = sign(secret, payloadB64);
  const given = Buffer.from(sigB64, 'base64url');
  // 길이가 다르면 timingSafeEqual이 throw하므로 선검사 (길이 자체는 비밀이 아님)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const fields = Buffer.from(payloadB64, 'base64url').toString('utf8').split('.');
  if (fields.length !== 4 || fields[0] !== TOKEN_VERSION) return { ok: false, reason: 'MALFORMED' };
  const [, subscriberId, brokerId, expStr] = fields;
  if (!ID_RE.test(subscriberId) || !ID_RE.test(brokerId) || !/^\d{1,12}$/.test(expStr)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (Math.floor(Date.now() / 1000) > Number(expStr)) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, subscriberId, brokerId };
}

/** 수신거부 확인 페이지 URL. baseUrl 끝의 '/'는 제거한다. */
export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 One-Click 헤더. mailto가 있으면 함께 노출한다. */
export function buildListUnsubscribeHeaders(url: string, mailto?: string): Record<string, string> {
  const targets = [`<${url}>`];
  if (mailto) targets.push(`<mailto:${mailto}>`);
  return {
    'List-Unsubscribe': targets.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
