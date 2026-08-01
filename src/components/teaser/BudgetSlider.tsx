"use client";

import React, { useState, useEffect } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';

interface BudgetSliderProps {
  defaultBudgetEok: number;
  maxBudgetEok: number;
  teaserConfigId: string;
}

export function BudgetSlider({ defaultBudgetEok, maxBudgetEok, teaserConfigId }: BudgetSliderProps) {
  const [budget, setBudget] = useState(defaultBudgetEok);
  const [ltv, setLtv] = useState(30);

  // debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      const fp = typeof window !== 'undefined' ? localStorage.getItem('visitorFp') || 'anon' : 'anon';
      trackTeaserCta(teaserConfigId, fp, 'slider_interact', { budget, ltv });
    }, 300);
    return () => clearTimeout(handler);
  }, [budget, ltv, teaserConfigId]);

  const equity = Math.round(budget * (1 - ltv / 100));
  const estimatedCapRate = (3.5 + (ltv * 0.02)).toFixed(1);

  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">💰 투자 예산 시뮬레이터</h3>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">예산 상한</span>
            <span className="text-white font-medium">{budget}억</span>
          </div>
          <input
            type="range"
            min="10"
            max={maxBudgetEok}
            step="10"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">대출 활용 (LTV)</span>
            <span className="text-white font-medium">{ltv}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="60"
            step="5"
            value={ltv}
            onChange={(e) => setLtv(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </div>

      <div className="bg-[#0b0f19] rounded-xl p-4 border border-[#252E39] space-y-3 mt-4">
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">⚙ 가정</span> 실투자금
          </span>
          <span className="text-sm font-bold text-emerald-400">{equity}억 내외</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">⚙ 가정</span> 참고 수익률
          </span>
          <span className="text-sm font-bold text-white">{estimatedCapRate}%대</span>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 text-center">
        ※ 일반적 조건 가정 시 참고 범위이며, 실제 한도·금리는 금융기관 심사에 따릅니다.
      </p>
    </div>
  );
}
