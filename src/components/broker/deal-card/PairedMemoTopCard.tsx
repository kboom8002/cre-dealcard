"use client";

import React, { useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import type { DealCardGenerationSource } from "@/lib/deal-card/card4-schema";

export interface PairedMemoTopCardProps {
  mode: "capture" | "paired";
  memoText: string;
  onMemoTextChange: (nextText: string) => void;
  onGenerateFromMemo: () => void;
  onSaveMemoOnly?: () => void;
  onSkipMemoManual?: () => void;
  onFillSample?: () => void;
  onOpenMemoImportModal: () => void;
  isGenerating: boolean;
  memoSaveStatus?: "idle" | "saving" | "saved";
  generationSource?: DealCardGenerationSource;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function PairedMemoTopCard({
  mode,
  memoText,
  onMemoTextChange,
  onGenerateFromMemo,
  onSaveMemoOnly,
  onSkipMemoManual,
  onFillSample,
  onOpenMemoImportModal,
  isGenerating,
  memoSaveStatus = "idle",
  generationSource = "ai_memo",
  textareaRef,
}: PairedMemoTopCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasMemo = memoText.trim().length > 0;
  const isCaptureMode = mode === "capture";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (hasMemo && !isGenerating) {
        onGenerateFromMemo();
      }
    }
  };

  return (
    <section
      data-testid="paired-memo-top-card"
      data-memo-mode={mode}
      aria-label="원본 매물 메모 및 딜카드 생성"
      className={`rounded-2xl border bg-white transition-all ${
        isCaptureMode
          ? "p-5 border-slate-300 shadow-xs"
          : "p-4 border-slate-200 shadow-2xs"
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-extrabold text-[#1D1D1F]">
            {isCaptureMode ? "매물 메모로 10초 만에 만들기" : "원본 매물 메모"}
          </h2>
          {!isCaptureMode && (
            <span
              data-testid="paired-memo-origin-badge"
              className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[#515154] border border-slate-200 text-sm font-semibold"
            >
              {generationSource === "ai_memo" ? "AI 메모 생성" : "직접 작성"}
            </span>
          )}
          <span className="text-sm font-medium text-[#6E6E73]">
            · 나만 보는 비공개
          </span>
        </div>

        {/* Header Helper Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="dealcard-open-memo-import-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenMemoImportModal}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer inline-flex items-center"
          >
            저장 메모 불러오기
          </button>

          {!isCaptureMode && (
            <button
              type="button"
              data-testid="dealcard-memo-collapse-btn"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-expanded={!isCollapsed}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#3A3A3C] border border-slate-300 text-sm font-semibold transition cursor-pointer"
            >
              {isCollapsed ? "펼치기 ▾" : "접기 ▴"}
            </button>
          )}
        </div>
      </div>

      {/* Collapsed 1-line summary when user manually collapses in paired mode */}
      {!isCaptureMode && isCollapsed ? (
        <div
          data-testid="paired-memo-collapsed-summary"
          onClick={() => setIsCollapsed(false)}
          className="mt-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-[#3A3A3C] cursor-pointer hover:bg-slate-100 transition"
        >
          {hasMemo
            ? memoText.replace(/\s+/g, " ").trim()
            : "번지·소유주·특약 메모를 남겨두세요."}
        </div>
      ) : (
        <>
          {/* Memo Input Textarea */}
          <div className="mt-3">
            <label htmlFor="dealcard-top-memo-input" className="sr-only">
              원본 매물 메모 입력
            </label>
            <textarea
              ref={textareaRef}
              id="dealcard-top-memo-input"
              data-testid="dealcard-top-memo-textarea"
              value={memoText}
              onChange={(e) => onMemoTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={isCaptureMode ? 5 : 3}
              placeholder="예: 마포구 서교동 395-12 코너 근생빌딩, 1층 스타벅스 입점, 대지 90평 / 연면적 280평, 매매가 85억, 홍대입구역 도보 3분 전층 만실 (김사장님 010-1234-5678)"
              className={`w-full p-3.5 rounded-xl bg-white border text-base text-[#1D1D1F] placeholder:text-[#6E6E73] leading-relaxed focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 transition resize-y ${
                isCaptureMode
                  ? "min-h-[132px] border-slate-300"
                  : "min-h-[88px] border-slate-300"
              }`}
            />
          </div>

          {/* Footer Action Bar: 2 grouped clusters (primary memo actions vs secondary helper shortcuts) */}
          {isCaptureMode ? (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="dealcard-generate-from-memo-btn"
                  disabled={!hasMemo || isGenerating}
                  onClick={onGenerateFromMemo}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 disabled:cursor-not-allowed text-white text-base font-extrabold shadow-xs transition cursor-pointer inline-flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {isGenerating
                      ? "메모로 딜카드 만드는 중…"
                      : "메모로 딜카드 생성하기"}
                  </span>
                </button>

                {onSaveMemoOnly && (
                  <button
                    type="button"
                    data-testid="dealcard-save-memo-only-btn"
                    disabled={!hasMemo || isGenerating}
                    onClick={onSaveMemoOnly}
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer"
                  >
                    메모만 저장해두기
                  </button>
                )}
              </div>

              {(onFillSample || onSkipMemoManual) && (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                  {onFillSample && (
                    <button
                      type="button"
                      data-testid="dealcard-fill-sample-btn"
                      onClick={onFillSample}
                      className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-[#1D1D1F] border border-slate-200 text-sm font-bold transition cursor-pointer whitespace-nowrap"
                    >
                      예시 채우기
                    </button>
                  )}
                  {onSkipMemoManual && (
                    <button
                      type="button"
                      data-testid="dealcard-skip-memo-manual-btn"
                      onClick={onSkipMemoManual}
                      className="min-h-[44px] px-3 py-1.5 rounded-lg bg-transparent hover:bg-white text-[#515154] text-sm font-bold transition cursor-pointer whitespace-nowrap"
                    >
                      메모 없이 직접 입력
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-[#515154] font-medium flex items-center gap-2">
                {memoSaveStatus === "saving" ? (
                  <span data-testid="paired-memo-save-status" className="text-[#1D4ED8] font-semibold">
                    메모 저장 중…
                  </span>
                ) : memoSaveStatus === "saved" ? (
                  <span data-testid="paired-memo-save-status" className="text-[#059669] font-semibold">
                    메모 저장됨
                  </span>
                ) : (
                  <span data-testid="paired-memo-save-status">
                    원본 메모는 나만 보며 자동 저장됩니다
                  </span>
                )}
              </div>

              <button
                type="button"
                data-testid="dealcard-reparse-memo-btn"
                disabled={!hasMemo || isGenerating}
                onClick={onGenerateFromMemo}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              >
                <RotateCw className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                <span>
                  {isGenerating ? "다시 채우는 중…" : "메모로 다시 채우기"}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
