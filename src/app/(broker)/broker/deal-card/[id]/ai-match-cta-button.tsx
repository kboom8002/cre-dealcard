"use client";

import React from "react";

interface AiMatchCtaButtonProps {
  buildingId: string;
}

export function AiMatchCtaButton({ buildingId }: AiMatchCtaButtonProps) {
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

  return (
    <button
      onClick={handleClick}
      id="cta-trigger-ai-match"
      className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-3 px-3 text-xs sm:text-sm font-bold shadow-md shadow-purple-500/20 active:scale-[0.98] transition-all"
    >
      <span className="text-base">🎯</span>
      <span>AI 매칭</span>
    </button>
  );
}
