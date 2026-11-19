'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'admin',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 bg-slate-50 text-slate-900">
      <div className="max-w-md w-full text-center space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
          <AlertOctagon className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">관리자 화면 오류</h2>
          <p className="text-slate-600 text-base mt-2 leading-relaxed">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <p className="text-sm font-mono text-slate-600 mt-3">
            오류 참조코드: {refCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-rose-700 text-white rounded-xl font-semibold text-sm hover:bg-rose-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도하기
          </button>
          <Link
            href="/admin"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-900 border border-slate-200 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            관리자 홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
