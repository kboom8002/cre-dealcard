"use client";

import React, { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  buildingId: string;
  onSuccess: () => void;
}

export function ContactGateModal({ isOpen, onClose, buildingId, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !phone.trim()) {
      setErrorMessage("이름과 연락처를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/public/teaser/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          eventType: "intent.pro_im_request",
          metadata: { name: name.trim(), phone: phone.trim() },
        }),
      });

      if (!res.ok) {
        setErrorMessage("요청 전송에 실패했어요. 잠시 후 다시 눌러 주세요.");
        return;
      }

      try {
        localStorage.setItem(`contact_verified_${buildingId}`, "true");
      } catch {
        // ignore storage error
      }
      onSuccess();
    } catch {
      setErrorMessage("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-gate-modal-title"
    >
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 text-base"
        >
          ✕
        </button>

        <div className="space-y-1.5 pr-10">
          <h3 id="contact-gate-modal-title" className="text-xl font-extrabold text-white">
            IM 자료 요청하기
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed break-keep">
            이름과 연락처를 남겨 주시면 담당 중개사가 확인 후 상세 자료를 보내드립니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label
              htmlFor="contact-gate-name"
              className="block text-sm font-bold text-slate-200 mb-1.5"
            >
              이름
            </label>
            <input
              id="contact-gate-name"
              type="text"
              required
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[48px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label
              htmlFor="contact-gate-phone"
              className="block text-sm font-bold text-slate-200 mb-1.5"
            >
              연락처
            </label>
            <input
              id="contact-gate-phone"
              type="tel"
              inputMode="tel"
              required
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[48px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <p className="text-sm text-slate-300 leading-snug break-keep">
            요청을 보내면 매물 안내를 위한 연락처 수집·이용에 동의하게 됩니다.
          </p>

          {errorMessage && (
            <p role="alert" className="text-sm font-bold text-red-400">
              ⚠ {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[52px] py-3 mt-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold rounded-xl text-base transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "요청 보내는 중…" : "IM 요청 보내기"}
          </button>
        </form>
      </div>
    </div>
  );
}
