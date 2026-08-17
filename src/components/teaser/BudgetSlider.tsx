"use client";

import React, { useState, useEffect } from 'react';
import { trackTeaserCta } from './TeaserEventTracker';

interface BudgetSliderProps {
  defaultBudgetEok: number;
  maxBudgetEok: number;
  teaserConfigId: string;
  posture?: string;
  sliderAxis2Config?: { label: string; min: number; max: number; step: number; unit: string };
  askingPriceEok?: number;
  annualRentEok?: number;
}

export function BudgetSlider({ defaultBudgetEok, maxBudgetEok, teaserConfigId, posture = 'income', sliderAxis2Config, askingPriceEok, annualRentEok }: BudgetSliderProps) {
  const [budget, setBudget] = useState(defaultBudgetEok);
  const [isOpen, setIsOpen] = useState(false);
  
  const defaultAxis2 = sliderAxis2Config?.min ?? 50;
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

  const ltv = axis2;
  const equity = Math.round(budget * (1 - ltv / 100));
  const equityStr = `약 ${Math.max(1, equity)}억원`;
  // Use actual financial data if available, otherwise estimate
  let capLow: number;
  let capHigh: number;
  if (annualRentEok && askingPriceEok && askingPriceEok > 0) {
    // Real data: NOI-based cap rate adjusted for leverage
    const baseCap = (annualRentEok / askingPriceEok) * 100;
    const leverageBoost = ltv > 0 ? (baseCap - 2.5) * (ltv / 100) : 0;
    const leveragedReturn = baseCap + Math.max(0, leverageBoost);
    capLow = Math.max(0.5, leveragedReturn - 0.3);
    capHigh = leveragedReturn + 0.3;
  } else {
    // Estimate: base 3.5% + leverage effect
    const baseCap = 3.5;
    const leverageBoost = ltv > 0 ? (baseCap - 2.5) * (ltv / 100) : 0;
    capLow = baseCap + leverageBoost - 0.2;
    capHigh = baseCap + leverageBoost + 0.2;
  }
  const estimatedValueStr = `${capLow.toFixed(1)}~${capHigh.toFixed(1)}%대`;

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 text-slate-100 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-amber-300 flex items-center gap-1.5">
          <span>💰</span> 투자 수익률 시뮬레이터
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-semibold border border-amber-400/20">
          임대수익형
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-850 border border-slate-800 p-3.5 space-y-2">
        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>가정 실투자금 (자기자본)</span>
          <span className="text-sm font-bold text-emerald-300">{equityStr}</span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>참고 수익률 (LTV {ltv}% 가정)</span>
          <span className="text-base font-extrabold text-amber-300">
            {estimatedValueStr}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-800/80">
          <p className="text-[10px] text-slate-500 text-center">
            ※ 본 시뮬레이션은 참고 범위이며, 실제 대출 금리 및 한도는 금융기관 심사에 따릅니다.
          </p>
        </div>
      </div>

      {/* Collapsible Slider Inputs */}
      <div className="border-t border-slate-800 pt-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 py-1 transition-colors"
        >
          <span>⚙️ 조건 변경하기</span>
          <span>{isOpen ? "▲ 접기" : "▼ 펼치기"}</span>
        </button>

        {isOpen && (
          <div className="pt-3 space-y-3.5 text-xs">
            <div>
              <div className="flex justify-between mb-1 text-slate-300 font-medium">
                <span>총 투자 예산</span>
                <span className="text-amber-300 font-bold">{budget}억원</span>
              </div>
              <input
                type="range"
                min="10"
                max={maxBudgetEok}
                step="10"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-300 font-medium">
                <span>{axis2Config.label}</span>
                <span className="text-teal-300 font-bold">{axis2}{axis2Config.unit}</span>
              </div>
              <input
                type="range"
                min={axis2Config.min}
                max={axis2Config.max}
                step={axis2Config.step}
                value={axis2}
                onChange={(e) => setAxis2(Number(e.target.value))}
                className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

