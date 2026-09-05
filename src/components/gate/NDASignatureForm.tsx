"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export interface NDASignatureFormProps {
  requestId: string;
  buildingId?: string;
  isAlreadySigned?: boolean;
}

export default function NDASignatureForm({
  requestId,
  buildingId,
  isAlreadySigned = false,
}: NDASignatureFormProps) {
  const router = useRouter();
  const [signerName, setSignerName] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (isAlreadySigned) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-primary text-sm font-bold">이미 서명이 완료된 문서입니다.</p>
          <p className="text-xs text-slate-400 mt-1">상세 투자설명서 열람 권한이 활성화되어 있습니다.</p>
        </div>
        <button
          onClick={() => {
            if (buildingId) {
              router.push(`/im-lite/${buildingId}?doc=${requestId}&pro=true`);
            } else {
              router.push(`/im-pro/${requestId}`);
            }
          }}
          className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-3 rounded-xl text-sm transition-colors"
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
      };

      const res = await fetch(`/api/gate-requests/${requestId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "서명 제출에 실패했습니다.");
      }

      // Automatically redirect cleanly based on response
      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      } else if (data.grantId) {
        router.push(`/im-pro/${data.grantId}`);
      } else if (buildingId) {
        router.push(`/im-lite/${buildingId}?doc=${requestId}&pro=true`);
      } else {
        router.push(`/im-pro/${requestId}`);
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
          <label className="block text-xs text-slate-400 font-bold mb-1.5 ml-1">
            성명 <span className="text-amber-400">*</span>
          </label>
          <input
            type="text"
            placeholder="홍길동"
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            disabled={isSubmitting}
            required
            data-testid="input-signer-name"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 font-bold mb-1.5 ml-1">
            연락처 (선택)
          </label>
          <input
            type="tel"
            placeholder="010-0000-0000"
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
            value={signerPhone}
            onChange={(e) => setSignerPhone(e.target.value)}
            disabled={isSubmitting}
            data-testid="input-signer-phone"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 font-bold mb-1.5 ml-1">
            전자 서명 (성함을 정자로 입력해주세요) <span className="text-amber-400">*</span>
          </label>
          <input
            type="text"
            placeholder="홍길동"
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors font-serif"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={isSubmitting}
            required
            data-testid="input-signature"
          />
        </div>

        <div className="pt-2">
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:bg-slate-900 transition-colors">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              disabled={isSubmitting}
              className="mt-0.5 accent-primary h-4 w-4 rounded"
              data-testid="checkbox-agree-terms"
            />
            <span className="text-xs text-slate-300 leading-snug select-none">
              본인은 상기 비밀유지서약서(NDA)의 내용을 충분히 숙지하였으며, 매도인 및 중개사의 지적재산권과 영업비밀을 보호하는 데 전적으로 동의합니다.
            </span>
          </label>
        </div>
      </div>

      {errorMsg && (
        <p className="text-red-400 text-xs px-1" data-testid="nda-error-msg">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !agreedToTerms || !signerName.trim()}
        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
        data-testid="btn-submit-nda"
      >
        {isSubmitting ? "처리 중..." : "동의 및 전자 서명 제출"}
      </button>
    </form>
  );
}
