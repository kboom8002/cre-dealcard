"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useSeniorHelp } from "./SeniorHelpContext";

export interface FieldCoachBannerProps {
  /** 코칭 헤드라인 (e.g. "💡 메모 입력 전 10초 코칭") */
  headline: string;
  /** 상세 안내 지침 (15px-16px) */
  guidance?: string | React.ReactNode;
  /** 1-click 예시 텍스트 */
  sampleText?: string;
  /** 예시 버튼 라벨 (기본값: "✨ 1초 예시 채우기") */
  sampleButtonLabel?: string;
  /** 1-click 예시 채우기 콜백 함수 */
  onApplySample?: (sampleText: string) => void;
  /** 클립보드 복사 모드 (onApplySample 대신 클립보드로 복사) */
  copySample?: boolean;
  /** 복사 완료 토스트 문구 */
  copyToastMessage?: string;
  /** 자주 하는 실수 경고 (⚠️ 자주 하는 실수) */
  mistakeWarning?: string | React.ReactNode;
  /** 실수 경고 기본 접힘 여부 (기본: false) */
  defaultMistakeCollapsed?: boolean;
  /** 디자인 테마 (기본 'amber' 크림 바탕) */
  variant?: "amber" | "blue" | "emerald" | "paper";
  /** 부가 액션 (링크, 버튼 등) */
  actionExtra?: React.ReactNode;
  className?: string;
}

/**
 * 60대 대표공인중개사 맞춤형 필드 코칭 배너 (Tier 2)
 * - 입력창·작업 영역 상단에 위치하여 공백 불안을 없애고 자주 하는 실수를 방지합니다.
 * - 15px~16px 읽기 쉬운 글씨체 & 고대비 앰버 크림/페이퍼 표면
 * - helperEnabled가 false일 때 DOM에서 렌더링되지 않습니다.
 */
export function FieldCoachBanner({
  headline,
  guidance,
  sampleText,
  sampleButtonLabel = "✨ 1초 예시 채우기",
  onApplySample,
  copySample = false,
  copyToastMessage,
  mistakeWarning,
  defaultMistakeCollapsed = false,
  variant = "amber",
  actionExtra,
  className = "",
}: FieldCoachBannerProps) {
  const { helperEnabled } = useSeniorHelp();
  const [isCopied, setIsCopied] = useState(false);
  const [isMistakeOpen, setIsMistakeOpen] = useState(!defaultMistakeCollapsed);

  // Return null when helper is disabled
  if (!helperEnabled) return null;

  const handleAction = async () => {
    if (!sampleText) return;

    if (onApplySample) {
      onApplySample(sampleText);
      setIsCopied(true);
      toast.success(copyToastMessage || "✅ 예시 문구가 입력창에 적용되었습니다!");
      setTimeout(() => setIsCopied(false), 2500);
      return;
    }

    if (copySample || !onApplySample) {
      try {
        await navigator.clipboard.writeText(sampleText);
        setIsCopied(true);
        toast.success(copyToastMessage || "✅ 예시가 복사되었습니다! 필요한 곳에 붙여넣기(Ctrl+V) 하세요.");
        setTimeout(() => setIsCopied(false), 2500);
      } catch {
        toast.error("복사에 실패했습니다.");
      }
    }
  };

  const variantStyles = {
    amber: "border-amber-300 bg-[#FFFBEB] text-[#0F172A]",
    blue: "border-blue-300 bg-blue-50/80 text-blue-950",
    emerald: "border-emerald-300 bg-emerald-50/80 text-emerald-950",
    paper: "border-slate-300 bg-white text-slate-900",
  }[variant];

  return (
    <div
      data-testid="field-coach-banner"
      className={`rounded-2xl border-2 p-4 sm:p-5 space-y-3 shadow-2xs transition-all ${variantStyles} ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-[240px]">
          <h3 className="text-[16px] sm:text-[17px] font-black leading-snug tracking-tight">
            {headline}
          </h3>
          {guidance && (
            <div className="text-[14px] sm:text-[15px] font-medium leading-relaxed opacity-95">
              {guidance}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {sampleText && (
            <button
              type="button"
              onClick={handleAction}
              data-testid="field-coach-sample-btn"
              className={`px-3.5 py-2 min-h-[40px] rounded-xl text-[14px] font-black transition-all cursor-pointer shadow-2xs ${
                isCopied
                  ? "bg-emerald-700 text-white border border-emerald-800"
                  : "bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500/60"
              }`}
            >
              {isCopied ? (onApplySample ? "✅ 적용 완료!" : "✅ 복사 완료!") : sampleButtonLabel}
            </button>
          )}
          {actionExtra}
        </div>
      </div>

      {mistakeWarning && (
        <div className="rounded-xl border border-amber-300 bg-white/90 p-3 text-[14px] text-amber-950 space-y-1">
          <button
            type="button"
            onClick={() => setIsMistakeOpen((prev) => !prev)}
            aria-expanded={isMistakeOpen}
            className="w-full flex items-center justify-between text-left cursor-pointer font-black text-[14px] text-amber-950 hover:text-amber-800"
          >
            <span>⚠️ 잠깐! 자주 하는 실수</span>
            <span className="text-[12px] font-bold text-slate-600 bg-amber-100 px-2 py-0.5 rounded-md">
              {isMistakeOpen ? "접기 ▲" : "펼치기 ▼"}
            </span>
          </button>
          {isMistakeOpen && (
            <div className="text-[13px] sm:text-[14px] text-slate-800 font-medium leading-relaxed pt-1.5 border-t border-amber-200">
              {mistakeWarning}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
