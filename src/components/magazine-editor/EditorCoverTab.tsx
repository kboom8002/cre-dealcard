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
import { formatSingleLineTitle } from "@/domain/magazine/issue-clustering";

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
      <div className="flex items-start gap-2 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-caption text-blue-950 font-medium leading-relaxed">
          뉴스레터 헤더와 1줄 제목을 설정합니다. 제목은 독자 화면에서 항상 깔끔하게 <strong>한 줄로 표시</strong>됩니다.
        </p>
      </div>

      {/* 헤드라인 (최상단 배치 · 한 줄 표시 강제) */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={headlineId} className="text-label font-extrabold text-slate-900 block">
            뉴스레터 제목 (한 줄 표시)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">
              {headline.length}/38자 · 1줄 고정
            </span>
            {headline.length > 34 && (
              <button
                type="button"
                onClick={() => setHeadline(formatSingleLineTitle(headline, 34))}
                className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-extrabold text-blue-800 hover:bg-blue-100"
              >
                한 줄로 다듬기
              </button>
            )}
          </div>
        </div>
        <input
          id={headlineId}
          type="text"
          maxLength={44}
          value={headline}
          onChange={(e) => setHeadline(e.target.value.replace(/[\r\n]+/g, " "))}
          className="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-extrabold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/40 transition-all placeholder:text-slate-400"
          placeholder="독자가 한눈에 읽을 수 있는 1줄 제목을 입력하세요"
        />
      </div>

      {/* 시장 온도 — 구독자(매수자) 온도와 다른 개념: 색 사각형 아이콘으로 구분 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2.5" role="group" aria-labelledby={`${uid}-temp-label`}>
        <span id={`${uid}-temp-label`} className="text-label font-extrabold text-slate-900 block">
          시장 온도 <span className="font-medium text-slate-500">(이번 호 헤더 배지)</span>
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
                className={`flex min-h-11 items-center gap-1.5 text-label font-extrabold px-3 py-2 rounded-xl border transition-all ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                    : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
                style={
                  isActive
                    ? {
                        borderColor: cfg.color,
                        backgroundColor: cfg.color + "22",
                        color: "#0F172A",
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
            className="text-caption font-medium text-slate-600 leading-relaxed pl-1"
          >
            {MARKET_TEMP_CONFIG[marketTemp].description}
          </motion.p>
        )}
      </div>

      {/* 키워드 뱃지 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2.5" role="group" aria-labelledby={keywordsId}>
        <span id={keywordsId} className="text-label font-extrabold text-slate-900 block">
          헤더 키워드 뱃지 (최대 3개)
        </span>
        <div className="flex gap-2">
          {coverKeywords.map((kw, idx) => (
            <input
              key={idx}
              value={kw}
              onChange={(e) => updateKeyword(idx, e.target.value)}
              maxLength={12}
              aria-label={`키워드 ${idx + 1}`}
              className="flex-1 min-w-0 min-h-11 bg-white border border-slate-300 rounded-lg px-3 py-2 text-label font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/40 transition-all placeholder:text-slate-400"
              placeholder={`키워드 ${idx + 1}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-bold text-slate-600 mr-1">추천 키워드:</span>
          {(["금리 인하", "꼬마빌딩", "공실률", "착한 임대", "역세권"] as const).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                if (coverKeywords.includes(chip)) return;
                const emptyIdx = coverKeywords.findIndex((k) => !k.trim());
                const targetIdx = emptyIdx !== -1 ? emptyIdx : coverKeywords.length - 1;
                if (targetIdx >= 0) updateKeyword(targetIdx, chip);
              }}
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-800 transition-colors"
            >
              + {chip}
            </button>
          ))}
        </div>
      </div>

      {/* AI 브리핑 / 서브 요약 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2">
        <label htmlFor={briefingId} className="text-label font-extrabold text-slate-900 block">
          도입부 핵심 브리핑 요약
        </label>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          💡 한 줄 브리핑은 중개사님이 직접 적거나 [AI] 탭에서 다듬어 넣을 수 있습니다
        </p>
        <textarea
          id={briefingId}
          value={briefing}
          onChange={(e) => setBriefing(e.target.value)}
          className="w-full h-32 bg-white border border-slate-300 rounded-xl px-4 py-3 text-body font-medium text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/40 transition-all resize-y placeholder:text-slate-400"
          placeholder="고객에게 전달할 핵심 메시지를 2~3문장으로 입력하세요"
        />
      </div>

      {/* 커버 이미지 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-2xs space-y-2" role="group" aria-labelledby={`${uid}-cover-label`}>
        <span id={`${uid}-cover-label`} className="text-label font-extrabold text-slate-900 block">
          헤더 배경 이미지 (선택)
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={fileId}
            className="flex min-h-11 items-center gap-1.5 text-label font-bold px-3.5 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-500 transition-all cursor-pointer"
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
            className="flex min-h-11 items-center gap-1.5 text-label font-bold px-3.5 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-all"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            URL 입력
          </motion.button>
          {coverImageUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-caption text-blue-700 font-medium truncate flex-1">
                {coverImageUrl}
              </span>
              <button
                type="button"
                aria-label="커버 이미지 제거"
                onClick={() => setCoverImageUrl(null)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-slate-500 hover:text-slate-900 flex-shrink-0"
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
