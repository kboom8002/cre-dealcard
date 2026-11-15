'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

export default function PublicDealCardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'public-deal-card',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F14] text-slate-100 p-6 text-center">
      <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-400" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold text-slate-100 mb-2">
        딜카드 화면을 불러오지 못했습니다
      </h2>
      <p className="text-slate-300 text-base max-w-md mb-3 leading-relaxed">
        일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <p className="text-xs font-mono text-slate-400 mb-8">
        오류 참조코드: {refCode}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={() => (reset ? reset() : window.location.reload())}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          다시 시도하기
        </button>
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-2.5 bg-slate-800 text-slate-100 border border-slate-700 rounded-xl font-medium text-sm hover:bg-slate-700 transition-colors"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          홈으로 이동
        </Link>
      </div>
    </div>
  );
}
