"use client";

import React from "react";
import {
  SIMPLE_STARTER_CHIPS,
  SIMPLE_NOTE_MAX,
  type StarterChip,
} from "@/lib/magazine/simple-format";

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
    <div className="space-y-1.5" data-testid="note-starter-chips">
      <p className="text-xs font-semibold text-slate-300">
        💡 첫 문장이 막막하실 때 아래 버튼을 누르면 시작 문장이 자동으로 들어갑니다
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="한마디 시작 문장 추천">
        {SIMPLE_STARTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            data-testid={`starter-chip-${chip.id}`}
            onClick={() => {
              const next = appendStarterTemplate(currentComment, chip.template);
              onSelectTemplate(next, chip);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-indigo-500/35 bg-indigo-500/12 px-3.5 py-2.5 text-[15px] font-semibold text-indigo-100 hover:border-indigo-400 hover:bg-indigo-500/22 active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
