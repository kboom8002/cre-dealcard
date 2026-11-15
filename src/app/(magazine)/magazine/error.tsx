'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

/**
 * 매거진 라우트 오류 경계 (E-03 U-05 & Wave 6 WP-21).
 * 원시 내부 오류 문구를 노출하지 않고 안전한 한국어 안내 + 오류 참조코드만 표시한다.
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
  const refCode = generateErrorReferenceCode(error);
  const retry = unstable_retry ?? reset;

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'magazine',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <main
      id="magazine-main"
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)' }}
    >
      <div
        role="alert"
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/15 bg-slate-900/90 p-7 text-center text-slate-100 shadow-xl"
      >
        <div className="space-y-2">
          <h2 className="text-title font-bold text-white">매거진을 불러오지 못했습니다</h2>
          <p className="text-body text-slate-300 leading-relaxed">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <p className="text-caption font-mono text-slate-400 pt-1">
            오류 참조코드: {refCode}
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={() => (retry ? retry() : window.location.reload())}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-rose-600 px-5 text-body font-bold text-white hover:bg-rose-500 transition-colors"
          >
            다시 시도하기
          </button>
          <Link
            href="/"
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-white/20 px-5 text-body font-bold text-slate-200 hover:bg-white/5 transition-colors"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </main>
  );
}
