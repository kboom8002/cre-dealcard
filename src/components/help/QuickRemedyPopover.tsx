"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { BROKER_FEEDBACK_SCENARIOS } from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

interface QuickRemedyPopoverProps {
  /** 테마 탭으로 바로 열어주는 콜백 (Basic IM Studio 전용) */
  onOpenThemeTab?: () => void;
  /** 콘텐츠 편집 탭으로 열어주는 콜백 */
  onOpenContentTab?: () => void;
}

/**
 * 매수인·매도인 수정 요청 6대 상황별 '30초 해결 처방전' 모달 (Tier 4)
 * - 수익률 보완 요청, 주변 시세 비교표 추가 요청, 기관 보고용 골드/네이비 색상 변경,
 *   어르신 흑백 인쇄·팩스용 모노 고대비 전환 등 실전 피드백을 30초 안에 해결하도록 안내합니다.
 */
export function QuickRemedyPopover({
  onOpenThemeTab,
  onOpenContentTab,
}: QuickRemedyPopoverProps) {
  const { helperEnabled } = useSeniorHelp();
  const [isOpen, setIsOpen] = useState(false);

  if (!helperEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        data-testid="studio-quick-remedy-btn"
        className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        title="고객이 수익률·시세비교표·색상·흑백인쇄 수정을 요청했을 때 30초 만에 고치는 방법"
      >
        <span>🛠️ 고객 수정 요청 30초 해결사</span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="고객 수정 요청 30초 해결 처방전"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl border-2 border-amber-400 bg-[#FFFBEB] text-[#0F172A] shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 bg-white border-b border-amber-300 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[12px] font-extrabold mb-1">
                    부록 D · 현장 고객 피드백 6대 처방전
                  </span>
                  <h3 className="text-[19px] sm:text-[21px] font-black text-slate-900">
                    🛠️ 매수인·매도인이 자료 수정을 요청하셨나요? (30초 해결법)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-[14px] font-extrabold shrink-0 cursor-pointer"
                >
                  ✕ 닫기
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                {BROKER_FEEDBACK_SCENARIOS.map((sc) => {
                  const isThemeScenario = sc.id === "fb-03" || sc.id === "fb-05";
                  return (
                    <div
                      key={sc.id}
                      className="rounded-2xl border border-amber-300 bg-white p-4 space-y-2 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-100 text-blue-950 text-[13px] font-black">
                          {sc.feedbackFrom}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-950 text-[12px] font-extrabold">
                          ⏱️ 소요시간: {sc.timeRequired}
                        </span>
                      </div>

                      <p className="text-[15px] font-extrabold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        💬 {sc.clientQuote}
                      </p>

                      <div className="text-[14px] sm:text-[15px] text-slate-800 space-y-1 leading-relaxed">
                        <p>
                          <strong className="text-amber-950">📍 고치는 위치: </strong>
                          {sc.whereToFix}
                        </p>
                        <p>
                          <strong className="text-emerald-900">✅ 30초 해결법: </strong>
                          {sc.howToFixIn30Sec}
                        </p>
                      </div>

                      {isThemeScenario && onOpenThemeTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenThemeTab();
                            setIsOpen(false);
                          }}
                          className="mt-1 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[13px] font-extrabold cursor-pointer"
                        >
                          🎨 우측 [테마·프리셋] 탭 바로 열기 →
                        </button>
                      )}
                      {!isThemeScenario && onOpenContentTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenContentTab();
                            setIsOpen(false);
                          }}
                          className="mt-1 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[13px] font-extrabold cursor-pointer"
                        >
                          📝 우측 [슬라이드 편집] 탭 바로 열기 →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
