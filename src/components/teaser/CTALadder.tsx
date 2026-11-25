"use client";

import React, { useEffect, useState } from "react";
import { trackTeaserCta } from "./TeaserEventTracker";
import { ContactGateModal } from "./ContactGateModal";
import { toast } from "sonner";
import { useBottomSlot } from "@/components/ui/use-bottom-slot";
import { TERMS } from "@/lib/ux/lexicon";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { formatKrPhoneInput } from "@/lib/format/phone";
import {
  PhoneActionButton,
  isValidKrPhone,
  sanitizePhoneDigits,
} from "@/components/common/PhoneActionButton";

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
  hasImDoc = true,
}: CTALadderProps) {
  const [showContactModal, setShowContactModal] = useState(false);
  const [requestConfirmed, setRequestConfirmed] = useState(false);
  const [serverCookieVerified, setServerCookieVerified] = useState(false);
  useBottomSlot(`cta-ladder-${buildingId}`);

  useEffect(() => {
    let cancelled = false;
    if (readSafeLocalStorage(`contact_verified_${buildingId}`) === "true") {
      setRequestConfirmed(true);
    }
    fetch(`/api/gate-requests?buildingId=${encodeURIComponent(buildingId)}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { verified?: boolean } | null) => {
        if (!cancelled && json?.verified === true) {
          setServerCookieVerified(true);
        }
      })
      .catch(() => {
        // non-blocking
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const fp = readSafeLocalStorage("visitorFp") || "anon";
  const cleanPhone = sanitizePhoneDigits(brokerPhone);
  const hasValidPhone = isValidKrPhone(brokerPhone);
  const isVerified = requestConfirmed || serverCookieVerified;

  const handleCallPhoneUnavailable = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", { action: "phone_call" });
    toast.info(
      hasImDoc
        ? "전화번호가 등록되지 않았습니다. IM 요청하기를 이용해 주세요."
        : "전화번호가 등록되지 않았습니다. 상세 자료 요청을 이용해 주세요."
    );
  };

  const handleProImRequest = () => {
    trackTeaserCta(teaserConfigId, fp, "cta_click", {
      action: hasImDoc ? "pro_im_request" : "detail_doc_request",
    });
    setShowContactModal(true);
  };

  return (
    <>
      {/* Strictly Two Fixed Primary Buttons: [전화하기] [IM 요청하기 / 상세 자료 요청] */}
      <div
        data-testid="public-dealcard-sticky-cta"
        className="grid grid-cols-2 gap-3 pt-2"
      >
        {hasValidPhone ? (
          <PhoneActionButton
            phone={brokerPhone}
            variant="compact"
            showCopyButton={false}
            callTestId="public-dealcard-call-btn"
            onCallClick={() =>
              trackTeaserCta(teaserConfigId, fp, "cta_click", {
                action: "phone_call",
              })
            }
            className="flex w-full"
            callClassName="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white text-base font-extrabold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
            renderCallContent={<span>{TERMS.recipientCallCta}</span>}
          />
        ) : (
          <button
            type="button"
            onClick={handleCallPhoneUnavailable}
            data-testid="public-dealcard-call-btn"
            className="min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white text-base font-extrabold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <span>{TERMS.recipientCallCta}</span>
          </button>
        )}

        {isVerified ? (
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            data-testid="public-dealcard-im-request-btn"
            data-cta-action="상세 자료 요청 접수됨"
            className="min-h-[52px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-sm sm:text-base font-extrabold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-center active:scale-95 cursor-pointer"
          >
            <span>✅ 상세 자료 요청 접수됨</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleProImRequest}
            data-testid="public-dealcard-im-request-btn"
            data-cta-action={hasImDoc ? "상세 IM 신청하기" : "담당 중개사에게 상세 자료 요청"}
            className="min-h-[52px] bg-amber-400 hover:bg-amber-500 text-slate-950 text-sm sm:text-base font-extrabold py-3 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 text-center active:scale-95 cursor-pointer"
          >
            <span>{TERMS.recipientImRequestCta}</span>
          </button>
        )}
      </div>

      {hasValidPhone && (
        <div
          data-testid="public-dealcard-micro-actions"
          className="grid grid-cols-2 gap-2 pt-2"
        >
          <a
            href={`sms:${cleanPhone}`}
            data-testid="public-dealcard-sms-link"
            onClick={() =>
              trackTeaserCta(teaserConfigId, fp, "cta_click", {
                action: "sms_inquiry",
              })
            }
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5 text-center transition cursor-pointer"
          >
            <span>💬 문자 문의 남기기</span>
          </a>
          <button
            type="button"
            data-testid="public-dealcard-copy-phone-btn"
            onClick={async () => {
              trackTeaserCta(teaserConfigId, fp, "cta_click", {
                action: "copy_phone",
              });
              const formatted = formatKrPhoneInput(cleanPhone);
              const ok = await copyText(formatted);
              if (ok) {
                toast.success(`담당 중개사 연락처(${formatted})를 복사했습니다.`);
              } else {
                toast.error(COPY_FAILED_MESSAGE);
              }
            }}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5 text-center transition cursor-pointer"
          >
            <span>📋 연락처 복사</span>
          </button>
        </div>
      )}

      {/* Lightweight Contact Gate Modal */}
      <ContactGateModal
        isOpen={showContactModal}
        onClose={() => {
          if (readSafeLocalStorage(`contact_verified_${buildingId}`) === "true") {
            setRequestConfirmed(true);
          }
          setShowContactModal(false);
        }}
        buildingId={buildingId}
        hasImDoc={hasImDoc}
        brokerPhone={brokerPhone}
        initialConfirmed={isVerified}
        onSubmitted={() => setRequestConfirmed(true)}
        onSuccess={() => {
          setRequestConfirmed(true);
          setShowContactModal(false);
        }}
      />
    </>
  );
}
