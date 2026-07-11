"use client";
// src/app/(public)/im-lite/[buildingId]/price-trend-chart.tsx
// [E2] 시세 추이 미니 라인 차트 (SVG 기반, 외부 라이브러리 없음)
// comparable_transactions 배열의 거래일자별 ㎡당 단가 추이를 시각화합니다.

import { useMemo } from "react";

interface Transaction {
  date: string;       // ISO 날짜 문자열
  pricePerSqm: number; // ㎡당 가격 (원)
  pricePerPyeong?: number;
}

interface PriceTrendChartProps {
  transactions: Transaction[];
  targetPricePerSqm: number;
  className?: string;
}

const CHART_WIDTH  = 280;
const CHART_HEIGHT = 100;
const PADDING = { top: 12, right: 12, bottom: 28, left: 52 };

function formatPrice(krw: number): string {
  if (krw >= 1_000_000) return `${(krw / 1_000_000).toFixed(0)}백만`;
  if (krw >= 10_000)    return `${Math.round(krw / 10_000)}만`;
  return krw.toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 7);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PriceTrendChart({ transactions, targetPricePerSqm, className = "" }: PriceTrendChartProps) {
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => a.date.localeCompare(b.date)),
    [transactions]
  );

  if (sorted.length < 2) return null;

  const prices = sorted.map((t) => t.pricePerSqm);
  const allPrices = [...prices, targetPricePerSqm];
  const minPrice = Math.min(...allPrices) * 0.95;
  const maxPrice = Math.max(...allPrices) * 1.05;
  const priceRange = maxPrice - minPrice || 1;

  const innerW = CHART_WIDTH  - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top  - PADDING.bottom;

  const toX = (i: number) =>
    PADDING.left + (i / (sorted.length - 1)) * innerW;
  const toY = (price: number) =>
    PADDING.top + (1 - (price - minPrice) / priceRange) * innerH;

  // 라인 path
  const linePath = sorted
    .map((t, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(t.pricePerSqm).toFixed(1)}`)
    .join(" ");

  // 목표 자산 기준선 Y
  const targetY = toY(targetPricePerSqm);

  // 레이블 (처음, 마지막)
  const firstLabel  = formatDate(sorted[0].date);
  const lastLabel   = formatDate(sorted[sorted.length - 1].date);
  const firstPrice  = formatPrice(sorted[0].pricePerSqm);
  const lastPrice   = formatPrice(sorted[sorted.length - 1].pricePerSqm);

  return (
    <div className={`price-trend-chart ${className}`} style={{ overflowX: "auto" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)", marginBottom: "4px" }}>
        ㎡당 시세 추이 (인근 실거래)
      </p>
      <svg
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        aria-label="권역 시세 추이 차트"
        role="img"
        style={{ display: "block" }}
      >
        {/* 배경 그리드 */}
        {[0, 0.5, 1].map((t) => {
          const y = PADDING.top + t * innerH;
          return (
            <line
              key={t}
              x1={PADDING.left} y1={y}
              x2={PADDING.left + innerW} y2={y}
              stroke="currentColor" strokeOpacity="0.1" strokeWidth="1"
            />
          );
        })}

        {/* 목표 자산 기준선 (빨간 점선) */}
        <line
          x1={PADDING.left} y1={targetY}
          x2={PADDING.left + innerW} y2={targetY}
          stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85"
        />
        <text
          x={PADDING.left + innerW + 2} y={targetY + 4}
          fontSize="9" fill="#ef4444" textAnchor="start"
        >
          본 자산
        </text>

        {/* 추이 라인 */}
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 데이터 포인트 */}
        {sorted.map((t, i) => (
          <circle
            key={i}
            cx={toX(i)} cy={toY(t.pricePerSqm)}
            r="3" fill="#3b82f6"
          />
        ))}

        {/* X축 레이블 (첫/마지막) */}
        <text
          x={toX(0)} y={CHART_HEIGHT - 6}
          fontSize="9" fill="currentColor" opacity="0.6" textAnchor="middle"
        >
          {firstLabel}
        </text>
        <text
          x={toX(sorted.length - 1)} y={CHART_HEIGHT - 6}
          fontSize="9" fill="currentColor" opacity="0.6" textAnchor="middle"
        >
          {lastLabel}
        </text>

        {/* Y축 레이블 (첫/마지막 데이터 포인트 가격) */}
        <text
          x={PADDING.left - 4} y={toY(sorted[0].pricePerSqm) + 4}
          fontSize="9" fill="currentColor" opacity="0.55" textAnchor="end"
        >
          {firstPrice}
        </text>
        <text
          x={PADDING.left - 4} y={toY(sorted[sorted.length - 1].pricePerSqm) + 4}
          fontSize="9" fill="currentColor" opacity="0.55" textAnchor="end"
        >
          {lastPrice}
        </text>
      </svg>
      <p style={{ fontSize: "0.7rem", color: "var(--text-secondary, #888)", marginTop: "2px" }}>
        ※ 인근 유사 거래 {sorted.length}건 기준 | 빨간 점선: 본 자산 ㎡당 단가
      </p>
    </div>
  );
}
