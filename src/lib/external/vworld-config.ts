/**
 * V-World API 공통 설정
 * - Referer 헤더: V-World API는 등록된 도메인의 Referer 헤더를 필수로 요구합니다.
 * - API 키: 대문자 필수 (AGENTS.md 규칙)
 */

/** V-World API Referer 헤더를 반환합니다. V-World 인증은 등록된 도메인(credeal.net / cre-dealcard.vercel.app)만 허용합니다. */
export function getVWorldReferer(): string {
  return (
    process.env.VWORLD_REFERER ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://credeal.net'
  );
}

/** V-World API 키를 대문자로 변환하여 반환합니다. */
export function getVWorldApiKey(): string {
  const key = process.env.VWORLD_API_KEY || process.env.NEXT_PUBLIC_VWORLD_KEY || '';
  return key.toUpperCase();
}

export function hasVWorldApiKey(): boolean {
  const key = getVWorldApiKey();
  if (!key) {
    console.warn('[vworld-config] V-World API 키 미설정 — WMS/WFS 호출 생략');
  }
  return !!key;
}

/** V-World API Domain을 반환합니다. */
export function getVWorldDomain(): string {
  const referer = getVWorldReferer();
  return referer.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}
