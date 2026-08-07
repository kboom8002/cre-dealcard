"use client";

import React from "react";
import { Building2, User, Lock, CheckCircle2, Clock, Sparkles } from "lucide-react";

interface CircleMatchCardProps {
  match: {
    id: string;
    grade: "S" | "A" | "B" | "C";
    score: number;
    reasoning: string;
    building_broker_approved: boolean;
    buyer_broker_approved: boolean;
    identity_revealed_at: string | null;
    building_broker_id: string;
    buyer_broker_id: string;
    building_detail?: {
      area_signal?: string;
      asset_type?: string;
      price_band?: string;
      fit_summary?: string;
    };
    buyer_intent_detail?: {
      buyer_type?: string;
      budget_display?: string;
      preferred_regions?: string[];
      purchase_purpose?: string;
    };
    building_broker_profile?: {
      display_name?: string;
      company?: string;
      phone?: string;
    };
    buyer_broker_profile?: {
      display_name?: string;
      company?: string;
      phone?: string;
    };
  };
  currentBrokerId: string;
  onApprove: (matchId: string) => void;
  onViewDetail?: (matchId: string) => void;
  isApproving?: boolean;
}

export function CircleMatchCard({
  match,
  currentBrokerId,
  onApprove,
  onViewDetail,
  isApproving = false,
}: CircleMatchCardProps) {
  const isBuildingBroker = match.building_broker_id === currentBrokerId;
  const isBuyerBroker = match.buyer_broker_id === currentBrokerId;

  const myApproved = isBuildingBroker
    ? match.building_broker_approved
    : isBuyerBroker
    ? match.buyer_broker_approved
    : false;

  const partnerApproved = isBuildingBroker
    ? match.buyer_broker_approved
    : match.building_broker_approved;

  const isRevealed = Boolean(match.identity_revealed_at);

  const gradeColor =
    match.grade === "S"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : match.grade === "A"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : "bg-blue-500/20 text-blue-300 border-blue-500/40";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#131b2e] p-5 space-y-4 shadow-lg">
      {/* Header Grade & Score */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className={`px-3 py-1 rounded-xl text-sm font-black border ${gradeColor}`}>
            {match.grade}등급
          </span>
          <span className="text-xl font-black text-slate-100 tabular-nums">
            {match.score}점
          </span>
          <span className="text-[13px] text-slate-400 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> AI 매칭
          </span>
        </div>

        {isRevealed ? (
          <span className="flex items-center gap-1 text-[13px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" /> 양측 승인 완료
          </span>
        ) : myApproved ? (
          <span className="flex items-center gap-1 text-[13px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
            <Clock className="w-4 h-4" /> 상대방 승인 대기
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[13px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
            <Lock className="w-4 h-4 text-amber-400" /> 신원 비공개
          </span>
        )}
      </div>

      {/* Matching Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        {/* Building Side */}
        <div className="bg-[#0f172a] p-3.5 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> 매물 시그널
            </span>
            {isBuildingBroker && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">내 물건</span>
            )}
          </div>
          <p className="text-[15px] font-bold text-slate-100">
            {match.building_detail?.area_signal || "지역 미상"} · {match.building_detail?.asset_type || "자산"}
          </p>
          <p className="text-amber-300 font-extrabold">{match.building_detail?.price_band || "가격대 미정"}</p>
          <p className="text-slate-400 text-[11px] mt-1">
            담당: {match.building_broker_profile?.display_name || "중개사"} ({match.building_broker_profile?.company || "소속"})
          </p>
        </div>

        {/* Buyer Side */}
        <div className="bg-[#0f172a] p-3.5 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> 매수의향 시그널
            </span>
            {isBuyerBroker && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">내 매수자</span>
            )}
          </div>
          <p className="text-[15px] font-bold text-slate-100">
            {match.buyer_intent_detail?.buyer_type || "고객"} ({match.buyer_intent_detail?.purchase_purpose || "매수"})
          </p>
          <p className="text-blue-300 font-extrabold">{match.buyer_intent_detail?.budget_display || "예산 미정"}</p>
          <p className="text-slate-400 text-[11px] mt-1">
            담당: {match.buyer_broker_profile?.display_name || "중개사"} ({match.buyer_broker_profile?.company || "소속"})
          </p>
        </div>
      </div>

      {/* Reasoning */}
      {match.reasoning && (
        <p className="text-[13px] text-slate-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800/50 leading-relaxed">
          💡 {match.reasoning}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        {!isRevealed && !myApproved && (
          <button
            onClick={() => onApprove(match.id)}
            disabled={isApproving}
            className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isApproving ? "승인 처리 중..." : "상대방 신원 공개 승인하기"}
          </button>
        )}

        {isRevealed && (
          <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-center space-y-1">
            <p className="text-[13px] font-bold text-emerald-300">
              🎉 양측 승인이 완료되어 파이프라인 딜이 자동 생성되었습니다!
            </p>
            <p className="text-[11px] text-slate-400">
              상대 중개사 연락처: {isBuildingBroker ? match.buyer_broker_profile?.phone : match.building_broker_profile?.phone || "연락처 확인 가능"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
