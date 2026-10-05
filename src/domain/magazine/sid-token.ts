/**
 * src/domain/magazine/sid-token.ts — 구독자 개인 링크 식별자(sid) 서명 토큰 (E-04 / I-04 계약, T3-20·S2-13)
 *
 * 포맷:  base64url(payload) + '.' + base64url(HMAC-SHA256(secret, 'sid1:' + payloadB64))
 *        payload = `sid1.{subscriberId}.{brokerKey}.{expUnixSec}`
 *
 * - 비밀키 `MAGAZINE_SID_SECRET` 필수. 없으면 발급 throw / 검증 NO_SECRET (폴백 금지).
 * - 해지 토큰(UNSUBSCRIBE_SECRET, 'v2.' payload)과 키·도메인 접두가 달라 서로 재사용될 수 없다.
 * - 만료 기본 90일. 토큰은 구독자 + 브로커에 바인딩 — 호출부가 이벤트 대상 에디션의 브로커와 일치하는지 확인한다.
 * - 포워딩된 링크로는 다른 사람의 열람이 해당 구독자에게 귀속될 수 있다(링크 소지자 = 구독자로 간주하는 한계) — 문서화된 수용 위험.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'sid1';
const DEFAULT_TTL_DAYS = 90;
const MAX_TTL_DAYS = 365;

export type SidVerifyFailure = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NO_SECRET';
export type SidVerifyResult =
  | { ok: true; subscriberId: string; brokerKey: string }
  | { ok: false; reason: SidVerifyFailure };

function getSecret(): string | null {
  const s = process.env.MAGAZINE_SID_SECRET;
  return typeof s === 'string' && s.length >= 8 ? s : null;
}

const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function sign(secret: string, payloadB64: string): Buffer {
  return createHmac('sha256', secret).update(`${VERSION}:${payloadB64}`).digest();
}

export function issueSidToken(input: { subscriberId: string; brokerKey: string; ttlDays?: number; now?: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('MAGAZINE_SID_SECRET is required to issue sid tokens');
  const { subscriberId, brokerKey } = input;
  if (!ID_RE.test(subscriberId ?? '') || !ID_RE.test(brokerKey ?? '')) {
    throw new Error('subscriberId/brokerKey must be non-empty and must not contain "." or whitespace');
  }
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > MAX_TTL_DAYS) throw new Error('ttlDays out of range');
  const exp = Math.floor((input.now ?? Date.now()) / 1000) + Math.round(ttlDays * 86400);
  const payloadB64 = Buffer.from(`${VERSION}.${subscriberId}.${brokerKey}.${exp}`).toString('base64url');
  return `${payloadB64}.${sign(secret, payloadB64).toString('base64url')}`;
}

export function verifySidToken(token: unknown, now: number = Date.now()): SidVerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'NO_SECRET' };
  if (typeof token !== 'string' || token.length === 0 || token.length > 500) return { ok: false, reason: 'MALFORMED' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'MALFORMED' };
  const [payloadB64, sigB64] = parts;
  if (!B64URL_RE.test(payloadB64) || !B64URL_RE.test(sigB64)) return { ok: false, reason: 'MALFORMED' };

  const expected = sign(secret, payloadB64);
  const given = Buffer.from(sigB64, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'BAD_SIGNATURE' };

  const fields = Buffer.from(payloadB64, 'base64url').toString('utf8').split('.');
  if (fields.length !== 4 || fields[0] !== VERSION) return { ok: false, reason: 'MALFORMED' };
  const [, subscriberId, brokerKey, expStr] = fields;
  if (!ID_RE.test(subscriberId) || !ID_RE.test(brokerKey) || !/^\d{1,12}$/.test(expStr)) return { ok: false, reason: 'MALFORMED' };
  if (Math.floor(now / 1000) > Number(expStr)) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, subscriberId, brokerKey };
}
