import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/ai/llm-client";
import { trackNaverCommunity, crawlNaverCRENews } from "./naver-search";
import { crawlYoutubeTrends } from "./youtube-crawler";

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
function parseRSSItems(xml: string): { title: string; link: string; description: string }[] {
  const items: { title: string; link: string; description: string }[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || "";
    const link  = (block.match(/<link>(.*?)<\/link>/) ||
                   block.match(/<link\s[^>]*href="([^"]+)"/))?.[1]?.trim() || "";
    const desc  = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                   block.match(/<description>(.*?)<\/description>/))?.[1]?.replace(/<[^>]+>/g, " ").slice(0, 500).trim() || "";
    if (title && link) items.push({ title, link, description: desc });
  }
  return items.slice(0, 5);
}

// ─── BigKinds API 호출 ─────────────────────────────────────────────────────────
async function fetchBigKindsNews(): Promise<{ title: string; link: string; description: string }[]> {
  if (!BIGKINDS_ACCESS_KEY) return [];
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];
  const startDate = new Date(today.getTime() - 3 * 86400000).toISOString().split("T")[0];
  const results: { title: string; link: string; description: string }[] = [];

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
          results.push({
            title: doc.title || "",
            link: doc.news_url || `https://www.bigkinds.or.kr/v2/news/search.do?query=${encodeURIComponent(keyword)}`,
            description: (doc.content || "").slice(0, 300),
          });
        }
      }
    } catch (err) {
      console.warn(`[BigKinds] keyword failed:`, err);
    }
  }
  return results;
}

// ─── E2: RSS + BigKinds + 네이버뉴스 통합 크롤러 ─────────────────────────────────
export async function crawlCreNews(supabase: SupabaseClient): Promise<any[]> {
  const results: any[] = [];

  // Phase 1: RSS 피드 (6개 언론사)
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
        const isRelevant = /\uBE4C\uB529|\uC0C1\uAC00|\uC624\uD53C\uC2A4|\uACF5\uC2E4|\uC784\uB300|\uB9E4\uB9E4|\uBD84\uC591|\uACBD\uB9E4|\uB9AC\uBAA8\uB378|\uC9C0\uC0B0|\uADFC\uC0DD|\uC0C1\uC5C5\uC6A9|\uD3C9\uB2F9|\uC218\uC775\uB960/.test(item.title + item.description);
        if (!isRelevant) continue;

        let summary = item.description.slice(0, 200);
        try {
          const aiRes = await callLLM({
            systemPrompt: "\uAF2C\uB9C8\uBE4C\uB529 \uC911\uAC1C \uBE0C\uB85C\uCEE4 \uAD00\uC810\uC5D0\uC11C 1\uC904(40\uC790 \uC774\uB0B4) \uD575\uC2EC \uC694\uC57D.",
            userPrompt: `Title: ${item.title}\nContent: ${item.description}`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 80,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }

        const sentiment = item.title.match(/\uAE09\uC99D|\uC0C1\uC2B9|\uB3CC\uD30C|\uAC15\uC138/) ? "bullish"
          : item.title.match(/\uD558\uB77D|\uC704\uCD95|\uACF5\uC2E4|\uC720\uCC30|\uCE68\uCCB4/) ? "bearish" : "neutral";

        const { data, error } = await supabase
          .from("external_news")
          .upsert({ url: item.link, title: item.title, source: feed.name, summary, content: item.description.slice(0, 500), sentiment }, { onConflict: "url" })
          .select().single();
        if (!error && data) results.push(data);
      }
    } catch (err) {
      console.warn(`[crawlCreNews] Feed ${feed.name} failed:`, err);
    }
  }

  // Phase 2: BigKinds API
  if (BIGKINDS_ACCESS_KEY) {
    try {
      const bkNews = await fetchBigKindsNews();
      for (const item of bkNews) {
        let summary = item.description.slice(0, 200);
        try {
          const aiRes = await callLLM({
            systemPrompt: "\uAF2C\uB9C8\uBE4C\uB529 \uBE0C\uB85C\uCEE4 \uAD00\uC810\uC5D0\uC11C 1\uC904(40\uC790 \uC774\uB0B4) \uD575\uC2EC \uC694\uC57D.",
            userPrompt: `Title: ${item.title}\nContent: ${item.description}`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 80,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }
        const sentiment = item.title.match(/\uAE09\uC99D|\uC0C1\uC2B9|\uB3CC\uD30C/) ? "bullish"
          : item.title.match(/\uD558\uB77D|\uC704\uCD95|\uACF5\uC2E4/) ? "bearish" : "neutral";
        const { data, error } = await supabase
          .from("external_news")
          .upsert({ url: item.link, title: `[BigKinds] ${item.title}`, source: "BigKinds", summary, content: item.description.slice(0, 500), sentiment }, { onConflict: "url" })
          .select().single();
        if (!error && data) results.push(data);
      }
    } catch (err) {
      console.warn("[crawlCreNews] BigKinds failed:", err);
    }
  }

  // Phase 3: 네이버뉴스 (네이버 API 키 있을 때)
  try {
    const naverNews = await crawlNaverCRENews(supabase);
    results.push(...naverNews);
  } catch (err) {
    console.warn("[crawlCreNews] Naver news failed:", err);
  }

  // 모든 소스 실패 시 빈 배열 반환 (더미 데이터 없음)
  if (results.length === 0) {
    console.warn("[crawlCreNews] All news sources returned empty — no dummy fallback");
  }
  return results;
}

// ─── E3: 리서치 리포트 — 네이버뉴스 "부동산 리포트" 실제 검색 ─────────────────────
export async function ingestGlobalReports(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  if (!NAVER_ID || !NAVER_SECRET) {
    console.warn("[ingestGlobalReports] Naver API credentials missing");
    return [];
  }

  const keywords = ["CBRE 오피스 리포트", "쿠시먼 부동산", "부동산플래닛 거래", "알스퀘어 오피스"];
  const results: any[] = [];

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
        const title = (item.title || "").replace(/<[^>]+>/g, "");
        const desc = (item.description || "").replace(/<[^>]+>/g, "").slice(0, 300);
        // 기관명 추출
        const institution = keyword.includes("CBRE") ? "CBRE Korea"
          : keyword.includes("쿠시먼") ? "Cushman & Wakefield"
          : keyword.includes("부동산플래닛") ? "부동산플래닛"
          : "알스퀘어";

        let summary = desc.slice(0, 150);
        try {
          const aiRes = await callLLM({
            systemPrompt: "부동산 리포트 뉴스를 1줄(50자 이내)로 핵심 수치 중심 요약.",
            userPrompt: `${title}: ${desc}`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 80,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }

        const { data, error } = await supabase.from("external_reports").upsert({
          institution,
          title,
          url: item.link || item.originallink || `https://naver-report-${Date.now()}`,
          summary,
          published_date: new Date().toISOString().split("T")[0],
        }, { onConflict: "url" }).select().single();
        if (!error && data) results.push(data);
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.warn(`[ingestGlobalReports] "${keyword}" failed:`, err);
    }
  }
  return results;
}

// ─── E4: 네이버 카페 감성 트래커 (실제 API) ───────────────────────────────────────
export async function trackSocialSentiment(supabase: SupabaseClient): Promise<any[]> {
  // trackNaverCommunity 가 내부적으로 API 유무 자동 분기
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
    console.warn("[crawlAuctions] Naver API credentials missing");
    return [];
  }

  const keywords = [
    "빌딩 경매 낙찰가율",
    "상업용 부동산 경매 낙찰",
    "꼬마빌딩 경공매",
    "상가 경매 유찰률",
  ];
  const results: any[] = [];

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
        const title = (item.title || "").replace(/<[^>]+>/g, "");
        const desc = (item.description || "").replace(/<[^>]+>/g, "").slice(0, 500);

        // AI로 경매 구조화 데이터 추출
        try {
          const aiRes = await callLLM({
            systemPrompt: `경매 뉴스에서 다음 JSON을 추출하세요. 정보가 없으면 null:
{"case_number":"사건번호","court":"법원명","address":"소재지","appraised_value":감정가(원),"minimum_bid":최저가(원),"status":"진행상태","auction_date":"YYYY-MM-DD"}`,
            userPrompt: `${title}\n${desc}`,
            model: "gpt-5.4",
            temperature: 0.1,
            maxTokens: 200,
          });
          const jsonMatch = aiRes.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.case_number && parsed.address) {
              const { data, error } = await supabase.from("auction_listings").upsert({
                case_number: parsed.case_number,
                court: parsed.court || "미확인",
                address: parsed.address,
                appraised_value: parsed.appraised_value || 0,
                minimum_bid: parsed.minimum_bid || 0,
                status: parsed.status || "미확인",
                auction_date: parsed.auction_date || new Date().toISOString().slice(0, 10),
              }, { onConflict: "case_number" }).select().single();
              if (!error && data) results.push(data);
            }
          }
        } catch { /* AI 파싱 실패 시 스킵 */ }
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.warn(`[crawlAuctions] "${keyword}" failed:`, err);
    }
  }
  return results;
}

