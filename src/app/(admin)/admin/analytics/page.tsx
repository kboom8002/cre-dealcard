import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";
import {
  getAdminAnalytics,
  computeFunnelRates,
  EVENT_DISPLAY,
} from "@/domain/analytics/admin-analytics";

export const metadata: Metadata = {
  title: "애널리틱스 | 관리자",
  description: "핵심 이벤트 카운트와 전환율 대시보드",
};

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
      className={`rounded-xl border p-4 space-y-1 shadow-xs ${
        highlight
          ? "border-blue-200 bg-blue-50/70"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-lg">{emoji}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {sub && <p className="text-sm text-slate-600">{sub}</p>}
    </div>
  );
}

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
      ? "text-slate-500"
      : rate >= 50
        ? "text-emerald-700"
        : rate >= 20
          ? "text-amber-700"
          : "text-rose-700";

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-200 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-600 text-sm truncate">{from}</span>
        <span className="text-slate-500 text-sm">→</span>
        <span className="text-sm font-medium text-slate-900 truncate">{to}</span>
      </div>
      <span className={`text-sm font-semibold shrink-0 ml-4 ${color}`}>
        {rate === null ? "—" : `${rate}%`}
      </span>
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  await requireAdminRsc();

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
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">애널리틱스</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              MVP 핵심 이벤트 집계
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-blue-700 hover:underline"
          >
            ← 관리자 홈
          </Link>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            ⚠️{" "}
            {errorMsg.includes("supabase") || errorMsg.includes("service")
              ? "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다."
              : "애널리틱스 데이터를 불러오지 못했습니다."}
          </div>
        )}

        {data && counts && (
          <>
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
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

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
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

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                🤝 Broker Loop
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  emoji="📋"
                  label="공인중개사 메모 제출"
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

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
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

            {funnel && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  📉 전환율 (Funnel)
                </h2>
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-xs">
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
                    from="공인중개사 메모"
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

            {data.recentEvents.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  🕐 최근 이벤트 (30건)
                </h2>
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  {data.recentEvents.map((event, i) => {
                    const display = EVENT_DISPLAY[event.event_type];
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          i < data.recentEvents.length - 1
                            ? "border-b border-slate-200"
                            : ""
                        }`}
                      >
                        <span className="text-base shrink-0">
                          {display?.emoji ?? "📌"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {display?.label ?? event.event_type}
                          </p>
                          <p className="text-sm text-slate-600">
                            {event.actor_role ?? "익명"}
                            {event.entity_type ? ` · ${event.entity_type}` : ""}
                          </p>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-nowrap shrink-0">
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
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
                <p className="text-sm text-slate-600">
                  아직 이벤트가 없습니다.
                  <br />
                  딜카드, 매수자 조건, 매각 준비도를 생성하면 여기 표시됩니다.
                </p>
              </div>
            )}
          </>
        )}

        {!data && !errorMsg && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
            <p className="text-sm text-slate-600">데이터를 불러오는 중...</p>
          </div>
        )}

        <div className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 shadow-xs">
          <p className="text-sm text-slate-700 leading-relaxed">
            이 대시보드는 이벤트 유형별 집계만 표시합니다.
            개인 식별 정보, 건물 원본 데이터, 매도자 정보는 포함되지 않습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
