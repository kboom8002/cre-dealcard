import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";
import { searchNaverNews } from "@/lib/external/naver-search";
import { getModel } from "@/ai/model-selector";
import { requireBroker } from "@/lib/auth-guard";
import { enforceBrokerAiQuota } from "@/lib/ai-quota-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("morning-briefing-route");

const REGION_SEARCH_QUERY: Record<string, string> = {
  seongsu: "성수 꼬마빌딩 OR 성수 상업용 부동산",
  gbd: "강남 빌딩 매매 OR 강남 오피스 임대",
  ybd: "여의도 프라임 오피스 OR 여의도 상업용 부동산",
  cbd: "도심 프라임 오피스 OR 광화문 상업용 부동산",
  default: "상업용 부동산 빌딩 매매",
};

const ALLOWED_REGIONS = new Set(["seongsu", "gbd", "ybd", "cbd", "default"]);
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedBriefing {
  briefing: string;
  sentimentIndex: number;
  cachedAt: number;
  timestamp: string;
}

const BRIEFING_CACHE = new Map<string, CachedBriefing>();

function buildDeterministicDbBriefing(
  region: string,
  dbNews: Array<{ title?: string | null; summary?: string | null; source?: string | null }>,
  avgSentiment: number
): string {
  const regionLabel = region.toUpperCase();
  if (!dbNews || dbNews.length === 0) {
    return `오늘 아침 등록된 ${regionLabel} 권역 주요 뉴스 브리핑 데이터를 집계 중입니다.\n- 현장 중개사 심리 지수: **${avgSentiment}/100**`;
  }
  const bullets = dbNews
    .slice(0, 3)
    .map((n) => {
      const src = n.source ? `[${n.source}] ` : "";
      const title = (n.title || "").trim();
      const summary = (n.summary || "").trim();
      return `- ${src}**${title}**${summary ? ` — ${summary}` : ""}`;
    })
    .join("\n");
  return `**${regionLabel} 모닝 시장 브리핑**\n${bullets}\n- 현장 중개사 심리 지수: **${avgSentiment}/100**`;
}

