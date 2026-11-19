"use client";

import React, { useEffect, useCallback, useSyncExternalStore } from "react";

export const FONT_SCALE_STORAGE_KEY = "credeal-workspace-font-scale-v1";
export const LEGACY_FONT_SCALE_STORAGE_KEY = "cre-font-scale";
export const FONT_SCALE_EVENT = "credeal:font-scale-change";

export type UiFontScale = "compact" | "normal" | "large" | "xlarge";

export function isValidFontScale(val: unknown): val is UiFontScale {
  return val === "compact" || val === "normal" || val === "large" || val === "xlarge";
}

export function getFontScaleSnapshot(): UiFontScale {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "normal";
  }
  const attr = document.documentElement.dataset.fontScale;
  if (isValidFontScale(attr)) {
    return attr;
  }
  try {
    const saved =
      window.localStorage.getItem(FONT_SCALE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY);
    if (isValidFontScale(saved)) {
      return saved;
    }
  } catch {
    // ignore storage failure
  }
  return "normal";
}

export function getFontScaleServerSnapshot(): UiFontScale {
  return "normal";
}

export function subscribeFontScale(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const htmlEl = document.documentElement;
  const handleSync = () => onStoreChange();
  window.addEventListener(FONT_SCALE_EVENT, handleSync);
  window.addEventListener("storage", handleSync);

  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      onStoreChange();
    });
    observer.observe(htmlEl, { attributes: true, attributeFilter: ["data-font-scale"] });
  }

  return () => {
    window.removeEventListener(FONT_SCALE_EVENT, handleSync);
    window.removeEventListener("storage", handleSync);
    observer?.disconnect();
  };
}

export function applyAndPersistFontScale(nextScale: UiFontScale): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.fontScale = nextScale;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, nextScale);
      window.localStorage.setItem(LEGACY_FONT_SCALE_STORAGE_KEY, nextScale);
    } catch {
      // ignore storage failure
    }
    try {
      window.dispatchEvent(
        new CustomEvent<UiFontScale>(FONT_SCALE_EVENT, { detail: nextScale }),
      );
    } catch {
      // ignore CustomEvent failure
    }
  }
}

export interface FontScaleToggleProps {
  className?: string;
}

/**
 * Shared 4-step workspace & broker home font size switcher synced across tabs and views.
 * - compact (15px): 표준 글씨
 * - normal  (17px): 큰글씨
 * - large   (19px): 더 크게
 * - xlarge  (21px): 아주 크게
 */
export function FontScaleToggle({ className }: FontScaleToggleProps) {
  const fontScale = useSyncExternalStore(
    subscribeFontScale,
    getFontScaleSnapshot,
    getFontScaleServerSnapshot,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
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
      const currentAttr = htmlEl.dataset.fontScale;
      if (isValidFontScale(currentAttr)) {
        resolved = currentAttr;
      }
    }

    if (resolved) {
      if (htmlEl.dataset.fontScale !== resolved) {
        htmlEl.dataset.fontScale = resolved;
      }
      try {
        window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, resolved);
        window.localStorage.setItem(LEGACY_FONT_SCALE_STORAGE_KEY, resolved);
      } catch {
        // ignore storage failure
      }
    }
  }, []);

  const handleSelect = useCallback((nextScale: UiFontScale) => {
    applyAndPersistFontScale(nextScale);
  }, []);

  const options: Array<{ id: UiFontScale; label: string }> = [
    { id: "compact", label: "표준 글씨" },
    { id: "normal", label: "큰글씨" },
    { id: "large", label: "더 크게" },
    { id: "xlarge", label: "아주 크게" },
  ];

  return (
    <div
      role="group"
      aria-label="화면 글자 크기 선택"
      data-testid="workspace-font-scale-toggle"
      className={
        className ||
        "inline-flex max-w-full flex-wrap items-center justify-center ios-segmented-track bg-[#767680]/[0.10] p-[3px] rounded-[12px] border border-white/60 gap-0.5"
      }
    >
      {options.map((opt) => {
        const active = fontScale === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            data-testid={`workspace-font-scale-${opt.id}`}
            aria-pressed={active}
            onClick={() => handleSelect(opt.id)}
            className={`px-2 sm:px-2.5 min-h-[44px] rounded-[9px] text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              active
                ? "ios-segmented-pill bg-white text-[#007AFF]"
                : "text-[#3A3A3C] hover:text-[#1D1D1F]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
