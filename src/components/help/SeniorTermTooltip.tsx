"use client";

import React, { useState, useRef, useEffect } from "react";
import { BROKER_GLOSSARY_LIST, POSTURE_GUIDE_ROWS } from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

export interface BuiltinTermEntry {
  title: string;
  easyMeaning: string;
  tip?: string;
}

const BUILTIN_TERMS: Record<string, BuiltinTermEntry> = {
  "수신자 화면": {
    title: "📱 수신자 화면 (고객 보호 블라인드 화면)",
    easyMeaning:
      "매수 고객님께 카카오톡으로 보냈을 때 고객님 휴대폰에 실제로 보이는 화면입니다. 상세 지번(예: 114번지)과 건물명, 호실별 임차인 실명은 자동으로 가려지고 '중구 쌍림동 역세권'처럼 안전하게 표시됩니다.",
    tip: "카톡으로 보내기 전에 [수신자 화면]을 눌러 지번이 잘 가려졌는지 5초만 확인하시면 매물 뺏길 걱정 없이 안심하고 보내실 수 있습니다.",
  },
  "안정화 수익률": {
    title: "📈 안정화 기대수익률 (공실·주인사용 층 임대 전환 시)",
    easyMeaning:
      "현재 비어 있는 층(공실)이나 건물주가 직접 쓰고 있는 층을 주변 시세대로 세놓았을 때 올라가는 예상 수익률입니다.",
    tip: "지금 당장 수익률이 2%대라 아쉬워하는 매수 고객님께 '공실 채우면 3.7%까지 올라갑니다'라고 설득할 수 있는 가장 강력한 무기입니다.",
  },
  "다필지": {
    title: "🗺️ 다필지 매물 (여러 번지가 함께 매각되는 건물)",
    easyMeaning:
      "건물 하나가 2개 이상의 번지(예: 양평동4가 117, 134, 125-2) 위에 지어졌거나 본건 옆 주차장 필지가 함께 매각되는 경우입니다.",
    tip: "메모에 '양평동4가 117 외 134, 125-2'처럼 쉼표로 함께 적어주시면 토지 면적을 합산하여 정확한 평당가를 계산합니다.",
  },
  "투자 포스처": {
    title: "🎯 5대 투자 목적 (포스처)",
    easyMeaning:
      "이 건물을 어떤 매수자에게 브리핑할지 고르는 기준입니다. 선택하신 목적에 맞춰 12장 PPTX 제안서의 표지 문구와 분석 표가 자동으로 바뀝니다.",
    tip: "꼬마빌딩·근생은 [💰 임대수익], 법인 사옥용은 [🏢 자가사용(사옥)], 나대지·신축부지는 [🏗️ 신축·리모델링]을 고르시면 가장 알맞습니다.",
  },
  "모노 고대비": {
    title: "🖨️ 모노 고대비 테마 (흑백 인쇄 · 팩스 전용)",
    easyMeaning:
      "배경 색깔을 모두 없애고 흰 종이 바탕에 진한 먹색 글씨와 굵은 테두리로만 만드는 인쇄 전용 테마입니다.",
    tip: "휴대폰 작은 글씨보다 종이 출력물이나 팩스를 선호하시는 60~70대 건물주·매수인 어르신께 드릴 때 선택하시면 숫자 하나 흐려지지 않고 또렷하게 인쇄됩니다.",
  },
  "렌트롤 AI 변환": {
    title: "🤖 엉망인 임대내역(렌트롤) AI 10초 자동 변환",
    easyMeaning:
      "매도인이 사진, 한글파일, 혹은 줄이 안 맞는 엑셀로 준 임대내역을 ChatGPT·Claude에 붙여넣어 크리딜 표준 표로 한 번에 바꾸는 기능입니다.",
    tip: "주의하실 점 딱 2가지! ① 금액 단위가 '천원'이면 원 단위로 바꿨는지, ② 공실 행의 (희망월세)는 비고란으로 옮겼는지만 확인해 주세요.",
  },
};

