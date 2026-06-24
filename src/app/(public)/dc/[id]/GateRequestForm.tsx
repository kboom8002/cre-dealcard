"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GateRequestForm({ buildingId }: { buildingId: string }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !contact) {
      setErrorMsg("성함과 연락처를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      // Serialize requester details into the reason field
      const reasonData = JSON.stringify({ name, contact });

      const res = await fetch("/api/gate-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: buildingId,
          requestedLevel: "G1",
          reason: reasonData,
        }),
      });

      if (!res.ok) {
        throw new Error("요청 처리에 실패했습니다.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
        <p className="text-primary text-sm font-bold mb-1">✅ 요청이 접수되었습니다.</p>
        <p className="text-primary/80 text-xs">담당 중개인이 확인 후 연락드립니다.</p>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="성함 또는 기업명"
          className="bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
        />
        <input
          type="text"
          placeholder="연락처"
          className="bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          disabled={isSubmitting}
        />
      </div>
      {errorMsg && <p className="text-red-400 text-xs px-1">{errorMsg}</p>}
      <button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold py-3 rounded-xl text-xs transition-colors active:scale-[0.98]"
        disabled={isSubmitting}
      >
        {isSubmitting ? "요청 중..." : "🔒 NDA 기반 상세자료 요청 (무료)"}
      </button>
    </form>
  );
}
