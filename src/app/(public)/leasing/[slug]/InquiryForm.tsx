"use client";

import { useState } from "react";

interface InquiryFormProps {
  spaceId: string;
  leasingPageId?: string;
  slug: string;
}

const TENANT_TYPES = [
  { value: "clinic", label: "의원/클리닉" },
  { value: "office", label: "오피스" },
  { value: "fnb", label: "F&B" },
  { value: "retail", label: "리테일" },
  { value: "academy", label: "학원/교육" },
  { value: "showroom", label: "쇼룸" },
  { value: "other", label: "기타" },
];

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors";
const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

export default function InquiryForm({ spaceId, leasingPageId, slug }: InquiryFormProps) {
  const [step, setStep] = useState<"form" | "submitting" | "done" | "error">("form");
  const [formData, setFormData] = useState({
    display_name: "",
    company_name: "",
    tenant_category: "",
    move_in_timing: "",
    question_text: "",
    tour_interest: false,
    privacy_consent: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.privacy_consent) return;
    setStep("submitting");

    try {
      const res = await fetch(`/api/spaces/${spaceId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: spaceId,
          leasing_page_id: leasingPageId,
          prospect: {
            display_name: formData.display_name || undefined,
            company_name: formData.company_name || undefined,
          },
          requirement: {
            tenant_category: formData.tenant_category || undefined,
            move_in_timing: formData.move_in_timing || undefined,
            tour_interest: formData.tour_interest,
          },
          question_text: formData.question_text || undefined,
          consent: {
            privacy_consent_given: true,
            consented_at: new Date().toISOString(),
            consent_version: "v1",
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      setStep("done");
    } catch {
      setStep("error");
    }
  };

  if (step === "done") {
    return (
      <div className="text-center space-y-3 py-6">
        <div className="text-4xl">✅</div>
        <h3 className="text-base font-bold text-white">문의가 접수되었습니다</h3>
        <p className="text-xs text-slate-400">브로커가 곧 연락드립니다.</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="text-center space-y-3 py-6">
        <div className="text-4xl">❌</div>
        <p className="text-xs text-slate-400">접수에 실패했습니다.</p>
        <button onClick={() => setStep("form")} className="text-xs text-emerald-400 hover:underline">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>이름 (선택)</label>
          <input
            className={inputCls}
            placeholder="홍길동"
            value={formData.display_name}
            onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelCls}>업체명 (선택)</label>
          <input
            className={inputCls}
            placeholder="OO 클리닉"
            value={formData.company_name}
            onChange={(e) => setFormData((p) => ({ ...p, company_name: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>업종</label>
        <select
          className={inputCls}
          value={formData.tenant_category}
          onChange={(e) => setFormData((p) => ({ ...p, tenant_category: e.target.value }))}
        >
          <option value="">업종 선택</option>
          {TENANT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>희망 입주 시기</label>
        <input
          className={inputCls}
          placeholder="예: 3개월 이내, 6월 중"
          value={formData.move_in_timing}
          onChange={(e) => setFormData((p) => ({ ...p, move_in_timing: e.target.value }))}
        />
      </div>

      <div>
        <label className={labelCls}>궁금하신 점</label>
        <textarea
          rows={3}
          className={inputCls + " resize-none"}
          placeholder="시설, 조건 등 문의하실 내용을 입력해주세요."
          value={formData.question_text}
          onChange={(e) => setFormData((p) => ({ ...p, question_text: e.target.value }))}
        />
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-emerald-500"
          checked={formData.tour_interest}
          onChange={(e) => setFormData((p) => ({ ...p, tour_interest: e.target.checked }))}
        />
        <span className="text-xs text-slate-400">현장 투어에 관심 있습니다</span>
      </label>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-500"
            checked={formData.privacy_consent}
            onChange={(e) => setFormData((p) => ({ ...p, privacy_consent: e.target.checked }))}
            required
          />
          <span className="text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">[필수] 개인정보 처리 동의</span>
            <br />
            수집된 정보는 임대 문의 처리 목적으로만 사용되며 제3자에게 제공되지 않습니다.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={step === "submitting" || !formData.privacy_consent}
        className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all text-sm"
      >
        {step === "submitting" ? "접수 중..." : "문의 접수하기"}
      </button>
    </form>
  );
}
