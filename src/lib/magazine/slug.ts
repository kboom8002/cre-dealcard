/**
 * src/lib/magazine/slug.ts — 브로커 slug/uuid 검증·판별 (I-02, F-04)
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 소문자·숫자·하이픈, 3~30자, 하이픈으로 시작/끝 금지. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'demo', 'broker', 'brokers', 'magazine', 'magazines', 'explore', 'login', 'logout',
  'signup', 'signin', 'register', 'auth', 'dashboard', 'settings', 'profile', 'subscribe', 'unsubscribe',
  'public', 'static', 'assets', 'og', 'image', 'images', 'robots', 'sitemap', 'favicon', 'null',
  'undefined', 'test', 'tests', 'support', 'help', 'about', 'terms', 'privacy', 'credeal', 'cre-dealcard',
  'root', 'system', 'internal', 'cron', 'webhook', 'webhooks', 'im', 'im-lite', 'dc', 'insight',
]);

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** 런타임 가드: uuid 컬럼에 slug가 들어가는 22P02 방지. */
export function assertUuid(v: unknown, label = 'id'): string {
  if (!isUuid(v)) throw new Error(`${label} must be a uuid`);
  return v;
}

export type SlugValidation = { ok: true; slug: string } | { ok: false; code: 'FORMAT' | 'RESERVED'; message: string };

export function validateSlug(input: unknown): SlugValidation {
  if (typeof input !== 'string') return { ok: false, code: 'FORMAT', message: '주소(slug)를 입력해 주세요.' };
  const slug = input.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      code: 'FORMAT',
      message: '주소는 영문 소문자·숫자·하이픈(-)만 사용해 3~30자로 입력해 주세요.',
    };
  }
  if (isUuid(slug) || RESERVED_SLUGS.has(slug)) {
    return { ok: false, code: 'RESERVED', message: '사용할 수 없는 주소입니다. 다른 주소를 선택해 주세요.' };
  }
  return { ok: true, slug };
}

/** URL 파라미터 brokerId 1차 검증: slug 형식 또는 uuid 형식만 통과(기존 데이터 호환을 위해 예약어는 허용). */
export function isPlausibleBrokerParam(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (isUuid(v)) return true;
  // 기존 운영 slug(예: test-broker-kim, demo)도 SLUG_RE를 만족한다.
  return SLUG_RE.test(v);
}
