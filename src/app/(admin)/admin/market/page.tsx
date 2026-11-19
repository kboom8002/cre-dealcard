import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";
import { createServiceClient } from "@/lib/supabase/service";
import { MarketIndicatorEngine } from "@/domain/analytics/market-indicator-engine";

export const metadata: Metadata = {
  title: "시장 선행 지표 | 관리자",
  description: "권역별 수요/공급 스냅샷 및 시세 저항선 분석",
};

interface MarketIndicatorRow {
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
  } | null;
  absorption_rate: number;
  trend_direction: "up" | "flat" | "down";
  computed_at: string;
}

async function recalculateIndicatorsAction() {
  "use server";
  await requireAdminRsc();
  const supabase = createServiceClient();
  const engine = new MarketIndicatorEngine(supabase);
  const regions = ["GBD", "CBD", "YBD", "Other"];
  const assetTypes = ["office", "retail", "warehouse", "other"];

  for (const r of regions) {
    for (const a of assetTypes) {
      await engine.generateSnapshot(r, a);
    }
  }
  revalidatePath("/admin/market");
}

export default async function AdminMarketPage() {
  await requireAdminRsc();

  let indicators: MarketIndicatorRow[] = [];
  let loadFailed = false;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("market_leading_indicators")
      .select("*")
      .order("computed_at", { ascending: false });

    if (error) {
      loadFailed = true;
    } else {
      indicators = (data ?? []) as MarketIndicatorRow[];
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
              📈 시장 선행 지표 대시보드
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              매칭 분석 및 미완료 파이프라인에서 추출한 시장 경향 지표
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-blue-700 hover:underline shrink-0"
          >
            ← 관리자 콘솔
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xs">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">실시간 선행 지표 수동 생성</h2>
            <p className="text-sm text-slate-600">
              마지막 계산 일시:{" "}
              {indicators[0]
                ? new Date(indicators[0].computed_at).toLocaleString("ko-KR")
                : "없음"}
            </p>
          </div>
          <form action={recalculateIndicatorsAction} className="w-full md:w-auto">
            <button
              type="submit"
              className="w-full md:w-auto min-h-[44px] px-5 py-2.5 bg-blue-700 text-white rounded-lg text-sm font-bold shadow-xs hover:bg-blue-800 transition-colors cursor-pointer"
            >
              🚀 시장 선행 지표 재생성
            </button>
          </form>
        </div>

        {loadFailed && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-800">
            ⚠️ 시장 지표 데이터를 불러오지 못했습니다. 서비스 키 및 테이블 상태를 확인해 주세요.
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            🗺️ 권역별 / 자산별 선행 지표 현황
          </h2>

          {indicators.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {indicators.map((ind) => {
                const trendEmoji =
                  ind.trend_direction === "up"
                    ? "📈"
                    : ind.trend_direction === "down"
                      ? "📉"
                      : "➡️";
                const trendText =
                  ind.trend_direction === "up"
                    ? "수요 증가"
                    : ind.trend_direction === "down"
                      ? "공급 우위"
                      : "보합세";
                const trendColor =
                  ind.trend_direction === "up"
                    ? "text-emerald-700"
                    : ind.trend_direction === "down"
                      ? "text-rose-700"
                      : "text-slate-600";

                return (
                  <div
                    key={ind.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm bg-blue-50 text-blue-800 border border-blue-200 font-bold px-2.5 py-0.5 rounded">
                          {ind.region}
                        </span>
                        <span className="text-sm bg-slate-100 text-slate-800 border border-slate-200 font-semibold px-2.5 py-0.5 rounded">
                          {ind.asset_type === "office"
                            ? "오피스"
                            : ind.asset_type === "retail"
                              ? "리테일"
                              : ind.asset_type === "warehouse"
                                ? "물류센터"
                                : "기타"}
                        </span>
                      </div>
                      <span className={`text-sm font-bold ${trendColor} flex items-center gap-1`}>
                        {trendEmoji} {trendText}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-sm text-slate-600 font-semibold">수요 강도</p>
                        <p className="text-lg font-extrabold text-slate-900">{ind.demand_score}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-sm text-slate-600 font-semibold">공급 강도</p>
                        <p className="text-lg font-extrabold text-slate-900">{ind.supply_score}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center space-y-0.5">
                        <p className="text-sm text-slate-600 font-semibold">매칭 흡수율</p>
                        <p className="text-lg font-extrabold text-blue-700">{ind.absorption_rate}%</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">평균 매칭 체류 일수:</span>
                        <span className="font-semibold text-slate-900">{ind.avg_hold_days}일</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">평균 불전환 가격 갭:</span>
                        <span className="font-semibold text-slate-900">
                          {ind.price_resistance_band?.avgPriceGapPct || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">가격 이탈 저항 임계선:</span>
                        <span className="font-semibold text-rose-700">
                          {ind.price_resistance_band?.resistanceThresholdPct || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-4 shadow-xs">
              <p className="text-sm text-slate-600">시장 선행 지표 데이터가 비어 있습니다.</p>
              <form action={recalculateIndicatorsAction}>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 cursor-pointer"
                >
                  지표 재생성하기
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 shadow-xs">
          <p className="text-sm text-slate-700 leading-relaxed">
            💡 <strong className="text-slate-900">선행 지표 분석 기준</strong>: 단순 거래 완료 결과만이 아니라,
            완료되지 않은 매수/임차인 매칭 이력, 체류 기간, 가격 저항 한계를 분석하여
            시장 변동성을 진단합니다.
          </p>
        </div>
      </div>
    </main>
  );
}
