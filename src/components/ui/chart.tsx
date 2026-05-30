"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Chart Color Config ──────────────────────────────────────────────────────

export type ChartConfig = {
  [k: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

export function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer>");
  }
  return context;
}

// ── ChartContainer ──────────────────────────────────────────────────────────

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
  children: React.ReactElement;
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: ChartContainerProps) {
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn("relative", className)}
        {...props}
      >
        <ChartStyle config={config} />
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

// Inject CSS variables for chart colors into a <style> tag
function ChartStyle({ config }: { config: ChartConfig }) {
  const vars = Object.entries(config)
    .filter(([, v]) => v.color)
    .map(([k, v]) => `--color-${k}: ${v.color};`)
    .join(" ");

  if (!vars) return null;
  return <style>{`:root { ${vars} }`}</style>;
}

// ── ChartTooltip ────────────────────────────────────────────────────────────

export const ChartTooltip = Tooltip;

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  className,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatter?: (value: number, name: string) => string;
  className?: string;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-background/90 px-3 py-2 shadow-elevation-3",
        "backdrop-blur-md text-sm",
        className
      )}
    >
      {label && (
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((item: TooltipPayloadItem, i: number) => {
          const key = String(item.dataKey ?? "");
          const cfg = config[key] ?? {};
          const color = item.color ?? cfg.color ?? "hsl(var(--chart-1))";
          const name = cfg.label ?? item.name ?? key;
          const rawVal = typeof item.value === "number" ? item.value : 0;
          const val = formatter
            ? formatter(rawVal, key)
            : rawVal.toLocaleString("ko-KR");

          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-muted-foreground">{String(name)}</span>
              <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                {val}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chart Legend ─────────────────────────────────────────────────────────────

export function ChartLegend({
  config,
  className,
}: {
  config: ChartConfig;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {Object.entries(config).map(([key, value]) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: value.color }}
          />
          {value.label ?? key}
        </div>
      ))}
    </div>
  );
}
