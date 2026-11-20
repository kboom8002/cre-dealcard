import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import {
  CHANNEL_SEARCH_QUERIES,
  MULTI_CHANNEL_RSS_FEEDS,
  OFFICIAL_GOV_GOOGLE_QUERIES,
  OFFICIAL_PUBLIC_RSS_FEEDS,
  areArticlesSameEvent,
  hasStrongCreOrChannelSignal,
  isCreRelevantArticle,
  resolveNewsChannel,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import { decodeEntities, safeHttpUrl } from "@/lib/magazine/escape";
import { todayKst, toKstDate, addDays, parseIssueDate } from "@/lib/magazine/kst";
import {
  trackNaverCommunity,
  fetchNaverCRENewsRaw,
  cleanNewsText,
  detectRegions,
  computeNewsImportance,
  NEWS_SUMMARY_SYSTEM_PROMPT,
} from "./naver-search";
import { crawlYoutubeTrends } from "./youtube-crawler";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('market-crawlers');


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

export interface RssItem { title: string; link: string; description: string; pubDate?: string }

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
    const pubDate = cleanNewsText(unwrapCdata(innerTag(block, "pubDate"))) || undefined;
    if (title && link && safeHttpUrl(link)) {
      items.push({ title, link, description: desc, ...(pubDate ? { pubDate } : {}) });
    }
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

// ─── E2: 다채널 RSS + 정부 공식 RSS + Google News 5채널 + BigKinds + 네이버뉴스 통합 크롤러 ──
interface RawNewsItem {
  title: string;
  link: string;
  description: string;
  feedSource: string;
  defaultTopic?: string;
  defaultChannel?: SpecificNewsChannelId;
  topicPrior?: number;
}

export interface ScoredNews {
  title: string;
  link: string;
  description: string;
  feedSource: string;
  score: number;
  regions: string[];
  topic: string;
  channel: SpecificNewsChannelId;
  sentiment: string;
  summary: string;
}

/** LLM 점수를 얻지 못했을 때의 규칙 기반 폴백 (고정 5점 금지 — 기사 텍스트 근거로 산정). */
function ruleBasedScore(item: RawNewsItem): ScoredNews {
  const topic = item.defaultTopic || "market_trend";
  const channel = resolveNewsChannel({
    channel: item.defaultChannel,
    topic,
    title: item.title,
    summary: item.description,
    source: item.feedSource,
  });
  return {
    title: item.title,
    link: item.link,
    description: item.description,
    feedSource: item.feedSource,
    score: computeNewsImportance(item.title, item.description, item.topicPrior ?? 6),
    regions: detectRegions(`${item.title} ${item.description}`),
    topic,
    channel,
    sentiment: "neutral",
    summary: item.description.slice(0, 150),
  };
}

/**
 * 5대 채널(부동산·경제금리·절세상속·상권트렌드·문화라이프) 균형 선별기 (최대 maxTotal건)
 * - 부동산 기사 대량 유입으로 절세·상권·문화 채널이 0건으로 밀리는 현상을 원천 방지
 */
export function selectBalancedTopNews(
  scored: readonly ScoredNews[],
  maxTotal = 25,
): ScoredNews[] {
  const relevant = scored
    .filter((item) => item.score >= 4 && isCreRelevantArticle({ title: item.title, summary: item.description, topic: item.topic }))
    .sort((a, b) => b.score - a.score);

  const channels: SpecificNewsChannelId[] = [
    "real_estate",
    "economy_finance",
    "tax_wealth",
    "commercial_trend",
    "culture_lifestyle",
  ];
  const minQuota: Record<SpecificNewsChannelId, number> = {
    real_estate: 8,
    economy_finance: 4,
    tax_wealth: 4,
    commercial_trend: 4,
    culture_lifestyle: 3,
  };

  const picked: ScoredNews[] = [];
  const pickedUrls = new Set<string>();
  const tryAdd = (item: ScoredNews): boolean => {
    if (picked.length >= maxTotal) return false;
    if (pickedUrls.has(item.link)) return false;
    if (picked.some((prev) => areArticlesSameEvent(prev.title, item.title))) return false;
    pickedUrls.add(item.link);
    picked.push(item);
    return true;
  };

  // 1단계: 5대 채널별 최소 쿼터 우선 확보
  for (const ch of channels) {
    let added = 0;
    for (const item of relevant) {
      if (added >= minQuota[ch] || picked.length >= maxTotal) break;
      if (item.channel !== ch) continue;
      if (tryAdd(item)) added += 1;
    }
  }

  // 2단계: 잔여 슬롯을 전체 점수 순으로 채움
  for (const item of relevant) {
    if (picked.length >= maxTotal) break;
    tryAdd(item);
  }

  return picked;
}

async function scoreNewsChunk(items: RawNewsItem[]): Promise<ScoredNews[]> {
  if (items.length === 0) return [];

  const newsListText = items
    .map((item, i) => `[${i}] (${item.feedSource}) ${item.title}\n    ${item.description.slice(0, 180)}`)
    .join("\n");

  try {
    const aiRes = await callLLM(
      {
        systemPrompt: `당신은 한국 상업용 부동산(CRE) 꼬마빌딩·건물주·자산가 대상 뉴스레터의 수석 에디터입니다.
아래 뉴스 목록을 분석하여, 각 뉴스의 5대 채널 적합성과 중요도를 엄격히 평가하세요.

■ 채점 기준 (1~10점):
- 8~10점: 직접 CRE(꼬마빌딩·오피스·상가·근생 매매/임대/공실/경매/개발/리츠/CBRE·JLL 등 리서치), 빌딩 증여·상속·감정평가·가족법인 세무, 핵심 상권(성수·한남·강남 등) 리테일·우량임차 트렌드, 국토부·서울시·한국은행·국세청 공식 정책
- 6~7점: 상업용 대출금리·기준금리·채권·거시금융, 건축·공간 리모델링·미술품 전시 등 건물주·자산가 품격 교양
- 4~5점: 간접 관련 건설·경기 지표
- 1~3점 (반드시 탈락): 순수 아파트 청약·국평·재초환·전세·시공사 수주, 책 출간·세미나·강의 홍보 PR, 개별 주식 종목 리포트(목표가/자본비율), 연예·정치·가십

■ 권역 판단: gbd(강남/서초/송파), seongsu(성수/성동/왕십리), ybd(여의도/영등포/마포), 그 외 all
■ 토픽 분류 (반드시 1개): transaction, rental, market_trend, development, policy, auction, finance, economy, tax, commercial_trend, culture
■ 감성 판단: bullish, bearish, neutral

반드시 아래 JSON 배열만 출력 (설명 없이):
[{"idx":0,"score":8,"regions":["gbd"],"topic":"transaction","sentiment":"bullish"}]`,
        userPrompt: newsListText,
        model: getModel("luna"),
        temperature: 0.15,
        maxTokens: 2500,
      },
      { allowMock: false },
    );

    const arrMatch = aiRes.content.match(/\[[\s\S]*\]/);
    if (!arrMatch) return items.map(ruleBasedScore);

    const scored: { idx: number; score: number; regions: string[]; topic: string; sentiment: string }[] =
      JSON.parse(arrMatch[0]);
    const scoredMap = new Map(scored.map((s) => [s.idx, s]));

    return items.map((item, i) => {
      const s = scoredMap.get(i);
      if (!s || typeof s.score !== "number" || !Number.isFinite(s.score)) return ruleBasedScore(item);
      const topic = s.topic || item.defaultTopic || "market_trend";
      const channel = resolveNewsChannel({
        channel: item.defaultChannel,
        topic,
        title: item.title,
        summary: item.description,
        source: item.feedSource,
      });
      return {
        title: item.title,
        link: item.link,
        description: item.description,
        feedSource: item.feedSource,
        score: Math.max(1, Math.min(10, s.score)),
        regions:
          Array.isArray(s.regions) && s.regions.length
            ? s.regions
            : detectRegions(`${item.title} ${item.description}`),
        topic,
        channel,
        sentiment: s.sentiment || "neutral",
        summary: item.description.slice(0, 150),
      };
    });
  } catch (err) {
    log.warn("[scoreNewsBatch] LLM scoring failed, using rule-based scoring:", err);
    return items.map(ruleBasedScore);
  }
}

// LLM 배치: 30건 단위 청크로 분할해 JSON 잘림 없이 전체 후보 채점
async function scoreNewsBatch(items: RawNewsItem[]): Promise<ScoredNews[]> {
  if (items.length === 0) return [];
  const CHUNK_SIZE = 30;
  const out: ScoredNews[] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const scoredChunk = await scoreNewsChunk(chunk);
    out.push(...scoredChunk);
  }
  return out;
}

