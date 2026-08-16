"use client";

import type { HeroCardData } from "@/domain/building/mobile-im/types";

interface HeroCardProps {
  data: HeroCardData;
}

/** 숫자를 소수점 1자리까지 포맷 */
function fmt(v: number | null | undefined, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${suffix}`;
}

/** SSoT 완성도 점수 → 색상 */
function readinessColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

/** SSoT 완성도 라벨 */
function readinessLabel(score: number): string {
  if (score >= 80) return "투자 검토 가능";
  if (score >= 50) return "보충 자료 필요";
  return "데이터 수집 중";
}

export function HeroCard({ data }: HeroCardProps) {
  // 포스처별 메트릭 존재 여부 판단
  const hasMetrics = (() => {
    if (data.posture === "development") {
      return data.landPricePerPyeong != null || data.zoning != null || !!data.askingPriceDisplay || data.devProfitMarginPct != null;
    }
    if (data.posture === "owner_occupied") {
      return data.totalGrossAreaM2 != null || !!data.askingPriceDisplay || data.equityRequiredBil !== null || data.ownVsLeaseSavingsBil !== null;
    }
    if (data.posture === "operating") {
      return data.gopMarginPct != null || data.adr != null || data.occPct != null || data.revpar != null || data.capRateBase !== null;
    }
    if (data.posture === "trading") {
      return data.pricePerPyeong != null || data.marketDiscountPct != null || !!data.askingPriceDisplay || data.targetHprPct != null;
    }
    // income, undefined
    return (
      data.capRateBase !== null ||
      data.noiBaseBil !== null ||
      data.equityRequiredBil !== null ||
      data.leveragedYieldPct !== null
    );
  })();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-800/60 bg-neutral-900/80 backdrop-blur-xl">
      {/* Gradient top border */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-violet-500" />

      <div className="px-5 pt-5 pb-4">
        {/* Header: Asset type + area */}
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/30">
            {data.assetType || "상업용 자산"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300">
            📍 {data.areaSignal || "핵심 권역"}
          </span>
          {data.askingPriceDisplay && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
              💰 {data.askingPriceDisplay}
            </span>
          )}
        </div>

        {/* 2×2 Metric Grid */}
        {hasMetrics && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {data.posture === "development" ? (
              <>
                <MetricCell
                  label="토지 평당가"
                  value={data.landPricePerPyeong ? `${data.landPricePerPyeong.toLocaleString()}원/평` : "—"}
                  highlight={false}
                />
                <MetricCell
                  label="용도지역"
                  value={data.zoning || "—"}
                  highlight={false}
                />
                <MetricCell
                  label="토지/매각 희망가"
                  value={data.askingPriceDisplay || "미정"}
                  highlight={!!data.askingPriceDisplay}
                />
                <MetricCell
                  label="개발이익률"
                  value={fmt(data.devProfitMarginPct, "%")}
                  highlight={data.devProfitMarginPct != null && data.devProfitMarginPct > 0}
                />
              </>
            ) : data.posture === "owner_occupied" ? (
              <>
                <MetricCell
                  label="건축 연면적"
                  value={data.totalGrossAreaM2 ? `${data.totalGrossAreaM2.toLocaleString()}㎡ (${(data.totalGrossAreaM2 / 3.3058).toFixed(1)}평)` : "—"}
                  highlight={false}
                />
                <MetricCell
                  label="매각 희망가"
                  value={data.askingPriceDisplay || "—"}
                  highlight={true}
                />
                <MetricCell
                  label="자기자본 소요"
                  value={fmt(data.equityRequiredBil, "억")}
                  highlight={false}
                />
                <MetricCell
                  label="자가/임차 절감액"
                  value={fmt(data.ownVsLeaseSavingsBil, "억")}
                  highlight={data.ownVsLeaseSavingsBil != null && data.ownVsLeaseSavingsBil > 0}
                />
              </>
            ) : data.posture === "operating" ? (
              <>
                <MetricCell
                  label="GOP 마진"
                  value={fmt(data.gopMarginPct, "%")}
                  highlight={data.gopMarginPct != null && data.gopMarginPct >= 30}
                />
                <MetricCell
                  label="객단가(ADR)"
                  value={data.adr ? `${data.adr.toLocaleString()}원` : "—"}
                  highlight={false}
                />
                <MetricCell
                  label="가동률(OCC)"
                  value={fmt(data.occPct, "%")}
                  highlight={data.occPct != null && data.occPct >= 70}
                />
                <MetricCell
                  label="RevPAR"
                  value={data.revpar ? `${data.revpar.toLocaleString()}원` : "—"}
                  highlight={false}
                />
              </>
            ) : data.posture === "trading" ? (
              <>
                <MetricCell
                  label="평당 매매가"
                  value={data.pricePerPyeong ? `${data.pricePerPyeong.toLocaleString()}원/평` : "—"}
                  highlight={false}
                />
                <MetricCell
                  label="시세 할인율"
                  value={fmt(data.marketDiscountPct, "%")}
                  highlight={data.marketDiscountPct != null && data.marketDiscountPct > 0}
                />
                <MetricCell
                  label="매각 희망가"
                  value={data.askingPriceDisplay || "—"}
                  highlight={true}
                />
                <MetricCell
                  label="목표 수익률(HPR)"
                  value={fmt(data.targetHprPct, "%")}
                  highlight={false}
                />
              </>
            ) : (
              <>
                <MetricCell
                  label="매각 희망가"
                  value={data.askingPriceDisplay || "—"}
                  highlight={true}
                />
                <MetricCell
                  label="실투자금(내 돈)"
                  value={fmt(data.equityRequiredBil, "억")}
                  highlight={false}
                />
                <MetricCell
                  label="연 순수익률"
                  value={fmt(data.capRateBase, "%")}
                  highlight={data.capRateBase !== null && data.capRateBase >= 3.5}
                />
                <MetricCell
                  label="자기자본수익률"
                  value={fmt(data.leveragedYieldPct, "%")}
                  highlight={data.leveragedYieldPct !== null && data.leveragedYieldPct >= 5}
                />
              </>
            )}
          </div>
        )}

        {/* Investment Point */}
        <div className="mb-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 px-4 py-3">
          <p className="text-xs font-semibold text-blue-400 mb-1">💡 핵심 투자 포인트</p>
          <p className="text-sm sm:text-base font-medium text-neutral-200 leading-relaxed">
            {data.keyInvestmentPoint}
          </p>
        </div>

        {/* Key Risk */}
        {data.keyRisk && (
          <div className="mb-3 rounded-lg bg-gradient-to-r from-red-500/10 to-orange-500/5 border border-red-500/20 px-4 py-3">
            <p className="text-xs font-semibold text-red-400 mb-1">⚠️ 핵심 리스크 및 점검 사항</p>
            <p className="text-sm sm:text-base font-medium text-red-300/90 leading-relaxed">
              {data.keyRisk}
            </p>
          </div>
        )}

        {/* Bottom row: NPV badge + readiness */}
        <div className="flex items-center justify-between">
          {/* NPV Badge */}
          {data.dcf10YearNpvBil !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                data.dcf10YearNpvBil >= 0
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/30"
                  : "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/30"
              }`}
            >
              {data.dcf10YearNpvBil >= 0 ? "📈" : "📉"} 10Y NPV{" "}
              {fmt(data.dcf10YearNpvBil, "억")}
            </span>
          )}

          {/* Readiness Score */}
          <div className="ml-auto flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  data.readinessScore >= 80
                    ? "bg-emerald-500"
                    : data.readinessScore >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${Math.min(data.readinessScore, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-semibold ${readinessColor(data.readinessScore)}`}>
              {readinessLabel(data.readinessScore)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single metric cell inside the 2×2 grid */
function MetricCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div className="rounded-xl bg-neutral-800/60 border border-neutral-700/40 px-3.5 py-3 shadow-sm">
      <p className="text-xs font-medium text-neutral-400 mb-1">{label}</p>
      <p
        className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums ${
          highlight ? "text-emerald-400" : "text-neutral-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
