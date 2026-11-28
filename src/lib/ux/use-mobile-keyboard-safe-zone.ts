"use client";

import { useEffect, useState } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "button",
  "submit",
  "reset",
  "hidden",
  "range",
  "color",
]);

export function isTextInputElement(el: EventTarget | null): boolean {
  if (!el || typeof el !== "object") return false;
  const node = el as {
    tagName?: string;
    type?: string;
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
  };
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : "";
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const inputType = (
      node.getAttribute?.("type") ??
      node.type ??
      "text"
    ).toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  const contentEditableAttr = node.getAttribute?.("contenteditable");
  if (contentEditableAttr === "true") return true;
  if (contentEditableAttr !== "false" && node.isContentEditable === true) return true;
  return false;
}

export function computeIsMobileKeyboardOpen(params: {
  innerHeight: number;
  viewportHeight: number;
  innerWidth: number;
  hasFocusedTextInput: boolean;
}): boolean {
  const { innerHeight, viewportHeight, innerWidth, hasFocusedTextInput } = params;
  if (innerWidth >= 900) return false;
  if (hasFocusedTextInput) return true;
  if (innerHeight > 0 && viewportHeight / innerHeight < 0.78) return true;
  return false;
}

export interface MobileKeyboardSafeZone {
  isKeyboardOpen: boolean;
  viewportHeight: number;
  bottomInsetPx: number;
}

export function useMobileKeyboardSafeZone(): MobileKeyboardSafeZone {
  const [state, setState] = useState<MobileKeyboardSafeZone>({
    isKeyboardOpen: false,
    viewportHeight: 0,
    bottomInsetPx: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let rafId: number | null = null;

    const readState = (focusTargetOverride?: EventTarget | null) => {
      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const vv = window.visualViewport;
      const viewportHeight = vv ? vv.height : innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      const bottomInsetPx = vv
        ? Math.max(0, Math.round(innerHeight - (viewportHeight + offsetTop)))
        : 0;
      const focusTarget =
        focusTargetOverride !== undefined
          ? focusTargetOverride
          : document.activeElement;
      const hasFocusedTextInput = isTextInputElement(focusTarget);
      const isKeyboardOpen = computeIsMobileKeyboardOpen({
        innerHeight,
        viewportHeight,
        innerWidth,
        hasFocusedTextInput,
      });

      setState((prev) => {
        if (
          prev.isKeyboardOpen === isKeyboardOpen &&
          prev.viewportHeight === viewportHeight &&
          prev.bottomInsetPx === bottomInsetPx
        ) {
          return prev;
        }
        return { isKeyboardOpen, viewportHeight, bottomInsetPx };
      });
    };

    const handleViewportChange = () => readState();
    const handleFocusIn = (e: FocusEvent) => {
      readState(e.target ?? document.activeElement);
    };
    const handleFocusOut = (e: FocusEvent) => {
      readState(e.relatedTarget ?? null);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => readState());
    };

    readState();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleViewportChange);
    vv?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", handleViewportChange);
      vv?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return state;
}
