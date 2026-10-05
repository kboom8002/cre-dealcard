import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/ai/llm-client";
import { decodeEntities, safeHttpUrl } from "@/lib/magazine/escape";
import { todayKst, toKstDate, addDays, parseIssueDate } from "@/lib/magazine/kst";
import {
  trackNaverCommunity,
  crawlNaverCRENews,
  cleanNewsText,
  detectRegions,
  computeNewsImportance,
  NEWS_SUMMARY_SYSTEM_PROMPT,
} from "./naver-search";
import { crawlYoutubeTrends } from "./youtube-crawler";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('market-crawlers');


// ─── RSS 피드 목록: 6개 주요 경제지 부동산 섹션 ─────────────────────────────────
const CRE_RSS_FEEDS = [
  { name: "Hankyung RE",  url: "https://www.hankyung.com/feed/realestate" },
  { name: "MK Estate",    url: "https://www.mk.co.kr/rss/estate" },
  { name: "Edaily RE",    url: "https://www.edaily.co.kr/rss/realestate" },
  { name: "ChosunBiz",   url: "https://biz.chosun.com/rss/realty" },
  { name: "SedailyRE",   url: "https://www.sedaily.com/RSS/RealEstate" },
  { name: "MT Estate",   url: "https://news.mt.co.kr/rss/estate.xml" },
];

// ─── BigKinds API 설정 ─────────────────────────────────────────────────────────
const BIGKINDS_API_URL = "https://tools.kinds.or.kr:8443/search/news";
const BIGKINDS_ACCESS_KEY = process.env.BIGKINDS_ACCESS_KEY || "";
const BIGKINDS_KEYWORDS = [
  "\uAF2C\uB9C8\uBE4C\uB529",             // 꼬마빌딩
  "\uC0C1\uC5C5\uC6A9 \uBD80\uB3D9\uC0B0", // 상업용 부동산
  "\uBE4C\uB529 \uB9E4\uB9E4",             // 빌딩 매매
  "\uC624\uD53C\uC2A4 \uACF5\uC2E4\uB960", // 오피스 공실률
  "\uADFC\uC0DD \uAC74\uBB3C",             // 근생 건물
];

// ─── RSS XML 파싱 헬퍼 ──────────────────────────────────────────────────────────
/** `<tag ...>inner</tag>` 의 inner 원문. 없으면 ''. (개행 포함 매칭) */
function innerTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

/** `<![CDATA[...]]>` 래퍼를 모두 벗긴다 (M2-17: URL에 CDATA가 그대로 저장되던 문제). */
export function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export interface RssItem { title: string; link: string; description: string }

/**
 * RSS/Atom 아이템 파싱. title/description 은 CDATA 제거 + 태그 제거 + 엔티티 디코드,
 * link 는 CDATA 제거 + 엔티티 디코드 후 http(s) 검증을 통과한 것만 반환한다.
 */
