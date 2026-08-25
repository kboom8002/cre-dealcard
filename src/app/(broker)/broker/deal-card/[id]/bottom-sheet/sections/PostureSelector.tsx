"use client";

import React from "react";

/** AI 포스처 추천 제안 */
export interface PostureProposal {
  value: string;
  confidence: number;
  reason: string;
}

interface PostureSelectorProps {
  investmentPosture: string;
  setInvestmentPosture: (value: string) => void;
  /** C-2: AI 추천 배지용 포스처 제안 */
  postureProposal?: PostureProposal;
}

const POSTURES = [
  { id: 'income', label: '임대수익', emoji: '💰' },
  { id: 'owner_occupied', label: '자가사용', emoji: '🏢' },
  { id: 'development', label: '개발형', emoji: '🏗️' },
  { id: 'operating', label: '운영형', emoji: '🏨' },
  { id: 'trading', label: '단기매매', emoji: '📈' },
] as const;

export function PostureSelector({ investmentPosture, setInvestmentPosture, postureProposal }: PostureSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex justify-between items-center">
        <span>🎯 투자 포스처 선택</span>
        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">위젯 맞춤</span>
      </label>
      {/* C-2: AI 추천 배지 */}
      {postureProposal && postureProposal.confidence >= 0.7 && (
        <div className="mb-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400 flex items-center gap-2">
          <span className="font-semibold">💡 AI 추천:</span>
          <span className="flex-1">{postureProposal.reason}</span>
          <button
            type="button"
            onClick={() => setInvestmentPosture(postureProposal.value)}
            className="ml-auto px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-medium hover:bg-blue-700 transition-colors"
          >
            수락
          </button>
        </div>
      )}
      <div className="grid grid-cols-5 gap-1">
        {POSTURES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setInvestmentPosture(item.id)}
            className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all flex flex-col items-center gap-0.5 ${
              investmentPosture === item.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary/40 text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            <span className="text-sm">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
