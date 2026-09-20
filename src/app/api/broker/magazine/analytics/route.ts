import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { searchParams } = new URL(req.url);
    const subscriberId = searchParams.get("subscriberId");

    // 1. broker slug 조회 및 식별자 통합 (user.id & slug)
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("slug")
      .eq("user_id", user.id)
      .maybeSingle();
    const slug = bp?.slug;
    const brokerIds = Array.from(new Set([user.id, slug].filter(Boolean) as string[]));

    // ── 구독자별 상세 행동 드릴다운 ──
    if (subscriberId) {
      // 1. 구독자 정보 검증 (subscriberId 조회)
      const { data: sub, error: subError } = await supabase
        .from("magazine_subscribers")
        .select("id, subscriber_name, subscriber_phone, subscriber_email, segment, channel, interest_profile, status, subscribed_at, broker_id")
        .eq("id", subscriberId)
        .maybeSingle();

      if (subError || !sub) {
        return NextResponse.json({ error: "해당 구독자를 찾을 수 없습니다." }, { status: 404 });
      }

      // 2. 최근 30일 해당 구독자 이벤트 조회
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: events } = await supabase
        .from("magazine_analytics_events")
        .select("id, event_type, edition_id, scroll_pct, dwell_seconds, section_id, target_url, created_at")
        .or(`visitor_id.eq.${subscriberId},metadata->>subscriber_id.eq.${subscriberId}`)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100);

      const eventList = events || [];
      const views = eventList.filter(e => e.event_type === "page_view").length;
      const dwells = eventList.filter(e => e.event_type === "dwell" && e.dwell_seconds != null);
      const avgDwell = dwells.length > 0
        ? Math.round(dwells.reduce((sum, e) => sum + (e.dwell_seconds || 0), 0) / dwells.length)
        : 0;

      const viewedSections = [...new Set(eventList.map(e => e.section_id).filter(Boolean))];

      return NextResponse.json({
        subscriber: sub,
        analytics: {
          totalViews: views,
          avgDwellSeconds: avgDwell,
          lastActivityAt: eventList[0]?.created_at || null,
          viewedSections,
          recentEvents: eventList.slice(0, 30),
        },
      });
    }

    // ── 전체 브로커 매거진 성과 대시보드 ──
    // 2. 활성 구독자 수
    const { count: subscriberCount } = await supabase
      .from("magazine_subscribers")
      .select("id", { count: "exact", head: true })
      .in("broker_id", brokerIds)
      .eq("status", "active");

    // 3. 최근 배포 이력 (activity_events)
    const { data: distEvents } = await supabase
      .from("activity_events")
      .select("created_at, metadata")
      .in("actor_id", brokerIds)
      .eq("event_type", "magazine_distributed")
      .order("created_at", { ascending: false })
      .limit(1);
    
    const lastDist = distEvents?.[0];
    const lastDistribution = lastDist ? {
      date: lastDist.created_at?.slice(0, 10) || null,
      sentCount: (lastDist.metadata as any)?.sent_count ?? 0,
      failedCount: (lastDist.metadata as any)?.failed_count ?? 0,
      totalCount: (lastDist.metadata as any)?.total_count ?? 0,
    } : null;

    // 4. 에디션 목록
    const { data: editions } = await supabase
      .from("magazine_editions")
      .select("id, broker_id, edition_type, edition_label, title, status, market_temp, view_count, share_count, published_at, created_at")
      .in("broker_id", brokerIds)
      .order("created_at", { ascending: false })
      .limit(20);

    // 5. 열람 통계 (최근 30일)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    
    // 5a. 총 열람수 (page_view)
    const { count: totalViews } = await supabase
      .from("magazine_analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "page_view")
      .gte("created_at", thirtyDaysAgo)
      .in("edition_id", (editions || []).map(e => e.id));

    // 5b. 고유 방문자
    const { data: visitorRows } = await supabase
      .from("magazine_analytics_events")
      .select("visitor_id")
      .eq("event_type", "page_view")
      .gte("created_at", thirtyDaysAgo)
      .in("edition_id", (editions || []).map(e => e.id));
    const uniqueVisitors = new Set((visitorRows || []).map(r => r.visitor_id)).size;

    // 5c. 평균 체류 시간
    const { data: dwellRows } = await supabase
      .from("magazine_analytics_events")
      .select("dwell_seconds")
      .eq("event_type", "dwell")
      .gte("created_at", thirtyDaysAgo)
      .in("edition_id", (editions || []).map(e => e.id))
      .not("dwell_seconds", "is", null);
    const avgDwellSeconds = dwellRows && dwellRows.length > 0
      ? Math.round(dwellRows.reduce((s, r) => s + (r.dwell_seconds || 0), 0) / dwellRows.length)
      : 0;

    // 5d. 완독률
    const { count: scrollCompleteCount } = await supabase
      .from("magazine_analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "scroll_depth")
      .eq("scroll_pct", 100)
      .gte("created_at", thirtyDaysAgo)
      .in("edition_id", (editions || []).map(e => e.id));
    const completionRate = (totalViews ?? 0) > 0
      ? Math.round(((scrollCompleteCount ?? 0) / (totalViews ?? 1)) * 1000) / 10
      : 0;

    // 5e. 섹션별 열람 & 체류시간 집계 (section_view)
    const { data: sectionEvents } = await supabase
      .from("magazine_analytics_events")
      .select("section_id, dwell_seconds")
      .eq("event_type", "section_view")
      .gte("created_at", thirtyDaysAgo)
      .in("edition_id", (editions || []).map(e => e.id))
      .not("section_id", "is", null);

    const sectionMap = new Map<string, { count: number; totalDwell: number; dwellCount: number }>();
    (sectionEvents || []).forEach(ev => {
      if (!ev.section_id) return;
      const cur = sectionMap.get(ev.section_id) || { count: 0, totalDwell: 0, dwellCount: 0 };
      cur.count += 1;
      if (ev.dwell_seconds != null && ev.dwell_seconds > 0) {
        cur.totalDwell += ev.dwell_seconds;
        cur.dwellCount += 1;
      }
      sectionMap.set(ev.section_id, cur);
    });

    const SECTION_LABELS: Record<string, string> = {
      cover: "커버 & 브리핑 요약",
      ai_briefing: "AI 주간 브리핑",
      field_note: "현장 필드노트",
      theme_of_week: "금주의 핵심 테마",
      featured_deals: "추천 매물 하이라이트",
      market_data: "실거래 & 시장 데이터",
      news_curation: "주요 CRE 뉴스",
      tax_clinic: "세무 & 법률 클리닉",
      auction_picks: "경매 추천 픽",
      sentiment_index: "투자 심리 지수",
      roi_calculator: "투자 수익률 계산기",
      broker_profile: "브로커 프로필",
    };

    const sectionStats = Array.from(sectionMap.entries())
      .map(([sectionId, stat]) => ({
        sectionId,
        label: SECTION_LABELS[sectionId] || sectionId,
        count: stat.count,
        avgDwellSeconds: stat.dwellCount > 0 ? Math.round(stat.totalDwell / stat.dwellCount) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 6. 구독자 매수 온도 분석 & 핫리드(상위 고관여 고객) 집계
    const { data: activeSubscribers } = await supabase
      .from("magazine_subscribers")
      .select("id, subscriber_name, subscriber_phone, subscriber_email, segment, channel, interest_profile, subscribed_at")
      .in("broker_id", brokerIds)
      .eq("status", "active")
      .limit(100);

    const { getBuyerTemperature, TEMPERATURE_TIERS } = await import("@/domain/magazine/buyer-temperature");

    // 온도별 카운트 초기화
    const temperatureDistribution: Record<string, number> = {
      '🔥 적극검토': 0,
      '📈 관심': 0,
      '⏸️ 관망': 0,
      '❄️ 냉각': 0,
      '⚪ 미확인': 0,
    };

    // 최근 활동 이벤트 조회 (구독자별 매핑용)
    const { data: recentSubEvents } = await supabase
      .from("magazine_analytics_events")
      .select("visitor_id, event_type, section_id, dwell_seconds, created_at, metadata")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500);

    // visitor_id or metadata.subscriber_id -> events
    const subEventMap = new Map<string, any[]>();
    (recentSubEvents || []).forEach(ev => {
      const subId = ev.metadata?.subscriber_id || ev.visitor_id;
      if (!subId) return;
      const list = subEventMap.get(subId) || [];
      list.push(ev);
      subEventMap.set(subId, list);
    });

    const enrichedSubscribers = (activeSubscribers || []).map(sub => {
      const events = subEventMap.get(sub.id) || [];
      const viewCount = events.filter(e => e.event_type === "page_view").length;
      const lastActive = events[0]?.created_at || sub.subscribed_at;
      const activeSections = [...new Set(events.map(e => e.section_id).filter(Boolean))];

      // 크로스 채널 점수 가산: 최근 30일 내 열람 1회당 10점, 섹션 열람 5점
      const crossScore = Math.min(100, viewCount * 12 + events.length * 4);
      const tempConfig = getBuyerTemperature(sub.interest_profile, crossScore);

      if (temperatureDistribution[tempConfig.label] !== undefined) {
        temperatureDistribution[tempConfig.label] += 1;
      }

      return {
        id: sub.id,
        subscriber_name: sub.subscriber_name,
        subscriber_phone: sub.subscriber_phone,
        subscriber_email: sub.subscriber_email,
        segment: sub.segment || "investor",
        channel: sub.channel,
        interest_tags: sub.interest_profile?.tags || {},
        buyerTemperature: tempConfig.label,
        temperatureConfig: tempConfig,
        score: tempConfig.minScore + Math.min(15, viewCount * 3),
        totalViews: viewCount,
        lastActiveAt: lastActive,
        recentSections: activeSections.slice(0, 3).map(sid => SECTION_LABELS[sid] || sid),
      };
    });

    // 핫리드 (점수 및 최근 활동 기준 정렬 TOP 10)
    const hotLeads = enrichedSubscribers
      .sort((a, b) => b.score - a.score || new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
      .slice(0, 10);

    // 7. 최근 14일 일별 열람 추이
    const dailyViewsMap = new Map<string, number>();
    for (let d = 13; d >= 0; d--) {
      const dateStr = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      dailyViewsMap.set(dateStr, 0);
    }

    const { data: dailyViewRows } = await supabase
      .from("magazine_analytics_events")
      .select("created_at")
      .eq("event_type", "page_view")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .in("edition_id", (editions || []).map(e => e.id));

    (dailyViewRows || []).forEach(r => {
      const day = r.created_at?.slice(0, 10);
      if (day && dailyViewsMap.has(day)) {
        dailyViewsMap.set(day, (dailyViewsMap.get(day) || 0) + 1);
      }
    });

    const dailyTrend = Array.from(dailyViewsMap.entries()).map(([date, count]) => ({
      date: date.slice(5), // MM-DD
      count,
    }));

    // 8. 최신 에디션 독자 투표 결과
    let latestPollResults = null;
    if (editions && editions.length > 0) {
      const latestEdition = editions[0];
      const pollDate = latestEdition.published_at?.slice(0, 10) || latestEdition.created_at?.slice(0, 10);
      
      if (pollDate) {
        let votes: { choice: number }[] = [];
        try {
          const { data: voteData, error: voteErr } = await supabase
            .from("magazine_poll_responses")
            .select("choice")
            .in("broker_id", brokerIds)
            .eq("edition_date", pollDate);
          if (!voteErr && voteData) {
            votes = voteData as { choice: number }[];
          }
        } catch {
          // graceful fallback if table not migrated
        }

        const { data: latestFullEdition } = await supabase
          .from("magazine_editions")
          .select("content")
          .eq("id", latestEdition.id)
          .single();

        const pollData = latestFullEdition?.content?.poll;
        
        if (pollData && pollData.choices) {
          const total = (votes || []).length;
          const counts: Record<number, number> = {};
          for (const v of votes || []) {
            counts[v.choice] = (counts[v.choice] || 0) + 1;
          }
          latestPollResults = {
            question: pollData.question,
            choices: pollData.choices,
            total,
            counts
          };
        }
      }
    }

    return NextResponse.json({
      subscriberCount: subscriberCount ?? 0,
      editions: editions ?? [],
      lastDistribution,
      viewStats: {
        totalViews: totalViews ?? 0,
        uniqueVisitors,
        avgDwellSeconds,
        completionRate,
      },
      sectionStats,
      temperatureDistribution,
      hotLeads,
      dailyTrend,
      latestPollResults,
    });
  } catch (err: any) {
    log.error("[GET /api/broker/magazine/analytics]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