export function parseRSSItems(xml: string, limit = 5): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = cleanNewsText(unwrapCdata(innerTag(block, "title")));
    const rawLink =
      innerTag(block, "link") || (block.match(/<link\s[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const link = decodeEntities(unwrapCdata(rawLink)).trim();
    const desc = cleanNewsText(unwrapCdata(innerTag(block, "description"))).slice(0, 500);
    if (title && link && safeHttpUrl(link)) items.push({ title, link, description: desc });
  }
  return items.slice(0, limit);
}

// ─── BigKinds API 호출 ─────────────────────────────────────────────────────────
async function fetchBigKindsNews(): Promise<RssItem[]> {
  if (!BIGKINDS_ACCESS_KEY) return [];
  const endDate = todayKst();
  const startDate = addDays(endDate, -3);
  const results: RssItem[] = [];

  for (const keyword of BIGKINDS_KEYWORDS.slice(0, 3)) {
    try {
      const res = await fetch(BIGKINDS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access-key": BIGKINDS_ACCESS_KEY },
        body: JSON.stringify({
          access_key: BIGKINDS_ACCESS_KEY,
          argument: {
            query: keyword,
            published_at: { from: startDate, until: endDate },
            sort: { date: "desc" },
            hilight: 200,
            return_from: 0,
            return_size: 3,
            fields: ["title", "content", "published_at", "provider", "news_url"],
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const docs = data?.return_object?.documents || [];
        for (const doc of docs) {
          // 실제 기사 URL 이 없으면 저장하지 않는다 (검색 페이지 URL로 대체 금지)
          const link = typeof doc.news_url === "string" ? doc.news_url.trim() : "";
          const title = cleanNewsText(doc.title);
          if (!title || !safeHttpUrl(link)) continue;
          results.push({
            title,
            link,
            description: cleanNewsText(doc.content).slice(0, 300),
          });
        }
      }
    } catch (err) {
      log.warn(`[BigKinds] keyword failed:`, err);
    }
  }
  return results;
}

// ─── E2: RSS + BigKinds + 네이버뉴스 통합 크롤러 (LLM 기반 고도화) ──────────────
interface RawNewsItem {
  title: string;
  link: string;
  description: string;
  feedSource: string;
}

interface ScoredNews {
  title: string;
  link: string;
  description: string;
  feedSource: string;
  score: number;
  regions: string[];
  topic: string;
  sentiment: string;
  summary: string;
}

/** LLM 점수를 얻지 못했을 때의 규칙 기반 폴백 (고정 5점 금지 — 기사 텍스트 근거로 산정). */
function ruleBasedScore(item: RawNewsItem): ScoredNews {
  return {
    ...item,
    score: computeNewsImportance(item.title, item.description, 5),
    regions: detectRegions(`${item.title} ${item.description}`),
    topic: "market_trend",
    sentiment: "neutral",
    summary: item.description.slice(0, 150),
  };
}

// LLM 배치: 수집된 뉴스에 CRE 적합성 점수 + 권역 + 토픽 + 감성을 한 번에 부여
async function scoreNewsBatch(items: RawNewsItem[]): Promise<ScoredNews[]> {
  if (items.length === 0) return [];

  const newsListText = items.map((item, i) => 
    `[${i}] ${item.title}\n    ${item.description.slice(0, 200)}`
  ).join("\n");

  try {
    const aiRes = await callLLM({
      systemPrompt: `당신은 상업용 부동산(CRE) 꼬마빌딩 전문 브로커의 뉴스 에디터입니다.
아래 뉴스 목록을 분석하여, 각 뉴스의 CRE 적합성을 평가하세요.

■ 판단 기준:
- 직접 CRE (빌딩 매매/임대/경매/공실/개발) → 8~10점
- 간접 CRE (금리/LTV/DSR/세제/도시계획/재개발/인프라/교통) → 6~8점
- 관련 경제 (GDP/물가/건설경기/부동산시장 전반) → 4~6점
- 무관 (주거/아파트/전원주택/연예/스포츠) → 1~3점

■ 권역 판단: 뉴스 내용이 특정 권역과 관련되면 해당 코드 사용
- gbd: 강남/서초/송파/GBD 권역
- seongsu: 성수/성동/왕십리/뚝섬
- ybd: 여의도/영등포/마포/YBD 권역
- 전국/일반적 내용이면 all

■ 토픽 분류: market_trend, transaction, auction, rental, policy, development, finance, regulation 중 1개

■ 감성 판단: 상업용 부동산 시장 관점에서
- bullish: 시장에 호재 (금리인하, 공실률 하락, 거래량 증가 등)
- bearish: 시장에 악재 (금리인상, 공실률 상승, 규제 강화 등)
- neutral: 중립

반드시 아래 JSON 배열만 출력 (설명 없이):
[{"idx":0,"score":8,"regions":["gbd"],"topic":"transaction","sentiment":"bullish"}]`,
      userPrompt: newsListText,
      model: "gpt-5.6-luna",
      temperature: 0.15,
      maxTokens: 800,
    }, { allowMock: false });

    const arrMatch = aiRes.content.match(/\[[\s\S]*\]/);
    if (!arrMatch) return items.map(ruleBasedScore);

    const scored: { idx: number; score: number; regions: string[]; topic: string; sentiment: string }[] = JSON.parse(arrMatch[0]);
    const scoredMap = new Map(scored.map(s => [s.idx, s]));

    return items.map((item, i) => {
      const s = scoredMap.get(i);
      // LLM 이 해당 항목을 평가하지 않았거나 점수가 유효하지 않으면 규칙 기반으로 산정
      if (!s || typeof s.score !== "number" || !Number.isFinite(s.score)) return ruleBasedScore(item);
      return {
        ...item,
        score: Math.max(1, Math.min(10, s.score)),
        regions: Array.isArray(s.regions) && s.regions.length ? s.regions : detectRegions(`${item.title} ${item.description}`),
        topic: s.topic || "market_trend",
        sentiment: s.sentiment || "neutral",
        summary: item.description.slice(0, 150),
      };
    });
  } catch (err) {
    log.warn("[scoreNewsBatch] LLM scoring failed, using rule-based scoring:", err);
    return items.map(ruleBasedScore);
  }
}

// LLM 강화 요약: 1줄 40자 → 3줄 브로커 관점 요약 (원문에 없는 수치 생성 금지)
async function enhancedSummarize(title: string, content: string): Promise<string> {
  try {
    const aiRes = await callLLM({
      systemPrompt: NEWS_SUMMARY_SYSTEM_PROMPT,
      userPrompt: `제목: ${title}\n내용: ${content}`,
      model: "gpt-5.6-luna",
      temperature: 0.2,
      maxTokens: 200,
    }, { allowMock: false });
    return cleanNewsText(aiRes.content) || content.slice(0, 150);
  } catch {
    return content.slice(0, 150);
  }
}

export async function crawlCreNews(supabase: SupabaseClient): Promise<any[]> {
  const results: any[] = [];
  const rawItems: RawNewsItem[] = [];

  // Phase 1: RSS 피드 수집 (6개 언론사, 각 최대 8건)
  for (const feed of CRE_RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "CREDealCard-Bot/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSSItems(xml);
      for (const item of items) {
        rawItems.push({ ...item, feedSource: feed.name });
      }
    } catch (err) {
      log.warn(`[crawlCreNews] Feed ${feed.name} failed:`, err);
    }
  }

  // Phase 2: BigKinds API
  if (BIGKINDS_ACCESS_KEY) {
    try {
      const bkNews = await fetchBigKindsNews();
      for (const item of bkNews) {
        rawItems.push({ ...item, feedSource: "BigKinds" });
      }
    } catch (err) {
      log.warn("[crawlCreNews] BigKinds failed:", err);
    }
  }

  // Phase 3: 네이버뉴스
  try {
    const naverNews = await crawlNaverCRENews(supabase);
    results.push(...naverNews);
  } catch (err) {
    log.warn("[crawlCreNews] Naver news failed:", err);
  }

  // ── LLM 배치 적합성 판단 ─────────────────────────────────────────────────
  const scoredItems = await scoreNewsBatch(rawItems);

  // CRE 적합성 4점 이상만 저장 (주거/무관 뉴스 제외)
  const relevantItems = scoredItems.filter(item => item.score >= 4);
  // 점수 높은 순 정렬, 최대 15건
  relevantItems.sort((a, b) => b.score - a.score);
  const topItems = relevantItems.slice(0, 15);

  // ── 상위 뉴스 강화 요약 + DB 저장 ────────────────────────────────────────
  const newsMap = new Map<string, any>();
  for (const item of topItems) {
    if (!item.link) continue;
    // 점수 7 이상은 강화 요약, 나머지는 기본 요약
    const summary = item.score >= 7
      ? await enhancedSummarize(item.title, item.description)
      : item.summary;

    newsMap.set(item.link, {
      url: item.link,
      title: item.feedSource === "BigKinds" ? `[BigKinds] ${item.title}` : item.title,
      source: item.feedSource,
      summary,
      content: item.description.slice(0, 500),
      sentiment: item.sentiment,
      importance_score: item.score,
      regions: item.regions,
      topic: item.topic,
    });
  }

  const newsToUpsert = Array.from(newsMap.values());
  if (newsToUpsert.length > 0) {
    const { data, error } = await supabase
      .from("external_news")
      .upsert(newsToUpsert, { onConflict: "url" })
      .select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[crawlCreNews] Bulk upsert failed:", error);
    }
  }

  if (results.length === 0) {
    log.warn("[crawlCreNews] All news sources returned empty — no dummy fallback");
  }
  return results;
}

// ─── E3: 리서치 리포트 — 네이버뉴스 "부동산 리포트" 실제 검색 ─────────────────────
export async function ingestGlobalReports(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  if (!NAVER_ID || !NAVER_SECRET) {
    log.warn("[ingestGlobalReports] Naver API credentials missing");
    return [];
  }

  const keywords = ["CBRE 오피스 리포트", "쿠시먼 부동산", "부동산플래닛 거래", "알스퀘어 오피스"];
  const results: any[] = [];
  const reportsMap = new Map<string, any>();

  for (const keyword of keywords) {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "2");
      url.searchParams.set("sort", "date");
      const res = await fetch(url.toString(), {
        headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();

      for (const item of (json.items || []).slice(0, 1)) {
        const title = cleanNewsText(item.title);
        const desc = cleanNewsText(item.description).slice(0, 300);
        // 실제 기사 URL / 발행일이 없으면 저장하지 않는다 (가짜 URL·수집일=발행일 금지)
        const reportUrl: string = (item.link || item.originallink || "").trim();
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (!title || !safeHttpUrl(reportUrl) || !pubDate || Number.isNaN(pubDate.getTime())) continue;

        // 기관명 추출
        const institution = keyword.includes("CBRE") ? "CBRE Korea"
          : keyword.includes("쿠시먼") ? "Cushman & Wakefield"
          : keyword.includes("부동산플래닛") ? "부동산플래닛"
          : "알스퀘어";

        let summary = desc.slice(0, 150);
        try {
          const aiRes = await callLLM({
            systemPrompt: "부동산 리포트 뉴스를 1줄(50자 이내)로 요약. 제목·내용에 있는 수치만 사용하고, 없는 수치는 만들지 마세요.",
            userPrompt: `${title}: ${desc}`,
            model: "gpt-5.6-luna",
            temperature: 0.2,
            maxTokens: 80,
          }, { allowMock: false });
          summary = cleanNewsText(aiRes.content) || summary;
        } catch { /* */ }

        reportsMap.set(reportUrl, {
          institution,
          title,
          url: reportUrl,
          summary,
          published_date: toKstDate(pubDate),
        });
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      log.warn(`[ingestGlobalReports] "${keyword}" failed:`, err);
    }
  }

  const reportsToUpsert = Array.from(reportsMap.values());
  if (reportsToUpsert.length > 0) {
    const { data, error } = await supabase
      .from("external_reports")
      .upsert(reportsToUpsert, { onConflict: "url" })
      .select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[ingestGlobalReports] Bulk upsert failed:", error);
    }
  }

  return results;
}

// ─── E4: 네이버 카페 감성 트래커 (실제 API) ───────────────────────────────────────
export async function trackSocialSentiment(supabase: SupabaseClient): Promise<any[]> {
  // trackNaverCommunity 가 내부적으로 API 유무 자동 분기 (키 없으면 [] — 더미 적재 없음)
  return trackNaverCommunity(supabase);
}

// ─── E5: 유튜브 CRE 채널 트래커 (실제 API) ────────────────────────────────────────
export async function trackYoutubeTrends(supabase: SupabaseClient): Promise<any[]> {
  return crawlYoutubeTrends(supabase);
}

// ─── E6: 경매·공매 — 네이버뉴스 경매 검색 + AI 구조화 ─────────────────────────────
export async function crawlAuctions(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  if (!NAVER_ID || !NAVER_SECRET) {
    log.warn("[crawlAuctions] Naver API credentials missing");
    return [];
  }

  const keywords = [
    "빌딩 경매 낙찰가율",
    "상업용 부동산 경매 낙찰",
    "꼬마빌딩 경공매",
    "상가 경매 유찰률",
  ];
  const results: any[] = [];
  const auctionsMap = new Map<string, any>();

  for (const keyword of keywords) {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "3");
      url.searchParams.set("sort", "date");
      const res = await fetch(url.toString(), {
        headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();

      for (const item of (json.items || []).slice(0, 2)) {
        const title = cleanNewsText(item.title);
        const desc = cleanNewsText(item.description).slice(0, 500);

        // AI로 경매 구조화 데이터 추출
        try {
          const aiRes = await callLLM({
            systemPrompt: `경매 뉴스에서 다음 JSON을 추출하세요. 원문에 없는 값은 반드시 null (추측·생성 금지):
{"case_number":"사건번호","court":"법원명","address":"소재지","appraised_value":감정가(원),"minimum_bid":최저가(원),"status":"진행상태","auction_date":"YYYY-MM-DD"}`,
            userPrompt: `${title}\n${desc}`,
            model: "gpt-5.6-luna",
            temperature: 0.1,
            maxTokens: 200,
          }, { allowMock: false });
          const jsonMatch = aiRes.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // 입찰일(유효한 날짜)·사건번호·소재지·금액 근거가 모두 있어야 저장 (오늘 날짜 대체·0원 대체 금지)
            const hasDate = typeof parsed.auction_date === "string"
              && /^\d{4}-\d{2}-\d{2}$/.test(parsed.auction_date)
              && parseIssueDate(parsed.auction_date) !== null;
            const hasAmount = Number(parsed.appraised_value) > 0 || Number(parsed.minimum_bid) > 0;
            if (parsed.case_number && parsed.address && hasDate && hasAmount) {
              auctionsMap.set(parsed.case_number, {
                case_number: parsed.case_number,
                court: parsed.court || "미확인",
                address: parsed.address,
                appraised_value: Number(parsed.appraised_value) || 0,
                minimum_bid: Number(parsed.minimum_bid) || 0,
                status: parsed.status || "미확인",
                auction_date: parsed.auction_date,
              });
            }
          }
        } catch { /* AI 파싱 실패 시 스킵 */ }
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      log.warn(`[crawlAuctions] "${keyword}" failed:`, err);
    }
  }

  const auctionsToUpsert = Array.from(auctionsMap.values());
  if (auctionsToUpsert.length > 0) {
    const { data, error } = await supabase
      .from("auction_listings")
      .upsert(auctionsToUpsert, { onConflict: "case_number" })
      .select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[crawlAuctions] Bulk upsert failed:", error);
    }
  }

  return results;
}

// ─── E7: 임대시장 — 네이버뉴스 임대 시세 크롤링 + AI 구조화 ──────────────────────
export async function computeRentalMarketRates(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  if (!NAVER_ID || !NAVER_SECRET) {
    log.warn("[computeRentalMarketRates] Naver API credentials missing");
    return [];
  }

  const regionKeywords = [
    { region: "gbd", keyword: "강남 오피스 공실률 임대료" },
    { region: "seongsu", keyword: "성수 상가 임대 시세 공실" },
    { region: "ybd", keyword: "여의도 오피스 공실률 임대" },
    { region: "gbd", keyword: "서울 오피스 임대시장 동향 2026" },
    { region: "seongsu", keyword: "성동구 근생 임대료 월세" },
  ];
  const results: any[] = [];
  const rentalsToInsert: any[] = [];

  for (const rk of regionKeywords) {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", rk.keyword);
      url.searchParams.set("display", "3");
      url.searchParams.set("sort", "date");
      const res = await fetch(url.toString(), {
        headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const articles = (json.items || []).slice(0, 3);
      const articleTexts = articles.map((a: any) => {
        const t = cleanNewsText(a.title);
        const d = cleanNewsText(a.description);
        return `${t}: ${d}`;
      }).join("\n");

      if (!articleTexts.trim()) continue;

      // AI로 임대 시세 구조화
      try {
        const aiRes = await callLLM({
          systemPrompt: `부동산 뉴스에서 임대시장 데이터를 추출하세요. JSON 배열로 출력:
[{"building_type":"office_prime 또는 retail","deposit_avg":보증금(원/평),"monthly_rent_avg":월세(원/평),"vacancy_rate":공실률(%),"source":"출처"}]
원문에 명시된 수치만 사용하고 없는 값은 null. 정보가 부족하면 빈 배열 []을 출력하세요.`,
          userPrompt: `권역: ${rk.region}\n\n뉴스:\n${articleTexts}`,
          model: "gpt-5.6-luna",
          temperature: 0.1,
          maxTokens: 300,
        }, { allowMock: false });
        const arrMatch = aiRes.content.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const parsed = JSON.parse(arrMatch[0]);
          for (const rental of parsed) {
            if (!rental.building_type) continue;
            const deposit = Number(rental.deposit_avg) || 0;
            const rent = Number(rental.monthly_rent_avg) || 0;
            const vacancy = Number(rental.vacancy_rate) || 0;
            // 수치 근거가 하나도 없는 행은 저장하지 않는다
            if (deposit <= 0 && rent <= 0 && vacancy <= 0) continue;
            rentalsToInsert.push({
              region: rk.region,
              building_type: rental.building_type,
              deposit_avg: deposit,
              monthly_rent_avg: rent,
              vacancy_rate: vacancy,
              source: rental.source || "네이버뉴스",
            });
          }
        }
      } catch { /* AI 파싱 실패 */ }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      log.warn(`[computeRentalMarketRates] ${rk.region} failed:`, err);
    }
  }

  if (rentalsToInsert.length > 0) {
    const { data, error } = await supabase
      .from("rental_market_data")
      .insert(rentalsToInsert)
      .select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[computeRentalMarketRates] Bulk insert failed:", error);
    }
  }

  return results;
}

