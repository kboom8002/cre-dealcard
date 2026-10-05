'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '@/components/ui/error-state';
import { toUserMessage } from '@/lib/magazine/user-message';

/**
 * 매거진 라우트 오류 경계 (E-03 U-05).
 * 원시 error.message 를 노출하지 않고 toUserMessage 로 일반화한다. 원문은 콘솔/서버 로그에 남긴다.
 * Next 16: 재시도는 `unstable_retry` (구버전 호환으로 `reset` 폴백).
 */
export default function MagazineError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error('[MagazineError] Unhandled magazine route error:', error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <main
      id="magazine-main"
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)' }}
    >
      <div className="w-full max-w-md space-y-4">
        <ErrorState
          title="매거진을 불러오지 못했습니다"
          description={toUserMessage(error)}
          onRetry={retry ? () => retry() : undefined}
        />
        <Link
          href="/"
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/20 text-body font-bold text-ink-muted hover:bg-white/5"
        >
          홈으로 이동
        </Link>
      </div>
    </main>
  );
}
