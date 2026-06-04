"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { VTI_PROTOTYPES, type VibeVtiType } from "@/lib/vibe/vibe-vector";

const SIZE_MAP = {
  sm: { pill: "px-2 py-0.5 text-[10px] gap-0.5", emoji: "text-xs" },
  md: { pill: "px-3 py-1 text-xs gap-1",          emoji: "text-sm" },
  lg: { pill: "px-4 py-1.5 text-sm gap-1.5",      emoji: "text-base" },
} as const;

interface VibeBadgeProps {
  vtiType: VibeVtiType;
  size?: "sm" | "md" | "lg";
}

export function VibeBadge({ vtiType, size = "md" }: VibeBadgeProps) {
  const meta = useMemo(() => {
    const proto = VTI_PROTOTYPES.find((p) => p.meta.type === vtiType);
    return proto?.meta ?? { emoji: "✨", label_ko: vtiType, color: "#94a3b8" };
  }, [vtiType]);

  const s = SIZE_MAP[size];

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-full",
        "backdrop-blur-sm transition-transform hover:scale-105",
        "select-none whitespace-nowrap",
        s.pill,
      )}
      style={{
        backgroundColor: `${meta.color}18`, // ~10% opacity
        color: meta.color,
        border: `1px solid ${meta.color}30`,
      }}
    >
      <span className={s.emoji} role="img" aria-label={meta.label_ko}>
        {meta.emoji}
      </span>
      {meta.label_ko}
    </span>
  );
}
