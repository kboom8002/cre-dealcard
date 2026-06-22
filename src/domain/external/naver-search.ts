import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/ai/llm-client";

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

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  cafename?: string;
  postdate?: string;
}

async function fetchNaverCafeItems(keyword: string): Promise<NaverSearchItem[]> {
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
  return (json.items || []).map((item: any) => ({
    title: item.title?.replace(/<[^>]+>/g, "") || "",
    link: item.link || "",
    description: item.description?.replace(/<[^>]+>/g, "") || "",
    cafename: item.cafename || "",
    postdate: item.postdate || "",
  }));
}

// 감성 점수 계산 (0~100)
async function scoreSentiment(articles: NaverSearchItem[], keyword: string): Promise<number> {
  if (articles.length === 0) return 50;

  const sampleTexts = articles.slice(0, 5).map(a => `[${a.cafename}] ${a.title}: ${a.description}`).join("\n");

  try {
    const res = await callLLM({
      systemPrompt: "한국 꼬마빌딩 부동산 커뮤니티 글들의 투자 감성을 분석하세요. 0(극단적 공포)~100(극단적 탐욕) 점수를 숫자만 출력하세요.",
      userPrompt: `키워드: ${keyword}\n\n글 샘플:\n${sampleTexts}`,
      model: "gpt-5.4",
      temperature: 0.1,
      maxTokens: 10,
    });
    const score = parseFloat(res.content.trim());
    return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
  } catch {
    // 휴리스틱 폴백: 제목 키워드 기반
    let bullish = 0, bearish = 0;
    for (const a of articles) {
      if (/급증|상승|돌파|강세|매물없|희소/.test(a.title + a.description)) bullish++;
      if (/하락|위축|공실|유찰|찬바람|경계|폭탄/.test(a.title + a.description)) bearish++;
    }
    const total = bullish + bearish;
    return total > 0 ? Math.round((bullish / total) * 100) : 50;
  }
}

// 메인 함수: 네이버 카페 감성 분석
export async function trackNaverCommunity(supabase: SupabaseClient): Promise<any[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.warn("[Naver] API credentials missing — using dummy sentiment");
    return insertDummySentiment(supabase);
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];

  for (const keyword of COMMUNITY_KEYWORDS.slice(0, 5)) { // 일 25,000건 제한 고려, 5개씩
    try {
      const articles = await fetchNaverCafeItems(keyword);
      const sentimentScore = await scoreSentiment(articles, keyword);
      const mentionCount = articles.length;

      // 대표 카페명 추출 (가장 많이 나온 카페)
      const cafeFreq: Record<string, number> = {};
      for (const a of articles) if (a.cafename) cafeFreq[a.cafename] = (cafeFreq[a.cafename] || 0) + 1;
      const topCafe = Object.entries(cafeFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || "네이버 카페";

      const record = {
        keyword,
        source: topCafe,
        sentiment_score: sentimentScore,
        mention_count: mentionCount * 34, // API는 10개만 반환, 실제 언급수 추정
        analysis_date: today,
      };

      const { data, error } = await supabase.from("social_sentiment").insert(record).select().single();
      if (!error && data) results.push(data);

      // API Rate limit 준수 (초당 10건)
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.warn(`[Naver] Keyword "${keyword}" failed:`, err);
    }
  }

  if (results.length === 0) return insertDummySentiment(supabase);
  return results;
}

// 네이버 뉴스 검색 (빅카인즈 보완)
export async function crawlNaverCRENews(supabase: SupabaseClient): Promise<any[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return [];

  const newsKeywords = ["꼬마빌딩 거래", "상업용부동산 동향", "빌딩 매매 시세"];
  const results: any[] = [];

  for (const keyword of newsKeywords) {
    try {
      const url = new URL(NAVER_NEWS_URL);
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "5");
      url.searchParams.set("sort", "date");

      const res = await fetch(url.toString(), {
        headers: {
          "X-Naver-Client-Id": NAVER_CLIENT_ID,
          "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const json = await res.json();

      for (const item of (json.items || []).slice(0, 3)) {
        const title = (item.title || "").replace(/<[^>]+>/g, "");
        const desc = (item.description || "").replace(/<[^>]+>/g, "").slice(0, 300);
        const sentiment = /급증|상승|돌파|강세/.test(title) ? "bullish"
          : /하락|위축|공실|찬바람/.test(title) ? "bearish" : "neutral";

        let summary = desc.slice(0, 150);
        try {
          const aiRes = await callLLM({
            systemPrompt: "꼬마빌딩 브로커 관점 1줄(40자 이내) 핵심 요약.",
            userPrompt: `${title}: ${desc}`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 60,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }

        const { data, error } = await supabase.from("external_news").upsert({
          url: item.link || item.originallink || `https://naver-news-${Date.now()}-${Math.random()}`,
          title: `[네이버뉴스] ${title}`,
          source: "네이버뉴스",
          summary,
          content: desc,
          sentiment,
        }, { onConflict: "url" }).select().single();

        if (!error && data) results.push(data);
      }

      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.warn(`[NaverNews] "${keyword}" failed:`, err);
    }
  }
  return results;
}

async function insertDummySentiment(_supabase: SupabaseClient): Promise<any[]> {
  console.warn("[Naver] No real sentiment data available — returning empty");
  return [];
}
