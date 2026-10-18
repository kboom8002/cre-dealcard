"use client";

import React from "react";
import { motion } from "motion/react";
import {
  SIMPLE_STARTER_CHIPS,
  SIMPLE_NOTE_MAX,
  type StarterChip,
} from "@/lib/magazine/simple-format";
import { SOTA_SPRING } from "@/components/motion/sota-motion";

export function appendStarterTemplate(
  currentComment: string,
  template: string,
  maxLength: number = SIMPLE_NOTE_MAX,
): string {
  const cur = currentComment ?? "";
  const trimmedCur = cur.trim();
  const trimmedTpl = template.trim();
  if (!trimmedTpl) return cur;
  if (!trimmedCur) return template.slice(0, maxLength);
  if (trimmedCur.includes(trimmedTpl)) return cur;
  const joined = `${cur.replace(/\s+$/, "")} ${template}`;
  return joined.slice(0, maxLength);
}

export interface NoteStarterChipsProps {
  currentComment: string;
  onSelectTemplate: (nextComment: string, chip: StarterChip) => void;
  disabled?: boolean;
}

export function NoteStarterChips({
  currentComment,
  onSelectTemplate,
  disabled = false,
}: NoteStarterChipsProps) {
  return (
    <div className="space-y-2" data-testid="note-starter-chips">
      <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300">
        💡 첫 문장이 막막하실 때 아래 버튼을 누르면 시작 문장이 자동으로 들어갑니다
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="한마디 시작 문장 추천">
        {SIMPLE_STARTER_CHIPS.map((chip) => {
          const isIncluded = (currentComment ?? "").includes(chip.template.trim());
          return (
            <motion.button
              key={chip.id}
              type="button"
              disabled={disabled}
              data-testid={`starter-chip-${chip.id}`}
              whileHover={{ y: -1.5 }}
              whileTap={{ scale: 0.97 }}
              transition={SOTA_SPRING}
              onClick={() => {
                const next = appendStarterTemplate(currentComment, chip.template);
                onSelectTemplate(next, chip);
              }}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[15px] font-bold transition-colors shadow-2xs disabled:opacity-50 ${
                isIncluded
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-blue-300 dark:border-indigo-500/40 bg-blue-50/90 dark:bg-indigo-500/15 text-blue-900 dark:text-indigo-100 hover:bg-blue-100 dark:hover:bg-indigo-500/25"
              }`}
            >
              <span>{chip.label}</span>
              {isIncluded && <span className="text-xs font-black ml-0.5">✓</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

