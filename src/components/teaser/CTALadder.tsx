"use client";

import React, { useState } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';

interface CTALadderProps {
  buildingId: string;
  teaserConfigId: string;
  brokerPhone?: string;
}

export function CTALadder({ buildingId, teaserConfigId, brokerPhone }: CTALadderProps) {
  const [showInterestForm, setShowInterestForm] = useState(false);
  const [contact, setContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fp = typeof window !== 'undefined' ? localStorage.getItem('visitorFp') || 'anon' : 'anon';

  const handleCall = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'call' });
    if (brokerPhone) {
      window.location.href = `tel:${brokerPhone}`;
    } else {
      alert("연락처 정보가 없습니다.");
    }
  };

  const handleInterest = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'interest_open' });
    setShowInterestForm(!showInterestForm);
  };

  const submitInterest = async () => {
    if (!contact) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/gate-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId,
          requestedLevel: 'interest',
          reason: JSON.stringify({ contact })
        })
      });
      trackTeaserCta(teaserConfigId, fp, 'gate_request', { level: 'interest' });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFullRequest = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'full_request' });
    const gateForm = document.getElementById('gate-form');
    if (gateForm) {
      gateForm.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert("상세 요청 폼으로 이동합니다.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={handleCall}
          className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-medium py-3 rounded-xl transition-colors"
        >
          💬 질문하기
        </button>
        <button 
          onClick={handleInterest}
          className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-medium py-3 rounded-xl transition-colors"
        >
          ⭐ 관심 등록
        </button>
        <button 
          onClick={handleFullRequest}
          className="bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]"
        >
          🔑 상세 요청
        </button>
      </div>

      {showInterestForm && !submitted && (
        <div className="bg-[#141A21] border border-[#252E39] p-3 rounded-xl flex gap-2">
          <input
            type="text"
            placeholder="연락처를 남겨주세요"
            className="flex-1 bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <button 
            onClick={submitInterest}
            disabled={isSubmitting}
            className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-4 rounded-lg font-medium"
          >
            등록
          </button>
        </div>
      )}

      {submitted && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center p-3 rounded-xl">
          관심 등록이 완료되었습니다.
        </div>
      )}
    </div>
  );
}
