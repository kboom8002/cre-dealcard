/**
 * src/domain/magazine/templates/url-guard.ts — 발송물에 들어가는 링크 검증 (G-05)
 *
 * 이메일/알림톡 본문의 링크는 수신자 환경에서 열리므로 상대경로·localhost·undefined·비 https 링크는
 * 발송 사고(깨진 링크, 개발 환경 노출)로 이어진다. 발견 즉시 throw해서 발송 전에 차단한다.
 */

const FORBIDDEN_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.*\.local|.*\.internal)$/i;

/** https 절대 URL만 허용. 그 외는 Error (메시지에는 라벨만, URL 본문은 노출하지 않음 — 토큰 포함 가능). */
export function assertAbsoluteHttpsUrl(url: unknown, label: string): string {
  if (typeof url !== 'string' || !url.trim()) throw new Error(`${label}: URL이 비어 있습니다`);
  const raw = url.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${label}: 절대 URL이 아닙니다`);
  }
  // 'undefined'/'null' 리터럴: 호스트·경로 세그먼트 또는 쿼리 값 전체 일치만 검사(랜덤 토큰 부분 일치 오탐 방지)
  if (/(^|[/.])(undefined|null)([/.]|$)/i.test(u.hostname + u.pathname)) {
    throw new Error(`${label}: URL에 undefined/null 이 포함되어 있습니다`);
  }
  for (const v of u.searchParams.values()) {
    if (v === 'undefined' || v === 'null') throw new Error(`${label}: URL 파라미터에 undefined/null 이 포함되어 있습니다`);
  }
  if (u.protocol !== 'https:') throw new Error(`${label}: https 링크만 허용됩니다`);
  if (u.username || u.password) throw new Error(`${label}: 인증정보가 포함된 URL은 허용되지 않습니다`);
  if (FORBIDDEN_HOST.test(u.hostname)) throw new Error(`${label}: 내부/개발 호스트 링크는 허용되지 않습니다`);
  return u.toString();
}

/** 사이트 기준 URL (끝 슬래시 제거). 환경변수 미설정 시 운영 도메인. */
export function getSiteBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net').trim();
  return raw.replace(/\/+$/, '');
}

/** `tel:` 링크용 번호 정제 (숫자와 선행 + 만). 유효하지 않으면 null. */
export function toTelHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  const plus = t.startsWith('+') ? '+' : '';
  const digits = t.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `tel:${plus}${digits}`;
}
