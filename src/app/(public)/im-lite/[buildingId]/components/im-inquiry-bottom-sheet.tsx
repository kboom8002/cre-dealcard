"use client";

import React, { useId, useState } from "react";
import { Modal } from "@/components/ui/modal";

interface IMInquiryBottomSheetProps {
  buildingId: string;
  docId?: string;
  brokerUserId: string;
  brokerName: string;
  blindName: string;
  onClose: () => void;
}

export function IMInquiryBottomSheet({
  buildingId,
  docId,
  brokerUserId,
  brokerName,
  blindName,
  onClose,
}: IMInquiryBottomSheetProps) {
  const uid = useId();
  const nameId = `${uid}-inquiry-name`;
  const phoneId = `${uid}-inquiry-phone`;
  const emailId = `${uid}-inquiry-email`;
  const messageId = `${uid}-inquiry-message`;
  const privacyId = `${uid}-inquiry-privacy`;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    `${blindName} 건물에 관심이 있습니다. 프라이빗 IM을 요청합니다.`
  );
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError("이름과 연락처(휴대폰 번호)는 필수입니다.");
      return;
    }
    if (!privacyAgreed) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/public/im-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: buildingId,
          doc_id: docId,
          broker_user_id: brokerUserId,
          requester_name: name.trim(),
          requester_phone: phone.trim(),
          requester_email: email.trim() || undefined,
          message: message.trim() || undefined,
          privacy_agreed: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSubmitted(true);
      } else {
        setError(data?.error || "접수에 실패했습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="📄 프라이빗 IM 신청"
      side="bottom"
      size="md"
      className="mx-auto sm:my-auto sm:max-w-md sm:rounded-2xl sm:border-b bg-neutral-900 border-neutral-800"
    >
      <div data-testid="im-inquiry-bottom-sheet">
        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-white">신청이 완료되었습니다</h3>
            <p className="text-sm text-neutral-300">
              {brokerName} 중개인이 검토 후 신속히 연락드리겠습니다.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 min-h-[48px] px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-[16px] font-semibold"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-300">
              상세 재무 분석, 임대차 현황, 공부 서류가 포함된 전체 IM 열람을 요청합니다.
            </p>

            <div>
              <label
                htmlFor={nameId}
                className="block text-sm font-semibold text-neutral-200 mb-1"
              >
                성함 <span className="text-rose-400">*</span>
              </label>
              <input
                id={nameId}
                type="text"
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성함을 입력해 주세요"
                className="w-full min-h-[48px] bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-[16px] text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor={phoneId}
                className="block text-sm font-semibold text-neutral-200 mb-1"
              >
                연락처 <span className="text-rose-400">*</span>
              </label>
              <input
                id={phoneId}
                type="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full min-h-[48px] bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-[16px] text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor={emailId}
                className="block text-sm font-semibold text-neutral-200 mb-1"
              >
                이메일 (선택)
              </label>
              <input
                id={emailId}
                type="email"
                maxLength={120}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
                className="w-full min-h-[48px] bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-[16px] text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor={messageId}
                className="block text-sm font-semibold text-neutral-200 mb-1"
              >
                문의 내용
              </label>
              <textarea
                id={messageId}
                value={message}
                maxLength={1000}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full min-h-[48px] bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-[16px] text-white placeholder-neutral-500 focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-neutral-700 bg-neutral-800/70 p-3">
              <input
                id={privacyId}
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-neutral-500 accent-primary text-[16px] cursor-pointer"
              />
              <label
                htmlFor={privacyId}
                className="text-sm text-neutral-200 leading-snug cursor-pointer"
              >
                [필수] 매물 상담 및 상세 IM 안내를 위한 개인정보(성함·연락처·이메일) 수집·이용에 동의합니다.
              </label>
            </div>

            {error && (
              <p role="alert" className="text-sm text-rose-400 font-medium">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full min-h-[48px] py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-[16px] font-bold transition-colors"
            >
              {submitting ? "접수 중..." : "프라이빗 IM 신청하기"}
            </button>

            <p className="text-sm text-neutral-400 text-center">
              입력하신 정보는 담당 중개인에게만 전달되며, 투자 상담 목적으로만 사용됩니다.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
