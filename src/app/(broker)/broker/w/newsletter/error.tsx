"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from "@/lib/observability/error-reporter";

export default function NewsletterWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: "broker-w-newsletter",
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] p-6 text-center bg-[#FAF9F5] text-slate-900">
      <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-rose-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        뉴스레터 작업 공간을 불러오는 중 문제가 발생했습니다
      </h2>
      <p className="text-slate-700 text-base max-w-md mb-3 leading-relaxed">
        일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <p className="text-sm font-mono text-slate-600 mb-8">
        오류 참조코드: {refCode}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold text-base hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          다시 시도하기
        </button>
        <Link
          href="/broker"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 text-slate-900 rounded-xl font-semibold text-base hover:bg-slate-50 transition-colors"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          워크스페이스 홈으로 이동
        </Link>
      </div>
    </div>
  );
}
