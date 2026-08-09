"use client";

import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  buildingId: string;
  onSuccess: () => void;
}

export function ContactGateModal({ isOpen, onClose, buildingId, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("성함과 연락처를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Save contact request event
      await fetch("/api/public/teaser/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          eventType: "intent.pro_im_request",
          metadata: { name, phone, company }
        })
      });
      
      localStorage.setItem(`contact_verified_${buildingId}`, "true");
      onSuccess();
    } catch (err) {
      console.error(err);
      onSuccess(); // Graceful fallback
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 text-sm"
        >
          ✕
        </button>

        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>🔑</span> 상세 IM 즉시 열람
          </h3>
          <p className="text-xs text-slate-400">
            간단한 연락처 확인 후 10년 DCF 및 상세 수지분석표를 즉시 열람하실 수 있습니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">성함 *</label>
            <input
              type="text"
              required
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">연락처 *</label>
            <input
              type="tel"
              required
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">소속 / 회사명 (선택)</label>
            <input
              type="text"
              placeholder="예: ABC 자산운용 / 개인"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 mt-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {isSubmitting ? "확인 중..." : "📄 상세 IM 열람하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
