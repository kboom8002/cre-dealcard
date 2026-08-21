"use client";

import React, { useState } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';
import { ContactGateModal } from './ContactGateModal';
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface CTALadderProps {
  buildingId: string;
  teaserConfigId: string;
  brokerPhone?: string;
  requireNda?: boolean;
  /** IM 문서 존재 여부 — false이면 "모바일 IM 보기" 버튼을 숨기거나 안내로 대체 */
  hasImDoc?: boolean;
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
  const fp = typeof window !== 'undefined' ? localStorage.getItem('visitorFp') || 'anon' : 'anon';
  const cleanPhone = brokerPhone ? brokerPhone.replace(/[^0-9]/g, '') : '';

  const handleCallPhone = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'phone_call' });
    if (cleanPhone && cleanPhone.length >= 10) {
      window.location.href = `tel:${cleanPhone}`;
    } else {
      toast.info("담당 중개사에게 연결을 요청합니다. 잠시만 기다려 주세요.");
    }
  };

  const handleBasicIm = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'basic_im' });
    if (hasImDoc) {
      router.push(`/im-lite/${buildingId}`);
    } else {
      toast.info("📄 모바일 IM이 아직 준비되지 않았습니다. 담당 중개사에게 문의해주세요.");
    }
  };

  const handleProImRequest = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'pro_im_request' });
    if (requireNda) {
      const gateForm = document.getElementById('gate-form');
      if (gateForm) {
        gateForm.scrollIntoView({ behavior: 'smooth' });
      } else {
        toast.info("🔑 비밀유지약정(NDA) 체결 후 상세 자료가 제공됩니다.");
      }
    } else {
      // Check if already verified
      const isVerified = localStorage.getItem(`contact_verified_${buildingId}`);
      if (isVerified) {
        router.push(`/im-lite/${buildingId}?pro=true`);
      } else {
        setShowContactModal(true);
      }
    }
  };

  return (
    <>
      {/* Inline Vertical Stack CTAs */}
      <div className="space-y-2.5 pt-2">
        {hasImDoc ? (
          <button
            onClick={handleBasicIm}
            className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-100 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-between group"
          >
            <div className="flex items-center gap-2 text-left">
              <span className="text-base">📄</span>
              <div>
                <div className="font-extrabold text-slate-100">모바일 IM 보기 (무료)</div>
                <div className="text-[11px] font-normal text-slate-400">7-Section 기본 투자설명서를 바로 확인합니다</div>
              </div>
            </div>
            <span className="text-slate-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        ) : (
          <div className="w-full py-3 px-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-center">
            <p className="text-slate-400">📄 모바일 투자설명서(IM)가 아직 준비 중입니다</p>
            <p className="text-[10px] text-slate-500 mt-1">담당 중개사에게 문의하시면 빠르게 확인 가능합니다</p>
          </div>
        )}

        <button
          onClick={handleProImRequest}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 border border-amber-500/40 text-amber-200 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-between group"
        >
          <div className="flex items-center gap-2 text-left">
            <span className="text-base">🔑</span>
            <div>
              <div className="font-extrabold text-amber-300">상세 IM 보기</div>
              <div className="text-[11px] font-normal text-amber-200/70">
                {requireNda ? "NDA 체결 후 10년 DCF · 수지분석 열람" : "연락처 확인 후 10년 DCF · 수지분석 열람"}
              </div>
            </div>
          </div>
          <span className="text-amber-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </div>

      {/* Floating Bottom Sticky Bar: Equal-weight 2 Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F14]/95 border-t border-[#252E39] backdrop-blur-md px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex items-center gap-2.5">
          <button
            onClick={handleCallPhone}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
          >
            <span>📞</span>
            <span>전화 연결</span>
          </button>
          {hasImDoc ? (
            <button
              onClick={handleBasicIm}
              className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 text-xs font-extrabold py-3 px-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5"
            >
              <span>📄</span>
              <span>모바일 IM 보기</span>
            </button>
          ) : (
            <button
              onClick={handleBasicIm}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <span>📄</span>
              <span>IM 준비 중</span>
            </button>
          )}
        </div>
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
