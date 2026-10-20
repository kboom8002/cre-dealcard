import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, jsonError } from "@/lib/magazine/authz";
import { decodeEntities, safeHttpUrl } from "@/lib/magazine/escape";
import { cleanNewsText, computeNewsImportance, detectRegions } from "@/domain/external/naver-search";
import { parseRSSItems } from "@/domain/external/market-crawlers";
import {
  CHANNEL_SEARCH_QUERIES,
  CURATED_CHANNEL_POOL,
  MULTI_CHANNEL_RSS_FEEDS,
  NEWS_CHANNELS,
  enrichNewsPoolWithChannels,
  resolveNewsChannel,
  type CuratedChannelNewsItem,
  type NewsChannelId,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";

export const dynamic = "force-dynamic";

const CHANNEL_DEFAULT_TOPIC: Record<SpecificNewsChannelId, string> = {
  real_estate: "market_trend",
  economy_finance: "economy",
  tax_wealth: "tax",
  culture_lifestyle: "culture",
  commercial_trend: "commercial_trend",
};

function isSpecificChannel(v: string | null | undefined): v is SpecificNewsChannelId {
  return (
    v === "real_estate" ||
    v === "economy_finance" ||
    v === "tax_wealth" ||
    v === "culture_lifestyle" ||
    v === "commercial_trend"
  );
}

/**
 * 실시간 RSS + Google News Korea RSS + 네이버 뉴스 API(키 보유 시)에서
 * 선택된 채널 또는 키워드의 최신 뉴스를 수집한다.
 */
async function fetchLiveChannelNews(opts: {
  channel: NewsChannelId;
  query?: string;
}): Promise<CuratedChannelNewsItem[]> {
  const collected: CuratedChannelNewsItem[] = [];
  const seenUrls = new Set<string>();
  const targetChannel: SpecificNewsChannelId | null = isSpecificChannel(opts.channel)
    ? opts.channel
    : null;
  const trimmedQuery = (opts.query ?? "").trim();

  // 1. 키워드 검색이 있거나 특정 채널 새로고침 시 Google News RSS (무인증 공개 RSS) + Naver API 병행
  const searchTargets: { query: string; channel: SpecificNewsChannelId; topic: string; score: number }[] = [];
  if (trimmedQuery) {
    const inferredChannel =
      targetChannel ??
      resolveNewsChannel({ title: trimmedQuery, summary: trimmedQuery });
    searchTargets.push({
      query: trimmedQuery,
      channel: inferredChannel,
      topic: CHANNEL_DEFAULT_TOPIC[inferredChannel],
      score: 9,
    });
  } else if (targetChannel) {
    for (const q of CHANNEL_SEARCH_QUERIES[targetChannel].slice(0, 2)) {
      searchTargets.push({ ...q, channel: targetChannel });
    }
  } else {
    // 전체 채널 새로고침: 5대 채널 대표 키워드 각 1개씩
    (Object.keys(CHANNEL_SEARCH_QUERIES) as SpecificNewsChannelId[]).forEach((ch) => {
      const first = CHANNEL_SEARCH_QUERIES[ch][0];
      if (first) searchTargets.push({ ...first, channel: ch });
    });
  }

  const naverId = process.env.NAVER_CLIENT_ID || "";
  const naverSecret = process.env.NAVER_CLIENT_SECRET || "";

  await Promise.allSettled(
    searchTargets.map(async (target) => {
      // 1-A. 네이버 뉴스 검색 API (키가 설정된 경우)
      if (naverId && naverSecret) {
        try {
          const url = new URL("https://openapi.naver.com/v1/search/news.json");
          url.searchParams.set("query", target.query);
          url.searchParams.set("display", "4");
          url.searchParams.set("sort", "date");
          const res = await fetch(url.toString(), {
            headers: {
              "X-Naver-Client-Id": naverId,
              "X-Naver-Client-Secret": naverSecret,
            },
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const json = await res.json();
            for (const item of (json.items || []).slice(0, 4)) {
              const title = cleanNewsText(item.title);
              const desc = cleanNewsText(item.description).slice(0, 220);
              const link = String(item.link || item.originallink || "").trim();
              if (!title || !safeHttpUrl(link) || seenUrls.has(link)) continue;
              seenUrls.add(link);
              const ch = resolveNewsChannel({
                channel: target.channel,
                topic: target.topic,
                title,
                summary: desc,
              });
              collected.push({
                id: `live-${Buffer.from(link).toString("base64url").slice(0, 20)}`,
                title,
                summary: desc || `${title} 관련 최신 시장 브리핑입니다.`,
                source: "네이버뉴스",
                url: link,
                sentiment: "neutral",
                importance_score: computeNewsImportance(title, desc, target.score),
                topic: target.topic,
                channel: ch,
              });
            }
          }
        } catch {
          // 폴백으로 진행
        }
      }

      // 1-B. Google News 한국어 RSS 검색 (키 불필요)
      try {
        const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(target.query)}&hl=ko&gl=KR&ceid=KR:ko`;
        const res = await fetch(gUrl, {
          headers: { "User-Agent": "CREDealCard-Bot/1.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const xml = await res.text();
          const items = parseRSSItems(xml, 4);
          for (const item of items) {
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);
            // Google News 제목 끝의 " - 언론사명" 분리
            const parts = item.title.split(/\s+-\s+/);
            const press = parts.length > 1 ? parts.pop()!.trim() : "뉴스브리핑";
            const cleanTitle = parts.join(" - ").trim() || item.title;
            const desc = item.description && item.description !== item.title
              ? item.description.slice(0, 220)
              : `핵심 팩트: ${cleanTitle} (${press}) | 브로커 임플리케이션: 매수자·건물주 고객과의 상담 시 최신 ${target.query} 동향으로 공유하기 좋습니다.`;
            const ch = resolveNewsChannel({
              channel: target.channel,
              topic: target.topic,
              title: cleanTitle,
              summary: desc,
              source: press,
            });
            collected.push({
              id: `rss-${Buffer.from(item.link).toString("base64url").slice(0, 20)}`,
              title: cleanTitle,
              summary: desc,
              source: press,
              url: item.link,
              sentiment: "neutral",
              importance_score: target.score,
              topic: target.topic,
              channel: ch,
            });
          }
        }
      } catch {
        // 네트워크 제한 환경에서는 엄선 풀로 폴백
      }
    }),
  );

  // 2. 언론사 섹션별 직접 RSS 피드 (검색어가 없을 때)
  if (!trimmedQuery) {
    const feeds = targetChannel
      ? MULTI_CHANNEL_RSS_FEEDS.filter((f) => f.channel === targetChannel)
      : MULTI_CHANNEL_RSS_FEEDS.slice(0, 5);

    await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            headers: { "User-Agent": "CREDealCard-Bot/1.0" },
            signal: AbortSignal.timeout(3500),
          });
          if (!res.ok) return;
          const xml = await res.text();
          const items = parseRSSItems(xml, 3);
          for (const item of items) {
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);
            const ch = resolveNewsChannel({
              channel: feed.channel,
              topic: feed.defaultTopic,
              title: item.title,
              summary: item.description,
              source: feed.name,
            });
            collected.push({
              id: `feed-${Buffer.from(item.link).toString("base64url").slice(0, 20)}`,
              title: item.title,
              summary:
                item.description ||
                `핵심 팩트: ${item.title} | 브로커 임플리케이션: ${feed.name} 최신 주요 보도입니다.`,
              source: feed.name,
              url: item.link,
              sentiment: "neutral",
              importance_score: feed.baseScore,
              topic: feed.defaultTopic,
              channel: ch,
            });
          }
        } catch {
          // 개별 RSS 실패 무시
        }
      }),
    );
  }

  return collected;
}

export async function GET(req: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const { searchParams } = new URL(req.url);
    const channelParam = (searchParams.get("channel") ?? "all") as NewsChannelId;
    const query = (searchParams.get("q") ?? "").trim();
    const live = searchParams.get("live") === "1" || query.length > 0;

    const supabase = createServiceClient();
    const { data: dbRows } = await supabase
      .from("external_news")
      .select("id, title, summary, source, url, sentiment, importance_score, topic, created_at")
      .order("importance_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);

    const dbNews = ((dbRows ?? []) as Record<string, unknown>[]).map((n) => ({
      id: String(n.id ?? n.title ?? ""),
      title: cleanNewsText(String(n.title ?? "")),
      summary: typeof n.summary === "string" ? decodeEntities(n.summary) : "",
      source: typeof n.source === "string" ? cleanNewsText(n.source) : "뉴스",
      url: typeof n.url === "string" && safeHttpUrl(n.url) ? n.url : undefined,
      sentiment:
        n.sentiment === "bullish" || n.sentiment === "bearish" ? n.sentiment : ("neutral" as const),
      importance_score: typeof n.importance_score === "number" ? n.importance_score : 7,
      topic: typeof n.topic === "string" ? n.topic : "market_trend",
      created_at: typeof n.created_at === "string" ? n.created_at : undefined,
    }));

    const liveItems = live ? await fetchLiveChannelNews({ channel: channelParam, query }) : [];

    // 실시간 수집 기사가 있으면 external_news 에 비차단 캐시 적재 시도
    if (liveItems.length > 0) {
      const upsertRows = liveItems
        .filter((item) => item.url && safeHttpUrl(item.url))
        .slice(0, 12)
        .map((item) => ({
          url: item.url!,
          title: item.title,
          source: item.source,
          summary: item.summary,
          content: item.summary,
          sentiment: item.sentiment,
          importance_score: item.importance_score,
          regions: detectRegions(`${item.title} ${item.summary}`),
          topic: item.topic,
        }));
      if (upsertRows.length > 0) {
        await supabase.from("external_news").upsert(upsertRows, { onConflict: "url" });
      }
    }

    const merged = enrichNewsPoolWithChannels([...liveItems, ...dbNews], true);

    const filtered = merged.filter((item) => {
      if (channelParam !== "all" && item.channel !== channelParam) return false;
      if (query) {
        const qLower = query.toLowerCase();
        const hay = `${item.title} ${item.summary ?? ""} ${item.source ?? ""}`.toLowerCase();
        return hay.includes(qLower);
      }
      return true;
    });

    return NextResponse.json({
      ok: true,
      channels: NEWS_CHANNELS,
      items: filtered,
      totalPoolCount: merged.length,
      liveFetchedCount: liveItems.length,
    });
  } catch (err) {
    console.warn("[api/broker/magazine/news-channels] GET fallback:", err);
    return NextResponse.json({
      ok: true,
      channels: NEWS_CHANNELS,
      items: [...CURATED_CHANNEL_POOL],
      totalPoolCount: CURATED_CHANNEL_POOL.length,
      liveFetchedCount: 0,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "custom";

    if (action === "refresh") {
      const channel = (typeof body.channel === "string" ? body.channel : "all") as NewsChannelId;
      const query = typeof body.query === "string" ? body.query.trim() : "";
      const liveItems = await fetchLiveChannelNews({ channel, query });
      const merged = enrichNewsPoolWithChannels(liveItems, true);
      return NextResponse.json({
        ok: true,
        items: merged,
        liveFetchedCount: liveItems.length,
      });
    }

    // action === 'custom': 중개인이 직접 추천 기사/칼럼 추가
    const title = cleanNewsText(typeof body.title === "string" ? body.title : "");
    if (!title || title.length < 4) {
      return jsonError("INVALID_TITLE", "기사 제목을 4자 이상 입력해 주세요.", 400);
    }
    const rawChannel = typeof body.channel === "string" ? body.channel : "";
    const rawSummary = cleanNewsText(typeof body.summary === "string" ? body.summary : "");
    const rawSource = cleanNewsText(typeof body.source === "string" ? body.source : "") || "중개사 엄선 브리핑";
    const rawUrl = typeof body.url === "string" && safeHttpUrl(body.url.trim()) ? body.url.trim() : undefined;

    const channel: SpecificNewsChannelId = isSpecificChannel(rawChannel)
      ? rawChannel
      : resolveNewsChannel({ title, summary: rawSummary, source: rawSource });
    const topic = CHANNEL_DEFAULT_TOPIC[channel];

    const item: CuratedChannelNewsItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      summary:
        rawSummary ||
        `핵심 팩트: ${title} | 브로커 임플리케이션: 매수자·건물주 고객에게 추천하는 주요 소식입니다.`,
      source: rawSource,
      ...(rawUrl ? { url: rawUrl } : {}),
      sentiment:
        body.sentiment === "bullish" || body.sentiment === "bearish" ? body.sentiment : "neutral",
      importance_score: 9,
      topic,
      channel,
    };

    if (rawUrl) {
      try {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("external_news")
          .upsert(
            [
              {
                url: rawUrl,
                title: item.title,
                source: item.source,
                summary: item.summary,
                content: item.summary,
                sentiment: item.sentiment,
                importance_score: item.importance_score,
                regions: detectRegions(`${item.title} ${item.summary}`),
                topic: item.topic,
              },
            ],
            { onConflict: "url" },
          )
          .select("id")
          .maybeSingle();
        if (data?.id) {
          item.id = String(data.id);
        }
      } catch {
        // DB 적재 실패 시에도 에디터 세션에서 즉시 사용 가능하도록 반환
      }
    }

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.warn("[api/broker/magazine/news-channels] POST error:", err);
    return jsonError("SERVER_ERROR", "뉴스 처리 중 오류가 발생했습니다.", 500);
  }
}
