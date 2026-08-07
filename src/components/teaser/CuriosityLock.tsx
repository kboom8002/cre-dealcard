import React from 'react';

interface CuriosityLockProps {
  curiositySlot: string;
  candidateCount?: number;
  passed?: boolean;
  posture?: string;
}

export function CuriosityLock({ curiositySlot, candidateCount, passed, posture = 'income' }: CuriosityLockProps) {
  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-2xl p-5 space-y-4 shadow-lg">
      {/* Header & Gate Step Indicator */}
      <div className="flex items-center justify-between border-b border-[#252E39] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[#D4A853] text-base">🔒</span>
          <h3 className="text-xs font-bold text-slate-100 tracking-tight">핵심 비공개 인사이트 프리뷰</h3>
        </div>
        <span className="text-[10px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/30 px-2 py-0.5 rounded-full">
          G0 단계 (미승인)
        </span>
      </div>

      {/* Main Curiosity Slot Accent Quote */}
      <div className="bg-[#1A2333]/80 border border-[#D4A853]/25 rounded-xl p-3.5 space-y-1">
        <div className="text-[10px] text-[#D4A853] font-bold tracking-wider uppercase">Key Highlight</div>
        <p className="text-[13px] text-slate-100 font-semibold leading-snug">
          {curiositySlot}
        </p>
      </div>

      {/* 3 Locked Preview Cards (Blurred Content) */}
      <div className="space-y-2.5 pt-1">
        {/* Card 1: Pricing & Cap Rate */}
        <div className="relative bg-[#0B0F14] border border-[#252E39] rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>💰</span> <span>정밀 호가 및 층별 보증금/임대료</span>
            </div>
            <div className="text-xs font-bold text-slate-300 blur-[4px] select-none">
              매각 125,000,000,000원 / Cap Rate 5.24%
            </div>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>

        {/* Card 2: AI Financial / DCF Analysis */}
        <div className="relative bg-[#0B0F14] border border-[#252E39] rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>📊</span> <span>10년 DCF & 금리 변동 민감도표</span>
            </div>
            <div className="text-xs font-bold text-slate-300 blur-[4px] select-none">
              LTV 65% 적용 시 Leveraged IRR 12.8%
            </div>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>

        {/* Card 3: Tenant Roll & Eviction */}
        <div className="relative bg-[#0B0F14] border border-[#252E39] rounded-xl p-3 flex items-center justify-between overflow-hidden">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>📋</span> <span>주요 임차인 만기일 및 명도 여건</span>
            </div>
            <div className="text-xs font-bold text-slate-300 blur-[4px] select-none">
              앵커 테넌트 계약만기 2027.12 / 명도 협의가능
            </div>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded-md font-medium shrink-0 ml-2">
            🔒 NDA 체결 시
          </span>
        </div>
      </div>

      {/* Progressive Disclosure Progress Step */}
      <div className="pt-2 border-t border-[#252E39] space-y-2">
        <div className="flex justify-between items-center text-[10.5px]">
          <span className="text-slate-400 font-medium">열람 승인 진행도</span>
          <span className="text-[#D4A853] font-bold">1단계 완료 / 3단계 중</span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-[#D4A853] w-1/3 rounded-full" />
          <div className="h-full bg-slate-700 w-1/3 opacity-30" />
          <div className="h-full bg-slate-700 w-1/3 opacity-10" />
        </div>
        <p className="text-[10px] text-slate-500 text-center">
          상세 요청 버튼을 누르시면 비밀유지약정서(NDA) 모달이 열립니다.
        </p>
      </div>
    </div>
  );
}

