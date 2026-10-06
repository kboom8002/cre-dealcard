import { SECTION_LABELS } from '@/domain/ontology/d56-labels';
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, notFoundResponse, jsonError } from "@/lib/magazine/authz";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { isUuid } from "@/lib/magazine/slug";
import { isMagazineTrackingEnabled } from "@/lib/magazine/send-flags";
import { VISITOR_HASH_LIKE } from "@/lib/magazine/visitor-hash";
import { isMissingColumnError } from "@/lib/magazine/subscriber-view";
import { computeTemperatures, loadSubscriberEvents } from "@/lib/magazine/subscriber-temperature";
import { computeBuyerTemperature, emptyTemperatureDistribution, type TemperatureEvent } from "@/domain/magazine/buyer-temperature";
import { hotLeadThresholdMeta, parseHotLeadLimit, parseHotLeadTier, selectHotLeads } from "@/lib/magazine/hot-lead-filter";
import {
  KPI_DEFINITIONS,
  aggregatePageDwell,
  aggregateSections,
  completionRate,
  countUniqueVisitors,
  dailyTrendKst,
  pollHourlyDistribution,
  type AnalyticsRow,
} from "@/domain/magazine/analytics-aggregate";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** 대시보드 이벤트 상한 — 도달하면 `viewStats.truncated=true` 로 정직하게 알린다 */
const MAX_EVENT_ROWS = 10_000;
const MAX_EDITION_SCOPE = 100;
const MAX_SUBSCRIBERS = 500;

/** DB 오류를 빈 값으로 위장하지 않기 위한 내부 예외 (바깥 try/catch 에서 500) */
class QueryError extends Error {}

function must<T>(res: { data: T; error: { message?: string } | null }, label: string): T {
  if (res.error) throw new QueryError(`${label}: ${res.error.message ?? "unknown"}`);
  return res.data;
}

const DATA_QUALITY = {
  legacyExcluded: true,
  since: "2026-10",
  note: "2026-10 이전 데이터는 방문자 식별 오류(기기 지문 충돌)·에디션 미연결로 정확도가 낮아 집계에서 제외됩니다.",
} as const;

