/**
 * fit_summary 라벨 접두어 정리 (멱등성 보장)
 *
 * 배경: 승인 시 heroCard.keyInvestmentPoint(= 투자 포인트 섹션 첫 불릿, 예: "운영 자산 브랜드: …")가
 * building_ssot_lite.fit_summary 로 역동기화되고, 재생성 시 premium-template-engine 이
 * `• **운영 자산 브랜드**: ${fit_summary}` 로 다시 라벨을 붙인다 → 재생성마다 접두어가 1회씩 누적되어
 * ("운영 자산 브랜드: 운영 자산 브랜드: …") 프롬프트·본문이 비결정적으로 변한다.
 *
 * 해결: fit_summary 를 읽고/쓰는 모든 경로에서 선행 "라벨:" 접두어를 제거한다.
 * 라벨 = 24자 이하, 숫자·문장부호(.,;()) 없는 짧은 명사구 + 콜론. 본문 문장은 건드리지 않는다.
 */
const LEADING_LABEL = /^\s*(?:[•·\-*]\s*)?(?:\*\*)?\s*([^:：\n*.,;()\d]{2,24}?)\s*(?:\*\*)?\s*[:：]\s*/;

export function sanitizeFitSummary(input: unknown): string {
  if (typeof input !== 'string') return '';
  let text = input.trim();
  for (let i = 0; i < 12; i++) {
    const m = LEADING_LABEL.exec(text);
    if (!m) break;
    const rest = text.slice(m[0].length).trim();
    if (!rest) break; // 라벨만 남는 경우는 원문 유지
    text = rest;
  }
  return text;
}

/** null/undefined 는 그대로 통과(존재 여부 의미 보존), 문자열만 정리 */
export function sanitizeFitSummaryKeepNull<T>(input: T): T | string {
  if (typeof input !== 'string') return input;
  return sanitizeFitSummary(input);
}
