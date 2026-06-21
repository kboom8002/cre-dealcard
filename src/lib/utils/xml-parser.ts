/**
 * 안전한 XML 파싱 유틸.
 * 공공데이터 API XML 응답을 파싱합니다.
 */

/** XML 문자열에서 특정 태그의 텍스트 값 추출 */
export function xmlText(xml: string, tag: string): string {
  // CDATA 지원 패턴 또는 일반 태그 패턴
  const simpleMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([^\\]]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`));
  if (simpleMatch) return (simpleMatch[1] ?? simpleMatch[2] ?? "").trim();
  return "";
}

/** XML 문자열에서 특정 태그의 모든 블록 추출 */
export function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}
