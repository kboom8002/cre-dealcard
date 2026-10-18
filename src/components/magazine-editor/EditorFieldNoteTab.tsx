"use client";

import React, { useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PenLine, Info } from "lucide-react";
import type { BrokerFieldNote } from "@/domain/magazine/types";

const FIELD_NOTE_FIELDS: {
  key: keyof BrokerFieldNote;
  label: string;
  placeholder: string;
  tooltip: string;
}[] = [
  {
    key: "question",
    label: "주간 시장 요약",
    placeholder: "이번 주 시장을 한 문장으로 요약하면?",
    tooltip: "독자가 가장 먼저 읽는 문장입니다. 핵심을 간결하게 전달하세요.",
  },
  {
    key: "buyerReaction",
    label: "매수자 반응",
    placeholder: "이번 주 매수자들의 반응은? (문의 건수, 주요 관심 유형 등)",
    tooltip: "실제 현장에서 느낀 매수자 분위기를 공유하세요.",
  },
  {
    key: "sellerReaction",
    label: "매도자 반응",
    placeholder: "이번 주 매도자들의 반응은? (호가 변동, 급매 여부 등)",
    tooltip: "매도자 심리와 호가 변화를 전달하세요.",
  },
  {
    key: "marketJudgment",
    label: "시장 판단",
    placeholder: "본인의 시장 판단은? (온도, 방향성, 기회/리스크)",
    tooltip: "중개인으로서의 전문적인 시장 진단을 공유하세요.",
  },
  {
    key: "comment",
    label: "독자에게 한마디",
    placeholder: "독자(투자자)에게 한마디",
    tooltip: "구독자에게 직접 전하는 메시지입니다.",
  },
];

interface EditorFieldNoteTabProps {
  fieldNote: BrokerFieldNote;
  updateFieldNote: (key: keyof BrokerFieldNote, val: string) => void;
  activeTooltip: string | null;
  setActiveTooltip: (key: string | null) => void;
}

export function EditorFieldNoteTab({
  fieldNote,
  updateFieldNote,
  activeTooltip,
  setActiveTooltip,
}: EditorFieldNoteTabProps) {
  const uid = useId();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/25 rounded-xl shadow-2xs">
        <PenLine className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[14px] font-bold text-amber-950 dark:text-amber-100 leading-relaxed">
          현장 전문가로서 이번 주 시장에 대한 직접 분석을 작성하세요.
          독자들이 가장 신뢰하는 섹션입니다.
        </p>
      </div>

      {FIELD_NOTE_FIELDS.map((field) => {
        const inputId = `${uid}-${field.key}`;
        const tipId = `${uid}-${field.key}-tip`;
        const tipOpen = activeTooltip === field.key;
        const currentLen = (fieldNote[field.key] ?? "").length;
        return (
          <div key={field.key} className="space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor={inputId} className="text-[15px] font-extrabold text-slate-900 dark:text-slate-200">
                  {field.label}
                </label>
                <button
                  type="button"
                  aria-label={`${field.label} 작성 도움말`}
                  aria-expanded={tipOpen}
                  aria-controls={tipId}
                  onClick={() => setActiveTooltip(tipOpen ? null : field.key)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-blue-700 dark:text-indigo-300 bg-blue-50 dark:bg-slate-800/80 hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>작성 요령 보기</span>
                </button>
              </div>
              <span className="text-xs font-bold text-slate-600 dark:text-ink-subtle">
                {currentLen}자 · 권장 2~3문장
              </span>
            </div>
            <AnimatePresence>
              {tipOpen && (
                <motion.p
                  id={tipId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[13px] font-semibold text-blue-900 dark:text-indigo-200 bg-blue-50/70 dark:bg-indigo-950/40 rounded-lg px-3 py-2 leading-relaxed overflow-hidden"
                >
                  💡 {field.tooltip}
                </motion.p>
              )}
            </AnimatePresence>
            <textarea
              id={inputId}
              value={fieldNote[field.key]}
              onChange={(e) => updateFieldNote(field.key, e.target.value)}
              aria-describedby={tipOpen ? tipId : undefined}
              className="w-full min-h-[108px] resize-y bg-slate-50/60 dark:bg-[#0f1523] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-medium text-slate-900 dark:text-slate-200 leading-relaxed focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
              placeholder={field.placeholder}
            />
          </div>
        );
      })}
    </div>
  );
}

