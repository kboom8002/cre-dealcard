'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, RefreshCw, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error('[AdminError] Admin system error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">관리자 시스템 오류</h2>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            관리자 기능 처리 중 예외가 발생했습니다.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-muted-foreground/70 mt-2">
              Digest: {error.digest}
            </p>
          )}
        </div>

        {error.message && (
          <div className="text-left border border-border rounded-lg p-3 bg-muted/50">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <span>오류 메시지 상세</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showDetails && (
              <pre className="mt-2 text-xs font-mono text-destructive/90 overflow-x-auto whitespace-pre-wrap break-all max-h-36">
                {error.message}
              </pre>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-destructive text-destructive-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            관리자 홈
          </Link>
        </div>
      </div>
    </div>
  );
}
