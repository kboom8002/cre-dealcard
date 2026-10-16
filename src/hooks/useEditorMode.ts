"use client";

import { useState, useCallback, useEffect } from "react";
import {
  resolveEditorMode,
  type EditorMode,
} from "@/lib/magazine/simple-format";

export const EDITOR_MODE_STORAGE_KEY = "cre_mag_editor_mode";

export interface UseEditorModeOptions {
  queryMode?: string | null;
  queryTab?: string | null;
  serverSavedMode?: string | null;
  simpleModeEnabled?: boolean;
}

export interface SetEditorModeOptions {
  /** true 이면 원격 프로필 저장(PUT /api/broker/profile)을 생략하고 로컬 상태만 갱신 */
  skipRemote?: boolean;
}

export function readStoredEditorMode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistEditorModePreference(
  nextMode: EditorMode,
  opts: SetEditorModeOptions & { fetchImpl?: typeof fetch } = {},
): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(EDITOR_MODE_STORAGE_KEY, nextMode);
    } catch {
      // storage quota / private mode 무시
    }
  }

  if (opts.skipRemote) return;

  const fn = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fn) return;

  try {
    void Promise.resolve(
      fn("/api/broker/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magazine_editor_mode: nextMode }),
      }),
    ).catch(() => {
      // 비동기 프로필 선호 저장 실패는 무시
    });
  } catch {
    // 동기 예외 무시
  }
}

export function useEditorMode(options: UseEditorModeOptions = {}) {
  const { queryMode, queryTab, serverSavedMode, simpleModeEnabled } = options;

  const [mode, setModeState] = useState<EditorMode>(() =>
    resolveEditorMode({
      queryMode,
      queryTab,
      savedMode: serverSavedMode ?? readStoredEditorMode(),
      simpleModeEnabled,
    }),
  );

  // URL 쿼리(?mode=, ?tab=) 또는 서버 저장값이 뒤늦게 도착했을 때 반영
  useEffect(() => {
    const resolved = resolveEditorMode({
      queryMode,
      queryTab,
      savedMode: serverSavedMode ?? readStoredEditorMode(),
      simpleModeEnabled,
    });
    setModeState(resolved);
  }, [queryMode, queryTab, serverSavedMode, simpleModeEnabled]);

  const setMode = useCallback(
    (nextMode: EditorMode, opts?: SetEditorModeOptions) => {
      setModeState(nextMode);
      persistEditorModePreference(nextMode, opts);
    },
    [],
  );

  return {
    mode,
    setMode,
    isSimpleMode: mode === "simple",
    isFullMode: mode === "full",
  };
}
