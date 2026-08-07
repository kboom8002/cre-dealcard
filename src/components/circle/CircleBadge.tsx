"use client";

import React from "react";

interface CircleBadgeProps {
  count: number;
  label?: string;
  className?: string;
}

export function CircleBadge({ count, label = "팀 매칭", className = "" }: CircleBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-extrabold tracking-tight animate-pulse ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      {label} {count}건
    </span>
  );
}
