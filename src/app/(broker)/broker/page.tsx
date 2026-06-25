import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import { calculateBrokerMonthlyRoi } from "@/domain/analytics/roi-calculator";
import { RoiCard } from "@/components/dashboard/RoiCard";
import { MarketBreakthroughMode } from "@/components/dashboard/AntifragileMode";
import { WeeklyReportCard } from "@/components/dashboard/WeeklyReportCard";
import { MonthlyReportCard } from "@/components/dashboard/MonthlyReportCard";
import { Bell, TrendingUp, Users, Building2, Target, Calendar } from "lucide-react";
import BrokerDashboardTabs from "@/components/dashboard/BrokerDashboardTabs";
import MorningIntelligence from "@/components/dashboard/MorningIntelligence";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";

import { UniversalMemoFAB } from "@/components/memo/UniversalMemoFAB";

export const metadata: Metadata = {
  title: "JS 1분 딜카드 | 중개인 코크핏",
  description: "중개인 전용 대시보드 — 고객 관리, 매칭, 파이프라인을 한눈에.",
};

/**
 * Broker Cockpit v2 — 간소화된 데일리 허브
 * 인사 + 핵심 KPI + 알림 피드 + 시장 대응 전략 분석 + 주간 리포트 + 모닝 인텔리전스 (탭화)
 */
