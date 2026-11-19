import React from 'react';

interface CuriosityLockProps {
  curiositySlot: string;
  candidateCount?: number;
  passed?: boolean;
  posture?: string;
}

export function CuriosityLock({ curiositySlot }: CuriosityLockProps) {
  return (
    <div className="bg-white border border-slate-300 rounded-2xl p-5 space-y-4 shadow-sm">
      {/* Header & Gate Step Indicator */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-base">🔒</span>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">핵심 비공개 인사이트 프리뷰</h3>
        </div>
        <span className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
          G0 단계 (미승인)
        </span>
      </div>

      {/* Main Curiosity Slot Accent Quote */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-1">
        <div className="text-sm text-amber-800 font-bold tracking-wider uppercase">Key Highlight</div>
        <p className="text-sm text-slate-900 font-semibold leading-snug">
          {curiositySlot}
        </p>
      </div>

      {/* 3 Locked Preview Cards (Blurred Content) */}
      <div className="space-y-2.5 pt-1">
        {/* Card 1: Pricing & Cap Rate */}
        <div className="relative bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-sm text-slate-800 font-medium flex items-center gap-1.5">
              <span>💰</span> <span>정밀 호가 및 층별 보증금/임대료</span>
            </div>
            <div className="text-sm font-bold text-slate-500 blur-[4px] select-none">
              매각 ●●●억원 / 연 순수익률 ●.●%
            </div>
          </div>
          <span className="text-sm bg-white text-slate-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>

        {/* Card 2: AI Financial / DCF Analysis */}
        <div className="relative bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-sm text-slate-800 font-medium flex items-center gap-1.5">
              <span>📊</span> <span>10년 DCF & 금리 변동 민감도표</span>
            </div>
            <div className="text-sm font-bold text-slate-500 blur-[4px] select-none">
              LTV ●●% 적용 시 자기자본수익률 ●●.●%
            </div>
          </div>
          <span className="text-sm bg-white text-slate-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>

        {/* Card 3: Tenant Roll & Eviction */}
        <div className="relative bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-sm text-slate-800 font-medium flex items-center gap-1.5">
              <span>📋</span> <span>주요 임차인 만기일 및 명도 여건</span>
            </div>
            <div className="text-sm font-bold text-slate-500 blur-[4px] select-none">
              주요 임차인 계약만기 ●●●●.●●
            </div>
          </div>
          <span className="text-sm bg-white text-slate-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>
      </div>

      {/* Progressive Disclosure Progress Step */}
      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-700 font-medium">열람 승인 진행도</span>
          <span className="text-amber-800 font-bold">1단계 완료 / 3단계 중</span>
        </div>
        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
          <div className="h-full bg-amber-500 w-1/3 rounded-full" />
          <div className="h-full bg-slate-300 w-1/3" />
          <div className="h-full bg-slate-200 w-1/3" />
        </div>
        <p className="text-sm text-slate-600 text-center">
          상세 요청 버튼을 누르시면 비밀유지약정서(NDA) 모달이 열립니다.
        </p>
      </div>
    </div>
  );
}
