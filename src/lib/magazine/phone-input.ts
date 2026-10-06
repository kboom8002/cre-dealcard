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

/**
 * 소유 중개사 화면 표시용: 01000007103 → 010-0000-7103.
 * 휴대폰(01x, 10~11자리 숫자/공백/하이픈만)일 때만 포맷하고, 마스킹('010-****-1234')·유선·국제 번호 등은 원문 그대로 둔다.
 */
export function formatKrPhoneDisplay(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s || !/^[\d\s-]+$/.test(s)) return s;
  const d = s.replace(/\D/g, '');
  if (!/^01\d{8,9}$/.test(d)) return s;
  return formatKrPhoneInput(d);
}

/** 서버로 보낼 수 있는 최소 길이(10~11자리) 여부. 실제 검증은 서버가 한다. */
export function isPlausiblePhoneDigits(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length >= 10 && d.length <= 11;
}
