"use client";

import type { HeroCardData } from "@/domain/building/mobile-im/types";

interface HeroCardProps {
  data: HeroCardData;
}

/** 숫자를 소수점 1자리까지 포맷 */
function fmt(v: number | null, suffix = ""): string {
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
  const hasMetrics =
    data.capRateBase !== null ||
    data.noiBaseBil !== null ||
    data.equityRequiredBil !== null ||
    data.leveragedYieldPct !== null;

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
            <MetricCell
              label="Cap Rate"
              value={fmt(data.capRateBase, "%")}
              highlight={data.capRateBase !== null && data.capRateBase >= 4}
            />
            <MetricCell
              label="NOI (연간)"
              value={fmt(data.noiBaseBil, "억")}
              highlight={false}
            />
            <MetricCell
              label="자기자본"
              value={fmt(data.equityRequiredBil, "억")}
              highlight={false}
            />
            <MetricCell
              label="레버리지 수익률"
              value={fmt(data.leveragedYieldPct, "%")}
              highlight={data.leveragedYieldPct !== null && data.leveragedYieldPct >= 6}
            />
          </div>
        )}

        {/* Investment Point */}
        <div className="mb-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 px-4 py-3">
          <p className="text-xs text-neutral-500 mb-1">💡 핵심 투자 포인트</p>
          <p className="text-sm font-medium text-neutral-200 leading-relaxed">
            {data.keyInvestmentPoint}
          </p>
        </div>

        {/* Key Risk */}
        <div className="mb-3 rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-2.5">
          <p className="text-xs text-amber-500/80">
            ⚠️ {data.keyRisk}
          </p>
        </div>

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
            <span className={`text-xs font-medium ${readinessColor(data.readinessScore)}`}>
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
    <div className="rounded-lg bg-neutral-800/50 px-3 py-2.5">
      <p className="text-[11px] text-neutral-500 mb-0.5">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${
          highlight ? "text-emerald-400" : "text-neutral-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
