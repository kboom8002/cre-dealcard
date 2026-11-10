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
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F14] text-slate-100 p-6 text-center">
      <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-2xl font-bold text-slate-100 mb-2">
        존재하지 않거나 삭제된 딜카드입니다
      </h2>
      <p className="text-slate-400 max-w-md mb-8">
        링크가 올바른지 확인해 주세요. 
        만약 중개인으로부터 직접 받은 링크라면 다시 요청해 주시기 바랍니다.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 bg-slate-800 text-slate-100 border border-slate-700 rounded-xl font-medium hover:bg-slate-700 transition-colors"
      >
        새로고침
      </button>
    </div>
  );
}
