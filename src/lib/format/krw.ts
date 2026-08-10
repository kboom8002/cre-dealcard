/**
 * src/lib/format/krw.ts
 * 
 * 만원 단위 및 원 단위 수치를 "X억 X,XXX만원" 한국 표준 형식으로 포맷하는 유틸리티
 */

/**
 * 만원 단위 숫자를 한국식 금액 문자열로 변환합니다.
 * @example
 * formatKrwManwon(150000) // "15억원"
 * formatKrwManwon(152500) // "15억 2,500만원"
 * formatKrwManwon(500)    // "500만원"
 */
export function formatKrwManwon(manwon: number | null | undefined): string {
  if (manwon == null || isNaN(manwon) || manwon <= 0) return "미정";
  const eok = Math.floor(manwon / 10000);
  const remainder = Math.round(manwon % 10000);
  if (eok > 0 && remainder > 0) {
    return `${eok.toLocaleString()}억 ${remainder.toLocaleString()}만원`;
  }
  if (eok > 0) return `${eok.toLocaleString()}억원`;
  return `${remainder.toLocaleString()}만원`;
}

/**
 * 원 단위 숫자를 한국식 금액 문자열로 변환합니다.
 * @example
 * formatKrwWon(1500000000) // "15억원"
 */
export function formatKrwWon(won: number | null | undefined): string {
  if (won == null || isNaN(won) || won <= 0) return "미정";
  return formatKrwManwon(Math.round(won / 10000));
}
