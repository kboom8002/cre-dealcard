/**
 * src/components/magazine/MonthlyGlassStatCard.tsx
 *
 * 월간 뉴스레터 상단 주요 통계 그래픽 2선 — SOTA 루미너스 프로스티드 글래스 카드뉴스형 데이터 그래픽
 * (에디터 우측 실시간 미리보기 & 고객 공개 뷰어 공용 SSOT)
 *  - Apple Stocks · Toss Securities · Radix Color Scale(Step 1~3 표면 + Step 11~12 잉크) 기반:
 *    고명도 파스텔 오로라 메시 + 프로스티드 펄 글래스(backdrop-blur-xl) + #0F172A(15:1+) 초고대비 타이포그래피로
 *    라이트 워크스페이스(.broker-paper-theme)와 다크 뷰어(.dark) 어디서든 일관된 WCAG AAA 시인성 보장
 */
import React from "react";
import type { MonthlyRegionalChart } from "@/domain/magazine/types";

export type MonthlyGlassStatSize = "preview" | "viewer";

export interface MonthlyGlassStatCardProps {
  index: number;
  chart: MonthlyRegionalChart;
  size?: MonthlyGlassStatSize;
  cardTestId?: string;
  sourceTestId?: string;
}

const STAT_THEMES = [
  {
    glassBackground:
      "radial-gradient(125% 95% at 0% 0%, rgba(186, 230, 253, 0.72) 0%, rgba(255,255,255,0) 60%), radial-gradient(100% 90% at 100% 100%, rgba(199, 210, 254, 0.48) 0%, rgba(255,255,255,0) 62%), linear-gradient(145deg, #F8FCFF 0%, #EAF5FF 100%)",
    glassBorder: "rgba(2, 132, 199, 0.26)",
    glassGlow:
      "0 14px 30px -16px rgba(2, 132, 199, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
    accent: "#0284C7",
    pillBg: "rgba(224, 242, 254, 0.92)",
    pillBorder: "rgba(2, 132, 199, 0.30)",
    pillInk: "#0C4A6E",
    barActive: "linear-gradient(180deg, #0EA5E9 0%, #0284C7 100%)",
    barMuted: "linear-gradient(180deg, #93C5FD 0%, #60A5FA 100%)",
    focalLabelInk: "#0369A1",
  },
  {
    glassBackground:
      "radial-gradient(125% 95% at 100% 0%, rgba(221, 214, 254, 0.72) 0%, rgba(255,255,255,0) 60%), radial-gradient(100% 90% at 0% 100%, rgba(199, 210, 254, 0.50) 0%, rgba(255,255,255,0) 62%), linear-gradient(145deg, #FCFAFF 0%, #F1EEFF 100%)",
    glassBorder: "rgba(99, 102, 241, 0.26)",
    glassGlow:
      "0 14px 30px -16px rgba(99, 102, 241, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
    accent: "#4F46E5",
    pillBg: "rgba(238, 242, 255, 0.92)",
    pillBorder: "rgba(99, 102, 241, 0.30)",
    pillInk: "#312E81",
    barActive: "linear-gradient(180deg, #818CF8 0%, #4F46E5 100%)",
    barMuted: "linear-gradient(180deg, #C4B5FD 0%, #818CF8 100%)",
    focalLabelInk: "#4338CA",
  },
] as const;

const SOURCE_BADGE_LABEL: Record<string, string> = {
  public_db: "공공 DB 실측 집계",
  reference_benchmark: "시장 기준 참고치",
  broker_custom: "중개사 직접 입력",
};

const TITLE_SHADOW = "0 1px 0 rgba(255, 255, 255, 0.88)";

