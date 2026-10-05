/**
 * @file broker-mention-texts.ts
 * @description 입지 지도 POI 선별(location-poi-selector `mentionTexts`)에 넘길 "중개인 실입력 원문" 수집기 — 순수 함수.
 *
 * Rule 34: 중개인이 실제로 입력한 텍스트(메모 raw_input / 입지 설명 location_note / 소재지)만 사용한다.
 *          LLM 생성 문구(sections/heroCard 등)는 절대 포함하지 않는다.
 * 렌더 경로 전용 — LLM 프롬프트에는 관여하지 않는다.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** building / doc.body 에서 중개인 실입력 텍스트 조각들을 모은다 (중복·공백 제거, 입력 순서 유지) */
export function collectBrokerMentionTexts(building: any, body: any): string[] {
  const ssot = body?.ssot_summary ?? {};
  const raw = [
    building?.raw_input, building?.rawInput,
    body?.raw_input, body?.rawInput, ssot?.raw_input,
    body?.broker_extras?.location_note,
    ssot?.address, ssot?.raw_address, body?.resolved_address, body?.address, building?.address,
  ];
  const out: string[] = [];
  for (const v of raw) {
    const s = str(v);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
