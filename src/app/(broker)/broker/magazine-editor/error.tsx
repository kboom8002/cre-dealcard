'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

/**
 * 뉴스레터 작업 화면 에러 경계 (U-04 & Wave 6 WP-21).
 * 내부 에러 메시지는 절대 노출하지 않고 안전한 한국어 안내 + 오류 참조코드 + 재시도를 제공한다.
 */
export default function MagazineEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'broker-magazine-editor',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#FAF9F5] p-6 text-[#0F172A]">
      <div
        role="alert"
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">뉴스레터 화면을 열지 못했습니다</h2>
          <p className="text-base text-slate-700 leading-relaxed">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. 작성 중이던 내용은 초안으로 자동 저장되어 있습니다.
          </p>
          <p className="text-sm font-mono text-slate-600 pt-1">
            오류 참조코드: {refCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            다시 시도하기
          </button>
          <Link
            href="/broker"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100 transition-colors"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
