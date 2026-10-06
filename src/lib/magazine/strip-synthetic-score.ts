/**
 * 합성(가짜) 점수 토큰 제거 — 공용 순수 함수 (뷰어 · OG/스토리/카드 이미지 공유).
 *
 * 과거 발행본의 브리핑 본문에는 근거 없는 '62/100' 형태 점수 토큰이 박혀 있을 수 있다.
 * 같은 규칙을 모든 노출면에서 쓰도록 이 파일에만 정의한다 (서버/클라이언트 양쪽 import 가능, 의존성 없음).
 *
 *  - `NN/100`, `NN / 100`, `NN/100점`, `NN점/100점` 제거 (소수점 허용: `62.5/100`)
 *  - 토큰만 남은 빈 괄호 `()` `[]` `（）` 와 그로 인해 생긴 중복 공백·공백 뒤 구두점을 정리
 *  - 날짜(`2026/10/05`)·비율(`1/1000`)·분수(`3/100m`)는 건드리지 않는다.
 */

/** 100 점 만점 표기: 앞뒤가 숫자/영문/슬래시로 이어지지 않는 경우만 매치 */
const SCORE_TOKEN =
  /(?<![\d./A-Za-z])\d{1,3}(?:\.\d+)?[ \t]*점?[ \t]*\/[ \t]*100[ \t]*점?(?![\d/A-Za-z])/g;

const EMPTY_BRACKETS = /[(\[（［]\s*[)\]）］]/g;

/** 텍스트에 합성 점수 토큰이 있는지 */
export function hasSyntheticScore(text: string): boolean {
  SCORE_TOKEN.lastIndex = 0;
  const found = SCORE_TOKEN.test(text);
  SCORE_TOKEN.lastIndex = 0;
  return found;
}

/** `62/100` 같은 점수 토큰을 제거한다. 줄바꿈은 보존한다. */
export function stripSyntheticScore(text: string): string {
  if (!text) return text;
  return text
    .replace(SCORE_TOKEN, '')
    .replace(EMPTY_BRACKETS, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:·、。!?])/g, '$1')
    .replace(/[ \t]+$/gm, '');
}
