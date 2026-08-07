"use client";

import React, { useState } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';
import { toast } from "sonner";

interface CTALadderProps {
  buildingId: string;
  teaserConfigId: string;
  brokerPhone?: string;
}

export function CTALadder({ buildingId, teaserConfigId, brokerPhone = '010-0000-0000' }: CTALadderProps) {
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [isQuestionSubmitting, setIsQuestionSubmitting] = useState(false);
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [isInterestActive, setIsInterestActive] = useState(false);
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsInterestActive(localStorage.getItem(`interest_${buildingId}`) === 'true');
    }
  }, [buildingId]);

  const fp = typeof window !== 'undefined' ? localStorage.getItem('visitorFp') || 'anon' : 'anon';

  const handleCallPhone = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'phone_call' });
    const cleanPhone = brokerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone) {
      window.location.href = `tel:${cleanPhone}`;
    } else {
      toast.error("중개사 전화번호가 등록되지 않았습니다.");
    }
  };

  const handleSmsQuestion = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'sms_open' });
    setShowQuestionForm(!showQuestionForm);
  };

  const submitQuestion = async () => {
    if (!question.trim()) return;
    setIsQuestionSubmitting(true);
    try {
      await fetch('/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'intent.question',
          buildingId,
          payload: { question, phone: brokerPhone }
        })
      });
      setQuestionSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsQuestionSubmitting(false);
    }
  };

  const handleInterest = async () => {
    const newState = !isInterestActive;
    setIsInterestActive(newState);
    if (newState) {
      localStorage.setItem(`interest_${buildingId}`, 'true');
    } else {
      localStorage.removeItem(`interest_${buildingId}`);
    }
    
    try {
      await fetch('/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'intent.watch',
          buildingId,
          payload: { active: newState }
        })
      });
      trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: newState ? 'interest_add' : 'interest_remove' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleFullRequest = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'full_request' });
    const gateForm = document.getElementById('gate-form');
    if (gateForm) {
      gateForm.scrollIntoView({ behavior: 'smooth' });
    } else {
      toast.info("🔑 비밀유지약정(NDA) 체결 및 상세 자료 요청 페이지로 이동합니다.");
    }
  };

  return (
    <>
      {/* Inline Section CTAs */}
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-3 gap-2">
          <button 
            onClick={handleSmsQuestion}
            className="bg-[#1A2333] hover:bg-slate-800 border border-[#252E39] text-slate-200 text-[11.5px] font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            💬 문의하기
          </button>
          <button 
            onClick={handleInterest}
            className={`border text-[11.5px] font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm ${
              isInterestActive 
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' 
                : 'bg-[#1A2333] hover:bg-slate-800 border-[#252E39] text-slate-200'
            }`}
          >
            {isInterestActive ? '★ 관심 등록됨' : '⭐ 관심 등록'}
          </button>
          <button 
            onClick={handleFullRequest}
            className="bg-[#D4A853] hover:bg-[#c39744] text-slate-950 text-[11.5px] font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)] flex items-center justify-center gap-1"
          >
            🔑 상세 요청
          </button>
        </div>

        {showQuestionForm && !questionSubmitted && (
          <div className="bg-[#141A21] border border-[#252E39] p-3.5 rounded-xl space-y-2.5 shadow-lg">
            <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
              <span>✉️</span> 담당 중개사에게 익명 질문 남기기
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="궁금한 내용 (예: 명도 가능 시점, 주차 여건)"
                className="flex-1 bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D4A853]"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button 
                onClick={submitQuestion}
                disabled={isQuestionSubmitting}
                className="bg-[#D4A853] hover:bg-[#c39744] text-slate-950 text-xs px-4 rounded-lg font-bold transition-colors"
              >
                전송
              </button>
            </div>
          </div>
        )}

        {questionSubmitted && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs text-center p-3 rounded-xl font-medium">
            ✓ 질문이 중개사에게 전송되었습니다. 확인 후 답변이 도착합니다.
          </div>
        )}
      </div>

      {/* Floating Bottom Sticky Bar for Mobile Conversion */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B0F14]/95 border-t border-[#252E39] backdrop-blur-md px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex items-center gap-2.5">
          <button
            onClick={handleCallPhone}
            className="flex-1 bg-[#1F2937] hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            <span>📞</span> 전화 연결
          </button>
          <button
            onClick={handleFullRequest}
            className="flex-[2] bg-gradient-to-r from-[#D4A853] to-[#B98A2E] hover:from-[#c39744] hover:to-[#a77a24] text-slate-950 text-xs font-extrabold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(212,168,83,0.3)] flex items-center justify-center gap-1.5"
          >
            <span>🔑</span> 비밀유지(NDA) 체결 후 상세 보기
          </button>
        </div>
      </div>
    </>
  );
}