// ─── 소스별 가용성 플래그 (M2-18, C-01) ──────────────────────────────────────────
// 생성기가 "데이터 없는 소스의 섹션"을 가짜 기본값 대신 생략할 수 있도록 실측 가용성을 반환한다.

export type SourceKey =
  | "news" | "transactions" | "auctions" | "reports"
  | "rental" | "commercial" | "sentiment" | "pulse";

export interface SourceAvailabilityEntry {
  available: boolean;
  count: number;
  /** 최신 데이터 날짜(YYYY-MM-DD 또는 ISO). 날짜 컬럼이 없거나 조회 실패 시 null */
  latest: string | null;
  /** 가용하지 않거나 확인에 실패한 이유 (no_rows | stale | query_error:<code>) */
  reason?: string;
}

export type SourceAvailability = Record<SourceKey, SourceAvailabilityEntry>;

interface SourceSpec {
  key: SourceKey;
  table: string;
  /** 최신성 판정에 쓰는 날짜 컬럼 (없으면 최신성 검사 생략) */
  dateCol?: string;
  /** 이 일수보다 오래되면 가용하지 않음 */
  maxAgeDays?: number;
  /** count 쿼리 필터 (today = KST 오늘) */
  filter?: (q: any, today: string) => any;
}

const SOURCE_SPECS: SourceSpec[] = [
  {
    key: "news", table: "external_news", dateCol: "created_at", maxAgeDays: 14,
    // 더미 뉴스(news.cre-dummy.kr)는 가용 데이터로 세지 않는다 (M2-05)
    filter: (q) => q.not("url", "like", "https://news.cre-dummy.kr/%"),
  },
  { key: "transactions", table: "external_transactions", dateCol: "transaction_date", maxAgeDays: 90 },
  // 경매는 입찰일이 오늘(KST) 이상인 건만 가용 (D2-27)
  { key: "auctions", table: "auction_listings", filter: (q, today) => q.gte("auction_date", today) },
  { key: "reports", table: "external_reports" },
  { key: "rental", table: "rental_trend_data" },
  { key: "commercial", table: "commercial_district" },
  { key: "sentiment", table: "social_sentiment", dateCol: "analysis_date", maxAgeDays: 14 },
  {
    key: "pulse", table: "cre_pulses", dateCol: "created_at", maxAgeDays: 21,
    filter: (q) => q.eq("status", "published"),
  },
];

