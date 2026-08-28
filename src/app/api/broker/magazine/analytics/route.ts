import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

    // ── 구독자별 상세 행동 드릴다운 ──
    if (subscriberId) {
      // 1. 구독자 정보 검증 (내 구독자인지 확인)
      const { data: sub, error: subError } = await supabase
        .from("magazine_subscribers")
        .select("id, subscriber_name, subscriber_phone, subscriber_email, segment, channel, interest_tags, interest_profile, status, subscribed_at")
        .eq("id", subscriberId)
        .eq("broker_id", user.id)
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
    // 1. broker slug 조회
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("slug")
      .eq("user_id", user.id)
      .maybeSingle();
    const slug = bp?.slug;

    // 2. 활성 구독자 수
    const { count: subscriberCount } = await supabase
      .from("magazine_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id)
      .eq("status", "active");

    // 3. 최근 배포 이력 (activity_events)
    const { data: distEvents } = await supabase
      .from("activity_events")
      .select("metadata, created_at")
      .eq("actor_id", user.id)
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
      .eq("broker_id", slug || user.id)
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
    });
  } catch (err: any) {
    console.error("[GET /api/broker/magazine/analytics]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
