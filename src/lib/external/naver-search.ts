import { createModuleLogger } from "@/lib/logger";
import { decodeEntities, stripTags } from "@/lib/magazine/escape";

const log = createModuleLogger("naver-search");

export interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

export interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

/**
 * 네이버 검색 API 응답 문자열 정제:
 * - `<b>`, `</b>` 등 HTML 태그 제거
 * - `&quot;`, `&amp;`, `&lt;`, `&gt;`, `&#39;` 등 HTML 엔티티 디코드
 * - 엔티티 디코드 후 생성된 잔여 HTML 태그 재제거
 * - 제어문자(`\u0000`–`\u001F`, `\u007F`–`\u009F`) 제거 및 공백 정규화
 */
export function sanitizeNaverText(raw: string | null | undefined): string {
  if (!raw) return "";
  const withoutTags = stripTags(raw);
  const decoded = decodeEntities(withoutTags)
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'");
  return decoded
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/[\t\r\n]+/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchNaverNews(query: string, display: number = 10): Promise<NaverSearchItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log.warn("NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is missing. Skipping Naver News API.");
    return [];
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`Naver API error: ${res.statusText}`);
    }

    const data = (await res.json()) as NaverSearchResponse;
    if (!data.items) return [];
    
    return data.items.map(item => ({
      ...item,
      title: sanitizeNaverText(item.title),
      description: sanitizeNaverText(item.description)
    }));
  } catch (error) {
    log.error("Failed to fetch Naver News", error, { query });
    return [];
  }
}
