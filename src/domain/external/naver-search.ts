import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import {
  areArticlesSameEvent,
  isCreRelevantArticle,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import { decodeEntities, stripTags, safeHttpUrl } from "@/lib/magazine/escape";
import { todayKst } from "@/lib/magazine/kst";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('naver-search');


const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";

// 네이버 검색 API: 카페 게시글 검색
const NAVER_CAFE_URL = "https://openapi.naver.com/v1/search/cafearticle.json";
const NAVER_NEWS_URL  = "https://openapi.naver.com/v1/search/news.json";

// 꼬마빌딩 브로커 커뮤니티 핵심 키워드
const COMMUNITY_KEYWORDS = [
  "꼬마빌딩 매매",
  "상업용부동산 공실",
  "성수 상가 임대",
  "강남 빌딩 투자",
  "지식산업센터 공실",
  "빌딩 경매 낙찰",
  "근생 리모델링",
  "사옥 매수",
];

// ─── 공용 텍스트 정제 / 규칙 (market-crawlers 에서도 사용) ─────────────────────────

/**
 * 뉴스 텍스트 정제: 태그(`<b>`, `</b>` 등) 제거 → 엔티티 디코드(`&quot;`, `&amp;`, `&lt;`, `&gt;`, `&#39;` 등, M2-17)
 * → 디코드로 생긴 태그 재제거 → 제어문자 제거 → 공백 정리.
 * 결과는 "텍스트"이므로 HTML에 넣을 때는 반드시 escapeHtml 을 다시 거친다.
 */
export function cleanNewsText(s: string | null | undefined): string {
  if (!s) return "";
  const stripped = stripTags(s);
  const decoded = decodeEntities(stripped)
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

export const sanitizeNaverText = cleanNewsText;

/** 수집 대상 권역 코드 판정 (제목+내용 키워드 기반 규칙). 해당 없으면 ["all"]. */
export function detectRegions(text: string): string[] {
  const regions: string[] = [];
  if (/강남|서초|송파|GBD|테헤란/.test(text)) regions.push("gbd");
  if (/성수|성동|왕십리|뚝섬/.test(text)) regions.push("seongsu");
  if (/여의도|영등포|마포|YBD/.test(text)) regions.push("ybd");
  if (regions.length === 0) regions.push("all");
  return regions;
}

const CRE_DIRECT_RE = /꼬마빌딩|빌딩|상업용|오피스|상가|근생|근린|공실|임대|경매|사옥|지식산업센터|리모델링/;
const RESIDENTIAL_RE = /아파트|전세|청약|분양|주택|빌라/;

/**
 * 기사 단위 중요도(1~10) 규칙 — 고정 점수 대신 "검색 주제 사전점수 + 기사 텍스트 근거"로 산정한다.
 *  - 제목에 CRE 직접 키워드가 있으면 +1, 제목·본문 모두 없으면 -1
 *  - 제목이 주거 키워드뿐(CRE 직접 키워드 없음)이면 -2
 * 이는 추정 휴리스틱이며 LLM 점수가 없을 때의 폴백으로만 쓴다.
 */
export function computeNewsImportance(title: string, description: string, topicPrior: number): number {
  let score = topicPrior;
  const titleHasCre = CRE_DIRECT_RE.test(title);
  if (titleHasCre) score += 1;
  else if (!CRE_DIRECT_RE.test(description)) score -= 1;
  if (!titleHasCre && RESIDENTIAL_RE.test(title)) score -= 2;
  return Math.max(1, Math.min(10, score));
}

/** 뉴스 요약 프롬프트 — 원문에 없는 수치·기관명·사례 생성 금지 (C-01/C-02 공통 규칙). */
export const NEWS_SUMMARY_SYSTEM_PROMPT = `꼬마빌딩 중개 브로커 관점에서 뉴스를 3줄로 요약하세요.
규칙: 제목·내용에 있는 수치·기관명·사실만 사용하세요. 원문에 없는 수치, 기관명, 사례를 만들지 마세요. 수치가 원문에 없으면 수치 없이 핵심 사실만 쓰세요.
1줄: 핵심 팩트
2줄: 브로커 임플리케이션
3줄: 추천 액션
총 150자 이내. 줄바꿈은 | 로 구분.`;

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  cafename?: string;
  postdate?: string;
}

async function fetchNaverCafeItems(keyword: string): Promise<{ items: NaverSearchItem[]; total: number | null }> {
  const url = new URL(NAVER_CAFE_URL);
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "10");
  url.searchParams.set("sort", "date");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Naver API HTTP ${res.status}`);
  const json = await res.json();
  const total = typeof json.total === "number" && Number.isFinite(json.total) ? json.total : null;
  const items = (json.items || []).map((item: any) => ({
    title: cleanNewsText(item.title),
    link: item.link || "",
    description: cleanNewsText(item.description),
    cafename: item.cafename || "",
    postdate: item.postdate || "",
  }));
  return { items, total };
}

// 감성 점수 계산 (0~100). 근거가 없으면 null (가짜 50 금지).
async function scoreSentiment(articles: NaverSearchItem[], keyword: string): Promise<number | null> {
  if (articles.length === 0) return null;

  const sampleTexts = articles.slice(0, 5).map(a => `[${a.cafename}] ${a.title}: ${a.description}`).join("\n");

  try {
    const res = await callLLM({
      systemPrompt: "한국 꼬마빌딩 부동산 커뮤니티 글들의 투자 감성을 분석하세요. 0(극단적 위축)~100(극단적 과열) 점수를 숫자만 출력하세요.",
      userPrompt: `키워드: ${keyword}\n\n글 샘플:\n${sampleTexts}`,
      model: getModel("luna"),
      temperature: 0.1,
      maxTokens: 10,
    }, { allowMock: false });
    const score = parseFloat(res.content.trim());
    if (!isNaN(score)) return Math.max(0, Math.min(100, score));
  } catch (err) {
    log.warn("[Naver] LLM sentiment failed, using keyword heuristic:", err);
  }

  // 휴리스틱 폴백: 제목 키워드 기반 (LLM 불가/파싱 실패 시)
  let bullish = 0, bearish = 0;
  for (const a of articles) {
    if (/급증|상승|돌파|강세|매물없|희소/.test(a.title + a.description)) bullish++;
    if (/하락|위축|공실|유찰|찬바람|경계|폭탄/.test(a.title + a.description)) bearish++;
  }
  const total = bullish + bearish;
  return total > 0 ? Math.round((bullish / total) * 100) : null;
}

// 메인 함수: 네이버 카페 감성 분석
export async function trackNaverCommunity(supabase: SupabaseClient): Promise<any[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    log.warn("[Naver] API credentials missing — social_sentiment skipped (no dummy data)");
    return [];
  }

  const today = todayKst();
  const results: any[] = [];
  const recordsToInsert: any[] = [];

  for (const keyword of COMMUNITY_KEYWORDS.slice(0, 5)) { // 일 25,000건 제한 고려, 5개씩
    try {
      const { items: articles, total } = await fetchNaverCafeItems(keyword);
      const sentimentScore = await scoreSentiment(articles, keyword);
      // 실측 검색 결과 총수(total)만 사용한다. 값이 없거나 감성 근거가 없으면 미적재 (×34 추정 금지).
      if (total === null || sentimentScore === null) {
        log.warn(`[Naver] Keyword "${keyword}" skipped: no measured total or sentiment basis`);
        continue;
      }

      // 대표 카페명 추출 (가장 많이 나온 카페)
      const cafeFreq: Record<string, number> = {};
      for (const a of articles) if (a.cafename) cafeFreq[a.cafename] = (cafeFreq[a.cafename] || 0) + 1;
      const topCafe = Object.entries(cafeFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || "네이버 카페";

      recordsToInsert.push({
        keyword,
        source: topCafe,
        sentiment_score: sentimentScore,
        mention_count: total, // 네이버 검색 API가 반환한 실측 총 검색결과 수
        analysis_date: today,
      });

      // API Rate limit 준수 (초당 10건)
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      log.warn(`[Naver] Keyword "${keyword}" failed:`, err);
    }
  }

  if (recordsToInsert.length > 0) {
    const { data, error } = await supabase.from("social_sentiment").insert(recordsToInsert).select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[Naver] Bulk insert into social_sentiment failed:", error);
    }
  }

  return results;
}

export interface NaverRawNewsCandidate {
  title: string;
  link: string;
  description: string;
  feedSource: string;
  defaultTopic: string;
  defaultChannel: SpecificNewsChannelId;
  topicPrior: number;
}

/**
 * 5대 채널(부동산·경제금리·절세상속·상권트렌드·문화라이프) 고신호 CRE 전용 네이버 뉴스 쿼리
 * - 기존 광역 아파트·주가 노이즈 유발어("부동산 규제 LTV DSR", "서울시 도시계획 재개발") 교체
 */
export const NAVER_CRE_NEWS_KEYWORDS: ReadonlyArray<{
  query: string;
  topic: string;
  channel: SpecificNewsChannelId;
  score: number;
}> = [
  { query: "꼬마빌딩 매매 실거래", topic: "transaction", channel: "real_estate", score: 9 },
  { query: "상업용부동산 오피스 공실률 임대", topic: "rental", channel: "real_estate", score: 9 },
  { query: "서울 역세권 지구단위계획 빌딩 개발", topic: "development", channel: "real_estate", score: 8 },
  { query: "상업용부동산 담보대출 금리 한국은행", topic: "finance", channel: "economy_finance", score: 8 },
  { query: "꼬마빌딩 증여 상속 감정평가 절세", topic: "tax", channel: "tax_wealth", score: 9 },
  { query: "성수 한남 강남 상권 리테일 임차", topic: "commercial_trend", channel: "commercial_trend", score: 8 },
  { query: "건축 디자인 공간 리모델링 미술 전시", topic: "culture", channel: "culture_lifestyle", score: 7 },
];

/**
 * 네이버 뉴스 API에서 5대 채널 고신호 후보 기사를 수집한다.
 * - 아파트/홍보/주식/가십 노이즈(`isCreRelevantArticle`) 및 동일 사건 중복(`areArticlesSameEvent`) 사전 제거
 * - `crawlCreNews()`가 LLM 적합성 배치 심사(`scoreNewsBatch`)에 통합 투입할 수 있도록 순수 후보 배열 반환
 */
export async function fetchNaverCRENewsRaw(perQueryLimit = 4): Promise<NaverRawNewsCandidate[]> {
  const clientId = process.env.NAVER_CLIENT_ID || NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET || NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const collected: NaverRawNewsCandidate[] = [];
  const seenUrls = new Set<string>();

  for (const kw of NAVER_CRE_NEWS_KEYWORDS) {
    try {
      const url = new URL(NAVER_NEWS_URL);
      url.searchParams.set("query", kw.query);
      url.searchParams.set("display", String(Math.max(5, perQueryLimit + 2)));
      url.searchParams.set("sort", "date");

      const res = await fetch(url.toString(), {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const json = await res.json();

      let addedForQuery = 0;
      for (const item of json.items || []) {
        if (addedForQuery >= perQueryLimit) break;
        const title = cleanNewsText(item.title);
        const desc = cleanNewsText(item.description).slice(0, 300);
        const newsUrl: string = (item.link || item.originallink || "").trim();

        if (!safeHttpUrl(newsUrl) || !title || seenUrls.has(newsUrl)) continue;
        if (!isCreRelevantArticle({ title, summary: desc, topic: kw.topic })) continue;
        if (collected.some((prev) => areArticlesSameEvent(prev.title, title))) continue;

        seenUrls.add(newsUrl);
        collected.push({
          title,
          link: newsUrl,
          description: desc,
          feedSource: "네이버뉴스",
          defaultTopic: kw.topic,
          defaultChannel: kw.channel,
          topicPrior: kw.score,
        });
        addedForQuery += 1;
      }

      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      log.warn(`[NaverNews] "${kw.query}" failed:`, err);
    }
  }

  return collected;
}

// 네이버 뉴스 단독 크롤러 (직접 호출 호환 유지 — 노이즈 가드 + 5채널 쿼리 적용)
export async function crawlNaverCRENews(supabase: SupabaseClient): Promise<any[]> {
  const candidates = await fetchNaverCRENewsRaw(3);
  if (candidates.length === 0) return [];

  const results: any[] = [];
  const newsMap = new Map<string, any>();

  for (const item of candidates) {
    // LLM 강화 요약 (3줄) — Mock 응답은 저장하지 않는다(allowMock:false)
    let summary = item.description.slice(0, 150);
    try {
      const aiRes = await callLLM(
        {
          systemPrompt: NEWS_SUMMARY_SYSTEM_PROMPT,
          userPrompt: `${item.title}: ${item.description}`,
          model: getModel("luna"),
          temperature: 0.2,
          maxTokens: 200,
        },
        { allowMock: false },
      );
      const cleaned = cleanNewsText(aiRes.content);
      if (cleaned) summary = cleaned;
    } catch {
      /* LLM 불가 시 원문 발췌 사용 */
    }

    let sentiment = "neutral";
    try {
      const sentRes = await callLLM(
        {
          systemPrompt:
            "상업용 부동산 시장 관점에서 이 뉴스가 호재(bullish), 악재(bearish), 중립(neutral) 중 하나만 답하세요. 단어 하나만 출력.",
          userPrompt: `${item.title}: ${item.description}`,
          model: getModel("luna"),
          temperature: 0.1,
          maxTokens: 10,
        },
        { allowMock: false },
      );
      const word = sentRes.content.trim().toLowerCase();
      if (word.includes("bullish")) sentiment = "bullish";
      else if (word.includes("bearish")) sentiment = "bearish";
    } catch {
      /* 판단 불가 → neutral */
    }

    const regions = detectRegions(`${item.title} ${item.description}`);

    newsMap.set(item.link, {
      url: item.link,
      title: item.title,
      source: "네이버뉴스",
      summary,
      content: item.description,
      sentiment,
      importance_score: computeNewsImportance(item.title, item.description, item.topicPrior),
      regions,
      topic: item.defaultTopic,
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
      log.warn("[NaverNews] Bulk upsert into external_news failed:", error);
    }
  }

  return results;
}
