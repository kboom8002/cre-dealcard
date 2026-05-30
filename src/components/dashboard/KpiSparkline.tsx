"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SparklinePoint {
  value: number;
}

interface KpiSparklineProps {
  /** Main KPI value (current) */
  value: number;
  /** Optional: previous value for delta calculation */
  previousValue?: number;
  /** Trend data (last 7 days) */
  data?: SparklinePoint[];
  label?: string;
  unit?: string;
  className?: string;
  /** If true, higher is better (default). If false, lower is better. */
  higherIsBetter?: boolean;
}

export function KpiSparkline({
  value,
  previousValue,
  data,
  label,
  unit = "",
  className,
  higherIsBetter = true,
}: KpiSparklineProps) {
  const delta =
    previousValue !== undefined ? value - previousValue : undefined;
  const deltaPercent =
    delta !== undefined && previousValue
      ? Math.round((delta / previousValue) * 100)
      : undefined;

  const isPositive =
    delta !== undefined
      ? higherIsBetter
        ? delta > 0
        : delta < 0
      : null;

  const trendColor =
    isPositive === null
      ? "hsl(var(--muted-foreground))"
      : isPositive
        ? "hsl(160 84% 39%)"
        : "hsl(0 84% 60%)";

  const chartColor =
    isPositive === null
      ? "hsl(var(--primary))"
      : isPositive
        ? "hsl(160 84% 39%)"
        : "hsl(0 84% 60%)";

  const TrendIcon =
    isPositive === null ? Minus : isPositive ? TrendingUp : TrendingDown;

  return (
    <div className={cn("flex items-end justify-between gap-2", className)}>
      {/* Left: value + delta */}
      <div className="min-w-0">
        {label && (
          <p className="text-xs text-muted-foreground mb-0.5 truncate">{label}</p>
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-foreground leading-none">
            {value.toLocaleString("ko-KR")}
          </span>
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
        {deltaPercent !== undefined && (
          <div
            className="flex items-center gap-0.5 mt-1"
            style={{ color: trendColor }}
          >
            <TrendIcon className="w-3 h-3 shrink-0" strokeWidth={2.5} />
            <span className="text-xs font-semibold">
              {delta! > 0 ? "+" : ""}
              {deltaPercent}%
            </span>
            <span className="text-xs text-muted-foreground ml-0.5">전주 대비</span>
          </div>
        )}
      </div>

      {/* Right: sparkline */}
      {data && data.length > 0 && (
        <div className="w-20 h-12 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-md border border-white/10 bg-background/90 backdrop-blur-md px-2 py-1 text-xs shadow-elevation-2">
                      {payload[0].value}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: chartColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
