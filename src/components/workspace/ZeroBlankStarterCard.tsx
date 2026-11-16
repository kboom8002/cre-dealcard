"use client";

import React from "react";

export interface ZeroBlankStarterOption {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  testId: string;
}

export interface ZeroBlankStarterCardProps {
  heading: string;
  subheading?: string;
  options: readonly ZeroBlankStarterOption[];
  testId?: string;
}

/**
 * 처음 빈 화면에서 30초 안에 시작할 수 있도록 3가지 출발 경로를 큰 버튼으로 안내하는 카드.
 */
export function ZeroBlankStarterCard({
  heading,
  subheading,
  options,
  testId = "zero-blank-starter-card",
}: ZeroBlankStarterCardProps) {
  return (
    <section
      data-testid={testId}
      aria-label={heading}
      className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/85 via-white to-slate-50 p-4 shadow-2xs space-y-3"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-blue-600 px-2 py-0.5 text-sm font-extrabold text-white">
            30초 빠른 시작
          </span>
          <h3 className="text-base font-extrabold text-slate-900 break-keep">
            {heading}
          </h3>
        </div>
        {subheading && (
          <p className="text-sm text-slate-700 leading-relaxed break-keep">
            {subheading}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={opt.testId}
            onClick={opt.onClick}
            className="min-h-[56px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50/50 active:scale-[0.99] cursor-pointer flex items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-800 shrink-0">
                  {opt.badge}
                </span>
                <span className="text-base font-extrabold text-slate-900 break-keep">
                  {opt.title}
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-snug break-keep">
                {opt.subtitle}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="text-lg font-extrabold text-blue-600 shrink-0"
            >
              ›
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
