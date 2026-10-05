/**
 * 에디터 토스트 큐 (T2-34) — 토스트가 겹쳐 쌓이지 않도록 한다.
 *  - 같은 종류·같은 문구가 짧은 시간(기본 1.5초) 안에 반복되면 무시한다.
 *  - 모든 토스트가 하나의 슬롯 id 를 공유해 새 토스트가 이전 토스트를 대체한다(sonner id 동작).
 * sink 를 주입할 수 있어 단위 테스트에서 sonner 없이 검증한다.
 */

export type ToastKind = "success" | "error" | "warning" | "info" | "loading";

export interface ToastSink {
  show(kind: ToastKind, message: string, options: { id: string }): string | number | void;
}

export const EDITOR_TOAST_SLOT = "editor-toast-slot";
export const TOAST_DEDUPE_MS = 1500;

export interface EditorToaster {
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  info(message: string): void;
  /** 로딩 토스트(같은 슬롯). 완료 시 success/error 가 같은 슬롯을 대체한다. */
  loading(message: string): void;
}

export function createEditorToaster(
  sink: ToastSink,
  now: () => number = () => Date.now(),
  dedupeMs: number = TOAST_DEDUPE_MS,
): EditorToaster {
  let lastKey = "";
  let lastAt = -Infinity;
  const emit = (kind: ToastKind, message: string) => {
    const key = `${kind}:${message}`;
    const t = now();
    // loading 은 항상 통과(진행 상황 표시), 나머지는 중복 억제
    if (kind !== "loading" && key === lastKey && t - lastAt < dedupeMs) return;
    lastKey = key;
    lastAt = t;
    sink.show(kind, message, { id: EDITOR_TOAST_SLOT });
  };
  return {
    success: (m) => emit("success", m),
    error: (m) => emit("error", m),
    warning: (m) => emit("warning", m),
    info: (m) => emit("info", m),
    loading: (m) => emit("loading", m),
  };
}
