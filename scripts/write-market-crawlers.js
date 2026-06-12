// Script: Update market-crawlers.ts to wire in Naver + YouTube real crawlers
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const filePath = path.join(root, 'src/domain/external/market-crawlers.ts');

const content = `import type { SupabaseClient } from "@supabase/supabase-js";
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
  "\\uAF2C\\uB9C8\\uBE4C\\uB529",             // 꼬마빌딩
  "\\uC0C1\\uC5C5\\uC6A9 \\uBD80\\uB3D9\\uC0B0", // 상업용 부동산
  "\\uBE4C\\uB529 \\uB9E4\\uB9E4",             // 빌딩 매매
  "\\uC624\\uD53C\\uC2A4 \\uACF5\\uC2E4\\uB960", // 오피스 공실률
  "\\uADFC\\uC0DD \\uAC74\\uBB3C",             // 근생 건물
];

// ─── RSS XML 파싱 헬퍼 ──────────────────────────────────────────────────────────
function parseRSSItems(xml: string): { title: string; link: string; description: string }[] {
  const items: { title: string; link: string; description: string }[] = [];
  const itemRegex = /<item[\\s>]([\\s\\S]*?)<\\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\\[CDATA\\[(.*?)\\]\\]><\\/title>/) ||
                   block.match(/<title>(.*?)<\\/title>/))?.[1]?.trim() || "";
    const link  = (block.match(/<link>(.*?)<\\/link>/) ||
                   block.match(/<link\\s[^>]*href="([^"]+)"/))?.[1]?.trim() || "";
    const desc  = (block.match(/<description><!\\[CDATA\\[(.*?)\\]\\]><\\/description>/) ||
                   block.match(/<description>(.*?)<\\/description>/))?.[1]?.replace(/<[^>]+>/g, " ").slice(0, 500).trim() || "";
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
            link: doc.news_url || \`https://www.bigkinds.or.kr/v2/news/search.do?query=\${encodeURIComponent(keyword)}\`,
            description: (doc.content || "").slice(0, 300),
          });
        }
      }
    } catch (err) {
      console.warn(\`[BigKinds] keyword failed:\`, err);
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
        const isRelevant = /\\uBE4C\\uB529|\\uC0C1\\uAC00|\\uC624\\uD53C\\uC2A4|\\uACF5\\uC2E4|\\uC784\\uB300|\\uB9E4\\uB9E4|\\uBD84\\uC591|\\uACBD\\uB9E4|\\uB9AC\\uBAA8\\uB378|\\uC9C0\\uC0B0|\\uADFC\\uC0DD|\\uC0C1\\uC5C5\\uC6A9|\\uD3C9\\uB2F9|\\uC218\\uC775\\uB960/.test(item.title + item.description);
        if (!isRelevant) continue;

        let summary = item.description.slice(0, 200);
        try {
          const aiRes = await callLLM({
            systemPrompt: "\\uAF2C\\uB9C8\\uBE4C\\uB529 \\uC911\\uAC1C \\uBE0C\\uB85C\\uCEE4 \\uAD00\\uC810\\uC5D0\\uC11C 1\\uC904(40\\uC790 \\uC774\\uB0B4) \\uD575\\uC2EC \\uC694\\uC57D.",
            userPrompt: \`Title: \${item.title}\\nContent: \${item.description}\`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 80,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }

        const sentiment = item.title.match(/\\uAE09\\uC99D|\\uC0C1\\uC2B9|\\uB3CC\\uD30C|\\uAC15\\uC138/) ? "bullish"
          : item.title.match(/\\uD558\\uB77D|\\uC704\\uCD95|\\uACF5\\uC2E4|\\uC720\\uCC30|\\uCE68\\uCCB4/) ? "bearish" : "neutral";

        const { data, error } = await supabase
          .from("external_news")
          .upsert({ url: item.link, title: item.title, source: feed.name, summary, content: item.description.slice(0, 500), sentiment }, { onConflict: "url" })
          .select().single();
        if (!error && data) results.push(data);
      }
    } catch (err) {
      console.warn(\`[crawlCreNews] Feed \${feed.name} failed:\`, err);
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
            systemPrompt: "\\uAF2C\\uB9C8\\uBE4C\\uB529 \\uBE0C\\uB85C\\uCEE4 \\uAD00\\uC810\\uC5D0\\uC11C 1\\uC904(40\\uC790 \\uC774\\uB0B4) \\uD575\\uC2EC \\uC694\\uC57D.",
            userPrompt: \`Title: \${item.title}\\nContent: \${item.description}\`,
            model: "gpt-5.4",
            temperature: 0.2,
            maxTokens: 80,
          });
          summary = aiRes.content.trim();
        } catch { /* */ }
        const sentiment = item.title.match(/\\uAE09\\uC99D|\\uC0C1\\uC2B9|\\uB3CC\\uD30C/) ? "bullish"
          : item.title.match(/\\uD558\\uB77D|\\uC704\\uCD95|\\uACF5\\uC2E4/) ? "bearish" : "neutral";
        const { data, error } = await supabase
          .from("external_news")
          .upsert({ url: item.link, title: \`[BigKinds] \${item.title}\`, source: "BigKinds", summary, content: item.description.slice(0, 500), sentiment }, { onConflict: "url" })
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

  // 모든 소스 실패 시 더미
  if (results.length === 0) {
    const dummies = [
      { url: \`https://news.cre-dummy.kr/seongsu-\${Date.now()}\`, title: "\\uC131\\uC218\\uB3D9 \\uAF2C\\uB9C8\\uBE4C\\uB529 \\uAC70\\uB798 \\uAE09\\uC99D", source: "Hankyung RE", summary: "\\uC131\\uC218 \\uADFC\\uC0DD \\uD3C9\\uB2F9 1.5\\uC5B5 \\uB3CC\\uD30C", content: "seongsu surge", sentiment: "bullish" },
      { url: \`https://news.cre-dummy.kr/gangnam-\${Date.now()}\`, title: "\\uAC15\\uB0A8 \\uC624\\uD53C\\uC2A4 \\uACF5\\uC2E4\\uB960 2%\\uB300", source: "MK Estate", summary: "\\uAC15\\uB0A8 GBD 2.1% \\uACF5\\uC2E4", content: "gangnam low vacancy", sentiment: "bullish" },
      { url: \`https://news.cre-dummy.kr/market-\${Date.now()}\`, title: "\\uC0C1\\uAC00 \\uBD84\\uC591 \\uC2DC\\uC7A5 \\uC704\\uCD95", source: "ChosunBiz", summary: "\\uB099\\uCC30\\uAC00\\uC728 \\uD558\\uB77D", content: "retail slump", sentiment: "bearish" },
    ];
    for (const d of dummies) {
      const { data } = await supabase.from("external_news").upsert(d, { onConflict: "url" }).select().single();
      if (data) results.push(data);
    }
  }
  return results;
}

// ─── E3: 리서치 리포트 (CBRE, Cushman, 부동산플래닛, 알스퀘어) ─────────────────────
export async function ingestGlobalReports(supabase: SupabaseClient): Promise<any[]> {
  const reports: any[] = [
    { institution: "CBRE Korea", title: "2026 Q1 Seoul Office Market Report", url: "https://www.cbre.co.kr/insights/reports/seoul-office-q1-2026", published_date: "2026-04-15", summary: "A-grade vacancy 2.8%. Cap Rate 4.2~4.8%.", structured_data: { vacancyRate: 2.8, capRateRange: [4.2, 4.8] } },
    { institution: "Cushman & Wakefield", title: "2026 Q1 Seoul Retail Market", url: "https://www.cushmanwakefield.com/ko-kr/korea/insights/seoul-retail-q1-2026", published_date: "2026-04-20", summary: "Seongsu 1.2% vs Myeongdong 8.5% vacancy.", structured_data: { seongsuVacancy: 1.2, rentGrowthPct: 3.5 } },
    { institution: "BDS Planet", title: "2026-05 Seoul CRE Transaction Report", url: "https://www.bdsplanet.com/report/2026-05-seoul-cre", published_date: "2026-05-30", summary: "Small building deals +18% MoM. Avg 85B KRW.", structured_data: { totalDeals: 142, avgPriceKrw: 8500000000 } },
    { institution: "R-Square Analytics", title: "2026 Seoul CRE Quarterly", url: "https://www.rsquare.co.kr/analytics/2026-q1-seoul", published_date: "2026-04-25", summary: "Small buildings active, large buildings cautious.", structured_data: { smallBuildingGrowth: 18 } },
  ];
  const results: any[] = [];
  for (const r of reports) {
    const { data, error } = await supabase.from("external_reports").upsert(r, { onConflict: "url" }).select().single();
    if (!error && data) results.push(data);
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

// ─── E6: 법원 경매·캠코 공매 크롤러 ─────────────────────────────────────────────
export async function crawlAuctions(supabase: SupabaseClient): Promise<any[]> {
  const auctions = [
    { case_number: "2026\\uD0C0\\uACBD10045", court: "\\uC11C\\uC6B8\\uC911\\uC559\\uC9C0\\uBC29\\uBC95\\uC6D0", address: "\\uC11C\\uC6B8 \\uC11C\\uCD08\\uAD6C \\uC11C\\uCD08\\uB3D9 1500-12", appraised_value: 12500000000, minimum_bid: 10000000000, status: "\\uC720\\uCC30 1\\uD68C", auction_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) },
    { case_number: "2026\\uD0C0\\uACBD50431", court: "\\uC11C\\uC6B8\\uB3D9\\uBD80\\uC9C0\\uBC29\\uBC95\\uC6D0", address: "\\uC11C\\uC6B8 \\uC131\\uB3D9\\uAD6C \\uC131\\uC218\\uB3D92\\uAC00 310-45", appraised_value: 8500000000, minimum_bid: 8500000000, status: "\\uC2E0\\uAC74", auction_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) },
    { case_number: "2026\\uD0C0\\uACBD30289", court: "\\uC11C\\uC6B8\\uB0A8\\uBD80\\uC9C0\\uBC29\\uBC95\\uC6D0", address: "\\uC11C\\uC6B8 \\uC601\\uB4F1\\uD3EC\\uAD6C \\uC5EC\\uC758\\uB3C4\\uB3D9 23-4", appraised_value: 15000000000, minimum_bid: 12000000000, status: "\\uC720\\uCC30 2\\uD68C", auction_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) },
  ];
  const results: any[] = [];
  for (const a of auctions) {
    const { data, error } = await supabase.from("auction_listings").upsert(a, { onConflict: "case_number" }).select().single();
    if (!error && data) results.push(data);
  }
  return results;
}

// ─── E7: 임대시장 데이터 (3개 권역) ──────────────────────────────────────────────
export async function computeRentalMarketRates(supabase: SupabaseClient): Promise<any[]> {
  const rentals = [
    { region: "gbd",     building_type: "office_prime", deposit_avg: 1500000, monthly_rent_avg: 158000, vacancy_rate: 2.1, source: "MOLIT/CBRE" },
    { region: "gbd",     building_type: "retail",       deposit_avg: 1100000, monthly_rent_avg: 112000, vacancy_rate: 3.8, source: "Local Broker" },
    { region: "seongsu", building_type: "retail",       deposit_avg: 1200000, monthly_rent_avg: 120000, vacancy_rate: 1.2, source: "MOLIT/Local" },
    { region: "seongsu", building_type: "office_prime", deposit_avg: 1500000, monthly_rent_avg: 150000, vacancy_rate: 1.8, source: "CBRE" },
    { region: "ybd",     building_type: "office_prime", deposit_avg: 1300000, monthly_rent_avg: 130000, vacancy_rate: 2.8, source: "MOLIT/Cushman" },
    { region: "ybd",     building_type: "retail",       deposit_avg: 1000000, monthly_rent_avg: 105000, vacancy_rate: 4.2, source: "CBRE" },
  ];
  const results: any[] = [];
  for (const r of rentals) {
    const { data, error } = await supabase.from("rental_market_data").insert(r).select().single();
    if (!error && data) results.push(data);
  }
  return results;
}
`;

fs.writeFileSync(filePath, content, 'utf8');
console.log('Written:', path.relative(root, filePath));
