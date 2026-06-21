"use client";

import React from "react";
import { motion } from "motion/react";
import { Sparkles, CalendarCheck, AlertCircle } from "lucide-react";

export interface RecommendedSlot {
  slot_id: string;
  date: string;
  time_range: string;
  fit_reason: string;
  fit_score: number;
  caution: string | null;
}

interface ScheduleAdvisorCardProps {
  recommendation: RecommendedSlot;
  onSelect: (slotId: string) => void;
}

export function ScheduleAdvisorCard({ recommendation, onSelect }: ScheduleAdvisorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden w-full max-w-sm rounded-2xl p-5 cursor-pointer group"
      onClick={() => onSelect(recommendation.slot_id)}
    >
      {/* Premium Glassmorphism Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 backdrop-blur-xl border border-white/10" />
      
      {/* Animated Glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">AI 추천 일정</span>
          <span className="ml-auto text-xs font-medium bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
            {recommendation.fit_score}% 일치
          </span>
        </div>

        <h4 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          {recommendation.date} <span className="text-indigo-400 text-sm font-normal">{recommendation.time_range}</span>
        </h4>
        
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
          {recommendation.fit_reason}
        </p>

        {recommendation.caution && (
          <div className="flex items-start gap-2 bg-amber-500/10 text-amber-400/90 text-xs p-3 rounded-lg mt-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{recommendation.caution}</p>
          </div>
        )}

        <button className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
          <CalendarCheck className="w-4 h-4" /> 이 일정으로 예약하기
        </button>
      </div>
    </motion.div>
  );
}
