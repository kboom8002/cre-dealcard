"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { BROKER_MESSAGE_TEMPLATES } from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

export interface KakaoTemplatePickerProps {
  /** 매물 ID (선택: 없을 경우 링크 없이 인사말만 복사) */
  buildingId?: string;
  dealTitle?: string;
  areaSignal?: string;
  priceBand?: string;
  /** 기본 선택/강조할 템플릿 ID (e.g. "tpl-06") */
  defaultTemplateId?: string;
  /** 버튼 라벨 (기본값: "💬 카톡 보낼 때 같이 적을 '상황별 인사말 6선' 1초 복사") */
  buttonLabel?: string;
  className?: string;
}

/**
 * 60대 대표공인중개사 맞춤형 '상황별 카톡 인사말 멘트 6선' 1초 복사기 (Tier 2)
 * - 단독 발송, 비교 발송, 급매 안내, 정식 PPTX 송부, 주간 소식지, 3회 열람 안부 팔로업(tpl-06)
 * - buildingId가 있으면 블라인드 딜카드 링크(/dc/[buildingId])를 자동으로 포함합니다.
 */
export function KakaoTemplatePicker({
  buildingId,
  dealTitle,
  areaSignal,
  priceBand,
  defaultTemplateId,
  buttonLabel = "💬 카톡 보낼 때 같이 적을 '상황별 인사말 6선' 1초 복사",
  className = "",
}: KakaoTemplatePickerProps) {
  const { helperEnabled } = useSeniorHelp();
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!helperEnabled) return null;

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://credeal.net";
  const dealUrl = buildingId ? `${siteUrl}/dc/${buildingId}` : "";

  const handleCopyTemplate = async (id: string, rawBody: string, situation: string) => {
    const customized = dealUrl
      ? `${rawBody}\n\n🔗 매물 딜카드 바로 보기: ${dealUrl}`
      : rawBody;

    try {
      await navigator.clipboard.writeText(customized);
      setCopiedId(id);
      const successMsg = dealUrl
        ? `✅ [${situation}] 카톡 인사말과 매물 링크가 함께 복사되었습니다! 카카오톡 창에 붙여넣기(Ctrl+V) 하세요.`
        : `✅ [${situation}] 카톡 인사말이 복사되었습니다! 카카오톡 창에 붙여넣기(Ctrl+V) 하세요.`;
      toast.success(successMsg);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2500);
    } catch {
      toast.error("복사에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        data-testid="kakao-template-picker-btn"
        className={`w-full py-2.5 px-3.5 rounded-xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-950 text-[14px] font-extrabold flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer ${className}`}
      >
        <span>{buttonLabel}</span>
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
              aria-label="상황별 카톡 인사말 템플릿 6선"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border-2 border-amber-400 bg-[#FFFBEB] text-[#0F172A] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-white border-b border-amber-300 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[12px] font-extrabold mb-1">
                    부록 C · 베테랑 대표중개사 실전 카톡 문구
                  </span>
                  <h3 className="text-[19px] sm:text-[21px] font-black text-slate-900">
                    💬 상황별 카카오톡 발송 인사말 6선 {dealUrl ? "(링크 자동 포함)" : ""}
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

              {/* Description */}
              <div className="px-5 py-3 bg-amber-100/70 border-b border-amber-200 text-[14px] font-bold text-amber-950 shrink-0">
                💡 원하시는 상황의 <strong>[📋 인사말 복사]</strong> 버튼을 누르신 뒤, 카카오톡 대화창에 붙여넣기(Ctrl+V)만 하시면 됩니다.
                {(areaSignal || priceBand || dealTitle) && (
                  <span className="block text-[13px] text-slate-700 mt-0.5">
                    현재 연결된 매물: <strong>{dealTitle || `${areaSignal || ""} ${priceBand || ""}`}</strong>
                  </span>
                )}
              </div>

              {/* Template List */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                {BROKER_MESSAGE_TEMPLATES.map((tpl) => {
                  const isCopied = copiedId === tpl.id;
                  const isDefaultRecommended = defaultTemplateId === tpl.id;

                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-2xl border p-4 shadow-2xs space-y-2.5 transition-all ${
                        isDefaultRecommended
                          ? "border-2 border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/40"
                          : "border-amber-300 bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 text-[12px] font-extrabold">
                            {tpl.situation}
                          </span>
                          {isDefaultRecommended && (
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 border border-amber-500 text-[11px] font-black animate-pulse">
                              ⭐ 지금 추천
                            </span>
                          )}
                          <span className="text-[13px] font-bold text-slate-600">
                            추천 대상: {tpl.targetAudience}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyTemplate(tpl.id, tpl.body, tpl.situation)}
                          className={`px-3.5 py-2 min-h-[38px] rounded-xl text-[14px] font-extrabold transition-colors cursor-pointer ${
                            isCopied
                              ? "bg-emerald-700 text-white"
                              : "bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] border border-amber-400"
                          }`}
                        >
                          {isCopied
                            ? "✅ 복사 완료! (카톡에 붙여넣으세요)"
                            : dealUrl
                            ? "📋 인사말 + 딜카드 링크 한 번에 복사"
                            : "📋 인사말 1초 복사"}
                        </button>
                      </div>

                      <p className="text-[15px] font-extrabold text-slate-900">{tpl.title}</p>
                      <pre className="whitespace-pre-wrap font-sans text-[14px] sm:text-[15px] text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
                        {tpl.body}
                      </pre>
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
