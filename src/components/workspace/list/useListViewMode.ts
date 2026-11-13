"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * One list-view preference shared by all 4 broker workspaces (DealCard · IM · Newsletter · Inbox).
 * Default is "simple" (title · date · status). Changing it in one workspace applies everywhere,
 * including other open tabs/components, via a CustomEvent (same pattern as FontScaleToggle).
 */
export type ListViewMode = "simple" | "detailed";

export const LIST_VIEW_STORAGE_KEY = "credeal-ws-list-view-v1";
export const LIST_VIEW_EVENT = "credeal:list-view-change";

export function isListViewMode(v: unknown): v is ListViewMode {
  return v === "simple" || v === "detailed";
}

export function readStoredListViewMode(): ListViewMode {
  if (typeof window === "undefined") return "simple";
  try {
    const saved = window.localStorage.getItem(LIST_VIEW_STORAGE_KEY);
    return isListViewMode(saved) ? saved : "simple";
  } catch {
    return "simple";
  }
}

export function useListViewMode(): [ListViewMode, (next: ListViewMode) => void] {
  const [mode, setMode] = useState<ListViewMode>("simple");

  useEffect(() => {
    setMode(readStoredListViewMode());
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<ListViewMode>).detail;
      if (isListViewMode(next)) setMode(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIST_VIEW_STORAGE_KEY && isListViewMode(e.newValue)) setMode(e.newValue);
    };
    window.addEventListener(LIST_VIEW_EVENT, onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LIST_VIEW_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next: ListViewMode) => {
    setMode(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, next);
    } catch {
      // ignore storage failure
    }
    try {
      window.dispatchEvent(new CustomEvent<ListViewMode>(LIST_VIEW_EVENT, { detail: next }));
    } catch {
      // ignore CustomEvent failure
    }
  }, []);

  return [mode, update];
}
