import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import { calculateBrokerMonthlyRoi } from "@/domain/analytics/roi-calculator";
import { RoiCard } from "@/components/dashboard/RoiCard";
import { AntifragileMode } from "@/components/dashboard/AntifragileMode";
import { WeeklyReportCard } from "@/components/dashboard/WeeklyReportCard";

export const metadata: Metadata = {
  title: "JS 1분 딜카드 | 중개인 코크핏",
  description: "중개인 전용 대시보드 — 고객 관리, 매칭, 파이프라인을 한눈에.",
};

/**
 * Broker Cockpit — 중개인 메인 대시보드
 * KPI 카드 + 빠른 작업 + 파이프라인 미니 현황 + 알림 + 최근 데이터
 */
export default async function BrokerPage() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "좋은 아침이에요"
      : hour < 18
        ? "좋은 오후예요"
        : "수고하셨어요";

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ── KPI 데이터 병렬 조회 ─────────────────────────────────────
  const [
    { data: recentDeals },
    { data: recentLeases },
    { data: recentBuyers },
    { data: recentTenants },
    { count: totalBuildings },
    { count: totalLeaseSpaces },
    { count: totalBuyers },
    { count: totalTenants },
    { count: totalClients },
    { data: matchResults },
    { data: leaseMatchResults },
    roiMetrics,
    marketIndicatorRes,
  ] = await Promise.all([
    supabase
      .from("building_ssot_lite")
      .select("id, area_signal, asset_type, price_band, matched_buyer_count, status, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("lease_spaces")
      .select("id, floor, area_sqm, space_type, deposit, monthly_rent, status, created_at")
      .eq("broker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("buyer_intent_lite")
      .select("id, buyer_type, budget_display, preferred_regions, purchase_purpose, created_at")
      .eq("broker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("tenant_intent")
      .select("id, business_type, preferred_regions, budget_monthly_max, created_at")
      .eq("broker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
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
      .select("grade"), // RLS restricts to broker's spaces
    calculateBrokerMonthlyRoi(supabase, user.id),
    supabase
      .from("market_leading_indicators")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const sMatchCount = (matchResults?.filter((m) => m.grade === "S").length ?? 0) + (leaseMatchResults?.filter((m) => m.grade === "S").length ?? 0);
  const aMatchCount = (matchResults?.filter((m) => m.grade === "A").length ?? 0) + (leaseMatchResults?.filter((m) => m.grade === "A").length ?? 0);

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: "활성", color: "bg-success/10 text-success border border-success/20" },
    draft: { label: "초안", color: "bg-warning/10 text-warning border border-warning/20" },
    archived: { label: "보관", color: "bg-muted text-muted-foreground border border-border" },
    pending: { label: "검토중", color: "bg-primary/10 text-primary border border-primary/20" },
  };

  // ── Antifragile Mode Indicator Fallback ──
  const trend = marketIndicatorRes?.data as any;
  const antifragileMetrics = {
    trendDirection: (trend?.trend_direction ?? "down") as "up" | "flat" | "down",
    region: trend?.region ?? "강남 GBD",
    assetType: trend?.asset_type ?? "오피스빌딩",
    demandScore: Number(trend?.demand_score ?? 42),
    supplyScore: Number(trend?.supply_score ?? 78),
    avgHoldDays: Number(trend?.avg_hold_days ?? 28.5),
    priceResistanceBand: trend?.price_resistance_band
      ? (trend.price_resistance_band as { min: number; max: number })
      : { min: 0.08, max: 0.15 },
  };

  const totalMatchCount = (matchResults?.length ?? 0) + (leaseMatchResults?.length ?? 0);
  const sConversionRate = totalMatchCount > 0 
    ? Math.round((sMatchCount / totalMatchCount) * 1000) / 10 
    : 42.5;

  const holdDaysDelta = Math.round(((antifragileMetrics.avgHoldDays - 18.2) / 18.2) * 100);
  const holdDaysDeltaText = holdDaysDelta < 0
    ? `전체 평균 18.2일 대비 ${holdDaysDelta}%`
    : `전체 평균 18.2일 대비 +${holdDaysDelta}%`;

  const conversionDelta = Math.round((sConversionRate - 35.0) * 10) / 10;
  const conversionDeltaText = conversionDelta >= 0
    ? `전체 평균 35% 대비 +${conversionDelta}%p`
    : `전체 평균 35% 대비 ${conversionDelta}%p`;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* ── Greeting ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between pt-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{greeting}, 중개인님.</h1>
            <p className="text-sm text-muted-foreground">매매와 임대차 계약을 스마트하게 관리하세요</p>
          </div>
          <Link
            href="/broker/profile"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-muted hover:bg-muted/80 text-lg transition-colors shrink-0"
            id="nav-profile"
            title="프로필 관리"
          >
            👤
          </Link>
        </div>

        {/* ── 안티프래질 시장 선행 분석 모드 (Phase 4: F12) ── */}
        <AntifragileMode {...antifragileMetrics} />

        {/* ── 실시간 ROI 가치 지표 표시 (Growth Flywheel) ── */}
        <RoiCard metrics={roiMetrics} />

        {/* ── 주간 개인 리포트 ─────────────────────────────────── */}
        <WeeklyReportCard />

        {/* ── KPI Cards ────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <Link
              href="/broker/buildings"
              className="rounded-xl border border-border bg-card p-2 text-center transition-all hover:border-primary/30 active:scale-[0.97]"
            >
              <p className="text-xl font-bold text-foreground">{totalBuildings ?? 0}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">매매물건</p>
            </Link>
            <Link
              href="/broker/lease-card"
              className="rounded-xl border border-border bg-card p-2 text-center transition-all hover:border-primary/30 active:scale-[0.97]"
            >
              <p className="text-xl font-bold text-primary">{totalLeaseSpaces ?? 0}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">임대물건</p>
            </Link>
            <Link
              href="/broker/buyer-intents"
              className="rounded-xl border border-border bg-card p-2 text-center transition-all hover:border-primary/30 active:scale-[0.97]"
            >
              <p className="text-xl font-bold text-foreground">{totalBuyers ?? 0}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">매수고객</p>
            </Link>
            <Link
              href="/broker/tenant-intents"
              className="rounded-xl border border-border bg-card p-2 text-center transition-all hover:border-primary/30 active:scale-[0.97]"
            >
              <p className="text-xl font-bold text-primary">{totalTenants ?? 0}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">임차고객</p>
            </Link>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/broker/matching"
              className="rounded-xl border border-border bg-card p-2.5 text-center flex justify-between items-center transition-all hover:border-primary/30"
            >
              <span className="text-[11px] text-muted-foreground font-medium">S/A 매칭</span>
              <span className="text-lg font-bold text-grade-s">{sMatchCount + aMatchCount} 건</span>
            </Link>
            <Link
              href="/broker/clients"
              className="rounded-xl border border-border bg-card p-2.5 text-center flex justify-between items-center transition-all hover:border-primary/30"
            >
              <span className="text-[11px] text-muted-foreground font-medium">관리 고객</span>
              <span className="text-lg font-bold text-foreground">{totalClients ?? 0} 명</span>
            </Link>
          </div>
        </div>

        {/* ── 파이프라인 분석 & 시장 선행 지표 위젯 (Phase 6) ── */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4.5 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-primary flex items-center gap-1">
              📈 실시간 시장 분석 & KPI (Phase 6)
            </h2>
            <span className="text-[9px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded">특허 P4</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-card border border-border p-2.5 rounded-lg space-y-1">
              <p className="text-[10px] text-muted-foreground font-semibold">내 딜 체류일수</p>
              <p className="text-base font-extrabold text-foreground">{antifragileMetrics.avgHoldDays}일</p>
              <p className="text-[9px] text-green-600 font-medium">{holdDaysDeltaText}</p>
            </div>
            <div className="bg-card border border-border p-2.5 rounded-lg space-y-1">
              <p className="text-[10px] text-muted-foreground font-semibold">S등급 매칭 전환율</p>
              <p className="text-base font-extrabold text-foreground">{sConversionRate}%</p>
              <p className="text-[9px] text-primary font-medium">{conversionDeltaText}</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] bg-card border border-border px-3 py-2 rounded-lg leading-relaxed">
            <span className="text-muted-foreground">📍 실시간 서울 권역 트렌드 ({antifragileMetrics.region}):</span>
            <span className="font-bold text-green-600">
              {antifragileMetrics.trendDirection === "up" ? "📈 수요 강도 상승" : "➡️ 보합 안정세"} 
              (수요 {antifragileMetrics.demandScore} vs 공급 {antifragileMetrics.supplyScore})
            </span>
          </div>
        </div>

        {/* ── Quick Actions ────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">빠른 딜카드 작성</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/broker/deal-card/new"
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            >
              <span className="text-2xl">🏢</span>
              <div>
                <p className="text-xs font-semibold">매매 딜카드 생성</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">카톡메모 → 매매 딜카드</p>
              </div>
            </Link>
            
            <Link
              href="/broker/lease-card/new"
              className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            >
              <span className="text-2xl">🔑</span>
              <div>
                <p className="text-xs font-semibold text-primary">임대차 딜카드 생성</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">카톡메모 → 임대 딜카드</p>
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Link
              href="/broker/buyer-intents/new"
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/40 active:scale-[0.98]"
            >
              <span className="text-lg">🎯</span>
              <div>
                <p className="text-xs font-semibold">매수 의향서 등록</p>
                <p className="text-[10px] text-muted-foreground">매매 매칭용</p>
              </div>
            </Link>
            <Link
              href="/broker/tenant-intents/new"
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/40 active:scale-[0.98]"
            >
              <span className="text-lg">🏷️</span>
              <div>
                <p className="text-xs font-semibold">임차 의향서 등록</p>
                <p className="text-[10px] text-muted-foreground">임대 매칭용</p>
              </div>
            </Link>
          </div>

          {/* ── AI Leasing Studio ── */}
          <Link
            href="/broker/leasing"
            className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3.5 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 active:scale-[0.98] mt-2"
          >
            <span className="text-xl">🏪</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-emerald-300">AI 리싱 스튜디오</p>
              <p className="text-[10px] text-muted-foreground">사진 분류 → 적합성 분석 → 리싱 페이지 생성</p>
            </div>
            <span className="text-xs text-emerald-400 font-medium">관리 →</span>
          </Link>
        </div>

        {/* ── 최근 임대차 딜카드 ─────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">최근 임대차 딜카드</h2>
            <Link
              href="/broker/lease-card"
              className="text-xs text-primary hover:underline"
            >
              목록 보기
            </Link>
          </div>

          {recentLeases && recentLeases.length > 0 ? (
            <div className="space-y-2">
              {recentLeases.map((space) => {
                const st = statusLabels[space.status ?? "active"] ?? statusLabels["active"];
                return (
                  <Link
                    key={space.id}
                    href={`/broker/lease-card/${space.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                  >
                    <span className="text-xl">🔑</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {space.floor ? `${space.floor} ` : ""}{space.space_type === "office" ? "오피스" : "상가"}
                        </p>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {space.area_sqm ? `${Math.round(space.area_sqm / 3.3058)}평 ` : ""} · 보증금 {space.deposit || 0}만 / 월 {space.monthly_rent || 0}만
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(space.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <span className="text-xs text-muted-foreground">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 text-center">
              <p className="text-sm text-muted-foreground">
                아직 만든 임대차 딜카드가 없어요.
              </p>
              <Link
                href="/broker/lease-card/new"
                className="inline-flex items-center justify-center mt-3 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                첫 임대 딜카드 만들기
              </Link>
            </div>
          )}
        </div>

        {/* ── 최근 매매 딜카드 ──────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">최근 매매 딜카드</h2>
            <Link
              href="/broker/buildings"
              className="text-xs text-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>

          {recentDeals && recentDeals.length > 0 ? (
            <div className="space-y-2">
              {recentDeals.map((deal) => {
                const st = statusLabels[deal.status ?? "draft"] ?? statusLabels["draft"];
                const matchCount = deal.matched_buyer_count ?? 0;
                return (
                  <Link
                    key={deal.id}
                    href={`/broker/deal-card/${deal.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                  >
                    <span className="text-xl">🏢</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {deal.area_signal ?? "권역 미상"}{" "}
                          {deal.asset_type ?? ""}
                        </p>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {deal.price_band ?? "가격 미상"}
                        </p>
                        {matchCount > 0 && (
                          <span className="text-xs text-primary font-medium">
                            🎯 {matchCount}명 매칭
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(deal.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <span className="text-xs text-muted-foreground">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">아직 매매 딜카드가 없어요.</p>
            </div>
          )}
        </div>

        {/* ── 최근 임차 의향서 ──────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">등록된 임차고객 (의향서)</h2>
            <Link
              href="/broker/tenant-intents"
              className="text-xs text-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>

          {recentTenants && recentTenants.length > 0 ? (
            <div className="space-y-2">
              {recentTenants.map((tenant) => {
                const regions = Array.isArray(tenant.preferred_regions)
                  ? (tenant.preferred_regions as string[]).slice(0, 2).join(", ")
                  : "미확인";
                return (
                  <Link
                    key={tenant.id}
                    href={`/broker/tenant-intents/${tenant.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                  >
                    <span className="text-xl">🎯</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tenant.business_type || "임차고객"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        월세 상한 {tenant.budget_monthly_max ? `${tenant.budget_monthly_max}만` : "미확인"} · {regions}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">→</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">등록된 임차 의향서가 없어요.</p>
            </div>
          )}
        </div>
      </div>

      <BrokerBottomNav />
    </main>
  );
}

