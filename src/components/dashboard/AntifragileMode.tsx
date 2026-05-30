"use client";

import React, { useState } from "react";
import Link from "next/link";

export interface AntifragileModeProps {
  trendDirection: "up" | "flat" | "down";
  region: string;
  assetType: string;
  demandScore: number;
  supplyScore: number;
  avgHoldDays: number;
  priceResistanceBand: { min: number; max: number };
}

export function AntifragileMode({
  trendDirection,
  region,
  assetType,
  demandScore,
  supplyScore,
  avgHoldDays,
  priceResistanceBand,
}: AntifragileModeProps) {
  const [isOpen, setIsOpen] = useState(trendDirection === "down");

  const getTrendConfig = () => {
    switch (trendDirection) {
      case "down":
        return {
          title: "🚨 안티프래질 침체기 모드 활성화",
          desc: "매매 시장이 둔화 국면에 진입했습니다. 리스크 방어 및 임대 전환 전략을 추천합니다.",
          gradient: "from-amber-600/20 via-rose-600/10 to-purple-600/10 border-rose-500/30",
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40",
          badgeText: "시장 침체 (Down)",
        };
      case "up":
        return {
          title: "🚀 불마켓 성장 가속 모드",
          desc: "매매 시장이 강력한 상승 기류를 타고 있습니다. 적극적인 매칭 및 거래 종결 전략을 추천합니다.",
          gradient: "from-emerald-600/20 via-teal-600/10 to-indigo-600/10 border-emerald-500/30",
          badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          badgeText: "시장 활황 (Up)",
        };
      default:
        return {
          title: "⚖️ 안정적 보합세 모드",
          desc: "시장이 보합세를 유지하고 있습니다. 물건 정밀화와 대기 고객 매칭 고도화에 집중하세요.",
          gradient: "from-slate-600/20 via-indigo-600/10 to-purple-600/10 border-slate-500/30",
          badgeColor: "bg-slate-500/20 text-slate-300 border-slate-500/40",
          badgeText: "시장 보합 (Flat)",
        };
    }
  };

  const config = getTrendConfig();

  return (
    <div
      className={`relative w-full rounded-2xl border bg-gradient-to-br ${config.gradient} p-4.5 shadow-xl backdrop-blur-md transition-all duration-500 overflow-hidden`}
    >
      {/* Background Decorative Glow */}
      <div className="absolute -right-16 -top-16 w-32 h-32 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-1.5">
              {config.title}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {region} {assetType} 시장 선행 분석 스냅샷
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs px-2.5 py-1 rounded-lg bg-card/60 border border-border hover:bg-card hover:text-primary transition-all font-semibold shrink-0"
        >
          {isOpen ? "접기 닫기" : "자세히 분석"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mt-2.5 bg-card/30 p-2.5 rounded-xl border border-border/20">
        {config.desc}
      </p>

      {/* Expandable Area */}
      {isOpen && (
        <div className="mt-4 pt-3 border-t border-border/40 space-y-4 animate-fadeIn">
          {/* Market Status Overview Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card/45 border border-border/20 rounded-xl p-3 space-y-1">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                <span>공급 지수 (Supply)</span>
                <span className="text-[9px] px-1 bg-amber-500/10 text-amber-500 rounded font-bold">활성 물건</span>
              </div>
              <p className="text-base font-extrabold text-foreground">{supplyScore} pts</p>
              <div className="w-full bg-muted h-1 rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(supplyScore, 100)}%` }} />
              </div>
            </div>

            <div className="bg-card/45 border border-border/20 rounded-xl p-3 space-y-1">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                <span>수요 강도 (Demand)</span>
                <span className="text-[9px] px-1 bg-indigo-500/10 text-indigo-500 rounded font-bold">의향서 밀도</span>
              </div>
              <p className="text-base font-extrabold text-foreground">{demandScore} pts</p>
              <div className="w-full bg-muted h-1 rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(demandScore, 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Pricing Resistance and Hold Warning */}
          <div className="bg-card/35 border border-border/20 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                ⚠️ 가격 저항선 & 체류 경고
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${config.badgeColor}`}>
                {config.badgeText}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground mt-1">
              <div>
                <span className="block text-[10px] text-muted-foreground/80">평균 매물 체류일</span>
                <span className="text-sm font-extrabold text-foreground">{avgHoldDays} 일</span>
                {trendDirection === "down" && (
                  <span className="block text-[9px] text-rose-500 font-semibold mt-0.5">⚠️ 장기 체류 매물 급증 중</span>
                )}
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground/80">거래 실패 가격 저항선</span>
                <span className="text-sm font-extrabold text-foreground">
                  호가 대비 -{(priceResistanceBand.max * 100).toFixed(0)}% ~ -{(priceResistanceBand.min * 100).toFixed(0)}%
                </span>
                <span className="block text-[9px] text-amber-500 font-medium mt-0.5">조정 제안 필요</span>
              </div>
            </div>
          </div>

          {/* Antifragile Actions */}
          <div className="space-y-2 pt-1">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              💡 안티프래질 행동 강령
            </h4>

            {trendDirection === "down" ? (
              <div className="grid grid-cols-1 gap-2">
                {/* 1. 임대 전환 넛지 */}
                <div className="flex items-start gap-2.5 bg-gradient-to-r from-purple-500/10 to-indigo-500/5 p-3 rounded-xl border border-purple-500/20">
                  <span className="text-base mt-0.5">🔑</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-foreground">안티프래질 임대차 전환 가속화</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      매매 둔화기에는 임대 수요가 증가합니다. 기존 매매물건 중 일부 호실을 <strong>임대차 딜카드</strong>로 분할 등록하고, 임차 매칭을 가동해보세요.
                    </p>
                    <Link
                      href="/broker/lease-card/new"
                      className="inline-flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-bold mt-2"
                    >
                      지금 임대차 딜카드 등록하기 &rarr;
                    </Link>
                  </div>
                </div>

                {/* 2. 파이프라인 정비 */}
                <div className="flex items-start gap-2.5 bg-card/30 p-3 rounded-xl border border-border/20">
                  <span className="text-base mt-0.5">🎯</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-foreground">보류(Hold) 거래 집중 타협 방안</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      대기 중인 매수자의 가격 저항선 데이터를 기반으로 매도인에게 호가 조정 제안서를 자동 생성하여 송신하세요.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 p-3 rounded-xl border border-emerald-500/20">
                <span className="text-base mt-0.5">🚀</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground">시장 모멘텀 극대화</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    상승장에서는 정보 비대칭이 가속화됩니다. <strong>블라인드 티저 및 Full IM</strong>을 빠르게 다수 매수자에게 공유하여 매칭 피드백 속도를 올리세요.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
