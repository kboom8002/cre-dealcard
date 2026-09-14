'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react';

export default function BrokerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[BrokerError] Unhandled broker route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">브로커 대시보드 오류</h2>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            {error.message || '중개 대시보드를 불러오는 중 일시적인 오류가 발생했습니다.'}
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
            href="/broker"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            대시보드로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