/**
 * GET /api/pulse/morning-briefing?region=seongsu
 * B3: Morning Briefing API
 *
 * Security invariant:
 * - Unauthenticated public GET reads cached/DB briefing data ONLY (never triggers live Naver crawler + callLLM).
 * - Live crawler + LLM synthesis runs ONLY when authorized via CRON_SECRET or authenticated broker/admin with rate limit.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request) ?? "unknown";
    const publicAllowed = await checkRateLimit(ip, "pulse_morning_briefing_get", 30, 60_000);
    if (!publicAllowed) {
      return NextResponse.json(
        { success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }

    const rawRegion = (request.nextUrl.searchParams.get("region") || "gbd")
      .trim()
      .toLowerCase();
    const region = ALLOWED_REGIONS.has(rawRegion) ? rawRegion : "gbd";
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

    // Check authorization for live crawler + LLM synthesis
    const isCronAuthorized = verifyCronRequest(request) === null;

    let isBrokerAuthorized = false;
    let brokerActorKey = ip;
    if (!isCronAuthorized) {
      try {
        const guard = await requireBroker(request);
        if (!guard.error && guard.user?.id) {
          isBrokerAuthorized = true;
          brokerActorKey = guard.user.id;
        }
      } catch {
        isBrokerAuthorized = false;
      }
    }

    // Serve fresh in-memory cached briefing when available
    const memCached = BRIEFING_CACHE.get(region);
    if (memCached && Date.now() - memCached.cachedAt < CACHE_TTL_MS && !forceRefresh) {
      return NextResponse.json({
        success: true,
        region,
        sentimentIndex: memCached.sentimentIndex,
        briefing: memCached.briefing,
        cached: true,
        timestamp: memCached.timestamp,
      });
    }

    const supabase = createServiceClient();

    // 1. Read DB news, sentiment, and optional persisted briefing snapshot
    const [{ data: dbNews }, { data: sentiment }] = await Promise.all([
      supabase
        .from("external_news")
        .select("title, summary, source")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("market_sentiment_polls")
        .select("score, sentiment")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const avgSentiment =
      sentiment && sentiment.length > 0
        ? Math.round(sentiment.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0) / sentiment.length)
        : 55;

    // Check DB cached briefing in document_objects if present
    try {
      const { data: persistedDoc } = await supabase
        .from("document_objects")
        .select("body, created_at")
        .eq("document_type", "morning_briefing")
        .eq("title", region)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        persistedDoc?.body &&
        typeof persistedDoc.body === "object" &&
        typeof (persistedDoc.body as Record<string, unknown>).briefing === "string" &&
        !forceRefresh
      ) {
        const createdMs = Date.parse(String(persistedDoc.created_at || "")) || 0;
        if (!isCronAuthorized && (!isBrokerAuthorized || Date.now() - createdMs < CACHE_TTL_MS)) {
          return NextResponse.json({
            success: true,
            region,
            sentimentIndex: avgSentiment,
            briefing: (persistedDoc.body as Record<string, string>).briefing,
            cached: true,
            timestamp: String(persistedDoc.created_at || new Date().toISOString()),
          });
        }
      }
    } catch {
      // Non-blocking if document_objects cache row does not exist
    }

    // 2. Unauthenticated public GET: return cached/DB briefing data ONLY (never run live crawler or LLM)
    if (!isCronAuthorized && !isBrokerAuthorized) {
      const dbBriefing = buildDeterministicDbBriefing(region, dbNews || [], avgSentiment);
      return NextResponse.json({
        success: true,
        region,
        sentimentIndex: avgSentiment,
        briefing: dbBriefing,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Authorized broker/admin must pass AI synthesis rate limit (5 req / 10 min) & daily quota
    if (!isCronAuthorized && isBrokerAuthorized) {
      const aiAllowed = await checkRateLimit(
        brokerActorKey,
        "pulse_morning_briefing_ai",
        5,
        10 * 60 * 1000
      );
      if (!aiAllowed) {
        const fallbackBriefing =
          memCached?.briefing ||
          buildDeterministicDbBriefing(region, dbNews || [], avgSentiment);
        return NextResponse.json({
          success: true,
          region,
          sentimentIndex: avgSentiment,
          briefing: fallbackBriefing,
          cached: true,
          timestamp: new Date().toISOString(),
        });
      }
      const quotaErr = await enforceBrokerAiQuota(
        request,
        brokerActorKey,
        "pulse_morning_briefing",
        { perMinute: 5 },
      );
      if (quotaErr) return quotaErr;
    }

    // 4. Authorized live Naver News + LLM synthesis
    const query = REGION_SEARCH_QUERY[region] || REGION_SEARCH_QUERY.default;
    const naverNews = await searchNaverNews(query, 3);

    const newsItems: string[] = [];
    if (dbNews && dbNews.length > 0) {
      dbNews.forEach((n) => newsItems.push(`[${n.source}] ${n.title}: ${n.summary}`));
    }
    if (naverNews && naverNews.length > 0) {
      naverNews.forEach((n) => newsItems.push(`[네이버 뉴스] ${n.title}: ${n.description}`));
    }

    const newsSummary =
      newsItems.length > 0
        ? newsItems.join("\n")
        : "오늘 아침 주요 CRE 뉴스가 존재하지 않습니다.";

    let briefingText = "";
    try {
      const systemPrompt =
        "당신은 한국 상업용 부동산 전문 모닝 에디터입니다. 아침 8시에 중개사들에게 시장 동향을 브리핑합니다. 마크다운 포맷(볼드, 리스트 등)을 적극 사용하여 가독성 있게 작성하세요.";
      const userPrompt = `다음 데이터를 바탕으로 ${region.toUpperCase()} 권역의 모닝 브리핑(3줄 핵심 요약 및 오늘의 권장 행동)을 한글로 작성해 주세요:\n\n시장 뉴스:\n${newsSummary}\n\n현장 중개사 심리 지수: ${avgSentiment}/100`;

      const aiRes = await callLLM({
        systemPrompt,
        userPrompt,
        model: getModel("terra"),
        temperature: 0.7,
        maxTokens: 600,
      });
      briefingText =
        typeof aiRes === "string" ? aiRes : aiRes.content || JSON.stringify(aiRes);
    } catch {
      briefingText = buildDeterministicDbBriefing(region, dbNews || [], avgSentiment);
    }

    const nowIso = new Date().toISOString();
    BRIEFING_CACHE.set(region, {
      briefing: briefingText,
      sentimentIndex: avgSentiment,
      cachedAt: Date.now(),
      timestamp: nowIso,
    });

    return NextResponse.json({
      success: true,
      region,
      sentimentIndex: avgSentiment,
      briefing: briefingText,
      cached: false,
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    log.error("[api/pulse/morning-briefing] GET Error", {
      message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    return NextResponse.json(
      { success: false, error: "모닝 브리핑을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
