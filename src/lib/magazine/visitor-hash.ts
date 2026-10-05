/**
 * src/lib/magazine/visitor-hash.ts — 방문자 ID 서버측 해시 (E-04, T3-04/S2-28) · 서버 전용
 *
 * - 저장 형식: `v2_` + HMAC-SHA256(MAGAZINE_SID_SECRET, 방문자 uuid) 앞 40 hex.
 *   (이전 레거시 ID 는 base64 문자열이라 `_` 가 없고 `v2_` 로 시작하지 않는다 → 집계에서 구분·제외 가능)
 * - 시크릿 미설정이면 null (가짜 기본 salt 금지). 호출자는 503/미수집으로 정직하게 처리한다.
 */
import { createHmac } from 'node:crypto';
import { isValidVisitorId } from '@/lib/magazine/visitor-id';

export const VISITOR_HASH_PREFIX = 'v2_';
/** PostgREST like 패턴 (`_` 는 와일드카드지만 base64 에는 `_` 가 없어 레거시와 충돌하지 않는다) */
export const VISITOR_HASH_LIKE = 'v2_%';

export function isHashedVisitorId(v: unknown): v is string {
  return typeof v === 'string' && /^v2_[0-9a-f]{40}$/.test(v);
}

/** 원문 방문자 uuid → 저장용 해시. 형식 오류/시크릿 없음 → null */
export function hashVisitorId(raw: unknown, secret: string | undefined = process.env.MAGAZINE_SID_SECRET): string | null {
  if (!secret || secret.length < 8) return null;
  if (!isValidVisitorId(raw)) return null;
  const digest = createHmac('sha256', secret).update(`visitor:${raw.toLowerCase()}`).digest('hex');
  return `${VISITOR_HASH_PREFIX}${digest.slice(0, 40)}`;
}
