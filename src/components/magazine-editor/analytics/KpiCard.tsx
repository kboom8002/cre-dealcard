'use client';

import React, { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

interface KpiCardProps {
  label: string;
  /** 정의(기준) 문구 — 툴팁으로 표시. API 의 kpiDefinitions 와 같은 문구 */
  definition: string;
  icon: ReactNode;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: 'muted' | 'good';
}

/** KPI 카드 + 기준 툴팁(터치에서도 열리도록 버튼 토글, T1-UX-4). */
export function KpiCard({ label, definition, icon, value, unit, sub, subTone = 'muted' }: KpiCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between text-ink-muted mb-1">
        <span className="text-label inline-flex items-center gap-1">
          {label}
          <button
            type="button"
            aria-label={`${label} 기준 보기`}
            aria-expanded={open}
            title={definition}
            onClick={() => setOpen((v) => !v)}
            className="-my-2.5 inline-flex h-11 w-11 items-center justify-center rounded text-ink-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-white">{value}</span>
        {unit ? <span className="text-label text-ink-subtle">{unit}</span> : null}
      </div>
      {sub ? (
        <p className={`text-label mt-1 ${subTone === 'good' ? 'text-emerald-400/80' : 'text-ink-subtle'}`}>{sub}</p>
      ) : null}
      {open ? (
        <p role="note" className="mt-2 rounded-lg bg-black/30 p-2 text-label leading-relaxed text-ink-muted">
          {definition}
        </p>
      ) : null}
    </div>
  );
}
