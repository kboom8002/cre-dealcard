/**
 * src/domain/magazine/templates/format.ts — 이메일/알림톡 공용 표시 포맷 유틸 (G-05, M2-10⑥)
 * 값이 없거나 비정상이면 문자열 'NaN억' 같은 가짜 표시 대신 null을 돌려준다(Fail-closed 표시).
 */

const BAD_TOKEN = /\b(nan|undefined|null|infinity)\b/i;

/**
 * 금액(원 단위 number 또는 이미 표기된 문자열) → '12.5억' / '3,500만' / '5,000원'.
 *  - number: 유한하고 0 초과일 때만 표기. NaN/Infinity/음수/0 → null.
 *  - string: 'NaN'·'undefined'·'null' 토큰 포함 시 null. 숫자만 있으면 원 단위로 해석, 한글 단위 포함 표기는 정제 후 그대로.
 */
export function formatKrwAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return fromWon(value);
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || BAD_TOKEN.test(s)) return null;
  if (/^[\d,]+(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? fromWon(n) : null;
  }
  // 이미 '12억 5천만원' 같은 표기: 제어문자·꺾쇠 제거, 길이 제한
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 30);
  return /[\d]/.test(cleaned) ? cleaned : null;
}

function fromWon(won: number): string {
  if (won >= 100_000_000) {
    const eok = Math.round((won / 100_000_000) * 10) / 10;
    return `${trimZero(eok)}억`;
  }
  if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString('ko-KR')}만`;
  return `${Math.round(won).toLocaleString('ko-KR')}원`;
}

function trimZero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 'YYYY-MM-DD'(또는 ISO 앞부분) → 'YYYY년 M월 D일'. 형식이 다르면 null (타임존 변환 없이 문자열만 사용 → KST 날짜 보존). */
export function formatDateKo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}년 ${mo}월 ${d}일`;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' (거래일 등 짧은 표기). 형식이 다르면 null. */
export function formatDateDots(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** 길이 제한(말줄임). */
export function clip(s: string, max: number): string {
  const arr = Array.from(s);
  return arr.length > max ? `${arr.slice(0, max - 1).join('')}…` : s;
}
