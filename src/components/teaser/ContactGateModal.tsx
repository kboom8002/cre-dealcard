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
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
      const payloadReason = JSON.stringify({
        type: "anonymous_lead",
        name: name.trim(),
        phone: phone.trim(),
        company: company.trim() || undefined,
        message: message.trim() || "상세 IM 열람을 요청합니다.",
      });

      const [gateRes, eventRes] = await Promise.allSettled([
        fetch("/api/gate-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingId,
            requestedLevel: "G1",
            requestedFields: ["im_lite_request"],
            reason: payloadReason,
          }),
        }),
        fetch("/api/public/teaser/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingId,
            eventType: "intent.pro_im_request",
            eventData: {
              name: name.trim(),
              phone: phone.trim(),
              company: company.trim() || undefined,
              message: message.trim() || undefined,
            },
            metadata: {
              name: name.trim(),
              phone: phone.trim(),
              company: company.trim() || undefined,
              message: message.trim() || undefined,
            },
          }),
        }),
      ]);

      const gateOk = gateRes.status === "fulfilled" && gateRes.value.ok;
      const eventOk = eventRes.status === "fulfilled" && eventRes.value.ok;

      if (!gateOk && !eventOk) {
        setErrorMessage("요청 전송에 실패했어요. 잠시 후 다시 눌러 주세요.");
        return;
      }

      try {
        localStorage.setItem(`contact_verified_${buildingId}`, "true");
      } catch {
        // ignore storage error
      }
      setIsSubmitted(true);
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
      data-testid="contact-gate-modal"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 text-base"
        >
          ✕
        </button>

        {isSubmitted ? (
          <div className="space-y-4 py-2" data-testid="contact-gate-submitted">
            <div className="space-y-2 pr-8">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ✓ 신청 접수 완료
              </span>
              <h3 id="contact-gate-modal-title" className="text-xl font-extrabold text-white">
                상세 IM 열람 신청이 접수되었습니다
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed break-keep">
                담당 중개사가 신청 내용을 확인한 뒤 입력하신 연락처({phone})로 전용 열람 링크를 보내드립니다.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                data-testid="contact-gate-close-btn"
                className="flex-1 min-h-[48px] py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold rounded-xl text-base transition-all cursor-pointer"
              >
                확인
              </button>
              <button
                type="button"
                onClick={onSuccess}
                data-testid="contact-gate-preview-btn"
                className="flex-1 min-h-[48px] py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-sm border border-slate-600 transition-all cursor-pointer"
              >
                기본 요약본 먼저 보기
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 pr-10">
              <h3 id="contact-gate-modal-title" className="text-xl font-extrabold text-white">
                IM 자료 요청하기
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed break-keep">
                이름과 연락처를 남겨 주시면 담당 중개사가 확인 후 상세 자료를 보내드립니다.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="contact-gate-name"
                    className="block text-sm font-bold text-slate-200 mb-1.5"
                  >
                    이름 (필수)
                  </label>
                  <input
                    id="contact-gate-name"
                    data-testid="contact-gate-name"
                    type="text"
                    required
                    placeholder="예: 박매수 상무"
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
                    연락처 (필수)
                  </label>
                  <input
                    id="contact-gate-phone"
                    data-testid="contact-gate-phone"
                    type="tel"
                    inputMode="tel"
                    required
                    placeholder="010-8888-7777"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full min-h-[48px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="contact-gate-company"
                  className="block text-sm font-bold text-slate-200 mb-1.5"
                >
                  소속 · 기관명 (선택)
                </label>
                <input
                  id="contact-gate-company"
                  data-testid="contact-gate-company"
                  type="text"
                  placeholder="예: 케이리츠자산운용"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full min-h-[48px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-gate-message"
                  className="block text-sm font-bold text-slate-200 mb-1.5"
                >
                  문의 내용 (선택)
                </label>
                <input
                  id="contact-gate-message"
                  data-testid="contact-gate-message"
                  type="text"
                  placeholder="예: 투심위 상정용 임대 현황 및 상세 IM 요청드립니다"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
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
                data-testid="contact-gate-submit-btn"
                className="w-full min-h-[52px] py-3 mt-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold rounded-xl text-base transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "요청 보내는 중…" : "IM 요청 보내기"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
