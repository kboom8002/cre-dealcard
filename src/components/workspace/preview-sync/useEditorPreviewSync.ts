"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type PreviewLifecycleState =
  | "pre_generation"
  | "live_draft"
  | "published_clean"
  | "published_dirty";

export interface EditorUnitTarget<TTab extends string = string> {
  /** Unique unit identifier shared between Column 2 and Column 3 */
  unitId: string;
  /** Senior-friendly Korean label announced on jump */
  label: string;
  /** Optional editor step/tab to activate before scrolling & focusing */
  tab?: TTab;
  /** CSS selector for the editor card/section or input to scroll into view and pulse */
  editorSelector: string;
  /** Optional CSS selector for the specific input/textarea/button to receive keyboard focus */
  focusSelector?: string;
  /** Optional hook executed before focusing (e.g., auto-expanding a collapsed section) */
  onBeforeFocus?: () => void;
  /** Optional custom handler instead of DOM selector focus (e.g., profile guidance toast) */
  onCustomActivate?: () => void;
}

export interface UseEditorPreviewSyncOptions<TTab extends string = string> {
  units: Record<string, EditorUnitTarget<TTab>>;
  onSelectTab?: (tab: TTab) => void;
  previewRootSelector?: string;
}

function applyPulseAndFocus(editorSelector: string, focusSelector?: string): boolean {
  if (typeof document === "undefined") return false;
  const containerEl = document.querySelector<HTMLElement>(editorSelector);
  const focusEl = focusSelector
    ? document.querySelector<HTMLElement>(focusSelector)
    : containerEl;

  const targetForVisibility = focusEl || containerEl;
  if (!targetForVisibility) return false;
  if (targetForVisibility.closest(".hidden")) return false;

  const scrollTarget = containerEl || focusEl;
  if (scrollTarget && typeof scrollTarget.scrollIntoView === "function") {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (containerEl) {
    containerEl.classList.remove("ws-editor-unit-pulse");
    // Trigger reflow to restart CSS keyframe animation without JS timers
    void containerEl.offsetWidth;
    containerEl.classList.add("ws-editor-unit-pulse");
    const cleanup = () => {
      containerEl.classList.remove("ws-editor-unit-pulse");
      containerEl.removeEventListener("animationend", cleanup);
    };
    containerEl.addEventListener("animationend", cleanup);
  }

  if (focusEl && typeof focusEl.focus === "function") {
    const focusable =
      focusEl.matches("input, textarea, select, button, [tabindex]")
        ? focusEl
        : focusEl.querySelector<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
          );
    (focusable || focusEl).focus({ preventScroll: true });
  }

  return true;
}

export function useEditorPreviewSync<TTab extends string = string>({
  units,
  onSelectTab,
  previewRootSelector = '[data-testid="workspace-col-preview"]',
}: UseEditorPreviewSyncOptions<TTab>) {
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ unitId: string; seq: number } | null>(null);
  const unitsRef = useRef(units);
  unitsRef.current = units;

  // Post-commit DOM focus & pulse: runs after tab switch and disclosure state updates commit
  useEffect(() => {
    if (!focusRequest) return;
    const target = unitsRef.current[focusRequest.unitId];
    if (!target || target.onCustomActivate) return;

    const ok = applyPulseAndFocus(target.editorSelector, target.focusSelector);
    if (!ok && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      const id = window.requestAnimationFrame(() => {
        applyPulseAndFocus(target.editorSelector, target.focusSelector);
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [focusRequest]);

  const focusEditorUnit = useCallback(
    (unitId: string) => {
      const target = unitsRef.current[unitId];
      if (!target) return;

      setActiveUnitId(unitId);
      target.onBeforeFocus?.();

      if (target.onCustomActivate) {
        target.onCustomActivate();
        return;
      }

      if (target.tab !== undefined) {
        onSelectTab?.(target.tab);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("workspace:focus-editor", {
            detail: { unitId, label: target.label },
          })
        );
      }

      setFocusRequest((prev) => ({ unitId, seq: (prev?.seq ?? 0) + 1 }));
    },
    [onSelectTab]
  );

  const notifyEditorFocus = useCallback(
    (unitId: string) => {
      setActiveUnitId((prev) => (prev === unitId ? prev : unitId));
      if (typeof document === "undefined") return;

      const scrollPreviewIfNeeded = () => {
        const root =
          document.querySelector<HTMLElement>(previewRootSelector) || document.body;
        const previewUnit = root.querySelector<HTMLElement>(
          `[data-preview-unit-id="${unitId}"]`
        );
        if (!previewUnit || previewUnit.closest(".hidden")) return;
        if (typeof previewUnit.scrollIntoView !== "function") return;

        const scrollParent = previewUnit.closest<HTMLElement>(".overflow-y-auto");
        if (!scrollParent) {
          previewUnit.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        const parentRect = scrollParent.getBoundingClientRect();
        const unitRect = previewUnit.getBoundingClientRect();
        if (parentRect.height > 0) {
          const outOfView =
            unitRect.top < parentRect.top + 24 ||
            unitRect.bottom > parentRect.bottom - 24;
          if (outOfView) {
            previewUnit.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      };

      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(scrollPreviewIfNeeded);
      } else {
        scrollPreviewIfNeeded();
      }
    },
    [previewRootSelector]
  );

  return {
    activeUnitId,
    setActiveUnitId,
    focusEditorUnit,
    notifyEditorFocus,
  };
}