// LLM 강화 요약: 1줄 40자 → 3줄 브로커 관점 요약 (원문에 없는 수치 생성 금지)
async function enhancedSummarize(title: string, content: string): Promise<string> {
  try {
    const aiRes = await callLLM(
      {
        systemPrompt: NEWS_SUMMARY_SYSTEM_PROMPT,
        userPrompt: `제목: ${title}\n내용: ${content}`,
        model: getModel("luna"),
        temperature: 0.2,
        maxTokens: 1200,
      },
      { allowMock: false },
    );
    return cleanNewsText(aiRes.content) || content.slice(0, 150);
  } catch {
    return content.slice(0, 150);
  }
}

async function fetchGoogleNewsRssQuery(query: string, limit = 5): Promise<RssItem[]> {
  try {
    const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(gUrl, {
      headers: { "User-Agent": "CREDealCard-Bot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, limit);
  } catch {
    return [];
  }
}

export async function crawlCreNews(supabase: SupabaseClient): Promise<any[]> {
  const results: any[] = [];
  const rawItems: RawNewsItem[] = [];
  const seenUrls = new Set<string>();

  const pushCandidate = (cand: RawNewsItem) => {
    if (!cand.title || !cand.link || seenUrls.has(cand.link)) return;
    if (!isCreRelevantArticle({ title: cand.title, summary: cand.description, topic: cand.defaultTopic })) {
      return;
    }
    if (rawItems.some((prev) => areArticlesSameEvent(prev.title, cand.title))) {
      return;
    }
    seenUrls.add(cand.link);
    rawItems.push(cand);
  };

  // Phase 1-A: 실측 검증된 경제지 13종 + 정부·지자체 1차 공식 RSS 2종
  // - 일반 종합 피드는 앞 5건 절단 대신 최대 50건을 전수 스캔해 CRE/5채널 고신호 기사만 추출
  const allRssFeeds = [...OFFICIAL_PUBLIC_RSS_FEEDS, ...MULTI_CHANNEL_RSS_FEEDS];
  await Promise.allSettled(
    allRssFeeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "CREDealCard-Bot/1.0" },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSSItems(xml, 50);
        let pickedForFeed = 0;
        for (const item of items) {
          if (pickedForFeed >= 5) break;
          if (!feed.isOfficialPublic && !hasStrongCreOrChannelSignal({ title: item.title, summary: item.description })) {
            continue;
          }
          const beforeLen = rawItems.length;
          pushCandidate({
            ...item,
            feedSource: feed.name,
            defaultTopic: feed.defaultTopic,
            defaultChannel: feed.channel,
            topicPrior: feed.baseScore,
          });
          if (rawItems.length > beforeLen) pickedForFeed += 1;
        }
      } catch (err) {
        log.warn(`[crawlCreNews] Feed ${feed.name} failed:`, err);
      }
    }),
  );

  // Phase 1-B: Google News 한국어 정밀 RSS (5대 채널 각 2쿼리 + 정부/리서치 공식 3쿼리 = 13쿼리)
  const googleTargets: Array<{
    query: string;
    channel: SpecificNewsChannelId;
    topic: string;
    score: number;
    fallbackSource: string;
  }> = [
    ...OFFICIAL_GOV_GOOGLE_QUERIES.map((q) => ({
      query: q.query,
      channel: q.channel,
      topic: q.topic,
      score: q.score,
      fallbackSource: q.label,
    })),
    ...(Object.keys(CHANNEL_SEARCH_QUERIES) as SpecificNewsChannelId[]).flatMap((ch) =>
      CHANNEL_SEARCH_QUERIES[ch].slice(0, 2).map((q) => ({
        query: q.query,
        channel: ch,
        topic: q.topic,
        score: q.score,
        fallbackSource: "구글뉴스",
      })),
    ),
  ];

  await Promise.allSettled(
    googleTargets.map(async (target) => {
      const items = await fetchGoogleNewsRssQuery(target.query, 4);
      for (const item of items) {
        const parts = item.title.split(/\s+-\s+/);
        const press = parts.length > 1 ? parts.pop()!.trim() : target.fallbackSource;
        const cleanTitle = parts.join(" - ").trim() || item.title;
        pushCandidate({
          title: cleanTitle,
          link: item.link,
          description: item.description || cleanTitle,
          feedSource: press,
          defaultTopic: target.topic,
          defaultChannel: target.channel,
          topicPrior: target.score,
        });
      }
    }),
  );

  // Phase 2: BigKinds API (키 보유 시)
  if (BIGKINDS_ACCESS_KEY) {
    try {
      const bkNews = await fetchBigKindsNews();
      for (const item of bkNews) {
        pushCandidate({ ...item, feedSource: "BigKinds", topicPrior: 8 });
      }
    } catch (err) {
      log.warn("[crawlCreNews] BigKinds failed:", err);
    }
  }

  // Phase 3: 네이버 뉴스 (5대 채널 정밀 쿼리 — 이제 LLM 배치 심사 scoreNewsBatch 에 통합 투입)
  try {
    const naverCandidates = await fetchNaverCRENewsRaw(3);
    for (const item of naverCandidates) {
      pushCandidate(item);
    }
  } catch (err) {
    log.warn("[crawlCreNews] Naver news failed:", err);
  }

  // ── LLM 배치 적합성 판단 (전 소스 통합 게이트) ───────────────────────────────
  const scoredItems = await scoreNewsBatch(rawItems);

  // ── 5대 채널 균형 상위 25건 선별 + 동일 사건 중복 배제 ───────────────────────
  const topItems = selectBalancedTopNews(scoredItems, 25);

  // ── 상위 뉴스 강화 요약(유계 동시성 5) + DB 저장 ───────────────────────────
  const newsMap = new Map<string, any>();
  const SUMMARIZE_CONCURRENCY = 5;
  for (let i = 0; i < topItems.length; i += SUMMARIZE_CONCURRENCY) {
    const batch = topItems.slice(i, i + SUMMARIZE_CONCURRENCY);
    const enrichedBatch = await Promise.all(
      batch.map(async (item) => {
        if (!item.link) return null;
        const summary =
          item.score >= 7
            ? await enhancedSummarize(item.title, item.description)
            : item.summary;
        return {
          url: item.link,
          title: item.feedSource === "BigKinds" ? `[BigKinds] ${item.title}` : item.title,
          source: item.feedSource,
          summary,
          content: item.description.slice(0, 500),
          sentiment: item.sentiment,
          importance_score: item.score,
          regions: item.regions,
          topic: item.topic,
        };
      }),
    );
    for (const row of enrichedBatch) {
      if (row) newsMap.set(row.url, row);
    }
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

export const CRE_RESEARCH_REPORT_RE =
  /오피스|빌딩|상업용|리포트|보고서|공실률|거래량|거래액|임대료|상권|물류|리테일|매매|투자\s*시장|수익률|캡레이트|Cap\s*Rate/i;

const RESEARCH_REPORT_TARGETS: ReadonlyArray<{ institution: string; query: string }> = [
  { institution: "CBRE Korea", query: "CBRE 오피스 리포트" },
  { institution: "Cushman & Wakefield", query: "쿠시먼 상업용 부동산 리포트" },
  { institution: "JLL Korea", query: "JLL 코리아 서울 오피스 시장" },
  { institution: "Savills Korea", query: "세빌스 코리아 오피스 리포트" },
  { institution: "부동산플래닛", query: "부동산플래닛 상업업무용 빌딩 거래" },
  { institution: "알스퀘어", query: "알스퀘어 서울 오피스 공실률" },
];

// ─── E3: 리서치 리포트 — 6대 글로벌·국내 CRE 리서치 (네이버 API + Google News RSS 병행 + 42P10 안전 적재) ──
export async function ingestGlobalReports(supabase: SupabaseClient): Promise<any[]> {
  const NAVER_ID = process.env.NAVER_CLIENT_ID || "";
  const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
  const results: any[] = [];
  const reportsMap = new Map<
    string,
    { institution: string; title: string; url: string; summary: string; published_date: string }
  >();

  const considerCandidate = async (params: {
    institution: string;
    title: string;
    desc: string;
    reportUrl: string;
    rawPubDate?: string;
  }) => {
    const title = cleanNewsText(params.title);
    const desc = cleanNewsText(params.desc).slice(0, 300);
    const reportUrl = params.reportUrl.trim();
    const pubDate = params.rawPubDate ? new Date(params.rawPubDate) : null;
    if (!title || !safeHttpUrl(reportUrl) || !pubDate || Number.isNaN(pubDate.getTime())) return;
    if (reportsMap.has(reportUrl)) return;
    if (!isCreRelevantArticle({ title, summary: desc })) return;
    if (!CRE_RESEARCH_REPORT_RE.test(`${title} ${desc}`)) return;
    for (const existing of reportsMap.values()) {
      if (areArticlesSameEvent(existing.title, title)) return;
    }

    let summary = desc.slice(0, 150) || title;
    try {
      const aiRes = await callLLM(
        {
          systemPrompt:
            "부동산 리포트 뉴스를 1줄(50자 이내)로 요약. 제목·내용에 있는 수치만 사용하고, 없는 수치는 만들지 마세요.",
          userPrompt: `${title}: ${desc}`,
          model: getModel("luna"),
          temperature: 0.2,
          maxTokens: 80,
        },
        { allowMock: false },
      );
      summary = cleanNewsText(aiRes.content) || summary;
    } catch {
      /* 원문 발췌 사용 */
    }

    reportsMap.set(reportUrl, {
      institution: params.institution,
      title,
      url: reportUrl,
      summary,
      published_date: toKstDate(pubDate),
    });
  };

  for (const target of RESEARCH_REPORT_TARGETS) {
    let foundForInstitution = 0;

    // 1) 네이버 뉴스 API 우선 조회 (키 보유 시)
    if (NAVER_ID && NAVER_SECRET) {
      try {
        const url = new URL("https://openapi.naver.com/v1/search/news.json");
        url.searchParams.set("query", target.query);
        url.searchParams.set("display", "4");
        url.searchParams.set("sort", "date");
        const res = await fetch(url.toString(), {
          headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json = await res.json();
          for (const item of json.items || []) {
            if (foundForInstitution >= 2) break;
            const before = reportsMap.size;
            await considerCandidate({
              institution: target.institution,
              title: String(item.title || ""),
              desc: String(item.description || ""),
              reportUrl: String(item.link || item.originallink || ""),
              rawPubDate: item.pubDate,
            });
            if (reportsMap.size > before) foundForInstitution += 1;
          }
        }
        await new Promise((r) => setTimeout(r, 120));
      } catch (err) {
        log.warn(`[ingestGlobalReports] Naver "${target.query}" failed:`, err);
      }
    }

    // 2) Google News KR RSS 보충 (네이버 키 없거나 관련 리포트 부족 시)
    if (foundForInstitution < 2) {
      const gItems = await fetchGoogleNewsRssQuery(target.query, 4);
      for (const item of gItems) {
        if (foundForInstitution >= 2) break;
        const parts = item.title.split(/\s+-\s+/);
        if (parts.length > 1) parts.pop();
        const cleanTitle = parts.join(" - ").trim() || item.title;
        const before = reportsMap.size;
        await considerCandidate({
          institution: target.institution,
          title: cleanTitle,
          desc: item.description || cleanTitle,
          reportUrl: item.link,
          rawPubDate: item.pubDate,
        });
        if (reportsMap.size > before) foundForInstitution += 1;
      }
    }
  }

  const candidateReports = Array.from(reportsMap.values());
  if (candidateReports.length === 0) return results;

  // external_reports.url 은 초기 마이그레이션(00034)에 UNIQUE 제약이 없었으므로
  // 기존 URL 조회로 앱 레벨 중복 제거 후 insert 수행 (42P10 ON CONFLICT 실패 영구 해결)
  const candidateUrls = candidateReports.map((r) => r.url);
  const existingUrlSet = new Set<string>();
  try {
    const { data: existingRows } = await supabase
      .from("external_reports")
      .select("url")
      .in("url", candidateUrls);
    for (const row of existingRows || []) {
      if (typeof (row as { url?: unknown }).url === "string") {
        existingUrlSet.add((row as { url: string }).url);
      }
    }
  } catch (lookupErr) {
    log.warn("[ingestGlobalReports] Existing URL lookup failed, proceeding with insert:", lookupErr);
  }

  const newReports = candidateReports.filter((r) => !existingUrlSet.has(r.url));
  if (newReports.length > 0) {
    const { data, error } = await supabase
      .from("external_reports")
      .insert(newReports)
      .select();
    if (!error && data) {
      results.push(...data);
    } else if (error) {
      log.warn("[ingestGlobalReports] Bulk insert failed:", error);
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
            model: getModel("luna"),
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
          model: getModel("luna"),
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
