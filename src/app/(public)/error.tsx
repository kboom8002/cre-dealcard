'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[PublicError] Unhandled public route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">문제가 발생했습니다</h2>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            {error.message || '페이지를 불러오는 데 실패했습니다. 일시적인 장애일 수 있으니 다시 시도해 주세요.'}
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-muted-foreground/70 mt-3">
              Code: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            <Home className="w-4 h-4" />
            홈으로 가기
          </Link>
        </div>
      </div>
    </div>
  );
}
