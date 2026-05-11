import type { Metadata } from "next";
import Link from "next/link";
import {
  getAdminAnalytics,
  computeFunnelRates,
  EVENT_DISPLAY,
} from "@/domain/analytics/admin-analytics";

export const metadata: Metadata = {
  title: "애널리틱스 | 관리자",
  description: "핵심 이벤트 카운트와 전환율 대시보드",
};

// ─── metric card ─────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  emoji,
  sub,
  highlight,
}: {
  label: string;
  value: number | string;
  emoji: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border"
      }`}
    >
      <p className="text-lg">{emoji}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── funnel row ──────────────────────────────────────────────────────────────
function FunnelRow({
  from,
  to,
  rate,
}: {
  from: string;
  to: string;
  rate: number | null;
}) {
  const color =
    rate === null
      ? "text-muted-foreground"
      : rate >= 50
        ? "text-green-600"
        : rate >= 20
          ? "text-amber-600"
          : "text-red-500";

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground text-sm truncate">{from}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-sm truncate">{to}</span>
      </div>
      <span className={`text-sm font-semibold shrink-0 ml-4 ${color}`}>
        {rate === null ? "—" : `${rate}%`}
      </span>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────
export default async function AdminAnalyticsPage() {
  let data: Awaited<ReturnType<typeof getAdminAnalytics>> | null = null;
  let errorMsg: string | null = null;

  try {
    data = await getAdminAnalytics();
  } catch (e) {
    errorMsg =
      e instanceof Error ? e.message : "서비스 키가 설정되지 않았습니다.";
  }

  const counts = data?.counts;
  const funnel = counts ? computeFunnelRates(counts) : null;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold">애널리틱스</h1>
            <p className="text-sm text-muted-foreground">
              MVP 핵심 이벤트 집계
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-primary hover:underline"
          >
            ← 관리자 홈
          </Link>
        </div>

        {/* Config warning */}
        {errorMsg && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ {errorMsg.includes("supabase") || errorMsg.includes("service")
              ? "SUPABASE_SERVICE_ROLE_KEY가 .env.local에 설정되지 않았습니다."
              : errorMsg}
          </div>
        )}

        {data && counts && (
          <>
            {/* Overview */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                전체 현황
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  emoji="📦"
                  label="누적 이벤트"
                  value={data.totalEvents.toLocaleString()}
                  highlight
                />
                <MetricCard
                  emoji="📅"
                  label="오늘 이벤트"
                  value={data.todayEvents.toLocaleString()}
                  highlight
                />
              </div>
            </div>

            {/* Public Loop */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                🌐 Public Loop
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  emoji="🏢"
                  label="건물 SSoT 생성"
                  value={counts.building_ssot_lite_created}
                />
                <MetricCard
                  emoji="📊"
                  label="딜 리포트 생성"
                  value={counts.deal_curiosity_report_generated}
                />
                <MetricCard
                  emoji="📈"
                  label="매각 준비도 체크"
                  value={counts.owner_readiness_checked}
                />
                <MetricCard
                  emoji="💡"
                  label="전문가 코멘트 요청"
                  value={counts.expert_note_requested}
                />
              </div>
            </div>

            {/* Broker Loop */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                🤝 Broker Loop
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  emoji="📋"
                  label="브로커 메모 제출"
                  value={counts.broker_memo_submitted}
                />
                <MetricCard
                  emoji="🔍"
                  label="블라인드 티저 생성"
                  value={counts.blind_teaser_generated}
                />
                <MetricCard
                  emoji="🎯"
                  label="매수자 조건 생성"
                  value={counts.buyer_intent_created}
                />
                <MetricCard
                  emoji="💬"
                  label="매수자 메모 생성"
                  value={counts.buyer_memo_generated}
                />
              </div>
            </div>

            {/* Gate + Safety */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                🔐 Gate &amp; Safety
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  emoji="🔐"
                  label="Gate 요청"
                  value={counts.gate_request_created}
                />
                <MetricCard
                  emoji="✅"
                  label="Gate 검토 완료"
                  value={counts.gate_request_reviewed}
                />
                <MetricCard
                  emoji="⚠️"
                  label="AI 실패"
                  value={counts.ai_run_failed}
                  sub="0이어야 함"
                />
              </div>
            </div>

            {/* Funnel Conversion */}
            {funnel && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  📉 전환율 (Funnel)
                </h2>
                <div className="rounded-xl border border-border bg-card px-5 py-3">
                  <FunnelRow
                    from="SSoT 생성"
                    to="딜 리포트"
                    rate={funnel.reportCompletionRate}
                  />
                  <FunnelRow
                    from="딜 리포트"
                    to="블라인드 티저"
                    rate={funnel.blindTeaserConversion}
                  />
                  <FunnelRow
                    from="딜 리포트"
                    to="전문가 코멘트"
                    rate={funnel.expertNoteConversion}
                  />
                  <FunnelRow
                    from="블라인드 티저"
                    to="Gate 요청"
                    rate={funnel.gateRequestFromTeaser}
                  />
                  <FunnelRow
                    from="브로커 메모"
                    to="블라인드 티저"
                    rate={funnel.dealCardConversion}
                  />
                  <FunnelRow
                    from="매수자 조건"
                    to="매수자 메모"
                    rate={funnel.buyerMemoConversion}
                  />
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {data.recentEvents.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  🕐 최근 이벤트 (30건)
                </h2>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {data.recentEvents.map((event, i) => {
                    const display = EVENT_DISPLAY[event.event_type];
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          i < data.recentEvents.length - 1
                            ? "border-b border-border"
                            : ""
                        }`}
                      >
                        <span className="text-base shrink-0">
                          {display?.emoji ?? "📌"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {display?.label ?? event.event_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.actor_role ?? "익명"}
                            {event.entity_type ? ` · ${event.entity_type}` : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(event.created_at).toLocaleDateString(
                            "ko-KR",
                            { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.recentEvents.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  아직 이벤트가 없습니다.
                  <br />
                  딜카드, 매수자 조건, 매각 준비도를 생성하면 여기 표시됩니다.
                </p>
              </div>
            )}
          </>
        )}

        {/* No data placeholder (service key missing) */}
        {!data && !errorMsg && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">데이터를 불러오는 중...</p>
          </div>
        )}

        {/* Disclosure reminder */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            이 대시보드는 이벤트 유형별 집계만 표시합니다.
            개인 식별 정보, 건물 원본 데이터, 매도자 정보는 포함되지 않습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
