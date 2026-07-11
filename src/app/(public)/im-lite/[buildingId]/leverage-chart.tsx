"use client";
// src/app/(public)/im-lite/[buildingId]/leverage-chart.tsx
// [C4] 자금 구조 분석 — SVG 도넛 차트 (자기자본·보증금·대출)
// 외부 차트 라이브러리 없이 순수 SVG strokeDasharray 기반으로 구현합니다.

import { useMemo } from "react";

interface LeverageChartProps {
  equityBil: number;
  depositBil: number;
  loanBil: number;
  leveragedYieldPct: number | null;
}

interface Segment {
  label: string;
  value: number;
  color: string; // Tailwind-compatible hex
  tailwind: string; // for legend dot
}

const RADIUS = 44;
const CENTER = 60;
const STROKE_WIDTH = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 억원 포맷 */
function formatBil(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}천억`;
  if (Number.isInteger(v)) return `${v}억`;
  return `${v.toFixed(1)}억`;
}

export function LeverageChart({
  equityBil,
  depositBil,
  loanBil,
  leveragedYieldPct,
}: LeverageChartProps) {
  const total = equityBil + depositBil + loanBil;

  const segments: Segment[] = useMemo(
    () =>
      [
        {
          label: "자기자본",
          value: equityBil,
          color: "#0ea5e9", // sky-500
          tailwind: "bg-sky-500",
        },
        {
          label: "보증금",
          value: depositBil,
          color: "#f59e0b", // amber-500
          tailwind: "bg-amber-500",
        },
        {
          label: "대출",
          value: loanBil,
          color: "#f43f5e", // rose-500
          tailwind: "bg-rose-500",
        },
      ].filter((s) => s.value > 0),
    [equityBil, depositBil, loanBil]
  );

  // strokeDasharray/offset 계산
  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return segments.map((seg) => {
      const fraction = seg.value / total;
      const length = fraction * CIRCUMFERENCE;
      // 세그먼트 사이 1px 간격
      const gap = segments.length > 1 ? 2 : 0;
      const arc = {
        ...seg,
        fraction,
        dashArray: `${Math.max(0, length - gap)} ${CIRCUMFERENCE - Math.max(0, length - gap)}`,
        dashOffset: -offset,
      };
      offset += length;
      return arc;
    });
  }, [segments, total]);

  if (total <= 0) return null;

  return (
    <div className="rounded-xl bg-neutral-900 p-4">
      {/* 타이틀 */}
      <h3 className="mb-3 text-sm font-semibold text-white">
        💰 자금 구조 분석
      </h3>

      <div className="flex items-center gap-4">
        {/* SVG 도넛 */}
        <div className="relative flex-shrink-0">
          <svg
            viewBox="0 0 120 120"
            width={120}
            height={120}
            aria-label="자금 구조 도넛 차트"
            role="img"
          >
            {/* 배경 트랙 */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#262626"
              strokeWidth={STROKE_WIDTH}
            />
            {/* 세그먼트 */}
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
                style={{ transition: "stroke-dasharray 0.4s ease" }}
              />
            ))}
            {/* 중앙 텍스트 */}
            <text
              x={CENTER}
              y={CENTER - 5}
              textAnchor="middle"
              fill="#a3a3a3"
              fontSize="8"
            >
              매각가
            </text>
            <text
              x={CENTER}
              y={CENTER + 8}
              textAnchor="middle"
              fill="white"
              fontSize="12"
              fontWeight="600"
            >
              {formatBil(total)}
            </text>
          </svg>
        </div>

        {/* 범례 & 수치 */}
        <div className="flex flex-1 flex-col gap-2 text-xs">
          {arcs.map((arc) => {
            const pct = ((arc.fraction) * 100).toFixed(1);
            return (
              <div key={arc.label} className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${arc.tailwind}`}
                />
                <span className="text-neutral-400">{arc.label}</span>
                <span className="ml-auto font-medium text-white">
                  {formatBil(arc.value)}
                </span>
                <span className="w-10 text-right text-neutral-500">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 레버리지 수익률 뱃지 */}
      {leveragedYieldPct !== null && (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-sky-900/40 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
            레버리지 수익률 {leveragedYieldPct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-neutral-600">
            NOI ÷ 자기자본
          </span>
        </div>
      )}

      {/* 면책 */}
      <p className="mt-2 text-[9px] leading-relaxed text-neutral-600">
        ※ AI 추정값. 실제 자금 구조는 대출 조건·보증금 변동에 따라 달라질 수
        있습니다.
      </p>
    </div>
  );
}
