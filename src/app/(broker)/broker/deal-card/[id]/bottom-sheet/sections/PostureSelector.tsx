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
  const primaryPostures = POSTURES.slice(0, 3);
  const secondaryPostures = POSTURES.slice(3);

  return (
    <div className="space-y-2.5">
      <label className="block text-sm font-extrabold text-foreground flex justify-between items-center">
        <span>🎯 1단계: 이 매물의 투자 목적 선택</span>
        <span className="text-xs text-primary bg-primary/10 px-2.5 py-0.5 rounded-md font-bold">맞춤형 슬라이드 자동 구성</span>
      </label>
      {/* C-2: AI 추천 배지 */}
      {postureProposal && postureProposal.confidence >= 0.7 && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
          <span className="font-bold">💡 AI 추천 유형:</span>
          <span className="flex-1 font-medium">{postureProposal.reason}</span>
          <button
            type="button"
            onClick={() => setInvestmentPosture(postureProposal.value)}
            className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            추천 적용
          </button>
        </div>
      )}

      {/* 주요 3대 유형 (임대수익 / 자가사용 / 개발형) — 큼직한 3열 버튼 */}
      <div className="grid grid-cols-3 gap-2">
        {primaryPostures.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setInvestmentPosture(item.id)}
            className={`min-h-[60px] py-2.5 px-2 rounded-xl text-sm font-extrabold border-2 transition-all flex flex-col items-center justify-center gap-1 ${
              investmentPosture === item.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary/40 text-foreground border-border hover:border-primary/40"
            }`}
          >
            <span className="text-lg">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* 특수 목적 2대 유형 (운영형 / 단기매매) — 보조 2열 버튼 */}
      <div className="grid grid-cols-2 gap-2">
        {secondaryPostures.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setInvestmentPosture(item.id)}
            className={`min-h-[46px] py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
              investmentPosture === item.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span className="text-base">{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/30 rounded-xl px-3 py-2 border border-border/60 font-medium">
        {selectedItem
          ? `${selectedItem.emoji} ${selectedItem.desc}`
          : "👆 위 투자 목적 중 이 매물에 가장 잘 맞는 항목 하나를 눌러주세요."}
      </p>
    </div>
  );
}
