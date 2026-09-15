"use client";

import React from "react";
import { motion } from "motion/react";
import { Info, Upload, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  MARKET_TEMP_CONFIG,
  type MarketTemperature,
} from "@/domain/magazine/types";

const MARKET_TEMPS: MarketTemperature[] = [
  "적극 매수",
  "선별 매수",
  "관망",
  "조정 대기",
  "위기 경계",
];

interface EditorCoverTabProps {
  marketTemp: MarketTemperature | null;
  setMarketTemp: (temp: MarketTemperature | null) => void;
  coverKeywords: string[];
  updateKeyword: (idx: number, val: string) => void;
  headline: string;
  setHeadline: (v: string) => void;
  briefing: string;
  setBriefing: (v: string) => void;
  coverImageUrl: string | null;
  setCoverImageUrl: (url: string | null) => void;
}

export function EditorCoverTab({
  marketTemp,
  setMarketTemp,
  coverKeywords,
  updateKeyword,
  headline,
  setHeadline,
  briefing,
  setBriefing,
  coverImageUrl,
  setCoverImageUrl,
}: EditorCoverTabProps) {
  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
        <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-indigo-200/80 leading-relaxed">
          매거진 커버를 구성합니다. 시장 온도, 키워드, AI 브리핑을 설정하세요.
          변경사항은 실시간으로 우측 미리보기에 반영됩니다.
        </p>
      </div>

      {/* 시장 온도 */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">
          시장 온도
        </label>
        <div className="flex flex-wrap gap-2">
          {MARKET_TEMPS.map((temp) => {
            const cfg = MARKET_TEMP_CONFIG[temp];
            const isActive = marketTemp === temp;
            return (
              <motion.button
                key={temp}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMarketTemp(isActive ? null : temp)}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all ${
                  isActive
                    ? "border-white/30 bg-white/10 text-white shadow-lg"
                    : "border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600"
                }`}
                style={
                  isActive
                    ? {
                        borderColor: cfg.color + "60",
                        backgroundColor: cfg.color + "18",
                      }
                    : {}
                }
              >
                <span className="text-sm">{cfg.emoji}</span>
                {temp}
              </motion.button>
            );
          })}
        </div>
        {marketTemp && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] text-slate-500 leading-relaxed pl-1"
          >
            {MARKET_TEMP_CONFIG[marketTemp].description}
          </motion.p>
        )}
      </div>

      {/* 키워드 뱃지 */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">
          키워드 뱃지 (최대 3개)
        </label>
        <div className="flex gap-2">
          {coverKeywords.map((kw, idx) => (
            <input
              key={idx}
              value={kw}
              onChange={(e) => updateKeyword(idx, e.target.value)}
              maxLength={12}
              className="flex-1 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
              placeholder={`키워드 ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* 헤드라인 */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">헤드라인</label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className="w-full bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
          placeholder="매거진 제목을 입력하세요"
        />
      </div>

      {/* AI 브리핑 */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">AI 브리핑</label>
        <textarea
          value={briefing}
          onChange={(e) => setBriefing(e.target.value)}
          className="w-full h-40 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-[13px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
          placeholder="고객에게 전달할 핵심 메시지를 입력하세요"
        />
      </div>

      {/* 커버 이미지 */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">
          커버 배경 이미지
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            파일 업로드
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const toastId = toast.loading("이미지 업로드 중...");
                try {
                  const supabase = createClient();
                  const fileExt = file.name.split(".").pop();
                  const fileName = `${Math.random()
                    .toString(36)
                    .substring(2, 15)}.${fileExt}`;
                  const filePath = `${Date.now()}-${fileName}`;
                  const { error: uploadError } = await supabase.storage
                    .from("magazine-covers")
                    .upload(filePath, file);
                  if (uploadError) throw uploadError;
                  const {
                    data: { publicUrl },
                  } = supabase.storage
                    .from("magazine-covers")
                    .getPublicUrl(filePath);
                  setCoverImageUrl(publicUrl);
                  toast.success("업로드 완료", { id: toastId });
                } catch {
                  toast.error("업로드 실패", { id: toastId });
                }
              }}
            />
          </label>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const url = prompt("이미지 URL을 입력하세요:");
              if (url) setCoverImageUrl(url);
            }}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
          >
            <Link2 className="w-3.5 h-3.5" />
            URL 입력
          </motion.button>
          {coverImageUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] text-indigo-300 truncate flex-1">
                {coverImageUrl}
              </span>
              <button
                onClick={() => setCoverImageUrl(null)}
                className="text-slate-500 hover:text-slate-300 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
