"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { predictFundingSuccess } from "@/domain/prediction/funding-success-predictor";

interface Project {
  id: string;
  project_name: string;
  asset_type: string;
  target_amount: number | string;
  min_investment: number | string;
  expected_return_pct: number | string;
  investment_period_months: number | string;
  risk_level: number | string;
  token_type: string;
  description_memo: string;
  status: string;
  current_amount: number;
  investor_count: number;
  ssot_data?: any;
  gate_level: number;
}

export default function FundingProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/funding/project/${resolvedParams.id}`);
      if (!res.ok) throw new Error("프로젝트를 불러오지 못했습니다.");
      const json = await res.json();
      if (json.ok) {
        setProject(json.data);
        
        // Calculate dynamic funding success prediction
        const target = Number(json.data.target_amount) || 10000000;
        const current = Number(json.data.current_amount) || 0;
        const predResult = await predictFundingSuccess({
          targetAmount: target,
          minInvestment: Number(json.data.min_investment) || 1000000,
          expectedReturnPct: Number(json.data.expected_return_pct) || 7.5,
          investmentPeriodMonths: Number(json.data.investment_period_months) || 12,
          riskLevel: Number(json.data.risk_level) || 3,
          matchedInvestorCount: json.data.investor_count || 0,
          highFitCount: Math.round(json.data.investor_count * 0.4),
          currentAmount: current,
          investorCount: json.data.investor_count || 0,
          daysOpen: 5,
          regulatoryVerified: true,
        });
        setPrediction(predResult);
      } else {
        throw new Error(json.error || "데이터 불러오기 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProject();
  }, [resolvedParams.id]);

  async function handleMatch() {
    setMatchingLoading(true);
    try {
      const res = await fetch("/api/funding/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: resolvedParams.id }),
      });
      const json = await res.json();
      if (json.ok) {
        setMatches(json.data);
      } else {
        throw new Error(json.error || "매칭 실패");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMatchingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground font-semibold">공모 대시보드 로딩 중...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-2xl mx-auto rounded-xl bg-destructive/10 border border-destructive/20 p-6 text-center space-y-4">
          <p className="text-lg font-semibold text-destructive">오류가 발생했습니다</p>
          <p className="text-sm text-muted-foreground">{error || "프로젝트를 찾을 수 없습니다."}</p>
          <Link href="/funding/marketplace" className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/95">
            마켓플레이스로 이동
          </Link>
        </div>
      </main>
    );
  }

  const targetAmt = Number(project.target_amount) || 0;
  const currentAmt = Number(project.current_amount) || 0;
  const progressPct = targetAmt > 0 ? Math.min(100, Math.round((currentAmt / targetAmt) * 100)) : 0;
  const isLocked = typeof project.target_amount === "string" && project.target_amount.includes("🔐");

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-background">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📊 공모 캠페인 대시보드</h1>
            <p className="text-sm text-muted-foreground">
              {project.project_name} ({project.token_type === "sto" ? "토큰증권" : "지분형"})
            </p>
          </div>
          <Link href="/funding/marketplace" className="text-sm font-semibold text-primary hover:underline">
            ← 목록으로 돌아가기
          </Link>
        </div>

        {/* Campaign progress card */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded uppercase mr-2">
                {project.status === "open" ? "공모 진행 중" : project.status}
              </span>
              <span className="text-xs bg-secondary text-secondary-foreground font-semibold px-2 py-0.5 rounded capitalize">
                {project.asset_type === "real_estate" ? "부동산" : project.asset_type}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">참여 투자자 {project.investor_count || 0}명</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-foreground">달성률 {progressPct}%</span>
              <span className="text-muted-foreground">
                {isLocked ? "🔐 인증 필요" : `${(currentAmt / 10000).toLocaleString()}만원 / ${(targetAmt / 10000).toLocaleString()}만원`}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-3">
              <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* AI Success Predictor (Phase 5) */}
        {prediction && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
                🔮 AI 공모 달성 성공률 예측 (Phase 5)
              </h2>
              <span className="text-xs bg-primary/20 text-primary font-semibold px-2.5 py-0.5 rounded-full uppercase">
                {prediction.confidence} 신뢰도
              </span>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center shrink-0">
                <p className="text-4xl font-extrabold text-primary">{prediction.probabilityLabel}</p>
                <p className="text-[10px] text-muted-foreground font-semibold mt-1">예측 성공률</p>
              </div>
              <div className="flex-1 space-y-1 text-xs">
                <p className="font-semibold text-foreground leading-normal">
                  📌 추천 보완 액션: <span className="text-primary font-bold">{prediction.recommendedAction}</span>
                </p>
                <p className="text-muted-foreground leading-relaxed">{prediction.boundaryNote}</p>
              </div>
            </div>

            {/* Top factors */}
            <div className="space-y-2 pt-2 border-t border-primary/10">
              <p className="text-xs font-bold text-muted-foreground">📈 영향도 TOP 요인</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {prediction.topFactors.map((f: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-xs bg-card border border-border p-2 rounded">
                    <span className="text-foreground font-medium">{f.factor}</span>
                    <span className="font-bold text-primary shrink-0">{f.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Project details list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">📋 상세 공모 정보</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between pb-2 border-b border-border">
                <span className="text-muted-foreground">예상 연 수익률:</span>
                <span className="font-semibold text-foreground">{project.expected_return_pct}%</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-border">
                <span className="text-muted-foreground">최소 투자 금액:</span>
                <span className="font-semibold text-foreground">
                  {typeof project.min_investment === "string" ? project.min_investment : `${(Number(project.min_investment) / 10000).toLocaleString()}만원`}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-border">
                <span className="text-muted-foreground">투자기간 (만기):</span>
                <span className="font-semibold text-foreground">{project.investment_period_months}개월</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-border">
                <span className="text-muted-foreground">위험 등급:</span>
                <span className="font-semibold text-rose-500">{project.risk_level}등급 / 5</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">📝 설명 및 규제 현황</h2>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {project.description_memo}
            </p>
          </div>
        </div>

        {/* AI matching engine (Phase 5) */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🎯 투자자 AI 실시간 매칭 (Phase 5)</h2>
            <button
              onClick={handleMatch}
              disabled={matchingLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/95 disabled:opacity-50"
            >
              {matchingLoading ? "AI 분석 중..." : "매칭 매치 실행"}
            </button>
          </div>

          <div className="space-y-3">
            {matches.length > 0 ? (
              matches
                .sort((a, b) => b.score - a.score)
                .map((m, idx) => (
                  <div key={idx} className="border border-border p-4 rounded-lg bg-secondary/20 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-foreground">투자자 ID: {m.profileId.slice(0, 8)}...</span>
                      <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">
                        {m.grade}등급 ({m.score}점)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.reasoning}</p>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                위의 '매칭 매치 실행' 버튼을 누르면 적격 투자자 프로필을 분석하여 최우수 매칭 대상을 도출합니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
