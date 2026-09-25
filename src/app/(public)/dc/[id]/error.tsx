"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function PublicDealCardError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[PublicDealCard] Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        존재하지 않거나 삭제된 딜카드입니다
      </h2>
      <p className="text-slate-500 max-w-md mb-8">
        링크가 올바른지 확인해 주세요. 
        만약 중개인으로부터 직접 받은 링크라면 다시 요청해 주시기 바랍니다.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
      >
        새로고침
      </button>
    </div>
  );
}
