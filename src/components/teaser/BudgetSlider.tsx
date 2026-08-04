"use client";

import React, { useState, useEffect } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';

interface BudgetSliderProps {
  defaultBudgetEok: number;
  maxBudgetEok: number;
  teaserConfigId: string;
  posture?: string;
  sliderAxis2Config?: { label: string; min: number; max: number; step: number; unit: string };
}

export function BudgetSlider({ defaultBudgetEok, maxBudgetEok, teaserConfigId, posture = 'income', sliderAxis2Config }: BudgetSliderProps) {
  const [budget, setBudget] = useState(defaultBudgetEok);
  
  const defaultAxis2 = sliderAxis2Config?.min ?? 30;
  const [axis2, setAxis2] = useState(defaultAxis2);

  const axis2Config = sliderAxis2Config || { label: '대출활용 LTV', min: 0, max: 80, step: 5, unit: '%' };

  // debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      const fp = typeof window !== 'undefined' ? localStorage.getItem('visitorFp') || 'anon' : 'anon';
      trackTeaserCta(teaserConfigId, fp, 'slider_interact', { budget, axis2 });
    }, 300);
    return () => clearTimeout(handler);
  }, [budget, axis2, teaserConfigId]);

  let equityStr = '';
  let estimatedValueStr = '';
  let estimatedLabel = '참고 결과';

  if (posture === 'development') {
    equityStr = `${Math.round(budget * 0.5)}~${Math.round(budget * 0.7)}억 내외`;
    estimatedLabel = '예상 연면적';
    estimatedValueStr = `${Math.round((budget / 10) * (axis2 / 100))}평 내외`;
  } else if (posture === 'owner_occupied') {
    equityStr = `${Math.round(budget * 0.3)}~${Math.round(budget * 0.4)}억 내외`;
    estimatedLabel = '총 예산 필요액';
    estimatedValueStr = `${Math.round(axis2 * 1.5)}~${Math.round(axis2 * 2.5)}억 내외`;
  } else {
    // income, operating, trading
    const ltv = axis2;
    const equity = Math.round(budget * (1 - ltv / 100));
    equityStr = `${Math.max(0, equity - 5)}~${equity + 5}억 내외`;
    estimatedLabel = '참고 수익률';
    const cap = (3.5 + (ltv * 0.02)).toFixed(1);
    estimatedValueStr = `${(Number(cap) - 0.2).toFixed(1)}~${(Number(cap) + 0.2).toFixed(1)}%대`;
  }

  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">💰 투자 예산 시뮬레이터</h3>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">예산 상한</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="bg-transparent border border-[#252E39] rounded px-2 py-0.5 text-white w-16 text-right"
              />
              <span className="text-white font-medium">억</span>
            </div>
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
            <span className="text-slate-400">{axis2Config.label}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={axis2}
                onChange={(e) => setAxis2(Number(e.target.value))}
                className="bg-transparent border border-[#252E39] rounded px-2 py-0.5 text-white w-16 text-right"
              />
              <span className="text-white font-medium">{axis2Config.unit}</span>
            </div>
          </div>
          <input
            type="range"
            min={axis2Config.min}
            max={axis2Config.max}
            step={axis2Config.step}
            value={axis2}
            onChange={(e) => setAxis2(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </div>

      <div className="bg-[#0b0f19] rounded-xl p-4 border border-[#252E39] space-y-3 mt-4">
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">⚙ 가정</span> 실투자금
          </span>
          <span className="text-sm font-bold text-emerald-400">{equityStr}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">⚙ 가정</span> {estimatedLabel}
          </span>
          <span className="text-sm font-bold text-white">{estimatedValueStr}</span>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 text-center">
        ※ 일반적 조건 가정 시 참고 범위이며, 실제 한도·금리는 금융기관 심사에 따릅니다.
      </p>
    </div>
  );
}
