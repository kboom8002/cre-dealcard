"use client";

import React from "react";

interface AiMatchCtaButtonProps {
  buildingId: string;
  matchCount?: number;
  topGrade?: string;
}

export function AiMatchCtaButton({ buildingId, matchCount, topGrade }: AiMatchCtaButtonProps) {
  const handleClick = () => {
    // 1. Dispatch custom event to switch tab to 'buyers'
    window.dispatchEvent(
      new CustomEvent("switch-deal-tab", { detail: "buyers" })
    );

    // 2. Scroll to tabs container smoothly
    setTimeout(() => {
      const container = document.getElementById("deal-card-tabs-container");
      if (container) {
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const hasHighGrade = topGrade === 'S' || topGrade === 'A';
  const label = matchCount && matchCount > 0
    ? topGrade ? `🎯 ${topGrade}급 매칭(${matchCount})` : `🎯 매칭 ${matchCount}건`
    : '🎯 AI 매칭';

  return (
    <button
      onClick={handleClick}
      id="cta-trigger-ai-match"
      className={`flex items-center justify-center gap-1.5 w-full rounded-xl text-white py-3 px-3 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-all ${
        hasHighGrade
          ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 shadow-purple-500/30 animate-pulse ring-2 ring-purple-400/50'
          : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/20'
      }`}
    >
      <span>{label}</span>
    </button>
  );
}
