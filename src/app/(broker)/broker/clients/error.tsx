'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ClientsErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[BrokerClientsErrorBoundary]', error);
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-4 shadow-sm">
        <p className="text-3xl" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="text-lg font-bold text-slate-900">
          고객 화면을 불러오는 중 문제가 발생했습니다
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed break-keep">
          일시적인 통신 또는 화면 오류일 수 있습니다. 다시 시도하거나 소통관리함에서 고객 대화를 확인해 주세요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            다시 시도
          </button>
          <Link
            href="/broker/w/inbox"
            className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold transition-colors"
          >
            인박스에서 열기
          </Link>
        </div>
      </div>
    </main>
  );
}
