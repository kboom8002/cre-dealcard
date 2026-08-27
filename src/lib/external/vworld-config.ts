/**
 * V-World API 공통 설정
 * - Referer 헤더: V-World API는 등록된 도메인의 Referer 헤더를 필수로 요구합니다.
 * - API 키: 대문자 필수 (AGENTS.md 규칙)
 */

/** V-World API Referer 헤더를 반환합니다. 환경변수 우선순위: VWORLD_REFERER > NEXT_PUBLIC_SITE_URL > 프로덕션 도메인 */
export function getVWorldReferer(): string {
  return (
    process.env.VWORLD_REFERER ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://cre-dealcard.vercel.app'
  );
}

/** V-World API 키를 대문자로 변환하여 반환합니다. */
export function getVWorldApiKey(): string {
  const key = process.env.VWORLD_API_KEY || process.env.NEXT_PUBLIC_VWORLD_KEY || '';
  return key.toUpperCase();
}
