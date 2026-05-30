"use client";

import React, { useState } from "react";

interface ReverseOnboardingFormProps {
  buildingId: string;
  buildingArea: string;
  buildingAssetType: string;
}

export function ReverseOnboardingForm({
  buildingId,
  buildingArea,
  buildingAssetType,
}: ReverseOnboardingFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    company: "",
    budget: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/public/reverse-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          ...formData,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert("의향서 전송 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } catch {
      alert("네트워크 통신 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center space-y-3 animate-fadeIn">
        <span className="text-3xl">✉️</span>
        <h3 className="text-base font-bold text-foreground">의향서 전송 완료</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          입력하신 소중한 매수 의향서가 매물 담당 중개인에게 안전하게 전달되었습니다.
          검토 후 신속하게 연락드리겠습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4 shadow-lg backdrop-blur-md">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          🎯 이 매물에 관심이 있으신가요?
        </h3>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {buildingArea} {buildingAssetType}에 대한 매수/공동중개 의향을 남겨주시면, 담당 중개인이 직접 상세 자료를 송신해 드립니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            required
            placeholder="이름/회사명"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:border-primary/50 text-foreground"
          />
          <input
            type="tel"
            required
            placeholder="연락처 (휴대폰)"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:border-primary/50 text-foreground"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="소속 회사 (선택)"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:border-primary/50 text-foreground"
          />
          <input
            type="text"
            required
            placeholder="희망 매수 예산 (예: 300억)"
            value={formData.budget}
            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:border-primary/50 text-foreground"
          />
        </div>

        <textarea
          rows={2}
          placeholder="추가 희망 조건 또는 문의 사항을 남겨주세요 (선택)"
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full text-xs px-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:border-primary/50 text-foreground resize-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? "전송 중..." : "매수 의향서 간편 송신 ⚡"}
        </button>
      </form>
    </div>
  );
}
