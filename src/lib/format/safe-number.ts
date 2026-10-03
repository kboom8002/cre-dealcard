/**
 * @file safe-number.ts
 * @description 렌더 경로 공통 숫자 포맷터 (Hardening H2).
 *
 * 규칙 (Rule 37): 결측/NaN/Infinity 는 항상 '-' 로 표기한다. 'NaN%', 'undefined원' 이 산출물에 나가지 않도록
 * 렌더 경로에서는 `toFixed()` 를 직접 쓰지 말고 이 모듈을 사용한다.
 */

export const MISSING = '-';

/** 유한한 숫자인지 (null/undefined/''/NaN/±Infinity 제외). 숫자형 문자열도 허용. */
export function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** 고정 소수 포맷 (결측 → '-'). 반올림 방식은 Number.prototype.toFixed 와 동일. */
export function fmtFixed(v: unknown, decimals = 0, unit = ''): string {
  const n = toFiniteNumber(v);
  if (n === null) return MISSING;
  return `${n.toFixed(decimals)}${unit}`;
}

/** 천 단위 구분 정수/소수 포맷 (결측 → '-'). */
export function fmtGrouped(v: unknown, decimals = 0, unit = ''): string {
  const n = toFiniteNumber(v);
  if (n === null) return MISSING;
  return `${n.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${unit}`;
}

/** 퍼센트 (값은 이미 % 단위: 4.5 → '4.5%'). */
export function fmtPct(v: unknown, decimals = 1): string {
  return fmtFixed(v, decimals, '%');
}

/** 원 → 억 환산 표기 (1,150,000,000 → '11.5억'). 0 이하/결측은 '-'. */
export function fmtEok(won: unknown, decimals = 1): string {
  const n = toFiniteNumber(won);
  if (n === null || n <= 0) return MISSING;
  return `${(n / 1e8).toFixed(decimals)}억`;
}

/**
 * 'A / B' 쌍 표기.
 * 한쪽만 결측이면 결측 쪽에는 단위 없이 '-', 둘 다 결측이면 '-' 하나만 반환한다
 * ('-% / -%', '-대 / -대' 방지).
 */
export function pairOrDash(a: unknown, b: unknown, unit: string): string {
  const fmt = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return `${v}${unit}`;
  };
  const fa = fmt(a);
  const fb = fmt(b);
  if (!fa && !fb) return MISSING;
  return `${fa ?? MISSING} / ${fb ?? MISSING}`;
}