export async function GET(req: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "인증이 필요합니다.", 401);

    const supabase = createServiceClient();
    const { searchParams } = new URL(req.url);
    const subscriberId = searchParams.get("subscriberId");

    // 1. 서버가 결정한 broker 식별자 (slug + user.id) — 모든 쿼리의 기준
    const brokerIds = ctx.brokerKeys;

    // ── 구독자별 상세 행동 드릴다운 ──
    if (subscriberId) {
      // 1. 소유권 확인 (S2-03): 타 브로커/없음/비정상 id → 404. PII는 소유 구독자에 한해서만 반환.
      const sub = await assertOwnsRow<Record<string, any>>(supabase, "magazine_subscribers", subscriberId, ctx, {
        select: "id, subscriber_name, subscriber_phone, subscriber_email, segment, channel, interest_profile, status, subscribed_at, broker_id",
      });
      if (!sub || !isUuid(sub.id)) {
        return notFoundResponse("해당 구독자를 찾을 수 없습니다.");
      }

      // 2. 최근 30일 해당 구독자 이벤트 조회 — 내 에디션의 이벤트로만 한정
      const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
      const { data: ownEditionRows, error: edErr } = await supabase
        .from("magazine_editions")
        .select("id")
        .in("broker_id", brokerIds)
        .limit(500);
      if (edErr) {
        log.error("[GET /api/broker/magazine/analytics] edition lookup", edErr.message);
        return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
      }
      const ownEditionIds = (ownEditionRows || []).map((e: { id: string }) => e.id);

      const { data: events, error: evErr } = await supabase
        .from("magazine_analytics_events")
        .select("id, event_type, edition_id, visitor_id, scroll_pct, dwell_seconds, section_id, target_url, target_param, metadata, created_at")
        // sub.id는 DB에서 읽은 uuid(위에서 isUuid 검증) — 보간 안전
        .or(`visitor_id.eq.${sub.id},metadata->>subscriber_id.eq.${sub.id}`)
        .in("edition_id", ownEditionIds)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500);
      if (evErr) {
        log.error("[GET /api/broker/magazine/analytics] events lookup", evErr.message);
        return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
      }

      const eventList = (events || []) as Array<AnalyticsRow & { id: string; edition_id: string | null; target_url: string | null; target_param: string | null }>;
      const views = eventList.filter(e => e.event_type === "page_view").length;
      const pageDwell = aggregatePageDwell(eventList);
      const sections = aggregateSections(eventList).map(s => ({
        sectionId: s.sectionId,
        label: SECTION_LABELS[s.sectionId] || s.sectionId,
        count: s.count,
        avgDwellSeconds: s.avgDwellSeconds,
      }));
      const viewedSections = [...new Set(eventList.map(e => e.section_id).filter(Boolean))];

      // 온도 — 대시보드·구독자 목록과 동일한 함수 (T3-ANL-1)
      const temp = computeBuyerTemperature({
        profile: sub.interest_profile,
        events: eventList as TemperatureEvent[],
        subscribedAt: sub.subscribed_at,
      });

      return NextResponse.json({
        subscriber: sub,
        analytics: {
          totalViews: views,
          // 기존 키 유지: 표본 없으면 0 (별도 avgDwellSamples 로 구분)
          avgDwellSeconds: pageDwell.avgSeconds ?? 0,
          avgDwellSamples: pageDwell.samples,
          lastActivityAt: eventList[0]?.created_at || null,
          viewedSections,
          sections,
          recentEvents: eventList.slice(0, 30).map(e => ({
            id: e.id,
            event_type: e.event_type,
            edition_id: e.edition_id,
            scroll_pct: e.scroll_pct ?? null,
            dwell_seconds: e.dwell_seconds ?? null,
            section_id: e.section_id ?? null,
            target_url: e.target_url ?? null,
            target_param: e.target_param ?? null,
            created_at: e.created_at,
          })),
          temperature: {
            label: temp.tier.label,
            score: temp.composite,
            reason: temp.reason,
            engagementScore: temp.engagement,
            crossChannelScore: temp.crossChannelScore,
            counts: temp.counts,
          },
        },
      });
    }


    // ── 전체 브로커 매거진 성과 대시보드 ──
    const hotLeadTier = parseHotLeadTier(searchParams.get("tier"));
    if (!hotLeadTier) {
      return jsonError("INVALID_PARAMETER", "tier 는 hot, warm, all 중 하나여야 합니다.", 400);
    }
    const hotLeadLimit = parseHotLeadLimit(searchParams.get("limit"));
    const now = Date.now();

    const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString();

    // 2. 활성 구독자 수
    const { count: subscriberCount, error: subCountErr } = await supabase
      .from("magazine_subscribers")
      .select("id", { count: "exact", head: true })
      .in("broker_id", brokerIds)
      .eq("status", "active");
    if (subCountErr) throw new QueryError(`subscriber count: ${subCountErr.message}`);

    // 3. 최근 배포 이력 (activity_events)
    const distEvents = must(
      await supabase
        .from("activity_events")
        .select("created_at, metadata")
        .eq("actor_id", ctx.userId) // uuid 컬럼 — slug를 넣으면 22P02
        .eq("event_type", "magazine_distributed")
        .order("created_at", { ascending: false })
        .limit(1),
      "distribution history",
    );

    const lastDist = distEvents?.[0];
    const lastDistribution = lastDist ? {
      date: lastDist.created_at?.slice(0, 10) || null,
      sentCount: (lastDist.metadata as any)?.sent_count ?? 0,
      failedCount: (lastDist.metadata as any)?.failed_count ?? 0,
      totalCount: (lastDist.metadata as any)?.total_count ?? 0,
    } : null;

    // 4. 에디션 (이벤트 범위는 내 에디션 전체 최근 100건, 화면 표시는 20건)
    const scopeEditions = must(
      await supabase
        .from("magazine_editions")
        .select("id, broker_id, edition_type, edition_label, title, status, market_temp, view_count, share_count, published_at, created_at")
        .in("broker_id", brokerIds)
        .order("created_at", { ascending: false })
        .limit(MAX_EDITION_SCOPE),
      "editions",
    ) as Array<{ id: string; status?: string | null; published_at?: string | null; created_at?: string | null; [k: string]: unknown }>;
    const editions = scopeEditions.slice(0, 20);
    const editionIds = scopeEditions.map(e => e.id);

    // 5. 열람 통계 (최근 30일, v2 방문자만 · edition_id 연결된 이벤트만)
    let eventRows: AnalyticsRow[] = [];
    if (editionIds.length > 0) {
      eventRows = must(
        await supabase
          .from("magazine_analytics_events")
          .select("event_type, visitor_id, section_id, dwell_seconds, scroll_pct, created_at, metadata")
          .in("edition_id", editionIds)
          .like("visitor_id", VISITOR_HASH_LIKE)
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: false })
          .limit(MAX_EVENT_ROWS),
        "events",
      ) as AnalyticsRow[];
    }
    const truncated = eventRows.length >= MAX_EVENT_ROWS;

    const viewRows = eventRows.filter(r => r.event_type === "page_view");
    const totalViews = viewRows.length;
    const uniqueVisitors = countUniqueVisitors(viewRows);
    const pageDwell = aggregatePageDwell(eventRows);
    const viewVisitors = new Set(viewRows.map(r => r.visitor_id).filter((v): v is string => !!v));
    const completedVisitors = new Set(
      eventRows.filter(r => r.event_type === "scroll_depth" && r.scroll_pct === 100).map(r => r.visitor_id).filter((v): v is string => !!v),
    );
    const completion = completionRate(viewVisitors, completedVisitors);

    // 5e. 섹션별 열람 & 체류시간
    const sectionStats = aggregateSections(eventRows).map(s => ({
      sectionId: s.sectionId,
      label: SECTION_LABELS[s.sectionId] || s.sectionId,
      count: s.count,
      avgDwellSeconds: s.avgDwellSeconds ?? 0,
      dwellSamples: s.dwellSamples,
    }));

    // 6. 구독자 매수 온도 — analytics·subscribers 가 같은 함수·같은 입력을 쓴다 (T3-ANL-1)
    const activeSubscribers = must(
      await supabase
        .from("magazine_subscribers")
        .select("id, subscriber_name, subscriber_phone, subscriber_email, segment, channel, interest_profile, subscribed_at")
        .in("broker_id", brokerIds)
        .eq("status", "active")
        .limit(MAX_SUBSCRIBERS),
      "subscribers",
    ) as Array<Record<string, any>>;

    const loaded = await loadSubscriberEvents(supabase, brokerIds, activeSubscribers.map(s => s.id), now);
    if (!loaded.ok) throw new QueryError(`subscriber events: ${loaded.message}`);
    const temps = computeTemperatures(activeSubscribers as any, loaded.bySubscriber, now);

    const temperatureDistribution = emptyTemperatureDistribution() as Record<string, number>;

    const enrichedSubscribers = activeSubscribers.map(sub => {
      const temp = temps.get(sub.id)!;
      const events = loaded.bySubscriber.get(sub.id) ?? [];
      const activeSections = [...new Set(events.filter(e => e.event_type === "section_view").map(e => e.section_id).filter((s): s is string => !!s))];
      temperatureDistribution[temp.tier.label] = (temperatureDistribution[temp.tier.label] ?? 0) + 1;

      return {
        id: sub.id,
        subscriber_name: sub.subscriber_name,
        subscriber_phone: sub.subscriber_phone,
        subscriber_email: sub.subscriber_email,
        segment: sub.segment || "investor",
        channel: sub.channel,
        interest_tags: sub.interest_profile?.tags || {},
        buyerTemperature: temp.tier.label,
        temperatureConfig: temp.tier,
        temperatureReason: temp.reason,
        engagementScore: temp.engagement,
        crossChannelScore: temp.crossChannelScore,
        // 모든 화면의 점수 = 온도 판정에 쓴 복합 점수 (analytics·subscribers 동일)
        score: temp.composite,
        totalViews: temp.counts.page_view,
        lastActiveAt: temp.lastActivityAt || temp.lastEngagedAt || sub.subscribed_at,
        recentSections: activeSections.slice(0, 3).map(sid => SECTION_LABELS[sid] || sid),
      };
    });

    // 핫리드: 점수 임계(tier) 이상만 — 점수 0·냉각·미확인 구독자는 제외 (정렬: 점수 → 최근 활동)
    const hotSelection = selectHotLeads(enrichedSubscribers, hotLeadTier, hotLeadLimit);
    const hotLeads = hotSelection.leads;


    // 7. 최근 14일 일별 열람 추이 (KST)
    const fourteenDaysAgo = now - 14 * DAY_MS;
    const dailyTrend = dailyTrendKst(
      viewRows.filter(r => new Date(r.created_at).getTime() >= fourteenDaysAgo),
      14,
      new Date(now),
    );

    // 8. 최신 에디션 독자 투표 결과 (+ 시간대별 분포: 실데이터만, 5건 미만 숨김)
    let latestPollResults: Record<string, unknown> | null = null;
    let pollUnavailable: "NOT_MIGRATED" | null = null;
    if (editions.length > 0) {
      const latestEdition = editions[0];
      const pollDate = (latestEdition.published_at as string | null | undefined)?.slice(0, 10) || (latestEdition.created_at as string | null | undefined)?.slice(0, 10);

      if (pollDate) {
        type VoteRow = { choice: number; created_at?: string | null };
        let votes: VoteRow[] = [];
        let pollError: { code?: string; message: string } | null = null;
        const withTime = await supabase
          .from("magazine_poll_responses")
          .select("choice, created_at")
          .in("broker_id", brokerIds)
          .eq("edition_date", pollDate);
        pollError = withTime.error;
        let pollData2: VoteRow[] = (withTime.data ?? []) as VoteRow[];
        if (withTime.error && isMissingColumnError(withTime.error)) {
          // created_at 컬럼이 아직 없으면 시간대 분포 없이 선택지 집계만
          const noTime = await supabase
            .from("magazine_poll_responses")
            .select("choice")
            .in("broker_id", brokerIds)
            .eq("edition_date", pollDate);
          pollError = noTime.error;
          pollData2 = (noTime.data ?? []) as VoteRow[];
        }
        if (pollError) {
          if (pollError.code === "42P01" || pollError.code === "PGRST205") {
            pollUnavailable = "NOT_MIGRATED";
          } else {
            throw new QueryError(`poll responses: ${pollError.message}`);
          }
        } else {
          votes = pollData2;
        }

        const { data: latestFullEdition, error: fullErr } = await supabase
          .from("magazine_editions")
          .select("content")
          .eq("id", latestEdition.id)
          .maybeSingle();
        if (fullErr) throw new QueryError(`latest edition content: ${fullErr.message}`);

        const pollData = latestFullEdition?.content?.poll;

        if (pollData && pollData.choices) {
          const total = votes.length;
          const counts: Record<number, number> = {};
          for (const v of votes) {
            counts[v.choice] = (counts[v.choice] || 0) + 1;
          }
          const hourly = pollHourlyDistribution(votes);
          latestPollResults = {
            question: pollData.question,
            choices: pollData.choices,
            total,
            counts,
            hourly: hourly.hours,
            hourlyHidden: hourly.hidden,
          };
        }
      }
    }

    // KPI 가 0 인 이유 (빈 숫자만 보여 주지 않는다)
    const hasPublished = scopeEditions.some(e => e.status === "published");
    let kpiNotice: { code: "TRACKING_DISABLED" | "NO_PUBLISHED_EDITION" | "NO_V2_EVENTS"; message: string } | null = null;
    if (!isMagazineTrackingEnabled()) {
      kpiNotice = { code: "TRACKING_DISABLED", message: "열람 수집이 꺼져 있어 새 데이터가 쌓이지 않습니다." };
    } else if (!hasPublished) {
      kpiNotice = { code: "NO_PUBLISHED_EDITION", message: "발행된 호수가 없어 열람 데이터가 없습니다." };
    } else if (totalViews === 0) {
      kpiNotice = { code: "NO_V2_EVENTS", message: "최근 30일 새 기준 열람 기록이 없습니다. 2026-10 이전 데이터는 정확도가 낮아 제외됩니다." };
    }

    return NextResponse.json({
      subscriberCount: subscriberCount ?? 0,
      editions: editions ?? [],
      lastDistribution,
      viewStats: {
        totalViews,
        uniqueVisitors,
        avgDwellSeconds: pageDwell.avgSeconds ?? 0,
        dwellSamples: pageDwell.samples,
        completionRate: completion ?? 0,
        completionBase: viewVisitors.size,
        truncated,
      },
      kpiDefinitions: KPI_DEFINITIONS,
      kpiNotice,
      dataQuality: DATA_QUALITY,
      sectionStats,
      temperatureDistribution,
      hotLeads,
      // 핫리드 메타 (추가 키): 판정 기준 · 전체 구독자 수 · 일치/반환 수
      hotLeadThreshold: hotLeadThresholdMeta(hotLeadTier),
      totalSubscribers: subscriberCount ?? 0,
      hotLeadQuery: {
        tier: hotLeadTier,
        limit: hotLeadLimit,
        matched: hotSelection.matched,
        returned: hotLeads.length,
        evaluated: activeSubscribers.length,
      },
      dailyTrend,
      latestPollResults,
      pollUnavailable,
    });
  } catch (err: any) {
    log.error("[GET /api/broker/magazine/analytics]", err?.message ?? String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
