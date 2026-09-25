"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function DealCardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DealCard] Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        데이터를 불러오는 중 문제가 발생했습니다
      </h2>
      <p className="text-slate-500 max-w-md mb-8">
        일시적인 네트워크 오류이거나 데이터가 존재하지 않을 수 있습니다. 
        계속해서 문제가 발생하면 고객센터로 문의해 주세요.
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/broker/buildings"
          className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
