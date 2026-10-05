"use client";

import React, { useId } from "react";
import { motion } from "motion/react";
import { Info, Upload, Link2, X } from "lucide-react";
import { editorToast } from "./editor-toaster";
import { createClient } from "@/lib/supabase/client";
import {
  MARKET_TEMP_CONFIG,
  type MarketTemperature,
} from "@/domain/magazine/types";
import { marketTempIcon } from "@/lib/magazine/editor-labels";

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
  const uid = useId();
  const headlineId = `${uid}-headline`;
  const briefingId = `${uid}-briefing`;
  const keywordsId = `${uid}-keywords`;
  const fileId = `${uid}-cover-file`;

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
        <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-caption text-indigo-200/90 leading-relaxed">
          매거진 커버를 구성합니다. 시장 온도, 키워드, AI 브리핑을 설정하세요.
          변경사항은 실시간으로 우측 미리보기에 반영됩니다.
        </p>
      </div>

      {/* 시장 온도 — 구독자(매수자) 온도와 다른 개념: 색 사각형 아이콘으로 구분 */}
      <div className="space-y-2" role="group" aria-labelledby={`${uid}-temp-label`}>
        <span id={`${uid}-temp-label`} className="text-label font-semibold text-slate-300 block">
          시장 온도 <span className="font-normal text-ink-subtle">(이번 주 시장 분위기)</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {MARKET_TEMPS.map((temp) => {
            const cfg = MARKET_TEMP_CONFIG[temp];
            const isActive = marketTemp === temp;
            return (
              <motion.button
                key={temp}
                type="button"
                aria-pressed={isActive}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMarketTemp(isActive ? null : temp)}
                className={`flex min-h-11 items-center gap-1.5 text-label font-bold px-3 py-2 rounded-xl border transition-all ${
                  isActive
                    ? "border-white/30 bg-white/10 text-white shadow-lg"
                    : "border-slate-700 bg-slate-800/30 text-ink-subtle hover:border-slate-600"
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
                <span className="text-body" aria-hidden="true">{marketTempIcon(temp)}</span>
                {temp}
              </motion.button>
            );
          })}
        </div>
        {marketTemp && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-caption text-ink-subtle leading-relaxed pl-1"
          >
            {MARKET_TEMP_CONFIG[marketTemp].description}
          </motion.p>
        )}
      </div>

      {/* 키워드 뱃지 */}
      <div className="space-y-2" role="group" aria-labelledby={keywordsId}>
        <span id={keywordsId} className="text-label font-semibold text-slate-300 block">
          키워드 뱃지 (최대 3개)
        </span>
        <div className="flex gap-2">
          {coverKeywords.map((kw, idx) => (
            <input
              key={idx}
              value={kw}
              onChange={(e) => updateKeyword(idx, e.target.value)}
              maxLength={12}
              aria-label={`키워드 ${idx + 1}`}
              className="flex-1 min-w-0 min-h-11 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-label text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-ink-subtle"
              placeholder={`키워드 ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* 헤드라인 */}
      <div className="space-y-2">
        <label htmlFor={headlineId} className="text-label font-semibold text-slate-300 block">
          헤드라인
        </label>
        <input
          id={headlineId}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className="w-full min-h-11 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-body text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-ink-subtle"
          placeholder="매거진 제목을 입력하세요"
        />
      </div>

      {/* AI 브리핑 */}
      <div className="space-y-2">
        <label htmlFor={briefingId} className="text-label font-semibold text-slate-300 block">
          AI 브리핑
        </label>
        <textarea
          id={briefingId}
          value={briefing}
          onChange={(e) => setBriefing(e.target.value)}
          className="w-full h-40 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-body text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-ink-subtle"
          placeholder="고객에게 전달할 핵심 메시지를 입력하세요"
        />
      </div>

      {/* 커버 이미지 */}
      <div className="space-y-2" role="group" aria-labelledby={`${uid}-cover-label`}>
        <span id={`${uid}-cover-label`} className="text-label font-semibold text-slate-300 block">
          커버 배경 이미지
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={fileId}
            className="flex min-h-11 items-center gap-1.5 text-label font-bold px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 focus-within:ring-2 focus-within:ring-indigo-500 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            파일 업로드
            <input
              id={fileId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                editorToast.loading("이미지 업로드 중...");
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
                  editorToast.success("업로드 완료");
                } catch {
                  editorToast.error("업로드 실패");
                }
              }}
            />
          </label>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const url = prompt("이미지 URL을 입력하세요:");
              if (url) setCoverImageUrl(url);
            }}
            className="flex min-h-11 items-center gap-1.5 text-label font-bold px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            URL 입력
          </motion.button>
          {coverImageUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-caption text-indigo-300 truncate flex-1">
                {coverImageUrl}
              </span>
              <button
                type="button"
                aria-label="커버 이미지 제거"
                onClick={() => setCoverImageUrl(null)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-subtle hover:text-slate-200 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
