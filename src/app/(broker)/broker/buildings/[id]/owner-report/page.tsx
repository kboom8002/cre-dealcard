import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import ReportActions from "./ReportActions";
import { readWithMigration } from '@/lib/ssot-adapter';

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "건물주 공실 리포트 | JS 딜카드",
  description: "실시간 건물 공실 현황 및 AI 임대 마케팅 성과 리포트",
};

interface OwnerReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function OwnerReportPage({ params }: OwnerReportPageProps) {
  const { id } = await params;

  const userSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "broker" && role !== "admin") {
    notFound();
  }

  const ownerCheck = await assertBuildingOwner(supabase, id, user.id, {
    allowAdmin: true,
    role,
  });
  if (!ownerCheck.ok) {
    notFound();
  }

  // Fetch building data from building_ssot_lite
  const { data: _building } = await readWithMigration(id);
  const building = _building as Record<string, unknown> | null;

  if (!building) return notFound();

  // Fetch recent activity events
  const { data: events } = await supabase
    .from("activity_events")
    .select("event_type, created_at, metadata")
    .or(`building_ssot_lite_id.eq.${id},building_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(200);

  // Group events
  const matchEvents = events?.filter((e) => e.event_type === "match_computed") ?? [];
  const inquiryEvents = events?.filter((e) => e.event_type === "inquiry_received") ?? [];
  const viewEvents = events?.filter((e) => e.event_type === "im_lite_view" || e.event_type === "teaser_view" || e.event_type === "view") ?? [];
  const aGradeMatches = matchEvents.filter(
    (e) =>
      (e.metadata as Record<string, unknown>)?.grade === "A" ||
      (e.metadata as Record<string, unknown>)?.grade === "S"
  );

  const today = new Date();
  const reportDate = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Last 7 days calculations for trend graph
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const thisWeekMatches = matchEvents.filter((e) => new Date(e.created_at) >= oneWeekAgo);
  const thisWeekInquiries = inquiryEvents.filter((e) => new Date(e.created_at) >= oneWeekAgo);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - i);
    return d;
  }).reverse();

  // Map activities to chart data with genuine event aggregation for page views
  const chartData = last7Days.map((date) => {
    const dayStr = date.toLocaleDateString("ko-KR", { weekday: "short" });
    const dateKey = date.toDateString();
    const dayMatches = matchEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
    const dayInquiries = inquiryEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
    const dayViews = viewEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;

    return {
      label: dayStr,
      pageViews: dayViews,
      matches: dayMatches,
      inquiries: dayInquiries,
    };
  });

  const maxViews = Math.max(...chartData.map((d) => d.pageViews), 20);
  const areaSignal = typeof building.area_signal === "string" ? building.area_signal : "";
  const assetType = typeof building.asset_type === "string" ? building.asset_type : "";
  const priceBand = typeof building.price_band === "string" ? building.price_band : null;
  const vacancySignal = typeof building.vacancy_signal === "string" ? building.vacancy_signal : null;
  const matchedBuyerCount = Number(building.matched_buyer_count ?? 0);
  const promotionScore = Number(building.promotion_score ?? 0);
  const buildingIdStr = String(building.id ?? id);
  const aiPageUrl = `https://cre-aipage.vercel.app/m/spaces/${areaSignal.replace(/\s/g, "-").toLowerCase()}`;

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8 pb-24 md:px-6">
      <div className="w-full max-w-xl mx-auto space-y-6 print:space-y-4">
        {/* Navigation / Control panel - hidden on print */}
        <div className="flex items-center justify-between no-print mb-2">
          <Link
            href="/broker/buildings"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            <span>←</span> 매물 목록으로 돌아가기
          </Link>
          <span className="px-3 py-1 rounded-full text-sm font-bold bg-white border border-slate-200 text-slate-700">
            건물주용 보안 리포트
          </span>
        </div>

        {/* Real-time Document Card */}
        <div className="print-card rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 space-y-8 print:border-none print:shadow-none print:bg-white print:p-0">
          
          {/* Executive Header */}
          <div className="flex flex-col items-center text-center space-y-2 border-b border-slate-200 pb-6">
            <span className="px-3 py-1 rounded-full text-sm font-bold tracking-wider bg-blue-50 text-blue-700 border border-blue-200 uppercase">
              LANDLORD STATUS VACANCY REPORT
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {areaSignal} {assetType}
            </h1>
            <p className="text-sm text-slate-600">
              실시간 임대 마케팅 및 오너 리포트 &bull; 발행일: <span className="font-semibold text-slate-800">{reportDate}</span>
            </p>
          </div>

          {/* Key Metric Scorecard Grid */}
          <div className="grid grid-cols-3 gap-3 print:gap-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <span className="block text-sm font-semibold text-slate-600 mb-1">
                이번 주 노출수
              </span>
              <p className="text-2xl md:text-3xl font-extrabold text-blue-700">
                {chartData.reduce((acc, curr) => acc + curr.pageViews, 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <span className="block text-sm font-semibold text-slate-600 mb-1">
                이번 주 AI 매칭
              </span>
              <p className="text-2xl md:text-3xl font-extrabold text-emerald-700">
                {thisWeekMatches.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <span className="block text-sm font-semibold text-slate-600 mb-1">
                이번 주 문의수
              </span>
              <p className="text-2xl md:text-3xl font-extrabold text-amber-700">
                {thisWeekInquiries.length}
              </p>
            </div>
          </div>

          {/* SVG Weekly Activity Trend Graph */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                📈 임대 관심도 주간 트렌드 (활동 분석)
              </h3>
              <div className="flex gap-3 text-sm text-slate-600">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600"></span> 조회</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-600"></span> AI 매칭</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-600"></span> 문의</span>
              </div>
            </div>

            {/* SVG Elements */}
            <div className="w-full overflow-hidden">
              <svg viewBox="0 0 420 190" className="w-full overflow-visible">
                {/* Horizontal Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                  const y = 140 - ratio * 110;
                  return (
                    <g key={index}>
                      <line
                        x1="40"
                        y1={y}
                        x2="400"
                        y2={y}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        className="text-slate-300"
                      />
                      <text
                        x="34"
                        y={y + 4}
                        textAnchor="end"
                        className="text-sm font-mono fill-slate-500"
                      >
                        {Math.round(ratio * maxViews)}
                      </text>
                    </g>
                  );
                })}

                {/* Day data rendering */}
                {chartData.map((data, i) => {
                  const groupX = 65 + i * 50;
                  const barW = 12;
                  
                  // Compute heights based on maxViews
                  const viewH = (data.pageViews / maxViews) * 110;
                  const viewY = 140 - viewH;

                  // Render match marker overlay (circle or small bar)
                  const matchY = 140 - (data.matches > 0 ? Math.min(100, 20 + data.matches * 25) : 0);
                  const hasMatches = data.matches > 0;

                  // Render inquiry marker overlay
                  const inquiryY = 140 - (data.inquiries > 0 ? Math.min(100, 30 + data.inquiries * 30) : 0);
                  const hasInquiries = data.inquiries > 0;

                  return (
                    <g key={i} className="group">
                      {/* Bar - Page Views */}
                      <rect
                        x={groupX - 6}
                        y={viewY}
                        width={barW}
                        height={viewH}
                        rx="3"
                        className="fill-blue-600/30 group-hover:fill-blue-600/50 transition-colors"
                      />

                      {/* Event Dot - AI Matching */}
                      {hasMatches && (
                        <circle
                          cx={groupX}
                          cy={matchY}
                          r="4"
                          className="fill-emerald-600"
                        />
                      )}

                      {/* Event Dot - Inquiries */}
                      {hasInquiries && (
                        <circle
                          cx={groupX}
                          cy={inquiryY}
                          r="4.5"
                          className="fill-amber-600"
                        />
                      )}

                      {/* Bottom Day Label */}
                      <text
                        x={groupX}
                        y="162"
                        textAnchor="middle"
                        className="text-sm font-semibold fill-slate-600"
                      >
                        {data.label}
                      </text>
                    </g>
                  );
                })}
                {/* Horizontal Baseline */}
                <line
                  x1="40"
                  y1="140"
                  x2="400"
                  y2="140"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-slate-300"
                />
              </svg>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              * 파란색 바(조회수)는 AI 임대 마케팅 페이지 오가닉 트래픽을 집계한 수치이며, 원형 도트는 AI 연계 자동 매수자 매칭 및 실시간 임차인 상담 매물 문의 접수 시점입니다.
            </p>
          </div>

          {/* Building Overview Summary */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              🏢 자산 주요 마케팅 지표
            </h3>
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-slate-600">가격 포지션</span>
                <span className="font-semibold text-slate-900">{priceBand ?? "미집계"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-slate-600">현재 공실률 위험도</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1">
                  {vacancySignal === "없음" ? (
                    <span className="text-emerald-700 font-bold">🟢 전부 임차 (정상)</span>
                  ) : (
                    <span className="text-rose-700 font-bold">⚠️ {vacancySignal ?? "보통"}</span>
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-slate-600">누적 매수 매칭 풀</span>
                <span className="font-semibold text-slate-900">{matchedBuyerCount}개 매수 의향사</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-slate-600">종합 마케팅 노출 지수</span>
                <span className="font-semibold text-slate-900">{Math.round(promotionScore)} / 100 점</span>
              </div>
            </div>
          </div>

          {/* Executed & In-Progress Actions */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              📋 자산 활성화 세부 액션 플랜
            </h3>
            <div className="space-y-3">
              {aGradeMatches.length > 0 ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <span className="text-emerald-700 shrink-0 mt-0.5">✓</span>
                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-900">고등급(A/S급) 매수 의향 매칭 확보</span>
                    <p className="text-slate-600 text-sm mt-0.5">
                      총 {aGradeMatches.length}명의 검증 완료 매수 후보군과 세부 임차 조건에 대한 사전 정보 미팅 및 일정 조율 중입니다.
                    </p>
                  </div>
                </div>
              ) : null}

              {vacancySignal && vacancySignal !== "없음" ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <span className="text-blue-700 shrink-0 mt-0.5">✓</span>
                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-900">AI 공실 매칭 웹페이지 노출 활성화</span>
                    <p className="text-slate-600 text-sm mt-0.5">
                      자산 고유 공간 데이터를 입체 구조화하여 예비 임차사 및 매수자가 모바일에서 직접 탐색할 수 있도록 딜매칭 활성화 상태입니다.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start gap-2.5 text-sm">
                <span className="text-amber-700 shrink-0 mt-0.5">✓</span>
                <div className="text-slate-700">
                  <span className="font-semibold text-slate-900">실시간 매물 오너십 검증 완료 (SSOT 확보)</span>
                  <p className="text-slate-600 text-sm mt-0.5">
                    자산 가격 밴드 및 공실률 신호 데이터를 Single Source of Truth(SSOT)에 기반해 최신 정보로 유지 중입니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Timeline List */}
          {events && events.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                ⏱ 최근 자산 마케팅 타임라인 (5개 이벤트)
              </h3>
              <div className="relative border-l border-slate-300 pl-4 space-y-4">
                {events.slice(0, 5).map((event, i) => {
                  const eventLabels: Record<string, string> = {
                    match_computed: "AI 매수자 매칭 완료",
                    inquiry_received: "임차 문의 접수",
                    deal_card_created: "자산 딜카드 등록",
                    owner_readiness_checked: "자료 준비도 확인 완료",
                    gate_approved: "Gate 의사결정 승인 완료",
                    im_lite_view: "모바일 IM 열람",
                    teaser_view: "티저 페이지 열람",
                    view: "물건 상세 열람",
                  };
                  const grade = (event.metadata as Record<string, unknown>)?.grade as string;
                  return (
                    <div key={i} className="relative text-sm">
                      {/* Circle indicator on timeline */}
                      <span className="absolute -left-[21.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-400 border border-white"></span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-medium">
                          {new Date(event.created_at).toLocaleDateString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {eventLabels[event.event_type] ?? event.event_type}
                        </span>
                        {grade && (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold">
                            {grade}등급
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action container for client actions (hidden on print) */}
          <ReportActions
            buildingId={buildingIdStr}
            areaSignal={areaSignal}
            aiPageUrl={aiPageUrl}
          />

          {/* Footer disclaimer - ForbiddenClaims safe */}
          <div className="border-t border-slate-200 pt-6 text-center text-sm text-slate-600">
            <p>본 리포트는 JS부동산중개 법인 시스템을 통해 보유 자산의 최근 동향을 객관적 지표로 생성한 모니터링 자료입니다.</p>
            <p className="mt-1">기록된 정보는 시스템 원천 데이터(SSOT)에 기반하였으며, 실시간 임대율 및 상담 문의 진행 속도에 따라 변동 가능합니다.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
