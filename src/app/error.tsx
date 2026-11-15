'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'root',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">화면 표시 중 문제가 발생했습니다</h2>
          <p className="text-muted-foreground text-base mt-2 leading-relaxed">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <p className="text-xs font-mono text-muted-foreground/80 mt-3">
            오류 참조코드: {refCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도하기
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