// ─── E7: 임대시장 — 네이버뉴스 임대 시세 크롤링 + AI 구조화 ──────────────────────
export async function computeRentalMarketRates(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  if (!NAVER_ID || !NAVER_SECRET) {
    console.warn("[computeRentalMarketRates] Naver API credentials missing");
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
        const t = (a.title || "").replace(/<[^>]+>/g, "");
        const d = (a.description || "").replace(/<[^>]+>/g, "");
        return `${t}: ${d}`;
      }).join("\n");

      if (!articleTexts.trim()) continue;

      // AI로 임대 시세 구조화
      try {
        const aiRes = await callLLM({
          systemPrompt: `부동산 뉴스에서 임대시장 데이터를 추출하세요. JSON 배열로 출력:
[{"building_type":"office_prime 또는 retail","deposit_avg":보증금(원/평),"monthly_rent_avg":월세(원/평),"vacancy_rate":공실률(%),"source":"출처"}]
정보가 부족하면 빈 배열 []을 출력하세요.`,
          userPrompt: `권역: ${rk.region}\n\n뉴스:\n${articleTexts}`,
          model: "gpt-5.4",
          temperature: 0.1,
          maxTokens: 300,
        });
        const arrMatch = aiRes.content.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const parsed = JSON.parse(arrMatch[0]);
          for (const rental of parsed) {
            if (!rental.building_type) continue;
            const { data, error } = await supabase.from("rental_market_data").insert({
              region: rk.region,
              building_type: rental.building_type,
              deposit_avg: rental.deposit_avg || 0,
              monthly_rent_avg: rental.monthly_rent_avg || 0,
              vacancy_rate: rental.vacancy_rate || 0,
              source: rental.source || "네이버뉴스",
            }).select().single();
            if (!error && data) results.push(data);
          }
        }
      } catch { /* AI 파싱 실패 */ }
      await new Promise(r => setTimeout(r, 120));
    } catch (err) {
      console.warn(`[computeRentalMarketRates] ${rk.region} failed:`, err);
    }
  }
  return results;
}