/** 순수 판정 함수 (테스트 대상): 건수·최신일·허용 경과일 → 가용 여부. */
export function evaluateAvailability(
  count: number,
  latest: string | null,
  maxAgeDays: number | undefined,
  today: string,
): SourceAvailabilityEntry {
  if (count <= 0) return { available: false, count: 0, latest, reason: "no_rows" };
  if (maxAgeDays !== undefined && latest) {
    const cutoff = addDays(today, -maxAgeDays);
    if (latest.slice(0, 10) < cutoff) return { available: false, count, latest, reason: "stale" };
  }
  return { available: true, count, latest };
}

async function probeSource(
  supabase: SupabaseClient,
  spec: SourceSpec,
  today: string,
): Promise<SourceAvailabilityEntry> {
  let q: any = supabase.from(spec.table).select("*", { count: "exact", head: true });
  if (spec.filter) q = spec.filter(q, today);
  const { count, error } = await q;
  if (error) {
    log.warn(`[getSourceAvailability] ${spec.table} count failed:`, error);
    return { available: false, count: 0, latest: null, reason: `query_error:${error.code ?? error.message}` };
  }
  const n = count ?? 0;
  if (n <= 0 || !spec.dateCol) return evaluateAvailability(n, null, spec.maxAgeDays, today);

  let lq: any = supabase.from(spec.table).select(spec.dateCol).order(spec.dateCol, { ascending: false }).limit(1);
  const { data, error: latestErr } = await lq;
  if (latestErr) {
    log.warn(`[getSourceAvailability] ${spec.table} latest failed:`, latestErr);
    // 최신성을 확인할 수 없으면 가용으로 보지 않는다 (fail-closed)
    return { available: false, count: n, latest: null, reason: `query_error:${latestErr.code ?? latestErr.message}` };
  }
  const latest = (data?.[0] as Record<string, unknown> | undefined)?.[spec.dateCol] as string | undefined;
  return evaluateAvailability(n, latest ?? null, spec.maxAgeDays, today);
}

/**
 * 소스별 가용성. 생성기는 `available:false` 소스의 섹션을 생략해야 한다(가짜 기본값 금지).
 * 쿼리 실패는 `reason: 'query_error:*'` 로 드러나며 가용 아님으로 취급한다.
 */
export async function getSourceAvailability(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<SourceAvailability> {
  const today = toKstDate(now);
  const entries = await Promise.all(SOURCE_SPECS.map(async (spec) => [spec.key, await probeSource(supabase, spec, today)] as const));
  return Object.fromEntries(entries) as SourceAvailability;
}
