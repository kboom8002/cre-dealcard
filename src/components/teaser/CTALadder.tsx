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

export function CTALadder({
  buildingId,
  teaserConfigId,
  brokerPhone,
  requireNda = false,
}: CTALadderProps) {
  const router = useRouter();
  const [showContactModal, setShowContactModal] = useState(false);
  useBottomSlot(`cta-ladder-${buildingId}`);
  const fp =
    typeof window !== "undefined" ? localStorage.getItem("visitorFp") || "anon" : "anon";
  const cleanPhone = brokerPhone ? brokerPhone.replace(/[^0-9]/g, "") : "";
  const hasValidPhone = cleanPhone.length >= 8;

  const handleCallPhone = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", { action: "phone_call" });
    if (hasValidPhone) {
      window.location.href = `tel:${cleanPhone}`;
    } else {
      toast.info("전화번호가 등록되지 않았습니다. IM 요청하기를 이용해 주세요.");
    }
  };

  const handleProImRequest = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", { action: "pro_im_request" });
    if (requireNda) {
      router.push(`/nda/${buildingId}`);
    } else {
      const isVerified =
        typeof window !== "undefined"
          ? localStorage.getItem(`contact_verified_${buildingId}`)
          : null;
      if (isVerified) {
        router.push(`/im-lite/${buildingId}?pro=true`);
      } else {
        setShowContactModal(true);
      }
    }
  };

  return (
    <>
      {/* Strictly Two Fixed Primary Buttons: [전화하기] [IM 요청하기] */}
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

        <button
          type="button"
          onClick={handleProImRequest}
          data-testid="public-dealcard-im-request-btn"
          data-cta-action="상세 IM 신청하기"
          className="min-h-[52px] bg-amber-400 hover:bg-amber-500 text-slate-950 text-base font-extrabold py-3 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
        >
          <span>{TERMS.recipientImRequestCta}</span>
        </button>
      </div>

      {/* Lightweight Contact Gate Modal */}
      <ContactGateModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        buildingId={buildingId}
        onSuccess={() => {
          setShowContactModal(false);
          router.push(`/im-lite/${buildingId}?pro=true`);
        }}
      />
    </>
  );
}
