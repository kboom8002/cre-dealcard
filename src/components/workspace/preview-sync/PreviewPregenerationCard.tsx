"use client";

import React from "react";

export interface PregenerationChecklistItem {
  label: string;
  done: boolean;
  onClick?: () => void;
}

export interface PreviewPregenerationCardProps {
  testId: string;
  badge?: string;
  title: string;
  description: string;
  checklist?: PregenerationChecklistItem[];
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryActionTestId?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionTestId?: string;
}

export function PreviewPregenerationCard({
  testId,
  badge = "생성 전 · 입력 대기",
  title,
  description,
  checklist,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionTestId,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTestId,
}: PreviewPregenerationCardProps) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 space-y-4 shadow-xs"
    >
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-sm font-bold text-slate-800">
          <span aria-hidden="true">○</span>
          <span>{badge}</span>
        </span>
        <h3 className="text-lg font-extrabold text-slate-900 break-keep pt-1">
          {title}
        </h3>
        <p className="text-base text-slate-700 leading-relaxed break-keep">
          {description}
        </p>
      </div>

      {checklist && checklist.length > 0 && (
        <ul className="space-y-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
          {checklist.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between gap-2">
              <span
                className={`text-sm font-semibold break-keep ${
                  item.done ? "text-emerald-800" : "text-slate-800"
                }`}
              >
                {item.done ? "✓ " : "○ "}
                {item.label}
              </span>
              {!item.done && item.onClick && (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="min-h-[44px] px-3 rounded-lg bg-white border border-slate-300 hover:border-blue-500 text-sm font-bold text-blue-700 transition cursor-pointer shrink-0"
                >
                  입력하기 ›
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          data-testid={primaryActionTestId || `${testId}-primary-btn`}
          onClick={onPrimaryAction}
          className="min-h-[48px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-base font-extrabold transition cursor-pointer"
        >
          {primaryActionLabel}
        </button>
        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            data-testid={secondaryActionTestId || `${testId}-secondary-btn`}
            onClick={onSecondaryAction}
            className="min-h-[48px] px-4 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-base font-bold transition cursor-pointer"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </section>
  );
}
