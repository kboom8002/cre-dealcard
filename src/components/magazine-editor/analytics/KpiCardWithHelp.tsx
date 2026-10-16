'use client';

import React, { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export interface KpiCardWithHelpProps {
  label: string;
  /** 정의(기준) 문구 — 툴팁/노트로 표시. API 의 kpiDefinitions 와 같은 문구 */
  definition: string;
  icon: ReactNode;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: 'muted' | 'good';
}

/**
 * 60대 친화 KPI 카드 + 기준 도움말 토글 (U4 · KpiCardWithHelp).
 * - 최소 글자 크기 14px 이상(text-sm / text-base / text-2xl)
 * - 기준 보기 버튼 터치 영역 ≥44×48px (min-h-11 min-w-12) 및 한글 라벨('기준') 병기
 * - 골든 E2E 계약: label exact 매칭, aria-label="${label} 기준 보기", role="note" 유지
 */
export function KpiCardWithHelp({
  label,
  definition,
  icon,
  value,
  unit,
  sub,
  subTone = 'muted',
}: KpiCardWithHelpProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 text-slate-200 mb-1.5">
        <div className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-slate-100">{label}</span>
          <button
            type="button"
            aria-label={`${label} 기준 보기`}
            aria-expanded={open}
            title={definition}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 min-w-12 items-center justify-center gap-1 rounded-lg border border-white/10 bg-slate-800/80 px-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-400 transition-colors"
          >
            <Info className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
            <span>기준</span>
          </button>
        </div>
        <span aria-hidden="true" className="shrink-0">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-white">{value}</span>
        {unit ? <span className="text-sm font-semibold text-slate-300">{unit}</span> : null}
      </div>
      {sub ? (
        <p className={`text-sm mt-1.5 ${subTone === 'good' ? 'text-emerald-300' : 'text-slate-300'}`}>
          {sub}
        </p>
      ) : null}
      {open ? (
        <p
          role="note"
          className="mt-2.5 rounded-lg border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-slate-200"
        >
          {definition}
        </p>
      ) : null}
    </div>
  );
}