export interface SeniorTermTooltipProps {
  /** 내장 용어 키 또는 BROKER_GLOSSARY_LIST 검색어 */
  termKey?: string;
  /** 버튼 라벨 (기본값: "❓ 쉬운 설명") */
  buttonLabel?: string;
  /** 직접 지정할 제목 */
  title?: string;
  /** 직접 지정할 쉬운 설명 */
  easyMeaning?: string;
  /** 실무 중개 팁 */
  tip?: string;
  /** 5대 투자 포스처 비교표를 함께 보여줄지 여부 */
  showPostureTable?: boolean;
  /** 실행 버튼 라벨 (선택) */
  actionLabel?: string;
  /** 실행 버튼 클릭 핸들러 (선택) */
  onAction?: () => void;
  className?: string;
}

/**
 * 60대 대표공인중개사 맞춤형 클릭 고정형(Click-to-Pin) 고대비 용어·개념 툴팁 (Tier 1)
 * - 마우스 호버가 아닌 클릭/터치 고정 방식
 * - 16px~17px 큰 글씨 & 따뜻한 크림/앰버 고대비 카드 (#FFFBEB + #0F172A)
 */
export function SeniorTermTooltip({
  termKey,
  buttonLabel = "❓ 쉬운 설명",
  title,
  easyMeaning,
  tip,
  showPostureTable = false,
  actionLabel,
  onAction,
  className = "",
}: SeniorTermTooltipProps) {
  const { helperEnabled } = useSeniorHelp();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (!helperEnabled) return null;

  // Resolve content from BUILTIN_TERMS or BROKER_GLOSSARY_LIST
  const builtin = termKey ? BUILTIN_TERMS[termKey] : undefined;
  const glossaryMatch = termKey
    ? BROKER_GLOSSARY_LIST.find(
        (g) =>
          g.term.toLowerCase().includes(termKey.toLowerCase()) ||
          termKey.toLowerCase().includes(g.term.split("(")[0].trim().toLowerCase())
      )
    : undefined;

  const resolvedTitle = title || builtin?.title || glossaryMatch?.term || termKey || "쉬운 용어 설명";
  const resolvedMeaning =
    easyMeaning ||
    builtin?.easyMeaning ||
    glossaryMatch?.easyMeaning ||
    "이 항목에 대한 쉬운 설명입니다.";
  const resolvedTip = tip || builtin?.tip || (glossaryMatch?.whereUsed ? `활용 위치: ${glossaryMatch.whereUsed}` : undefined);

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        data-testid={`senior-tooltip-trigger-${termKey || "custom"}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-full bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 text-[13px] font-extrabold shadow-2xs transition-colors cursor-pointer shrink-0"
      >
        <span>{buttonLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={resolvedTitle}
          onClick={(e) => e.stopPropagation()}
          className="fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto bottom-6 sm:bottom-auto sm:top-full sm:mt-2 z-[9999] sm:w-[400px] max-w-[92vw] rounded-2xl border-2 border-amber-500 bg-[#FFFBEB] text-[#0F172A] p-4 sm:p-5 shadow-2xl space-y-3 text-left animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-start justify-between gap-2 border-b border-amber-300 pb-2.5">
            <p className="text-[16px] sm:text-[17px] font-black text-amber-950 leading-snug">
              {resolvedTitle}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 text-[13px] font-extrabold shrink-0 cursor-pointer"
            >
              ✕ 닫기
            </button>
          </div>

          <p className="text-[15px] sm:text-[16px] font-semibold text-slate-900 leading-relaxed">
            {resolvedMeaning}
          </p>

          {resolvedTip && (
            <div className="rounded-xl bg-white border border-amber-300 p-3 text-[14px] text-slate-800 leading-relaxed">
              <span className="font-extrabold text-amber-900">💡 실무 팁: </span>
              <span>{resolvedTip}</span>
            </div>
          )}

          {showPostureTable && (
            <div className="space-y-1.5 pt-1 max-h-[220px] overflow-y-auto">
              <p className="text-[13px] font-extrabold text-amber-950">
                👇 5가지 투자 목적별 추천 매물 한눈에 보기
              </p>
              {POSTURE_GUIDE_ROWS.map((row) => (
                <div
                  key={row.postureName}
                  className="rounded-xl bg-white border border-amber-200 p-2.5 text-[13px] space-y-0.5"
                >
                  <p className="font-black text-slate-900">{row.postureName}</p>
                  <p className="text-slate-700">{row.recommendedFor}</p>
                </div>
              ))}
            </div>
          )}

          {actionLabel && onAction && (
            <button
              type="button"
              onClick={() => {
                onAction();
                setOpen(false);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[14px] font-extrabold shadow-xs transition-colors cursor-pointer"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
