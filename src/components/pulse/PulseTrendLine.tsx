"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

interface TrendPoint {
  label: string; // e.g. "5/1"
  score: number; // 0–100
}

interface PulseTrendLineProps {
  data: TrendPoint[];
  className?: string;
  accent?: string;
  referenceScore?: number; // e.g. market average
  height?: number;
  showGrid?: boolean;
}

export function PulseTrendLine({
  data,
  className,
  accent = "hsl(217 91% 65%)",
  referenceScore,
  height = 120,
  showGrid = false,
}: PulseTrendLineProps) {
  const gradientId = "pulse-trend-gradient";

  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -28 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
          )}

          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />

          {referenceScore !== undefined && (
            <ReferenceLine
              y={referenceScore}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
              label={{
                value: "평균",
                position: "right",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 9,
              }}
            />
          )}

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as TrendPoint;
              return (
                <div className="rounded-lg border border-white/10 bg-background/90 backdrop-blur-md px-3 py-2 text-xs shadow-elevation-2">
                  <p className="text-muted-foreground mb-0.5">{d.label}</p>
                  <p className="font-bold text-foreground" style={{ color: accent }}>
                    펄스 {d.score}
                  </p>
                </div>
              );
            }}
          />

          <Area
            type="monotone"
            dataKey="score"
            stroke={accent}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: accent, stroke: "var(--background)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
