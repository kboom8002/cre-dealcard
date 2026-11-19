"use client";
// src/app/(public)/im-lite/[buildingId]/dcf-heatmap.tsx
// [C2] 10년 DCF 민감도 분석 히트맵 (3×3 매트릭스)
// 할인율(WACC) × Exit Cap Rate 시나리오별 NPV/IRR을 색상으로 시각화합니다.

import { useMemo } from "react";
import type {
  DCFOutputs,
  SensitivityMatrixCell,
} from "@/domain/building/mobile-im/dcf-sensitivity";

interface DCFHeatmapProps {
  dcfOutputs: DCFOutputs;
  waccBase: number; // base WACC for display (e.g. 0.062)
}

/** NPV(원) → 억원 문자열 */
function formatBil(krw: number): string {
  const bil = krw / 1e8;
  if (Math.abs(bil) >= 10) return `${bil >= 0 ? "+" : ""}${Math.round(bil)}억`;
  return `${bil >= 0 ? "+" : ""}${bil.toFixed(1)}억`;
}

/** IRR → 표시 문자열 */
function formatIrr(irr: number | null): string {
  if (irr === null) return "—";
  return `${irr.toFixed(1)}%`;
}

/** NPV 기반 셀 배경색 (Tailwind 클래스 — D3 Daylight) */
function getCellColor(npv: number): string {
  if (npv > 0) {
    // 양수: emerald 계열, 크기에 따라 채도 차등
    return npv > 5e8
      ? "bg-[#D1FAE5] text-[#065F46]"
      : "bg-[#ECFDF5] text-[#047857]";
  }
  if (npv < 0) {
    // 음수: rose 계열
    return npv < -5e8
      ? "bg-[#FFE4E6] text-[#991B1B]"
      : "bg-[#FFF1F2] text-[#BE123C]";
  }
  // 0 근방: amber
  return "bg-[#FEF3C7] text-[#92400E]";
}

export function DCFHeatmap({ dcfOutputs, waccBase }: DCFHeatmapProps) {
  const { sensitivityMatrix } = dcfOutputs;

  // 3×3 그리드로 재구성 (rows = discount rates, cols = exit cap rates)
  const grid = useMemo(() => {
    const rows: SensitivityMatrixCell[][] = [];
    for (let r = 0; r < 3; r++) {
      rows.push(sensitivityMatrix.slice(r * 3, r * 3 + 3));
    }
    return rows;
  }, [sensitivityMatrix]);

  // 고유 exit cap rate 라벨 (첫 행에서 추출)
  const capLabels = useMemo(() => {
    if (grid.length === 0 || grid[0].length === 0) return [];
    return grid[0].map((c) => `${(c.rentGrowthRate * 100).toFixed(1)}%`);
  }, [grid]);

  // 할인율 라벨
  const drLabels = useMemo(() => {
    return grid.map((row) => {
      if (row.length === 0) return "";
      return `${(row[0].discountRate * 100).toFixed(1)}%`;
    });
  }, [grid]);

  const waccPct = (waccBase * 100).toFixed(1);

  if (sensitivityMatrix.length !== 9) return null;

  return (
    <div className="rounded-xl bg-white border border-[#CBD5E1] p-4 shadow-2xs">
      {/* 타이틀 */}
      <h3 className="mb-1 text-base font-extrabold text-[#0F172A]">
        📊 10년 DCF 민감도 분석
      </h3>
      <p className="mb-3 text-sm text-[#475569]">
        WACC {waccPct}% 기준 | 할인율 × 임대료 상승률
      </p>

      {/* 히트맵 테이블 */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[280px] border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className="p-1.5 text-sm font-semibold text-[#64748B]">
                할인율 ＼ 상승률
              </th>
              {capLabels.map((label, i) => (
                <th
                  key={i}
                  className={`p-1.5 text-sm font-bold ${
                    i === 1 ? "text-[#1D4ED8]" : "text-[#475569]"
                  }`}
                >
                  {label}
                  {i === 0 && (
                    <span className="block text-sm font-normal text-[#64748B]">
                      −50bp
                    </span>
                  )}
                  {i === 1 && (
                    <span className="block text-sm font-semibold text-[#1D4ED8]">Base</span>
                  )}
                  {i === 2 && (
                    <span className="block text-sm font-normal text-[#64748B]">
                      +50bp
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                {/* 행 헤더: 할인율 */}
                <td
                  className={`p-1.5 text-sm font-bold whitespace-nowrap ${
                    ri === 1 ? "text-[#1D4ED8]" : "text-[#475569]"
                  }`}
                >
                  {drLabels[ri]}
                  <span className="block text-sm font-normal">
                    {ri === 0 ? (
                      <span className="text-[#64748B]">−1%p</span>
                    ) : ri === 1 ? (
                      <span className="font-semibold text-[#1D4ED8]">Base</span>
                    ) : (
                      <span className="text-[#64748B]">+1%p</span>
                    )}
                  </span>
                </td>
                {/* 데이터 셀 */}
                {row.map((cell, ci) => {
                  const isCenter = ri === 1 && ci === 1;
                  return (
                    <td
                      key={ci}
                      className={`p-2 rounded-md border border-white ${getCellColor(cell.npv)} ${
                        isCenter
                          ? "ring-2 ring-[#1D4ED8] ring-offset-1 ring-offset-white"
                          : ""
                      }`}
                    >
                      <div className="text-sm font-bold leading-tight tabular-nums">
                        {formatBil(cell.npv)}
                      </div>
                      <div className="mt-0.5 text-sm opacity-90 tabular-nums">
                        IRR {formatIrr(cell.irr)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#475569]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#059669]" />
          NPV &gt; 0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#D97706]" />
          NPV ≈ 0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#E11D48]" />
          NPV &lt; 0
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-semibold text-[#1D4ED8]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-[#1D4ED8]" />
          Base
        </span>
      </div>

      {/* 면책 */}
      <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
        ※ AI 추정값으로 참고용입니다. 실제 수익률은 임대차 조건, 공실률, 금리,
        세금 등에 따라 상이할 수 있습니다.
      </p>
    </div>
  );
}
