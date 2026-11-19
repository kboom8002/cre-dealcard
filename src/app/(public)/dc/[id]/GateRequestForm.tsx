"use client";

import React, { useId, useState } from "react";
import { formatKrPhoneInput } from "@/lib/format/phone";

export default function GateRequestForm({ buildingId }: { buildingId: string }) {
  const uid = useId();
  const nameId = `${uid}-gate-name`;
  const contactId = `${uid}-gate-contact`;
  const consentId = `${uid}-gate-consent`;

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      setErrorMsg("성함과 연락처를 모두 입력해주세요.");
      return;
    }
    if (!privacyConsent) {
      setErrorMsg("개인정보 수집 및 이용에 동의해주세요.");
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
          buildingId,
          requestedLevel: "G1",
          name: name.trim(),
          phone: contact.trim(),
          privacyConsent: true,
          reason: reasonData,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (typeof json?.error === "string" ? json.error : json?.error?.message) ||
          "요청 처리에 실패했습니다.";
        throw new Error(msg);
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
        <p className="text-emerald-900 text-base font-bold mb-1">✅ 요청이 접수되었습니다.</p>
        <p className="text-emerald-800 text-sm">담당 공인중개사가 확인 후 연락드립니다.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={nameId}
            className="mb-1 block text-sm font-semibold text-slate-800"
          >
            성함 또는 기업명
          </label>
          <input
            id={nameId}
            type="text"
            placeholder="성함 또는 기업명"
            className="min-h-[48px] w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label
            htmlFor={contactId}
            className="mb-1 block text-sm font-semibold text-slate-800"
          >
            연락처
          </label>
          <input
            id={contactId}
            type="tel"
            placeholder="010-0000-0000"
            className="min-h-[48px] w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
            value={contact}
            onChange={(e) => setContact(formatKrPhoneInput(e.target.value))}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <input
          id={consentId}
          type="checkbox"
          checked={privacyConsent}
          onChange={(e) => setPrivacyConsent(e.target.checked)}
          disabled={isSubmitting}
          className="min-h-[48px] w-5 shrink-0 cursor-pointer text-[16px] accent-slate-900"
        />
        <label
          htmlFor={consentId}
          className="flex min-h-[48px] cursor-pointer items-center text-sm text-slate-700 leading-snug"
        >
          <span>
            상세자료 안내를 위한{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 underline"
            >
              개인정보 수집·이용(새 창)
            </a>
            에 동의합니다. (필수)
          </span>
        </label>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {errorMsg}
        </p>
      )}
      <button
        type="submit"
        className="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-[16px] transition-colors active:scale-[0.98]"
        disabled={isSubmitting}
      >
        {isSubmitting ? "요청 중..." : "🔒 NDA 기반 상세자료 요청 (무료)"}
      </button>
    </form>
  );
}
