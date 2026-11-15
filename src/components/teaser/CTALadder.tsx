"use client";

import React, { useState } from "react";
import { trackTeaserCta } from "./TeaserEventTracker";
import { ContactGateModal } from "./ContactGateModal";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useBottomSlot } from "@/components/ui/use-bottom-slot";
import { TERMS } from "@/lib/ux/lexicon";

interface CTALadderProps {
  buildingId: string;
  teaserConfigId: string;
  brokerPhone?: string;
  requireNda?: boolean;
  hasImDoc?: boolean;
  isPptxApproved?: boolean;
  pptxDownloadUrl?: string;
}

function readSafeLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function CTALadder({
  buildingId,
  teaserConfigId,
  brokerPhone,
  requireNda = false,
  hasImDoc = true,
}: CTALadderProps) {
  const router = useRouter();
  const [showContactModal, setShowContactModal] = useState(false);
  const [requestConfirmed, setRequestConfirmed] = useState(false);
  useBottomSlot(`cta-ladder-${buildingId}`);

  const fp = readSafeLocalStorage("visitorFp") || "anon";
  const cleanPhone = brokerPhone ? brokerPhone.replace(/[^0-9]/g, "") : "";
  const hasValidPhone = cleanPhone.length >= 8;
  const isVerified =
    requestConfirmed || Boolean(readSafeLocalStorage(`contact_verified_${buildingId}`));

  const handleCallPhone = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", { action: "phone_call" });
    if (hasValidPhone) {
      window.location.href = `tel:${cleanPhone}`;
    } else {
      toast.info(
        hasImDoc
          ? "전화번호가 등록되지 않았습니다. IM 요청하기를 이용해 주세요."
          : "전화번호가 등록되지 않았습니다. 상세 자료 요청을 이용해 주세요."
      );
    }
  };

  const handleProImRequest = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", {
      action: hasImDoc ? "pro_im_request" : "detail_doc_request",
    });
    if (requireNda) {
      router.push(`/nda/${buildingId}`);
      return;
    }
    if (!hasImDoc) {
      setShowContactModal(true);
      return;
    }
    if (isVerified) {
      router.push(`/im-lite/${buildingId}?pro=true`);
    } else {
      setShowContactModal(true);
    }
  };

  return (
    <>
      {/* Strictly Two Fixed Primary Buttons: [전화하기] [IM 요청하기 / 상세 자료 요청] */}
      <div
        data-testid="public-dealcard-sticky-cta"
        className="grid grid-cols-2 gap-3 pt-2"
      >
        <button
          type="button"
          onClick={handleCallPhone}
          data-testid="public-dealcard-call-btn"
          className="min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white text-base font-extrabold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
        >
          <span>{TERMS.recipientCallCta}</span>
        </button>

        {!hasImDoc && isVerified ? (
          hasValidPhone ? (
            <a
              href={`tel:${cleanPhone}`}
              data-testid="public-dealcard-im-request-btn"
              data-cta-action="상세 자료 요청 접수됨"
              className="min-h-[52px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-sm sm:text-base font-extrabold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-center active:scale-95 cursor-pointer"
            >
              <span>✅ 상세 자료 요청 접수됨</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              data-testid="public-dealcard-im-request-btn"
              data-cta-action="상세 자료 요청 접수됨"
              className="min-h-[52px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-sm sm:text-base font-extrabold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-center active:scale-95 cursor-pointer"
            >
              <span>✅ 상세 자료 요청 접수됨</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={handleProImRequest}
            data-testid="public-dealcard-im-request-btn"
            data-cta-action={hasImDoc ? "상세 IM 신청하기" : "담당 중개사에게 상세 자료 요청"}
            className="min-h-[52px] bg-amber-400 hover:bg-amber-500 text-slate-950 text-sm sm:text-base font-extrabold py-3 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 text-center active:scale-95 cursor-pointer"
          >
            <span>
              {hasImDoc ? TERMS.recipientImRequestCta : "📩 담당 중개사에게 상세 자료 요청"}
            </span>
          </button>
        )}
      </div>

      {/* Lightweight Contact Gate Modal */}
      <ContactGateModal
        isOpen={showContactModal}
        onClose={() => {
          if (!hasImDoc && readSafeLocalStorage(`contact_verified_${buildingId}`)) {
            setRequestConfirmed(true);
          }
          setShowContactModal(false);
        }}
        buildingId={buildingId}
        hasImDoc={hasImDoc}
        brokerPhone={brokerPhone}
        onSuccess={() => {
          if (hasImDoc) {
            setShowContactModal(false);
            router.push(`/im-lite/${buildingId}?pro=true`);
          } else {
            setRequestConfirmed(true);
            setShowContactModal(false);
          }
        }}
      />
    </>
  );
}
