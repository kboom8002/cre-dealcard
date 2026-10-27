"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

export type ToastVariant = "info" | "success" | "warning" | "destructive";

export interface UndoToastOptions {
  message: string;
  durationMs?: number; // default 8000ms (8s)
  undoAction?: () => void | Promise<void>;
  undoLabel?: string; // default "되돌리기 (8초)"
  variant?: ToastVariant;
}

export interface UndoToastItem extends UndoToastOptions {
  id: string;
  createdAt: number;
  durationMs: number;
}

export type UndoToastInput = string | UndoToastOptions;

interface UndoToastContextValue {
  showUndoToast: (options: UndoToastInput) => string;
  dismissToast: (id?: string) => void;
  activeToast: UndoToastItem | null;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [activeToast, setActiveToast] = useState<UndoToastItem | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const dismissToast = useCallback((id?: string) => {
    setActiveToast((current) => {
      if (!current) return null;
      if (id && current.id !== id) return current;
      return null;
    });
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showUndoToast = useCallback(
    (input: UndoToastInput): string => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const options: UndoToastOptions = typeof input === "string" ? { message: input } : input;

      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = options.durationMs ?? 8000;
      const newItem: UndoToastItem = {
        ...options,
        id,
        createdAt: Date.now(),
        durationMs,
        undoLabel: options.undoLabel ?? "되돌리기",
        variant: options.variant ?? "warning",
      };

      setActiveToast(newItem);

      timerRef.current = setTimeout(() => {
        dismissToast(id);
      }, durationMs);

      return id;
    },
    [dismissToast]
  );

  // Esc key dismisses toast
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && activeToast) {
        dismissToast(activeToast.id);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeToast, dismissToast]);

  return (
    <UndoToastContext.Provider value={{ showUndoToast, dismissToast, activeToast }}>
      {children}
      {activeToast && (
        <UndoToastOverlay
          toast={activeToast}
          onDismiss={() => dismissToast(activeToast.id)}
        />
      )}
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) {
    throw new Error("useUndoToast must be used within an UndoToastProvider");
  }
  return ctx;
}

function UndoToastOverlay({
  toast,
  onDismiss,
}: {
  toast: UndoToastItem;
  onDismiss: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil(toast.durationMs / 1000)
  );
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - toast.createdAt;
      const remaining = Math.max(0, Math.ceil((toast.durationMs - elapsed) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [toast]);

  const handleUndo = async () => {
    if (!toast.undoAction || isExecuting) return;
    try {
      setIsExecuting(true);
      await toast.undoAction();
    } finally {
      setIsExecuting(false);
      onDismiss();
    }
  };

  const borderVariantClass =
    toast.variant === "destructive"
      ? "border-l-4 border-l-rose-600"
      : toast.variant === "success"
      ? "border-l-4 border-l-emerald-600"
      : toast.variant === "info"
      ? "border-l-4 border-l-blue-600"
      : "border-l-4 border-l-amber-500";

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="undo-confirm-toast"
      className="fixed z-50 top-6 left-1/2 -translate-x-1/2 max-w-lg w-[calc(100%-2rem)] px-2"
    >
      <div
        className={`bg-white text-[#0F172A] border border-slate-300 shadow-xl rounded-xl p-4 flex items-center justify-between gap-3 ${borderVariantClass}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">
            {toast.variant === "destructive"
              ? "🗑️"
              : toast.variant === "success"
              ? "✅"
              : "⏳"}
          </span>
          <p className="text-base font-bold text-slate-900 truncate">
            {toast.message}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {toast.undoAction && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={isExecuting}
              data-testid="undo-action-btn"
              className="px-3.5 py-2 min-h-[44px] rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-sm border border-amber-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isExecuting
                ? "되돌리는 중..."
                : `${toast.undoLabel} (${secondsRemaining}초)`}
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            data-testid="undo-dismiss-btn"
            aria-label="닫기"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default UndoToastProvider;
