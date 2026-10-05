/**
 * src/lib/magazine/phone-input.ts — 구독 폼 전화번호 입력 마스킹 (표시 전용, P0-07)
 *
 * 저장·정규화는 서버(`normalizeKrPhone`)가 한다. 클라이언트는 숫자만 보내고
 * 입력창에서는 하이픈을 자동으로 넣어 보여 준다.
 */

/** 입력값 → 숫자만(최대 11자리). */
export function digitsOnly(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 11);
}

/** 010 1234 5678 → 010-1234-5678 (입력 중 점진 포맷). */
export function formatKrPhoneInput(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 서버로 보낼 수 있는 최소 길이(10~11자리) 여부. 실제 검증은 서버가 한다. */
export function isPlausiblePhoneDigits(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length >= 10 && d.length <= 11;
}
