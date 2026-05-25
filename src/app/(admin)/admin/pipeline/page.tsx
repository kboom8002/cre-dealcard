"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PipelineData {
  totalTransitions: number;
  stageTransitionCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  avgHoldDays: number;
  recentTransitions: any[];
}

interface FailureData {
  totalFailures: number;
  rejectedByCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  avgPriceGapPct: number;
  recentLogs: any[];
}

export default function AdminPipelinePage() {
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [failureData, setFailureData] = useState<FailureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [pipeRes, failRes] = await Promise.all([
          fetch("/api/admin/pipeline-analytics"),
          fetch("/api/admin/match-failures"),
        ]);

        if (!pipeRes.ok || !failRes.ok) {
          throw new Error("데이터를 가져오는 중 오류가 발생했습니다.");
        }

        const pipeJson = await pipeRes.json();
        const failJson = await failRes.json();

        if (pipeJson.ok && failJson.ok) {
          setPipelineData(pipeJson.data);
          setFailureData(failJson.data);
        } else {
          throw new Error(pipeJson.error || failJson.error || "데이터 처리 실패");
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">파이프라인 통계 분석 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-2xl mx-auto rounded-xl bg-destructive/10 border border-destructive/20 p-6 text-center space-y-4">
          <p className="text-lg font-semibold text-destructive">오류가 발생했습니다</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/admin" className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
            관리자 홈으로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-background">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🔍 파이프라인 분석 대시보드</h1>
            <p className="text-sm text-muted-foreground">
              상업용 부동산 미완료 거래 데이터 기반 파이프라인 전환 및 이탈 분석
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
            ← 관리자 콘솔
          </Link>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">총 파이프라인 전환</p>
            <p className="text-3xl font-extrabold text-foreground">{pipelineData?.totalTransitions || 0}건</p>
            <p className="text-xs text-muted-foreground">전 단계 전환 히스토리 집계</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">평균 체류 일수</p>
            <p className="text-3xl font-extrabold text-amber-500">{pipelineData?.avgHoldDays || 0}일</p>
            <p className="text-xs text-muted-foreground">계약 완료/이탈까지 평균 기간</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">매칭 불전환 건수</p>
            <p className="text-3xl font-extrabold text-red-500">{failureData?.totalFailures || 0}건</p>
            <p className="text-xs text-muted-foreground">S/A 등급 매칭 후 이탈 건수</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">불전환 평균 가격 갭</p>
            <p className="text-3xl font-extrabold text-foreground">{failureData?.avgPriceGapPct || 0}%</p>
            <p className="text-xs text-muted-foreground">희망가 vs 제안가 평균 차이</p>
          </div>
        </div>

        {/* Funnel & Failure Reasons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Funnel transition counts */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🔄 주요 단계 전환 현황</h2>
            <div className="space-y-3">
              {pipelineData && Object.keys(pipelineData.stageTransitionCounts).length > 0 ? (
                Object.entries(pipelineData.stageTransitionCounts).map(([path, count]) => (
                  <div key={path} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <span className="text-sm text-foreground font-medium">{path}</span>
                    <span className="text-sm bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">{count}건</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">아직 기록된 파이프라인 전환이 없습니다.</p>
              )}
            </div>
          </div>

          {/* Rejection By Distribution */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🛑 매칭 거절 주체 분포</h2>
            <div className="space-y-3">
              {failureData && Object.keys(failureData.rejectedByCounts).length > 0 ? (
                Object.entries(failureData.rejectedByCounts).map(([rejector, count]) => {
                  const roleMap: Record<string, string> = {
                    buyer: "매수자 (Buyer)",
                    tenant: "임차인 (Tenant)",
                    owner: "매도/임대인 (Owner)",
                    broker: "중개인 (Broker)",
                  };
                  const pct = Math.round((count / (failureData.totalFailures || 1)) * 100);
                  return (
                    <div key={rejector} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground">{roleMap[rejector] || rejector}</span>
                        <span className="text-muted-foreground font-semibold">{count}건 ({pct}%)</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div className="bg-destructive h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">아직 기록된 거절 정보가 없습니다.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Failure Reasons */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🚨 매칭 불전환(이탈) 주요 사유 TOP 5</h2>
          <div className="space-y-3">
            {failureData && Object.keys(failureData.reasonCounts).length > 0 ? (
              Object.entries(failureData.reasonCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count], idx) => (
                  <div key={reason} className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-xs font-extrabold text-muted-foreground shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-foreground font-semibold flex-1 leading-normal">{reason}</span>
                    <span className="text-sm text-muted-foreground shrink-0 font-bold">{count}건</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">불전환 사유 데이터가 없습니다.</p>
            )}
          </div>
        </div>

        {/* Recent Transitions Timeline */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🕒 최근 파이프라인 전환 로그</h2>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {pipelineData && pipelineData.recentTransitions.length > 0 ? (
              pipelineData.recentTransitions.map((t) => (
                <div key={t.id} className="text-xs border-b border-border pb-3 last:border-b-0 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-primary">
                      {t.from_stage} → {t.to_stage}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-foreground leading-relaxed">
                    <span className="text-muted-foreground">사유:</span> {t.transition_reason || "미지정"} (체류 {t.hold_days}일)
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">최근 파이프라인 전환 이력이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            💡 <strong>특허 출원 기술 (P4)</strong>: 매칭 완료에 도달하지 못한 미완료 단계별 이탈 데이터를 분석하여
            시장 저항대 산출 및 시세 보정에 기여하는 지적자산 관리 시스템입니다.
          </p>
        </div>
      </div>
    </main>
  );
}
