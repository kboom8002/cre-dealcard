/**
 * src/lib/magazine/kakao-greeting.ts — 중개사 카카오톡 발송용 뉴스레터 인사말 생성기.
 *
 * Step 3 [카톡 인사말 복사] 버튼과 API/테스트 공용. 블라인드 위생 준수(비공개 상세 주소 미노출).
 */

export interface BuildNewsletterKakaoGreetingParams {
  headline: string;
  briefingBody?: string;
  publicUrl: string;
  brokerName?: string;
  brokerOffice?: string;
  brokerPhone?: string;
}

function summarizeBriefingSnippet(rawBody?: string): string {
  const cleaned = String(rawBody || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[•·\-*#>\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  if (!cleaned) return "";
  return cleaned.length > 90 ? `${cleaned.slice(0, 89).trimEnd()}…` : cleaned;
}

export function buildNewsletterKakaoGreeting({
  headline,
  briefingBody,
  publicUrl,
  brokerName,
  brokerOffice,
  brokerPhone,
}: BuildNewsletterKakaoGreetingParams): string {
  const safeHeadline = headline.trim() || "금주 상업용 부동산 시장 브리핑";
  const snippet = summarizeBriefingSnippet(briefingBody);
  const sigParts = [brokerOffice?.trim(), brokerName?.trim()].filter(Boolean);
  const signature = sigParts.join(" · ");
  const phoneLine = brokerPhone?.trim() ? `문의: ${brokerPhone.trim()}` : "";

  const lines: string[] = [
    `안녕하세요, ${signature ? `${signature} ` : ""}주간 CRE 매거진 안내드립니다.`,
    "",
    `📰 ${safeHeadline}`,
    ...(snippet ? [`${snippet}`] : []),
    "",
    `▶ 매거진 바로 보기: ${publicUrl}`,
    ...(phoneLine ? [phoneLine] : []),
  ];

  return lines.join("\n").trim();
}
