"use client";

import React, { useId, useState } from "react";
import { formatKrPhoneInput } from "@/lib/format/phone";

export default function GateRequestForm({ buildingId }: { buildingId: string }) {
  const uid = useId();
  const nameId = `${uid}-gate-name`;
  const contactId = `${uid}-gate-contact`;

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      setErrorMsg("성함과 연락처를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const reasonData = JSON.stringify({ name: name.trim(), contact: contact.trim() });

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setErrorMsg(msg || "오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
        <p className="text-primary text-base font-bold mb-1">✅ 요청이 접수되었습니다.</p>
        <p className="text-primary/80 text-sm">담당 중개인이 확인 후 연락드립니다.</p>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={nameId}
            className="mb-1 block text-sm font-semibold text-slate-300"
          >
            성함 또는 기업명
          </label>
          <input
            id={nameId}
            type="text"
            placeholder="성함 또는 기업명"
            className="min-h-[48px] w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label
            htmlFor={contactId}
            className="mb-1 block text-sm font-semibold text-slate-300"
          >
            연락처
          </label>
          <input
            id={contactId}
            type="tel"
            placeholder="010-0000-0000"
            className="min-h-[48px] w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
            value={contact}
            onChange={(e) => setContact(formatKrPhoneInput(e.target.value))}
            disabled={isSubmitting}
          />
        </div>
      </div>
      {errorMsg && (
        <p role="alert" className="text-red-400 text-sm px-1">
          {errorMsg}
        </p>
      )}
      <button
        type="submit"
        className="w-full min-h-[48px] bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold py-3 rounded-xl text-[16px] transition-colors active:scale-[0.98]"
        disabled={isSubmitting}
      >
        {isSubmitting ? "요청 중..." : "🔒 NDA 기반 상세자료 요청 (무료)"}
      </button>
    </form>
  );
}
