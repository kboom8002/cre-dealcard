"use client";

import React from "react";
import type { RoiMetrics } from "@/domain/analytics/roi-calculator";

interface RoiCardProps {
  metrics: RoiMetrics | null;
  loading?: boolean;
}

export function RoiCard({ metrics, loading = false }: RoiCardProps) {
  if (loading) {
    return (
      <div className="w-full h-44 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse border border-zinc-200 dark:border-zinc-700" />
    );
  }

  if (!metrics) return null;

  const formattedMoney = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(metrics.totalMoneySaved);

  return (
    <div className="w-full overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-2xl shadow-lg border border-indigo-400/20 text-white p-5 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            이번 달 실시간 생산성 가치
          </span>
          <h3 className="text-xl font-extrabold tracking-tight mt-1">
            절약한 시간 및 비용
          </h3>
        </div>
        <span className="text-2xl animate-bounce">⚡</span>
      </div>

      {/* Main Stats Display */}
      <div className="grid grid-cols-2 gap-4 py-2">
        <div className="space-y-0.5">
          <p className="text-[11px] text-indigo-100 font-medium">총 절약 금액</p>
          <p className="text-2xl font-black tracking-tight">{formattedMoney}</p>
        </div>
        <div className="space-y-0.5 border-l border-white/20 pl-4">
          <p className="text-[11px] text-indigo-100 font-medium">단축한 작업 시간</p>
          <p className="text-2xl font-black tracking-tight">
            {metrics.totalHoursSaved} <span className="text-xs font-normal">시간</span>
          </p>
        </div>
      </div>

      {/* Mini Feature Breakdown */}
      <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
        <div className="flex justify-between items-center text-[10px] text-indigo-100/80 mb-1">
          <span>작업 건수 분석</span>
          <span>총 {(metrics.breakdown.dealCardsCount + metrics.breakdown.buyerIntentsCount + metrics.breakdown.matchesCount + metrics.breakdown.imCount + metrics.breakdown.magazineCount)}건 처리</span>
        </div>
        
        <div className="grid grid-cols-5 gap-1.5 text-center">
          <div className="bg-white/10 hover:bg-white/15 transition-all p-1.5 rounded-lg">
            <p className="font-bold text-[13px]">{metrics.breakdown.dealCardsCount}건</p>
            <p className="text-[9px] text-indigo-100/70">딜카드</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-all p-1.5 rounded-lg">
            <p className="font-bold text-[13px]">{metrics.breakdown.buyerIntentsCount}건</p>
            <p className="text-[9px] text-indigo-100/70">매수자</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-all p-1.5 rounded-lg">
            <p className="font-bold text-[13px]">{metrics.breakdown.matchesCount}건</p>
            <p className="text-[9px] text-indigo-100/70">AI 매칭</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-all p-1.5 rounded-lg">
            <p className="font-bold text-[13px]">{metrics.breakdown.imCount}건</p>
            <p className="text-[9px] text-indigo-100/70">Full IM</p>
          </div>
          <div className="bg-white/10 hover:bg-white/15 transition-all p-1.5 rounded-lg">
            <p className={`font-bold text-[13px] ${metrics.breakdown.magazineCount === 0 ? 'text-white/40' : ''}`}>{metrics.breakdown.magazineCount}건</p>
            <p className="text-[9px] text-indigo-100/70">매거진</p>
          </div>
        </div>
      </div>
    </div>
  );
}
