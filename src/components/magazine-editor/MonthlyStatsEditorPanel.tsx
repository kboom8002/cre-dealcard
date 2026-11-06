"use client";

import React from "react";
import { BarChart3, Check, MapPin, TrendingUp } from "lucide-react";
import type { MonthlyRegionalChart } from "@/domain/magazine/types";
import {
  MONTHLY_CHART_TYPE_META,
  MONTHLY_REGION_PRESETS,
  getMonthlyChartsForRegion,
  normalizeMonthlyRegionKey,
  type MonthlyChartType,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import { editorToast } from "@/components/magazine-editor/editor-toaster";

export interface MonthlyStatsEditorPanelProps {
  monthlyRegion: string;
  onChangeRegion: (regionKey: MonthlyRegionKey, charts: MonthlyRegionalChart[]) => void;
  monthlyCharts: MonthlyRegionalChart[];
  onChangeCharts: (charts: MonthlyRegionalChart[]) => void;
}

const CHART_PAIR_PRESETS: readonly {
  id: string;
  label: string;
  pair: readonly [MonthlyChartType, MonthlyChartType];
  badge: string;
}[] = [
  {
    id: "molit_reb",
    label: "① 국토부 실거래량·평당가 + ② 부동산원 공실률·Cap Rate",
    pair: ["molit_tx_price_trend", "reb_vacancy_cap_spread"],
    badge: "추천 기본",
  },
  {
    id: "molit_kosis",
    label: "① 국토부 실거래량·평당가 + ② 통계청(KOSIS) 상권 활력지수",
    pair: ["molit_tx_price_trend", "kosis_commercial_vitality"],
    badge: "실거래+상권",
  },
  {
    id: "reb_kosis",
    label: "① 부동산원 공실률·Cap Rate + ② 통계청(KOSIS) 상권 활력지수",
    pair: ["reb_vacancy_cap_spread", "kosis_commercial_vitality"],
    badge: "수익률+임차",
  },
] as const;

export function MonthlyStatsEditorPanel({
  monthlyRegion,
  onChangeRegion,
  monthlyCharts,
  onChangeCharts,
}: MonthlyStatsEditorPanelProps) {
  const activeRegionKey = normalizeMonthlyRegionKey(monthlyRegion);
  const activeCharts =
    monthlyCharts.length >= 2
      ? monthlyCharts.slice(0, 2)
      : getMonthlyChartsForRegion(activeRegionKey);

  const currentPairKey = `${activeCharts[0]?.chartType ?? "molit_tx_price_trend"}_${activeCharts[1]?.chartType ?? "reb_vacancy_cap_spread"}`;

  const handleSelectRegion = (regionKey: MonthlyRegionKey) => {
    const pair: [MonthlyChartType, MonthlyChartType] = [
      (activeCharts[0]?.chartType as MonthlyChartType) ?? "molit_tx_price_trend",
      (activeCharts[1]?.chartType as MonthlyChartType) ?? "reb_vacancy_cap_spread",
    ];
    const nextCharts = getMonthlyChartsForRegion(regionKey, pair);
    onChangeRegion(regionKey, nextCharts);
    const label = MONTHLY_REGION_PRESETS.find((r) => r.key === regionKey)?.shortLabel ?? regionKey;
    editorToast.success(`${label} 권역 국토부·통계청 월간 통계 2건으로 갱신했습니다.`);
  };

  const handleSelectPair = (pair: readonly [MonthlyChartType, MonthlyChartType]) => {
    const nextCharts = getMonthlyChartsForRegion(activeRegionKey, pair);
    onChangeCharts(nextCharts);
    editorToast.success("월간 통계 그래프 2종 구성을 변경했습니다.");
  };

  const handleUpdateImplication = (idx: number, text: string) => {
    const next = activeCharts.map((c, i) => (i === idx ? { ...c, buyerImplication: text } : c));
    onChangeCharts(next);
  };

  return (
    <div data-testid="monthly-stats-editor-panel" className="space-y-4">
      {/* 1. 권역 선택 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-700" aria-hidden="true" />
          <h2 className="text-base font-extrabold text-slate-900">
            ① 월간 브리핑 대상 권역 선택
          </h2>
          <span className="ml-auto rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
            국토부·통계청 공식 지표 연동
          </span>
        </div>
        <p className="text-xs font-medium text-slate-600">
          권역을 선택하면 해당 권역 매수자가 가장 관심 갖는 <strong>국토교통부 실거래가·임대동향 및 통계청(KOSIS) 상권 지표 2건</strong>이 자동 구성됩니다.
        </p>

        <div
          role="group"
          aria-label="월간 통계 권역 프리셋 선택"
          className="grid grid-cols-2 sm:grid-cols-5 gap-2"
        >
          {MONTHLY_REGION_PRESETS.map((preset) => {
            const isSelected = preset.key === activeRegionKey;
            return (
              <button
                key={preset.key}
                type="button"
                data-testid={`monthly-region-btn-${preset.key}`}
                aria-pressed={isSelected}
                onClick={() => handleSelectRegion(preset.key)}
                className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                  isSelected
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                    : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                <span>{preset.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 통계 그래프 2종 조합 프리셋 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2.5">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-blue-700" aria-hidden="true" />
          <h3 className="text-sm font-extrabold text-slate-900">
            ② 매수자 관심 통계 그래프 2건 조합
          </h3>
        </div>
        <div className="space-y-1.5">
          {CHART_PAIR_PRESETS.map((preset) => {
            const key = `${preset.pair[0]}_${preset.pair[1]}`;
            const isSelected = currentPairKey === key;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`monthly-chart-pair-${preset.id}`}
                aria-pressed={isSelected}
                onClick={() => handleSelectPair(preset.pair)}
                className={`w-full min-h-11 rounded-xl border px-3.5 py-2.5 text-left transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-blue-50 border-blue-600 text-blue-950"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="text-xs sm:text-sm font-extrabold">{preset.label}</span>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                    isSelected ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {preset.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 선택된 통계 그래프 2건 상세 확인 & 매수자 시사점 편집 */}
      <div className="space-y-3.5">
        {activeCharts.map((chart, idx) => {
          const maxPrimary = Math.max(...chart.series.map((s) => s.primaryValue), 1);
          const typeMeta = MONTHLY_CHART_TYPE_META[chart.chartType];
          return (
            <div
              key={chart.id}
              data-testid={`monthly-chart-editor-card-${idx}`}
              className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg bg-emerald-700 text-white px-2.5 py-1 text-xs font-extrabold">
                    통계 그래프 0{idx + 1}
                  </span>
                  <span className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                    {chart.authorityLabel}
                  </span>
                </div>
                <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
                  {chart.highlightMetric.value} ({chart.highlightMetric.deltaText})
                </span>
              </div>

              <div>
                <h4 className="text-base font-extrabold text-slate-900">{chart.title}</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {typeMeta?.buyerReason ?? chart.subtitle}
                </p>
              </div>

              {/* 미니 바 차트 미리보기 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                {chart.series.map((pt, sIdx) => {
                  const widthPct = Math.max(15, Math.min(100, Math.round((pt.primaryValue / maxPrimary) * 100)));
                  return (
                    <div key={sIdx} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <span className="col-span-3 font-bold text-slate-700 truncate">{pt.label}</span>
                      <div className="col-span-6 h-4 rounded-md bg-slate-200/80 overflow-hidden">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className="h-full rounded-md bg-gradient-to-r from-blue-600 to-emerald-600"
                        />
                      </div>
                      <span className="col-span-3 text-right font-mono font-extrabold text-slate-900 truncate">
                        {pt.displayPrimary}
                        {pt.displaySecondary ? ` · ${pt.displaySecondary}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 매수자 시사점 1줄 해설 편집 */}
              <div className="space-y-1">
                <label
                  htmlFor={`monthly-chart-implication-${idx}`}
                  className="flex items-center gap-1 text-xs font-extrabold text-slate-800"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  <span>매수자 핵심 시사점 (그래프 하단 1~2문장 해설)</span>
                </label>
                <textarea
                  id={`monthly-chart-implication-${idx}`}
                  rows={2}
                  value={chart.buyerImplication}
                  onChange={(e) => handleUpdateImplication(idx, e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-600 resize-y"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
