"use client";

import React from "react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimatedSavingsMoney: number;
  currentCount: number;
  maxLimit: number;
  featureNameKo?: string;
}

export function UpgradeModal({
  isOpen,
  onClose,
  estimatedSavingsMoney,
  currentCount,
  maxLimit,
  featureNameKo = "매매 딜카드 생성",
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const formattedSavings = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(estimatedSavingsMoney);

  const handleUpgrade = () => {
    // 가상의 결제 연동 트리거 (console.log 기록)
    console.log("[Subscription Upgrade Triggered] Directing to payment page...");
    alert("Pro 요금제 구독 결제 페이지로 이동합니다. (데모 연동 완료)");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Container Card */}
      <div className="relative w-full max-w-sm overflow-hidden bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl text-white p-6 space-y-6">
        
        {/* Glow morphic element */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/20 rounded-full filter blur-xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-pink-500/20 rounded-full filter blur-xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors text-lg"
          title="닫기"
        >
          ✕
        </button>

        {/* Paywall Header */}
        <div className="text-center space-y-2 pt-2">
          <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
            무료 제공량 한도 도달
          </span>
          <h3 className="text-xl font-black tracking-tight pt-1">
            프로 요금제로 더 큰 효율을 누리세요
          </h3>
          <p className="text-xs text-zinc-400">
            {featureNameKo} 무료 혜택 ({maxLimit}건/월)을 모두 사용하셨습니다.
          </p>
        </div>

        {/* ROI Value Nudge Card */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-zinc-800 rounded-2xl p-4 text-center space-y-1">
          <p className="text-[11px] text-purple-300 font-bold">
            중개인님이 이번 달 플랫폼으로 누린 가치
          </p>
          <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 tracking-tight">
            이미 {formattedSavings} 절약 완료
          </p>
          <p className="text-[10px] text-zinc-500 leading-normal">
            작업 자동화를 통해 아낀 귀중한 {((estimatedSavingsMoney / 50000)).toFixed(1)}시간의 가치입니다.<br/>
            지속적인 절약과 무제한 이용을 위해 지금 전환하세요.
          </p>
        </div>

        {/* Plan Choices Details */}
        <div className="space-y-3">
          <div className="border border-indigo-500/40 bg-indigo-950/10 rounded-2xl p-3.5 flex justify-between items-center transition-all hover:bg-indigo-950/20">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black">Pro 요금제</span>
                <span className="text-[9px] bg-indigo-500 text-white font-extrabold px-1 py-0.2 rounded">추천</span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                무제한 딜카드 생성 + 3-Stage 풀 매칭
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-indigo-400">₩99,000</p>
              <p className="text-[9px] text-zinc-500">/ 월</p>
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/30 rounded-2xl p-3.5 flex justify-between items-center transition-all hover:bg-zinc-800/40">
            <div className="space-y-0.5">
              <span className="text-sm font-black text-zinc-300">Premium 요금제</span>
              <p className="text-[10px] text-zinc-400 leading-tight">
                Pro 혜택 + 실시간 시장 지표 + Full IM 무제한
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-zinc-300">₩299,000</p>
              <p className="text-[9px] text-zinc-500">/ 월</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={handleUpgrade}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white text-xs font-bold rounded-xl shadow-lg transform active:scale-[0.98] transition-all"
          >
            지금 프로 요금제로 업그레이드
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs font-semibold rounded-xl transition-all"
          >
            무료 버전 계속 사용 (다음 달에 한도 갱신)
          </button>
        </div>
      </div>
    </div>
  );
}