export function MonthlyGlassStatCard({
  index,
  chart,
  size = "viewer",
  cardTestId,
  sourceTestId,
}: MonthlyGlassStatCardProps) {
  const theme = STAT_THEMES[index % STAT_THEMES.length];
  const statNo = String(index + 1).padStart(2, "0");
  const series = Array.isArray(chart.series) ? chart.series : [];

  let maxPrimary = 1;
  for (const pt of series) {
    if (typeof pt.primaryValue === "number" && pt.primaryValue > maxPrimary) {
      maxPrimary = pt.primaryValue;
    }
  }

  const authority =
    chart.authorityLabel ||
    ((chart as unknown as Record<string, unknown>).agencySource as string) ||
    "시장 기준 통계";
  const sourceBadge = chart.sourceMode ? SOURCE_BADGE_LABEL[chart.sourceMode] : null;
  const colCount = Math.max(2, Math.min(6, series.length || 4));
  const isPreview = size === "preview";

  return (
    <div
      data-testid={cardTestId}
      data-card-style="glass"
      data-contrast-tier="wcag-aaa"
      data-source-mode={chart.sourceMode ?? "default"}
      className="relative isolate overflow-hidden rounded-3xl border"
      style={{
        background: theme.glassBackground,
        borderColor: theme.glassBorder,
        boxShadow: theme.glassGlow,
        color: "#0F172A",
      }}
    >
      {/* 상단 하이라이트 라인 & 코너 소프트 오로라 오브 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-18 blur-2xl"
        style={{ background: theme.accent }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.95), rgba(255,255,255,0.2))",
        }}
      />

      <div
        className={`relative m-[3px] rounded-[1.35rem] backdrop-blur-xl space-y-3.5 ${
          isPreview ? "p-4" : "p-5"
        }`}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.62)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.94)",
        }}
      >
        {/* 1. 상단 칩 & 출처 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-black tracking-[0.04em]"
              style={{
                backgroundColor: theme.pillBg,
                borderColor: theme.pillBorder,
                color: theme.pillInk,
              }}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{
                  background: theme.accent,
                  boxShadow: `0 0 6px ${theme.accent}66`,
                }}
              />
              통계 {statNo} · {chart.regionLabel}
            </span>
            {sourceBadge && (
              <span
                className="rounded-full border px-2.5 py-0.5 text-sm font-bold"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.88)",
                  borderColor: "rgba(15, 23, 42, 0.12)",
                  color: "#1E293B",
                }}
              >
                {sourceBadge}
              </span>
            )}
          </div>

          <span
            data-testid={sourceTestId}
            className="text-sm font-semibold"
            style={{ color: "#475569" }}
          >
            {authority} ({chart.asOf})
          </span>
        </div>

        {/* 2. 제목 & 대표 핵심 지표 박스 (좁은 미리보기·모바일 폭에서는 상하 적층으로 세로 줄쪼개짐 원천 차단) */}
        <div
          className={
            isPreview
              ? "flex flex-col gap-2.5"
              : "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
          }
        >
          <div className="min-w-0 flex-1 space-y-1">
            <h3
              className={`break-keep font-extrabold leading-snug text-slate-900 ${
                isPreview ? "text-base" : "text-lg"
              }`}
              style={{
                color: "#0F172A",
                wordBreak: "keep-all",
                textShadow: TITLE_SHADOW,
              }}
            >
              {chart.title}
            </h3>
            {chart.subtitle && (
              <p
                className="break-keep text-sm font-medium"
                style={{ color: "#334155" }}
              >
                {chart.subtitle}
                {chart.unit ? ` · 단위: ${chart.unit}` : ""}
              </p>
            )}
          </div>

          {chart.highlightMetric && (
            <div
              className={`shrink-0 rounded-2xl border px-3.5 py-2.5 backdrop-blur-md ${
                isPreview
                  ? "flex flex-wrap items-baseline justify-between gap-2 w-full"
                  : "flex flex-wrap items-baseline justify-between gap-2 w-full sm:w-auto sm:block sm:text-right"
              }`}
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.86)",
                borderColor: theme.pillBorder,
                boxShadow: "0 2px 8px -4px rgba(15, 23, 42, 0.08)",
              }}
            >
              <span
                className="block text-sm font-semibold"
                style={{ color: "#475569" }}
              >
                {chart.highlightMetric.label}
              </span>
              <div
                className={
                  isPreview
                    ? "flex items-baseline gap-2"
                    : "flex items-baseline gap-2 sm:block"
                }
              >
                <span
                  className="block text-base font-extrabold tabular-nums"
                  style={{ color: "#0F172A" }}
                >
                  {chart.highlightMetric.value}
                </span>
                {chart.highlightMetric.deltaText && (
                  <span
                    className="block text-sm font-bold"
                    style={{ color: "#047857" }}
                  >
                    {chart.highlightMetric.deltaText}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. 막대 비교 그래픽 */}
        {series.length > 0 ? (
          <div
            className="rounded-2xl border px-3 py-3.5 space-y-2.5"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.80)",
              borderColor: "rgba(15, 23, 42, 0.10)",
            }}
          >
            {chart.referenceLine && (
              <div
                data-testid={cardTestId ? `${cardTestId}-ref-line` : undefined}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-1.5"
                style={{
                  backgroundColor: theme.pillBg,
                  borderColor: theme.pillBorder,
                  color: theme.pillInk,
                }}
              >
                <span className="text-sm font-extrabold">
                  {chart.referenceLine.label}
                </span>
                <span className="text-sm font-black tabular-nums">
                  {chart.referenceLine.displayValue}
                </span>
              </div>
            )}
            <div
              className="grid items-end gap-2 pt-2"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                minHeight: isPreview ? "7.5rem" : "8.5rem",
              }}
            >
              {series.map((pt, idx) => {
                const rawPct = Math.round((pt.primaryValue / maxPrimary) * 100);
                const barHeightPx = Math.max(
                  20,
                  Math.min(isPreview ? 64 : 76, Math.round(((isPreview ? 64 : 76) * Math.max(24, rawPct)) / 100)),
                );
                const isFocal =
                  pt.displaySecondary === "선택 권역" || idx === series.length - 1;
                const primaryText = pt.displayPrimary || String(pt.primaryValue);
                const secondaryText =
                  pt.displaySecondary ||
                  (pt.secondaryValue !== undefined ? String(pt.secondaryValue) : "");

                return (
                  <div
                    key={`${pt.label}-${idx}`}
                    data-testid="monthly-stat-bar"
                    className="flex flex-col items-center justify-end gap-1 text-center"
                  >
                    <span
                      className="text-sm font-extrabold tabular-nums leading-tight"
                      style={{ color: isFocal ? theme.pillInk : "#0F172A" }}
                    >
                      {primaryText}
                    </span>
                    <div
                      className="w-full max-w-[44px] rounded-t-lg transition-all"
                      style={{
                        height: `${barHeightPx}px`,
                        background: isFocal ? theme.barActive : theme.barMuted,
                        boxShadow: isFocal ? `0 4px 12px -2px ${theme.accent}55` : undefined,
                      }}
                    />
                    <span
                      className="mt-0.5 text-sm font-bold leading-tight break-keep"
                      style={{ color: "#1E293B" }}
                    >
                      {pt.label}
                    </span>
                    {secondaryText && (
                      <span
                        className="text-sm font-semibold tabular-nums leading-tight break-keep"
                        style={{ color: isFocal ? theme.focalLabelInk : "#475569" }}
                      >
                        {secondaryText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl border px-3.5 py-3 text-sm font-medium"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.80)",
              borderColor: "rgba(15, 23, 42, 0.10)",
              color: "#334155",
            }}
          >
            {chart.placeholderNotice || chart.buyerImplication}
          </div>
        )}

        {/* 4. 매수자 핵심 시사점 */}
        {chart.buyerImplication && series.length > 0 && (
          <div
            className="rounded-2xl border px-3.5 py-2.5 text-sm font-medium leading-relaxed break-keep"
            style={{
              backgroundColor: "rgba(236, 253, 245, 0.88)",
              borderColor: "rgba(5, 150, 105, 0.26)",
              color: "#064E3B",
            }}
          >
            <strong className="font-extrabold" style={{ color: "#065F46" }}>
              💡 매수자 체크포인트:
            </strong>{" "}
            {chart.buyerImplication}
          </div>
        )}
      </div>
    </div>
  );
}
