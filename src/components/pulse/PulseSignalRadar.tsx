"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

interface SignalData {
  subject: string;
  value: number; // 0–100
  fullMark?: number;
}

interface PulseSignalRadarProps {
  data: SignalData[];
  className?: string;
  /** Color accent for the radar fill */
  accent?: string;
  title?: string;
}

const DEFAULT_DATA: SignalData[] = [
  { subject: "수요", value: 72 },
  { subject: "공급", value: 45 },
  { subject: "가격", value: 68 },
  { subject: "체감", value: 80 },
  { subject: "파트너", value: 55 },
];

export function PulseSignalRadar({
  data = DEFAULT_DATA,
  className,
  accent = "hsl(217 91% 65%)",
  title,
}: PulseSignalRadarProps) {
  return (
    <div className={cn("w-full", className)}>
      {title && (
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          {title}
        </p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius="70%"
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          <PolarGrid
            stroke="rgba(255,255,255,0.08)"
            radialLines={false}
          />
          <PolarAngleAxis
            dataKey="subject"
            tick={{
              fill: "hsl(var(--muted-foreground))",
              fontSize: 11,
              fontWeight: 500,
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              return (
                <div className="rounded-lg border border-white/10 bg-background/90 backdrop-blur-md px-3 py-2 text-xs shadow-elevation-2">
                  <p className="font-semibold text-foreground">{item.payload.subject}</p>
                  <p className="text-muted-foreground">
                    점수:{" "}
                    <span className="font-bold text-foreground">{item.value}</span>
                    /100
                  </p>
                </div>
              );
            }}
          />
          <Radar
            dataKey="value"
            stroke={accent}
            fill={accent}
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ fill: accent, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: accent, strokeWidth: 2, stroke: "var(--background)" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
