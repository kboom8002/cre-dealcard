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
  {
    id: 'income',
    label: '임대수익',
    emoji: '💰',
    desc: '월세·보증금 임대수익 중심 빌딩 (가장 많이 쓰는 기본형 · 층별 임대현황 및 수익률표 자동 구성)',
  },
  {
    id: 'owner_occupied',
    label: '자가사용',
    emoji: '🏢',
    desc: '사옥·병원 등으로 직접 입주할 매수자용 (입주 가능 층수·인원 수용력·임차료 절감 효과 중심 구성)',
  },
  {
    id: 'development',
    label: '개발형',
    emoji: '🏗️',
    desc: '신축·리모델링·용도변경 검토용 (법정 건폐율·용적률 여유분 및 개발 후 예상 연면적 중심 구성)',
  },
  {
    id: 'operating',
    label: '운영형',
    emoji: '🏨',
    desc: '호텔·숙박시설·공유오피스 등 직접 운영 수익형 (객실 수·객단가·가동률 중심 구성)',
  },
  {
    id: 'trading',
    label: '단기매매',
    emoji: '📈',
    desc: '밸류애드·리모델링 후 시세차익 매각 검토용 (인근 실거래 시세 비교 및 매각 전략 중심 구성)',
  },
] as const;

export function PostureSelector({ investmentPosture, setInvestmentPosture, postureProposal }: PostureSelectorProps) {
  const selectedItem = POSTURES.find((p) => p.id === investmentPosture);
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex justify-between items-center">
        <span>🎯 투자 목적(포스처) 선택</span>
        <span className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded font-semibold">9면 구성 자동 맞춤</span>
      </label>
      {/* C-2: AI 추천 배지 */}
      {postureProposal && postureProposal.confidence >= 0.7 && (
        <div className="mb-2 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400 flex items-center gap-2">
          <span className="font-semibold">💡 추천 유형:</span>
          <span className="flex-1">{postureProposal.reason}</span>
          <button
            type="button"
            onClick={() => setInvestmentPosture(postureProposal.value)}
            className="ml-auto px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            추천 적용
          </button>
        </div>
      )}
      <div className="grid grid-cols-5 gap-1.5">
        {POSTURES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setInvestmentPosture(item.id)}
            className={`min-h-[52px] py-2 px-1 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-0.5 ${
              investmentPosture === item.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary/40 text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            <span className="text-base">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed bg-secondary/30 rounded-lg px-2.5 py-1.5 border border-border/50">
        {selectedItem
          ? `${selectedItem.emoji} ${selectedItem.desc}`
          : "👆 위 5가지 투자 목적 중 이 건물에 가장 잘 맞는 항목 하나를 선택해 주세요."}
      </p>
    </div>
  );
}
