import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "파이프라인 분석 | 관리자",
  description: "상업용 부동산 미완료 거래 데이터 기반 파이프라인 전환 및 이탈 분석",
};

interface TransitionRow {
  id: string;
  from_stage: string;
  to_stage: string;
  transition_reason: string | null;
  hold_days: number | null;
  created_at: string;
}

interface FailureRow {
  id: string;
  rejected_by: string;
  failure_reason: string;
  price_gap_pct: number | null;
  created_at: string;
}

export default async function AdminPipelinePage() {
  await requireAdminRsc();

  let totalTransitions = 0;
  const stageTransitionCounts: Record<string, number> = {};
  let avgHoldDays = 0;
  let recentTransitions: TransitionRow[] = [];

  let totalFailures = 0;
  const rejectedByCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  let avgPriceGapPct = 0;
  let loadFailed = false;

  try {
    const supabase = createServiceClient();
    const [transRes, failRes] = await Promise.all([
      supabase
        .from("pipeline_stage_transitions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("match_failure_logs")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (transRes.error || failRes.error) {
      loadFailed = true;
    } else {
      const transitions = (transRes.data ?? []) as TransitionRow[];
      totalTransitions = transitions.length;
      let totalHoldDays = 0;
      let holdDaysCount = 0;
      for (const t of transitions) {
        const path = `${t.from_stage} -> ${t.to_stage}`;
        stageTransitionCounts[path] = (stageTransitionCounts[path] || 0) + 1;
        if (t.hold_days !== null && t.hold_days !== undefined) {
          totalHoldDays += Number(t.hold_days);
          holdDaysCount += 1;
        }
      }
      avgHoldDays =
        holdDaysCount > 0 ? Math.round((totalHoldDays / holdDaysCount) * 10) / 10 : 0;
      recentTransitions = transitions.slice(0, 15);

      const logs = (failRes.data ?? []) as FailureRow[];
      totalFailures = logs.length;
      let totalPriceGap = 0;
      let priceGapCount = 0;
      for (const l of logs) {
        rejectedByCounts[l.rejected_by] = (rejectedByCounts[l.rejected_by] || 0) + 1;
        reasonCounts[l.failure_reason] = (reasonCounts[l.failure_reason] || 0) + 1;
        if (l.price_gap_pct !== null && l.price_gap_pct !== undefined) {
          totalPriceGap += Number(l.price_gap_pct);
          priceGapCount += 1;
        }
      }
      avgPriceGapPct =
        priceGapCount > 0 ? Math.round((totalPriceGap / priceGapCount) * 10) / 10 : 0;
    }
  } catch {
    loadFailed = true;
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-slate-50 text-slate-900">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between pt-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              🔍 파이프라인 분석 대시보드
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              상업용 부동산 미완료 거래 데이터 기반 파이프라인 전환 및 이탈 분석
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-blue-700 hover:underline shrink-0"
          >
            ← 관리자 콘솔
          </Link>
        </div>

        {loadFailed && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-800">
            ⚠️ 파이프라인 분석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-xs">
            <p className="text-sm font-semibold text-slate-600">총 파이프라인 전환</p>
            <p className="text-3xl font-extrabold text-slate-900">{totalTransitions}건</p>
            <p className="text-sm text-slate-600">전 단계 전환 히스토리 집계</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-xs">
            <p className="text-sm font-semibold text-slate-600">평균 체류 일수</p>
            <p className="text-3xl font-extrabold text-amber-700">{avgHoldDays}일</p>
            <p className="text-sm text-slate-600">계약 완료/이탈까지 평균 기간</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-xs">
            <p className="text-sm font-semibold text-slate-600">매칭 불전환 건수</p>
            <p className="text-3xl font-extrabold text-rose-700">{totalFailures}건</p>
            <p className="text-sm text-slate-600">S/A 등급 매칭 후 이탈 건수</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-xs">
            <p className="text-sm font-semibold text-slate-600">불전환 평균 가격 갭</p>
            <p className="text-3xl font-extrabold text-slate-900">{avgPriceGapPct}%</p>
            <p className="text-sm text-slate-600">희망가 vs 제안가 평균 차이</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              🔄 주요 단계 전환 현황
            </h2>
            <div className="space-y-3">
              {Object.keys(stageTransitionCounts).length > 0 ? (
                Object.entries(stageTransitionCounts).map(([path, count]) => (
                  <div
                    key={path}
                    className="flex items-center justify-between border-b border-slate-200 pb-2 last:border-0"
                  >
                    <span className="text-sm text-slate-900 font-medium">{path}</span>
                    <span className="text-sm bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">
                      {count}건
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600 text-center py-6">
                  아직 기록된 파이프라인 전환이 없습니다.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              🛑 매칭 거절 주체 분포
            </h2>
            <div className="space-y-3">
              {Object.keys(rejectedByCounts).length > 0 ? (
                Object.entries(rejectedByCounts).map(([rejector, count]) => {
                  const roleMap: Record<string, string> = {
                    buyer: "매수자 (Buyer)",
                    tenant: "임차인 (Tenant)",
                    owner: "매도/임대인 (Owner)",
                    broker: "공인중개사 (Broker)",
                  };
                  const pct = Math.round((count / (totalFailures || 1)) * 100);
                  return (
                    <div key={rejector} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-900">
                          {roleMap[rejector] || rejector}
                        </span>
                        <span className="text-slate-700 font-semibold">
                          {count}건 ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-rose-600 h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-600 text-center py-6">
                  아직 기록된 거절 정보가 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            🚨 매칭 불전환(이탈) 주요 사유 TOP 5
          </h2>
          <div className="space-y-3">
            {Object.keys(reasonCounts).length > 0 ? (
              Object.entries(reasonCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count], idx) => (
                  <div key={reason} className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-sm font-extrabold text-slate-700 shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-slate-900 font-semibold flex-1 leading-normal">
                      {reason}
                    </span>
                    <span className="text-sm text-slate-700 shrink-0 font-bold">{count}건</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-slate-600 text-center py-6">
                불전환 사유 데이터가 없습니다.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            🕒 최근 파이프라인 전환 로그
          </h2>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {recentTransitions.length > 0 ? (
              recentTransitions.map((t) => (
                <div
                  key={t.id}
                  className="text-sm border-b border-slate-200 pb-3 last:border-b-0 space-y-1"
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-blue-700">
                      {t.from_stage} → {t.to_stage}
                    </span>
                    <span className="text-slate-600 text-sm">
                      {new Date(t.created_at).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-slate-900 leading-relaxed">
                    <span className="text-slate-600">사유:</span>{" "}
                    {t.transition_reason || "미지정"} (체류 {t.hold_days ?? 0}일)
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600 text-center py-6">
                최근 파이프라인 전환 이력이 없습니다.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 shadow-xs">
          <p className="text-sm text-slate-700 leading-relaxed">
            💡 <strong className="text-slate-900">미완료 파이프라인 분석</strong>: 매칭 완료에 도달하지 못한 미완료 단계별 이탈 데이터를 분석하여
            시장 저항대 산출 및 시세 보정에 기여합니다.
          </p>
        </div>
      </div>
    </main>
  );
}
