"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NDASignatureForm({ 
  requestId, 
  buildingId, 
  isAlreadySigned 
}: { 
  requestId: string; 
  buildingId: string; 
  isAlreadySigned: boolean; 
}) {
  const router = useRouter();
  const [signature, setSignature] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (isAlreadySigned) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-primary text-sm font-bold">이미 서명이 완료된 문서입니다.</p>
        </div>
        <button
          onClick={() => router.push(`/im-lite/${buildingId}?doc=${requestId}`)}
          className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-3 rounded-xl text-sm transition-colors"
        >
          📱 모바일 투자설명서 열람하기
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signature || signature.trim() === "") {
      setErrorMsg("서명(성함)을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/gate-requests/${requestId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signature.trim() }),
      });

      if (!res.ok) {
        throw new Error("서명 제출에 실패했습니다.");
      }

      // Automatically redirect to the mobile IM view
      router.push(`/im-lite/${buildingId}?doc=${requestId}`);
    } catch (err: any) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-xs text-slate-400 font-bold ml-1">전자 서명 (성함을 정자로 입력해주세요)</label>
        <input
          type="text"
          placeholder="성함 입력"
          className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={isSubmitting}
        />
      </div>
      {errorMsg && <p className="text-red-400 text-xs px-1">{errorMsg}</p>}
      <button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold py-3.5 rounded-xl text-sm transition-colors active:scale-[0.98]"
        disabled={isSubmitting}
      >
        {isSubmitting ? "처리 중..." : "동의 및 서명 제출"}
      </button>
    </form>
  );
}
