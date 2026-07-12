import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabase = createServiceClient();

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
