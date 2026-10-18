'use client';

import React, { useState } from 'react';

interface AiTextGeneratorProps {
  projectId: string;
  slideId: string;
  dataKey: string;
  fieldKey: string;
  currentText: string;
  onApply: (refinedText: string) => void;
}

const TONE_OPTIONS = [
  { id: 'conservative' as const, label: '보수적 · 공부기반', badge: '기관·법인용' },
  { id: 'balanced' as const, label: '균형 · 표준 브리핑', badge: '추천' },
  { id: 'aggressive' as const, label: '적극 · 밸류애드 강조', badge: '수익 극대화' },
];

export function AiTextGenerator({
  projectId,
  slideId,
  dataKey,
  fieldKey,
  currentText,
  onApply,
}: AiTextGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTone, setSelectedTone] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const handleGenerate = async (tone: 'conservative' | 'balanced' | 'aggressive') => {
    setSelectedTone(tone);
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/basic-im-studio/${projectId}/ai-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideId,
          dataKey,
          fieldKey,
          currentText,
          tone,
        }),
      });
      const data = await res.json();
      if (data?.ok && data.refinedText) {
        setSuggestion(data.refinedText);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          handleGenerate('balanced');
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1E3A8A] border border-[#BFDBFE] transition-colors"
        title="공적장부·실데이터 기반으로 문구를 전문적인 IM 톤으로 다듬습니다"
      >
        <span>✨ AI 문구 다듬기</span>
      </button>
    );
  }

  return (
    <div className="mt-1.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#BFDBFE] space-y-2.5 text-[#0F172A]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#1E3A8A]">
          ✨ 실데이터 기반 AI 문구 다듬기
        </span>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setSuggestion(null);
          }}
          className="text-xs font-bold text-[#64748B] hover:text-[#0F172A]"
        >
          닫기 ✕
        </button>
      </div>

      {/* 3대 톤앤매너 선택 */}
      <div className="grid grid-cols-3 gap-1.5">
        {TONE_OPTIONS.map(t => {
          const active = selectedTone === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleGenerate(t.id)}
              disabled={loading}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                active
                  ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 생성 결과 미리보기 */}
      {loading ? (
        <div className="py-3 text-center text-xs font-bold text-[#475569] animate-pulse">
          ⏳ 건물 제원·수익률 데이터를 반영해 문구를 다듬는 중...
        </div>
      ) : suggestion ? (
        <div className="space-y-2">
          <div className="p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-xs font-medium text-[#0F172A] whitespace-pre-wrap leading-relaxed">
            {suggestion}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleGenerate(selectedTone)}
              className="px-2.5 py-1 text-xs font-bold text-[#334155] hover:text-[#0F172A] border border-[#CBD5E1] rounded-lg bg-white"
            >
              ↻ 다시 제안받기
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(suggestion);
                setIsOpen(false);
                setSuggestion(null);
              }}
              className="px-3 py-1 text-xs font-extrabold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg shadow-xs"
            >
              ✓ 이 문구 적용하기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
