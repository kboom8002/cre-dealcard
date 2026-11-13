"use client";

import React, { useState } from "react";
import type { DealCardGenerationSource } from "@/lib/deal-card/card4-schema";

export interface PairedMemoTopCardProps {
  mode: "capture" | "paired";
  memoText: string;
  onMemoTextChange: (nextText: string) => void;
  onGenerateFromMemo: () => void;
  onSaveMemoOnly?: () => void;
  onSkipMemoManual?: () => void;
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
      className={`rounded-2xl border transition-all ${
        isCaptureMode
          ? "p-5 bg-gradient-to-b from-white via-white to-[#F2F7FF] border-[#007AFF]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_28px_-8px_rgba(0,122,255,0.18)] ring-2 ring-[#007AFF]/12"
          : "p-4 bg-white/95 border-slate-900/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_14px_rgba(15,23,42,0.06)]"
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold text-[#1D1D1F] flex items-center gap-1.5">
              <span>📝</span>
              <span>
                {isCaptureMode
                  ? "원본 매물 메모 먼저 입력"
                  : "페어링된 원본 매물 메모"}
              </span>
            </h2>

            {isCaptureMode ? (
              <span className="px-2.5 py-0.5 rounded-full bg-[#007AFF]/12 text-[#0040DD] border border-[#007AFF]/25 text-sm font-bold">
                1단계 · 메모 입력
              </span>
            ) : generationSource === "ai_memo" ? (
              <span
                data-testid="paired-memo-origin-badge"
                className="px-2.5 py-0.5 rounded-full bg-[#007AFF]/12 text-[#0040DD] border border-[#007AFF]/25 text-sm font-bold"
              >
                ✨ AI 메모 생성됨
              </span>
            ) : (
              <span
                data-testid="paired-memo-origin-badge"
                className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-sm font-semibold"
              >
                ✍️ 직접 작성 · 메모 연결 가능
              </span>
            )}

            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-sm font-semibold">
              🔒 나만 보는 비공개 메모
            </span>
          </div>
        </div>

        {/* Header Helper Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="dealcard-open-memo-import-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenMemoImportModal}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-sm font-bold transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>📋 저장된 메모 불러오기</span>
          </button>

          {!isCaptureMode && (
            <button
              type="button"
              data-testid="dealcard-memo-collapse-btn"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-expanded={!isCollapsed}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#3A3A3C] border border-slate-300 text-sm font-semibold transition cursor-pointer"
            >
              {isCollapsed ? "메모 펼치기 ▾" : "접기 ▴"}
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
            : "아직 입력된 원본 메모가 없습니다. 눌러서 번지·특약·소유주 메모를 남겨두세요."}
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
              className={`w-full p-3.5 rounded-xl bg-white border text-base text-[#1D1D1F] placeholder:text-[#6E6E73] leading-relaxed focus:outline-none focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 transition resize-y ${
                isCaptureMode
                  ? "min-h-[132px] border-[#007AFF]/30"
                  : "min-h-[88px] border-slate-300"
              }`}
            />
          </div>

          {/* Footer Action Bar */}
          {isCaptureMode ? (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="dealcard-generate-from-memo-btn"
                  disabled={!hasMemo || isGenerating}
                  onClick={onGenerateFromMemo}
                  className="min-h-[50px] px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed text-white text-base font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,122,255,0.28)] transition cursor-pointer inline-flex items-center gap-2"
                >
                  <span>✨</span>
                  <span>
                    {isGenerating
                      ? "메모 분석 및 딜카드 생성 중..."
                      : "메모로 딜카드 생성하기"}
                  </span>
                </button>

                {onSaveMemoOnly && (
                  <button
                    type="button"
                    data-testid="dealcard-save-memo-only-btn"
                    disabled={!hasMemo || isGenerating}
                    onClick={onSaveMemoOnly}
                    className="min-h-[50px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer"
                  >
                    📝 메모만 저장해두기
                  </button>
                )}
              </div>

              {onSkipMemoManual && (
                <button
                  type="button"
                  data-testid="dealcard-skip-memo-manual-btn"
                  onClick={onSkipMemoManual}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold text-[#515154] hover:text-[#1D1D1F] hover:bg-slate-100 transition cursor-pointer"
                >
                  메모 없이 직접 입력하기 ▾
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-[#515154] font-medium flex items-center gap-2">
                {memoSaveStatus === "saving" ? (
                  <span data-testid="paired-memo-save-status" className="text-[#007AFF] font-semibold">
                    원본 메모 저장 중...
                  </span>
                ) : memoSaveStatus === "saved" ? (
                  <span data-testid="paired-memo-save-status" className="text-[#116B22] font-semibold">
                    ✓ 원본 메모 자동 저장됨 (딜카드 문구는 유지됩니다)
                  </span>
                ) : hasMemo ? (
                  <span data-testid="paired-memo-save-status">
                    메모를 수정해도 아래 딜카드 문구는 덮어쓰지 않고 안전하게 따로 보관됩니다.
                  </span>
                ) : (
                  <span data-testid="paired-memo-save-status">
                    번지·소유주·특약 메모를 적어두면 이 딜카드와 1:1로 항상 함께 보입니다.
                  </span>
                )}
              </div>

              <button
                type="button"
                data-testid="dealcard-reparse-memo-btn"
                disabled={!hasMemo || isGenerating}
                onClick={onGenerateFromMemo}
                className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/18 disabled:opacity-45 disabled:cursor-not-allowed text-[#0040DD] border border-[#007AFF]/25 text-sm font-bold transition cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              >
                <span>↻</span>
                <span>
                  {isGenerating
                    ? "다시 채우는 중..."
                    : "메모 내용으로 딜카드 다시 채우기"}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
