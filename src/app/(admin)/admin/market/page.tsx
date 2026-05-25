"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MarketIndicator {
  id: string;
  region: string;
  asset_type: string;
  period_start: string;
  period_end: string;
  demand_score: number;
  supply_score: number;
  avg_hold_days: number;
  conversion_rate: number;
  price_resistance_band: {
    avgPriceGapPct: number;
    resistanceThresholdPct: number;
  };
  absorption_rate: number;
  trend_direction: "up" | "flat" | "down";
  computed_at: string;
}

export default function AdminMarketPage() {
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchIndicators() {
    try {
      const res = await fetch("/api/admin/market-indicators");
      if (!res.ok) throw new Error("시장 지표를 가져오는 중 오류가 발생했습니다.");
      const json = await res.json();
      if (json.ok) {
        setIndicators(json.data);
      } else {
        throw new Error(json.error || "시장 지표 데이터 가져오기 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchIndicators();
  }, []);

  async function handleRecalculate() {
    setComputing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/market-indicators", {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setMessage(json.message || "시장 선행 지표가 전 권역에 대해 재생성되었습니다.");
        fetchIndicators();
      } else {
        throw new Error(json.error || "시장 지표 생성 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">실시간 시장 선행 지표 분석 중...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-background">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📈 시장 선행 지표 대시보드</h1>
            <p className="text-sm text-muted-foreground">
              매칭 분석 및 미완료 파이프라인에서 추출한 초정밀 시장 경향
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
            ← 관리자 콘솔
          </Link>
        </div>

        {/* Action Panel */}
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">실시간 선행 지표 수동 생성</h2>
            <p className="text-xs text-muted-foreground">
              마지막 계산 일시: {indicators[0] ? new Date(indicators[0].computed_at).toLocaleString("ko-KR") : "없음"}
            </p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={computing}
            className="w-full md:w-auto px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-md hover:bg-primary/95 transition-all disabled:opacity-50"
          >
            {computing ? "AI 시장 데이터 분석 중..." : "🚀 시장 선행 지표 재생성"}
          </button>
        </div>

        {/* Notifications */}
        {message && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✅ {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            ⚠️ {error}
          </div>
        )}

        {/* Region & Asset Type Map */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">🗺️ 권역별 / 자산별 선행 지표 현황</h2>

          {indicators.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {indicators.map((ind) => {
                const trendEmoji = ind.trend_direction === "up" ? "📈" : ind.trend_direction === "down" ? "📉" : "➡️";
                const trendText = ind.trend_direction === "up" ? "수요 폭발" : ind.trend_direction === "down" ? "공급 초과" : "보합세";
                const trendColor = ind.trend_direction === "up" ? "text-green-600" : ind.trend_direction === "down" ? "text-red-500" : "text-muted-foreground";

                return (
                  <div key={ind.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded mr-2">
                          {ind.region}
                        </span>
                        <span className="text-xs bg-secondary text-secondary-foreground font-semibold px-2 py-0.5 rounded capitalize">
                          {ind.asset_type === "office" ? "오피스" : ind.asset_type === "retail" ? "리테일" : ind.asset_type === "warehouse" ? "물류센터" : "기타"}
                        </span>
                      </div>
                      <span className={`text-xs font-bold ${trendColor} flex items-center gap-1`}>
                        {trendEmoji} {trendText}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-secondary/40 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-[10px] text-muted-foreground font-semibold">수요 강도</p>
                        <p className="text-lg font-extrabold text-foreground">{ind.demand_score}</p>
                      </div>
                      <div className="bg-secondary/40 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-[10px] text-muted-foreground font-semibold">공급 강도</p>
                        <p className="text-lg font-extrabold text-foreground">{ind.supply_score}</p>
                      </div>
                      <div className="bg-secondary/40 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-[10px] text-muted-foreground font-semibold">매칭 흡수율</p>
                        <p className="text-lg font-extrabold text-primary">{ind.absorption_rate}%</p>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">평균 매칭 체류 일수:</span>
                        <span className="font-semibold text-foreground">{ind.avg_hold_days}일</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">평균 불전환 가격 갭:</span>
                        <span className="font-semibold text-foreground">
                          {ind.price_resistance_band?.avgPriceGapPct || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">가격 이탈 저항 임계선:</span>
                        <span className="font-semibold text-rose-500">
                          {ind.price_resistance_band?.resistanceThresholdPct || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-12 text-center space-y-4">
              <p className="text-sm text-muted-foreground">시장 선행 지표 데이터가 비어 있습니다.</p>
              <button
                onClick={handleRecalculate}
                disabled={computing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/95"
              >
                지표 재생성하기
              </button>
            </div>
          )}
        </div>

        {/* Patent Claim Summary */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            💡 <strong>독보적 특허 우위 (Unfair Advantage)</strong>: 단순 거래 완료 결과만이 아니라,
            완료되지 않은 매수/임차인 매칭의 이력, 체류 기간, 가격 저항 한계를 입체적으로 마이닝하여
            시장 변동성을 예측하는 차세대 선행 지표 분석 엔진입니다.
          </p>
        </div>
      </div>
    </main>
  );
}
