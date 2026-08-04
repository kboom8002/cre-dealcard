"use client";

import React, { useState } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';

interface CTALadderProps {
  buildingId: string;
  teaserConfigId: string;
  brokerPhone?: string;
}

export function CTALadder({ buildingId, teaserConfigId, brokerPhone }: CTALadderProps) {
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

  const handleCall = () => {
    trackTeaserCta(teaserConfigId, fp, 'cta_click', { action: 'question_open' });
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
          payload: { question }
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
          {isInterestActive ? '★ 관심 등록' : '⭐ 관심 등록'}
        </button>
        <button 
          onClick={handleFullRequest}
          className="bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]"
        >
          🔑 상세 요청
        </button>
      </div>

      {showQuestionForm && !questionSubmitted && (
        <div className="bg-[#141A21] border border-[#252E39] p-3 rounded-xl flex gap-2">
          <input
            type="text"
            placeholder="궁금한 점을 남겨주세요 (익명)"
            className="flex-1 bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button 
            onClick={submitQuestion}
            disabled={isQuestionSubmitting}
            className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-4 rounded-lg font-medium"
          >
            질문
          </button>
        </div>
      )}

      {questionSubmitted && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center p-3 rounded-xl">
          질문이 전달되었습니다.
        </div>
      )}
    </div>
  );
}
