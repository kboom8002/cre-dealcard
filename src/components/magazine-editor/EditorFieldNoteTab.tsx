"use client";

import React from "react";
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
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/15 rounded-xl">
        <PenLine className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          현장 전문가로서 이번 주 시장에 대한 직접 분석을 작성하세요.
          독자들이 가장 신뢰하는 섹션입니다.
        </p>
      </div>

      {FIELD_NOTE_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-300">
              {field.label}
            </label>
            <button
              onClick={() =>
                setActiveTooltip(
                  activeTooltip === field.key ? null : field.key
                )
              }
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Info className="w-3 h-3" />
            </button>
          </div>
          <AnimatePresence>
            {activeTooltip === field.key && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[10px] text-slate-500 leading-relaxed pl-1 overflow-hidden"
              >
                {field.tooltip}
              </motion.p>
            )}
          </AnimatePresence>
          <textarea
            value={fieldNote[field.key]}
            onChange={(e) => updateFieldNote(field.key, e.target.value)}
            className="w-full h-20 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
            placeholder={field.placeholder}
          />
        </div>
      ))}
    </div>
  );
}
