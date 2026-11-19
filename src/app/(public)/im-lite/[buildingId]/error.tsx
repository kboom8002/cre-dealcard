'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

export default function ImLiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'public-im-lite',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">페이지를 불러올 수 없습니다</h2>
          <p className="text-slate-600 text-base mt-2 leading-relaxed">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <p className="text-sm font-mono text-slate-500 mt-3">
            오류 참조코드: {refCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도하기
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-800 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
