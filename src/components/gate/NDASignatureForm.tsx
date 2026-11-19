"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { formatKrPhoneInput } from "@/lib/magazine/phone-input";

export interface NDASignatureFormProps {
  requestId: string;
  grantId?: string;
  buildingId?: string;
  initialGrantToken?: string;
  isAlreadySigned?: boolean;
}

export default function NDASignatureForm({
  requestId,
  grantId,
  initialGrantToken,
  isAlreadySigned = false,
}: NDASignatureFormProps) {
  const router = useRouter();
  const [signerName, setSignerName] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const resolvedTargetId = grantId || requestId;
  const tokenQuery = initialGrantToken
    ? `?token=${encodeURIComponent(initialGrantToken)}`
    : "";

  if (isAlreadySigned) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-blue-800 text-sm font-bold">이미 서명이 완료된 문서입니다.</p>
          <p className="text-sm text-slate-600 mt-1">
            상세 투자설명서 열람 권한이 활성화되어 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            router.push(`/im-pro/${encodeURIComponent(resolvedTargetId)}${tokenQuery}`);
          }}
          className="w-full min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl text-base transition-colors cursor-pointer"
        >
          📱 Pro 투자설명서 열람하기
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!signerName || signerName.trim() === "") {
      setErrorMsg("성함(성명)을 입력해주세요.");
      return;
    }

    if (!agreedToTerms) {
      setErrorMsg("비밀유지약정 조항에 동의해주세요.");
      return;
    }

    if (!signature || signature.trim() === "") {
      setErrorMsg("전자 서명(성함 정자 입력)을 완료해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const payload = {
        agreedToTerms: true,
        signerName: signerName.trim(),
        signerPhone: signerPhone.trim(),
        signature: signature.trim(),
        ...(initialGrantToken ? { grantToken: initialGrantToken } : {}),
      };

      const res = await fetch(`/api/gate-requests/${encodeURIComponent(requestId)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "서명 제출에 실패했습니다.");
      }

      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      } else {
        const nextId = data.grantId || resolvedTargetId;
        const nextToken = data.grantToken || initialGrantToken;
        const nextQuery = nextToken ? `?token=${encodeURIComponent(nextToken)}` : "";
        router.push(`/im-pro/${encodeURIComponent(nextId)}${nextQuery}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} data-testid="nda-signature-form">
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-slate-800 font-bold mb-1.5 ml-1">
            성명 <span className="text-amber-600">*</span>
          </label>
          <input
            type="text"
            placeholder="홍길동"
            className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition-colors"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            disabled={isSubmitting}
            required
            data-testid="input-signer-name"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-800 font-bold mb-1.5 ml-1">
            연락처 (본인 확인용)
          </label>
          <input
            type="tel"
            placeholder="010-0000-0000"
            className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition-colors"
            value={signerPhone}
            onChange={(e) => setSignerPhone(formatKrPhoneInput(e.target.value))}
            disabled={isSubmitting}
            data-testid="input-signer-phone"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-800 font-bold mb-1.5 ml-1">
            전자 서명 (성함을 정자로 입력해주세요) <span className="text-amber-600">*</span>
          </label>
          <input
            type="text"
            placeholder="홍길동"
            className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition-colors font-serif"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={isSubmitting}
            required
            data-testid="input-signature"
          />
        </div>

        <div className="pt-2">
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              disabled={isSubmitting}
              className="mt-1 accent-blue-700 h-4 w-4 rounded shrink-0"
              data-testid="checkbox-agree-terms"
            />
            <span className="text-sm text-slate-700 leading-snug select-none">
              본인은 상기 비밀유지서약서(NDA)의 내용을 충분히 숙지하였으며, 매도인 및 공인중개사의 지적재산권과 영업비밀을 보호하는 데 전적으로 동의합니다.
            </span>
          </label>
        </div>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="text-red-700 bg-red-50 border border-red-200 rounded-xl text-sm font-medium px-3.5 py-2.5"
          data-testid="nda-error-msg"
        >
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !agreedToTerms || !signerName.trim()}
        className="w-full min-h-[48px] bg-blue-700 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-base transition-all active:scale-[0.98] shadow-sm cursor-pointer"
        data-testid="btn-submit-nda"
      >
        {isSubmitting ? "처리 중..." : "동의 및 전자 서명 제출"}
      </button>
    </form>
  );
}
