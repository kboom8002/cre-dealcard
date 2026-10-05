/**
 * missing-values.ts
 *
 * '값 없음' 표기 정규화 (D7). 표 셀에 '미기재 / 미상 / 확인 필요 / N/A' 같은 긴 플레이스홀더가 들어오면
 * 좁은 열에서 '미기…' 처럼 말줄임이 생기므로, 맞춤(fit) 이전에 단일 기호 '-' 로 통일한다.
 * 순수 함수 — 외부 의존 없음 (a24 등 archetype 에서 순환 import 없이 사용).
 */

const MISSING_TOKEN_RE = /^(?:미기재|미상|미확인|확인\s*필요|n\s*\/\s*a|\[[^\]]*미기재\])$/i;

/** 플레이스홀더(미기재/미상/확인 필요/N/A)면 true. 빈 문자열·'-' 는 이미 정규형이므로 false */
export function isMissingToken(v: unknown): boolean {
  if (v == null) return false;
  return MISSING_TOKEN_RE.test(String(v).trim());
}

/**
 * 표 셀 값 정규화: 플레이스홀더 → '-', 그 외는 trim 한 문자열 그대로.
 * null/undefined 는 빈 문자열 (호출부가 열 구조를 유지하도록 '-' 로 날조하지 않는다).
 */
export function normalizeMissing(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return MISSING_TOKEN_RE.test(s) ? '-' : s;
}