export default async function BrokerPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "중개인";

  // ── KPI 데이터 병렬 조회 ──
  const [
    { count: totalBuildings },
    { count: totalLeaseSpaces },
    { count: totalBuyers },
    { count: totalTenants },
    { count: totalClients },
    { data: matchResults },
    { data: leaseMatchResults },
    roiMetrics,
    marketIndicatorRes,
    activityEventsRes,
    todayBookingsRes,
  ] = await Promise.all([
    supabase
      .from("building_ssot_lite")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id),
    supabase
      .from("lease_spaces")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id),
    supabase
      .from("buyer_intent_lite")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id),
    supabase
      .from("tenant_intent")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id),
    supabase
      .from("broker_clients")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id),
    supabase
      .from("match_results")
      .select("grade")
      .eq("broker_id", user.id),
    supabase
      .from("lease_match_results")
      .select("grade")
      .eq("broker_id", user.id),
    calculateBrokerMonthlyRoi(supabase, user.id),
    supabase
      .from("market_leading_indicators")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activity_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("bookings")
      .select(`
        id,
        status,
        requester_id,
        requester:profiles!bookings_requester_id_fkey(full_name, phone_number),
        slot:availability_slots!inner(
          slot_start,
          slot_end,
          slot_date,
          building:building_ssot_lite(id, address, area_signal)
        )
      `)
      .in("status", ["hold", "confirmed"])
      .eq("slot.slot_date", new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("slot.slot_start", { ascending: true })
  ]);

  const sMatchCount =
    (matchResults?.filter((m) => m.grade === "S").length ?? 0) +
    (leaseMatchResults?.filter((m) => m.grade === "S").length ?? 0);
  const aMatchCount =
    (matchResults?.filter((m) => m.grade === "A").length ?? 0) +
    (leaseMatchResults?.filter((m) => m.grade === "A").length ?? 0);

  const trend = marketIndicatorRes?.data as any;
  const breakthroughMetrics = {
    trendDirection: (trend?.trend_direction ?? "flat") as "up" | "flat" | "down",
    region: trend?.region ?? "성동구 성수동",
    assetType: trend?.asset_type ?? "근린생활시설",
    demandScore: Number(trend?.demand_score ?? 55),
    supplyScore: Number(trend?.supply_score ?? 40),
    avgHoldDays: Number(trend?.avg_hold_days ?? 39.0),
    priceResistanceBand: trend?.price_resistance_band
      ? (trend.price_resistance_band as { min: number; max: number })
      : { min: 0.08, max: 0.15 },
  };

  const totalMatchCount =
    (matchResults?.length ?? 0) + (leaseMatchResults?.length ?? 0);
  const sConversionRate =
    totalMatchCount > 0
      ? Math.round((sMatchCount / totalMatchCount) * 1000) / 10
      : 0;

  const myTotalDeals = (totalBuildings ?? 0) + (totalLeaseSpaces ?? 0);
  const displayAvgHoldDays = myTotalDeals > 0 ? breakthroughMetrics.avgHoldDays : 0;
  
  const holdDaysDelta = myTotalDeals > 0 
    ? Math.round(((displayAvgHoldDays - 18.2) / 18.2) * 100)
    : 0;

  // Query activity_events table for real notification feed
  const rawEvents = activityEventsRes?.data || [];
  const notifications = rawEvents.map((evt) => {
    let icon = "🔔";
    let text = `${evt.event_type} 이벤트가 발생했습니다.`;
    let href = "/broker";
    let color = "text-slate-300";

    switch (evt.event_type) {
      case "gate_request_created":
        icon = "🔒";
        text = `신규 Gate 상세 주소 요청 접수`;
        href = "/admin/gate-requests";
        color = "text-primary";
        break;
      case "gate_request_reviewed":
        const isApproved = (evt.metadata as any)?.decision === "approved";
        const buildingId = (evt.metadata as any)?.building_id;
        icon = isApproved ? "📅" : "📋";
        text = isApproved ? "Gate 승인 완료! 바로 임장 예약하세요" : "Gate 요청 검토 완료: 거절";
        href = isApproved && buildingId ? `/buildings/${buildingId}/schedule` : "/admin/gate-requests";
        color = isApproved ? "text-emerald-400" : "text-rose-400";
        break;
      case "expert_note_requested":
        icon = "📝";
        text = "전문가 노트 작성 요청 접수";
        href = "/admin/expert-notes";
        color = "text-amber-400";
        break;
      case "buyer_intent_created":
        icon = "🎯";
        text = "신규 매수 고객 의향서 등록";
        href = "/broker/buyer-intents";
        color = "text-emerald-400";
        break;
      case "deal_card.matched":
        const grade = (evt.metadata as any)?.grade || 'S';
        icon = "✨";
        text = `[${grade}급 매칭] 신규 자동 매칭 발생`;
        href = "/broker/matching";
        color = "text-amber-400";
        break;
      case "pipeline_stage_transitioned":
        icon = "📈";
        text = "딜 파이프라인 단계 변경됨";
        href = "/broker/pipeline";
        color = "text-indigo-400";
        break;
      case "broker_memo_submitted":
        icon = "✏️";
        text = "브로커 한줄 메모 등록 완료";
        href = "/broker";
        color = "text-slate-400";
        break;
      default:
        if (evt.event_type.includes("created")) {
          icon = "➕";
          text = `신규 데이터 생성: ${evt.entity_type || "레코드"}`;
        } else if (evt.event_type.includes("updated")) {
          icon = "🔄";
          text = `데이터 업데이트: ${evt.entity_type || "레코드"}`;
        }
        break;
    }

    const timeAgo = (dateStr: string) => {
      const diffMs = new Date().getTime() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "방금";
      if (diffMins < 60) return `${diffMins}분 전`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}시간 전`;
      return `${Math.floor(diffHours / 24)}일 전`;
    };

    return {
      icon,
      text,
      href,
      time: timeAgo(evt.created_at),
      color,
    };
  });

  const todayBookings = todayBookingsRes?.data || [];

  // Overview Tab Panel Content
  const overviewContent = (
    <div className="space-y-5 animate-fadeIn">
      {/* ── 오늘의 일정 ── */}
      {todayBookings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> 오늘의 일정 ({todayBookings.length}건)
            </p>
            <Link href="/broker/schedule" className="text-[10px] text-primary hover:underline">전체 보기</Link>
          </div>
          <div className="space-y-2">
            {todayBookings.map((bk: any) => {
              const start = new Date(bk.slot.slot_start).toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' });
              return (
                <Link
                  key={bk.id}
                  href={`/broker/deal-card/${bk.slot.building.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-all"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-white">{start} · {bk.slot.building.address || bk.slot.building.area_signal} 임장</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${bk.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {bk.status === "confirmed" ? "예약 확정" : "승인 대기"}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">매수자: {(bk.requester as any)?.full_name || "고객"}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 핵심 KPI 스크롤 카드 ── */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">오늘의 주요 지표</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { label: "매매물건", value: totalBuildings ?? 0, icon: Building2, color: "text-blue-400", href: "/broker/buildings" },
            { label: "임대물건", value: totalLeaseSpaces ?? 0, icon: Building2, color: "text-primary", href: "/broker/buildings" },
            { label: "S/A 매칭", value: sMatchCount + aMatchCount, icon: Target, color: "text-amber-400", href: "/broker/matching" },
            { label: "관리 고객", value: totalClients ?? 0, icon: Users, color: "text-emerald-400", href: "/broker/clients" },
            { label: "매수 고객", value: totalBuyers ?? 0, icon: TrendingUp, color: "text-rose-400", href: "/broker/buyer-intents" },
          ].map(({ label, value, icon: Icon, color, href }) => (
            <Link
              key={label}
              href={href}
              className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 text-center hover:border-primary/30 transition-all min-w-[76px]"
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} strokeWidth={2} />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── 알림 피드 ── */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Bell className="w-3 h-3" /> 최근 알림 피드
            </p>
            <Link href="/broker/matching" className="text-[10px] text-primary hover:underline">
              전체 보기
            </Link>
          </div>
          <div className="space-y-1.5">
            {notifications.map((n, i) => (
              <Link
                key={i}
                href={n.href}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 hover:border-primary/30 transition-all"
              >
                <span className="text-base shrink-0">{n.icon}</span>
                <p className={`text-xs font-medium flex-1 line-clamp-1 ${n.color}`}>{n.text}</p>
                <span className="text-[10px] text-muted-foreground shrink-0">{n.time}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 실시간 ROI ── */}
      <RoiCard metrics={roiMetrics} />

      {/* ── 핵심 성과 지표 미니 ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
        <h2 className="text-xs font-bold text-primary">📈 내 파이프라인 성과 요약</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-card border border-border p-2.5 rounded-lg">
            <p className="text-[10px] text-muted-foreground">내 딜 평균 체류일수</p>
            <p className="text-base font-extrabold">{displayAvgHoldDays}일</p>
            {myTotalDeals > 0 ? (
              <p className="text-[9px] text-green-600">
                평균 18.2일 대비{" "}
                {holdDaysDelta < 0 ? holdDaysDelta : `+${holdDaysDelta}`}%
              </p>
            ) : (
              <p className="text-[9px] text-muted-foreground">
                데이터 부족
              </p>
            )}
          </div>
          <div className="bg-card border border-border p-2.5 rounded-lg">
            <p className="text-[10px] text-muted-foreground">S등급 매칭 전환율</p>
            <p className="text-base font-extrabold">{sConversionRate}%</p>
            {totalMatchCount > 0 ? (
              <p className="text-[9px] text-primary">평균 35% 대비 {sConversionRate - 35 >= 0 ? '+' : ''}{Math.round((sConversionRate - 35) * 10) / 10}%p</p>
            ) : (
              <p className="text-[9px] text-muted-foreground">데이터 부족</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-28">
      <div className="w-full max-w-md mx-auto space-y-5">

        {/* ── 인사 & 날짜 & 로그인 상태 ── */}
        <GreetingHeader userName={userName} />

        {/* ── 퀵액션 버튼 ── */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/broker/deal-card/new"
            id="quick-action-new-dealcard"
            className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 hover:bg-primary/20 active:scale-95 transition-all"
          >
            <span className="text-xl">📝</span>
            <div>
              <p className="text-xs font-bold text-primary leading-tight">30초 딜카드</p>
              <p className="text-[10px] text-muted-foreground">카톡 메모 붙여넣기</p>
            </div>
          </Link>
          <Link
            href="/broker/buyer-intents/new"
            id="quick-action-new-buyer"
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/20 active:scale-95 transition-all"
          >
            <span className="text-xl">🎯</span>
            <div>
              <p className="text-xs font-bold text-emerald-400 leading-tight">매수자 등록</p>
              <p className="text-[10px] text-muted-foreground">조건 메모 붙여넣기</p>
            </div>
          </Link>
          <Link
            href="/broker/matching"
            id="quick-action-matching"
            className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            <span className="text-xl">⚡</span>
            <div>
              <p className="text-xs font-bold text-amber-400 leading-tight">매칭 센터</p>
              <p className="text-[10px] text-muted-foreground">AI 매칭 결과 확인</p>
            </div>
          </Link>
          <Link
            href="/broker/studio"
            id="quick-action-studio"
            className="flex items-center gap-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 hover:bg-indigo-500/20 active:scale-95 transition-all"
          >
            <span className="text-xl">🎬</span>
            <div>
              <p className="text-xs font-bold text-indigo-400 leading-tight">콘텐츠 스튜디오</p>
              <p className="text-[10px] text-muted-foreground">매거진 & 카톡 공유</p>
            </div>
          </Link>
          <Link
            href="/owner-readiness"
            id="quick-action-owner-readiness"
            className="flex items-center gap-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 hover:bg-teal-500/20 active:scale-95 transition-all"
          >
            <span className="text-xl">📋</span>
            <div>
              <p className="text-xs font-bold text-teal-400 leading-tight">매각준비도 진단</p>
              <p className="text-[10px] text-muted-foreground">소유주 자가진단</p>
            </div>
          </Link>
          <Link
            href="/broker/my-card/new"
            id="quick-action-vibe-card"
            className="flex items-center gap-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 hover:bg-purple-500/20 active:scale-95 transition-all"
          >
            <span className="text-xl">✨</span>
            <div>
              <p className="text-xs font-bold text-purple-400 leading-tight">Vibe 명함</p>
              <p className="text-[10px] text-muted-foreground">내 브로커 프로필</p>
            </div>
          </Link>
        </div>

        {/* ── 탭 레이아웃 연동 ── */}
        <BrokerDashboardTabs
          overviewContent={overviewContent}
          breakthroughContent={<MarketBreakthroughMode {...breakthroughMetrics} />}
          weeklyReportContent={
            <div className="space-y-4">
              <WeeklyReportCard />
              <MonthlyReportCard />
            </div>
          }
          morningIntelligenceContent={<MorningIntelligence />}
        />

      </div>

      <UniversalMemoFAB />
      <BrokerBottomNav />
    </main>
  );
}
