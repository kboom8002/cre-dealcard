"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FONT_SCALE_STORAGE_KEY,
  LEGACY_FONT_SCALE_STORAGE_KEY,
  FONT_SCALE_EVENT,
  isValidFontScale,
  type UiFontScale,
} from "@/components/workspace/FontScaleToggle";

export interface ReaderFontScaleToggleProps {
  variant?: "light" | "dark";
  className?: string;
}

const READER_SCALE_LABELS: Record<UiFontScale, string> = {
  compact: "표준",
  normal: "표준",
  large: "크게",
  xlarge: "아주 크게",
};

function nextReaderScale(current: UiFontScale): UiFontScale {
  if (current === "compact" || current === "normal") return "large";
  if (current === "large") return "xlarge";
  return "normal";
}

/**
 * Senior-friendly 60~70s buyer font scale toggle for public viewers (/dc/[id], /im-lite/[buildingId]).
 * Cycles "가+ 글자 크기" (표준 -> 크게 -> 아주 크게) with min-h-[44px] touch target.
 */
export function ReaderFontScaleToggle({
  variant = "light",
  className = "",
}: ReaderFontScaleToggleProps) {
  const [scale, setScale] = useState<UiFontScale>("normal");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const htmlEl = document.documentElement;
    let resolved: UiFontScale | null = null;

    try {
      const saved =
        window.localStorage.getItem(FONT_SCALE_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY);
      if (isValidFontScale(saved)) {
        resolved = saved;
      }
    } catch {
      // ignore storage failure
    }

    if (!resolved) {
      const attr = htmlEl.dataset.fontScale;
      if (isValidFontScale(attr)) {
        resolved = attr;
      }
    }

    if (resolved) {
      setScale(resolved);
      htmlEl.dataset.fontScale = resolved;
    }

    const onSync = (e: Event) => {
      const next = (e as CustomEvent<UiFontScale>).detail;
      if (isValidFontScale(next)) {
        setScale(next);
      }
    };
    window.addEventListener(FONT_SCALE_EVENT, onSync);

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        const attr = htmlEl.dataset.fontScale;
        if (isValidFontScale(attr)) {
          setScale((prev) => (prev === attr ? prev : attr));
        }
      });
      observer.observe(htmlEl, { attributes: true, attributeFilter: ["data-font-scale"] });
    }

    return () => {
      window.removeEventListener(FONT_SCALE_EVENT, onSync);
      observer?.disconnect();
    };
  }, []);

  const handleCycle = useCallback(() => {
    const next = nextReaderScale(scale);
    setScale(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.fontScale = next;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, next);
        window.localStorage.setItem(LEGACY_FONT_SCALE_STORAGE_KEY, next);
      } catch {
        // ignore storage failure
      }
      try {
        window.dispatchEvent(
          new CustomEvent<UiFontScale>(FONT_SCALE_EVENT, { detail: next })
        );
      } catch {
        // ignore CustomEvent failure
      }
    }
  }, [scale]);

  const stepLabel = READER_SCALE_LABELS[scale];

  const toneClasses =
    variant === "dark"
      ? "bg-slate-800/95 hover:bg-slate-700 text-slate-100 border-slate-600"
      : "bg-white hover:bg-[#F8FAFC] text-[#0F172A] border-[#64748B]";

  const badgeClasses =
    variant === "dark"
      ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
      : "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]";

  return (
    <button
      type="button"
      onClick={handleCycle}
      data-testid="reader-font-scale-toggle"
      data-font-scale-step={scale}
      aria-label={`글자 크기 조절 (현재: ${stepLabel})`}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl border text-sm font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0 no-print ${toneClasses} ${className}`}
    >
      <span>가+ 글자 크기</span>
      <span
        data-testid="reader-font-scale-label"
        className={`px-2 py-0.5 rounded-md text-xs font-extrabold ${badgeClasses}`}
      >
        {stepLabel}
      </span>
    </button>
  );
}
