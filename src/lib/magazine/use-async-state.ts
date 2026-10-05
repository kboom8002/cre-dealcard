"use client";

/**
 * U-04 비동기 상태 계약.
 *  - status: 'idle' | 'loading' | 'error' | 'empty' | 'ready'
 *  - loading → 스켈레톤, error → ErrorState + retry, empty → EmptyState
 * 순수 reducer(`asyncReducer`)와 React 훅(`useAsyncState`)을 분리해 reducer 만 단위 테스트한다.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

export type AsyncStatus = "idle" | "loading" | "error" | "empty" | "ready";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

export type AsyncAction<T> =
  | { type: "start" }
  | { type: "success"; data: T; isEmpty?: boolean }
  | { type: "failure"; error: string }
  | { type: "reset" };

export function initialAsyncState<T>(): AsyncState<T> {
  return { status: "idle", data: null, error: null };
}

/** 기본 empty 판정: null/undefined, 빈 배열 */
export function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function asyncReducer<T>(state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> {
  switch (action.type) {
    case "start":
      // 재시도 중에도 이전 data 는 유지(깜빡임 방지) — status 만 loading
      return { status: "loading", data: state.data, error: null };
    case "success":
      return {
        status: action.isEmpty ? "empty" : "ready",
        data: action.data,
        error: null,
      };
    case "failure":
      return { status: "error", data: state.data, error: action.error };
    case "reset":
      return initialAsyncState<T>();
    default:
      return state;
  }
}

export function toErrorMessage(e: unknown, fallback = "불러오지 못했습니다. 잠시 후 다시 시도해 주세요."): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

export interface UseAsyncStateOptions<T> {
  /** 마운트 시 자동 실행 (기본 true) */
  auto?: boolean;
  isEmpty?: (data: T) => boolean;
}

export interface UseAsyncStateResult<T> extends AsyncState<T> {
  retry: () => void;
  run: () => Promise<void>;
}

export function useAsyncState<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options: UseAsyncStateOptions<T> = {},
): UseAsyncStateResult<T> {
  const { auto = true, isEmpty = defaultIsEmpty } = options;
  const [state, dispatch] = useReducer(
    asyncReducer as (s: AsyncState<T>, a: AsyncAction<T>) => AsyncState<T>,
    undefined,
    initialAsyncState<T>,
  );
  const loaderRef = useRef(loader);
  const isEmptyRef = useRef(isEmpty);
  const reqId = useRef(0);
  useEffect(() => {
    loaderRef.current = loader;
    isEmptyRef.current = isEmpty;
  });

  const run = useCallback(async () => {
    const id = ++reqId.current;
    dispatch({ type: "start" });
    try {
      const data = await loaderRef.current();
      if (id !== reqId.current) return; // 오래된 응답 무시
      dispatch({ type: "success", data, isEmpty: isEmptyRef.current(data) });
    } catch (e) {
      if (id !== reqId.current) return;
      dispatch({ type: "failure", error: toErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    void run();
    return () => {
      reqId.current++; // unmount/deps 변경 시 in-flight 응답 폐기
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, run, ...deps]);

  return { ...state, retry: run, run };
}
