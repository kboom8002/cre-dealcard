"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { BROKER_TUTORIAL_MODULES } from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

/**
 * 렌트롤 업로드 영역 바로 위에 배치되는 '엉망인 임대내역 AI 10초 변환 도우미 & 4대 함정 방지' 모달 (Tier 2)
 */
export function RentRollAiHelperModal() {
  const { helperEnabled } = useSeniorHelp();
  const [isOpen, setIsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!helperEnabled) return null;

  const prepModule = BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-prep");
  const stepMethodA = prepModule?.steps.find((s) => s.id === "step-prep-3");
  const stepMethodB = prepModule?.steps.find((s) => s.id === "step-prep-5");

  const handleCopyPrompt = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`✅ [${label}]가 복사되었습니다! ChatGPT·Claude·Gemini 창에 붙여넣기(Ctrl+V) 하세요.`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2500);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return (
    <>
      <div className="rounded-2xl border-2 border-amber-400 bg-[#FFFBEB] p-3.5 space-y-2 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[14px] sm:text-[15px] font-black text-amber-950">
              💡 매도인이 준 임대내역이 사진·한글·제각각인 엑셀인가요?
            </p>
            <p className="text-[13px] font-semibold text-slate-800">
              손으로 일일이 다시 치지 마시고 AI 변환 지시문으로 1분 만에 표준 표로 바꾸세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            data-testid="rentroll-ai-helper-btn"
            className="px-3.5 py-2 min-h-[38px] rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-[13px] sm:text-[14px] font-black shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            🤖 AI 10초 변환 지시문 복사 · 주의사항 보기
          </button>
        </div>
      </div>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="렌트롤 AI 변환 도우미"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border-2 border-amber-400 bg-[#FFFBEB] text-[#0F172A] shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 bg-white border-b border-amber-300 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[12px] font-extrabold mb-1">
                    준비편 핵심 요약 · 수작업 입력 제로
                  </span>
                  <h3 className="text-[19px] sm:text-[21px] font-black text-slate-900">
                    🤖 엉망인 임대내역(사진·PPT·엑셀) AI로 표준 렌트롤 변환하기
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

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* 4대 실수 방지 체크리스트 */}
                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/80 p-4 space-y-2">
                  <p className="text-[15px] font-black text-rose-950">
                    ⚠️ 업로드 전 꼭 확인하실 4대 실수 방지 포인트
                  </p>
                  <ul className="space-y-1.5 text-[14px] text-slate-900 font-semibold leading-relaxed">
                    <li>
                      <strong>① 금액 단위 확인:</strong> 원본이 &apos;천원&apos; 단위면 ×1,000하여 &apos;원&apos; 단위로 들어갔는지 확인하세요.
                    </li>
                    <li>
                      <strong>② 공실·자가사용 괄호 금액:</strong> 공실 행의 <code>(희망 보증금/월세)</code>는 G·H열을 비우고 P열(비고)에 적어야 실수입 합계가 왜곡되지 않습니다.
                    </li>
                    <li>
                      <strong>③ 합계·기계실 행 제외:</strong> 맨 아래 &apos;합계/소계&apos; 행이나 임대 대상이 아닌 &apos;기계실/무료주차장&apos; 행은 뺍니다.
                    </li>
                    <li>
                      <strong>④ 주택 임차인 실명 가리기:</strong> 다가구·주택 임차인의 실명·주민번호는 AI에 올리기 전에 &apos;주택 임차인 A&apos;로 바꿔 주세요.
                    </li>
                  </ul>
                </div>

                {/* Method A */}
                {stepMethodA?.copySample && (
                  <div className="rounded-2xl border border-amber-300 bg-white p-4 space-y-2.5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[16px] font-black text-slate-900">
                        방법 A (권장 · 모든 AI 챗봇): 16열 표로 받아 빈 양식 A13칸에 붙여넣기
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyPrompt(
                            "methodA",
                            stepMethodA.copySample!.text,
                            stepMethodA.copySample!.label
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl text-[14px] font-extrabold transition-colors cursor-pointer ${
                          copiedKey === "methodA"
                            ? "bg-emerald-700 text-white"
                            : "bg-blue-700 hover:bg-blue-800 text-white"
                        }`}
                      >
                        {copiedKey === "methodA"
                          ? "✅ 복사 완료! (AI 챗봇에 Ctrl+V)"
                          : "📋 방법 A 변환 지시문 1초 복사"}
                      </button>
                    </div>
                    <p className="text-[14px] text-slate-700 leading-relaxed">
                      ChatGPT·Claude·Gemini에 매도인 자료(사진·엑셀)를 첨부하고 위 버튼으로 복사한 지시문을 붙여넣으세요. AI가 돌려준 16열 표를 크리딜 빈 양식 <strong>A13 칸</strong>에 붙여넣으면 끝납니다.
                    </p>
                  </div>
                )}

                {/* Method B */}
                {stepMethodB?.copySample && (
                  <div className="rounded-2xl border border-amber-300 bg-white p-4 space-y-2.5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[16px] font-black text-slate-900">
                        방법 B (빠른 방법): 빈 양식(.xlsx)과 매도인 자료를 함께 올려 파일째 받기
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyPrompt(
                            "methodB",
                            stepMethodB.copySample!.text,
                            stepMethodB.copySample!.label
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl text-[14px] font-extrabold transition-colors cursor-pointer ${
                          copiedKey === "methodB"
                            ? "bg-emerald-700 text-white"
                            : "bg-slate-800 hover:bg-slate-900 text-white"
                        }`}
                      >
                        {copiedKey === "methodB"
                          ? "✅ 복사 완료! (AI 챗봇에 Ctrl+V)"
                          : "📋 방법 B 양식 채우기 지시문 복사"}
                      </button>
                    </div>
                    <p className="text-[14px] text-slate-700 leading-relaxed">
                      ChatGPT 유료 버전이나 Claude처럼 엑셀 파일 생성 기능이 있는 챗봇에 <strong>① 크리딜 빈 양식 파일</strong>과 <strong>② 매도인 자료</strong>를 함께 올리고 지시문을 붙여넣으면 채워진 엑셀 파일을 바로 내려받으실 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
