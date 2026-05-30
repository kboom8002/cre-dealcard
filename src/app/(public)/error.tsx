"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto glass-medium rounded-2xl flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-destructive" strokeWidth={1.5} />
        </div>

        {/* Message */}
        <div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            오류가 발생했습니다
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            일시적인 오류입니다. 잠시 후 다시 시도하거나
            <br />
            Hub 홈으로 이동해 주세요.
          </p>
          {process.env.NODE_ENV === "development" && error?.message && (
            <p className="mt-3 text-xs text-destructive/70 font-mono bg-destructive/5 rounded-lg p-3 text-left">
              {error.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-5 py-2.5 text-sm transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} />
            다시 시도
          </button>
          <Link
            href="/hub"
            className="flex items-center gap-2 glass-subtle hover:bg-white/10 text-foreground font-medium rounded-xl px-5 py-2.5 text-sm transition-all active:scale-95"
          >
            <Home className="w-3.5 h-3.5" strokeWidth={2} />
            Hub 홈
          </Link>
        </div>
      </div>
    </div>
  );
}
