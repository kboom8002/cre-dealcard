"use client";

import React, { useState } from "react";

interface Props {
  attrs: Record<string, unknown>;
}

export function DevelopmentWidget({ attrs }: Props) {
  const priceEok = Number(attrs.askingPriceKrw || 0) / 100000000;
  const landAreaPyung = Number(attrs.landAreaPyung || attrs.effectiveLandAreaPyung || 100);

  // Smart defaults
  const [targetFarPct, setTargetFarPct] = useState(400); // 400%
  const [costPerPyungManwon, setCostPerPyungManwon] = useState(450); // 450만원/평
  const [isOpen, setIsOpen] = useState(false);

  // Calculations
  const expectedTotalFloorAreaPyung = landAreaPyung * (targetFarPct / 100);
  const constructionCostEok = (expectedTotalFloorAreaPyung * costPerPyungManwon) / 10000;
  const totalProjectCostEok = priceEok + constructionCostEok + (priceEok * 0.05); // Land + Const + Admin/Tax
  
  // Conservative exit valuation (assuming 20% margin on total project cost)
  const estimatedExitValuationEok = totalProjectCostEok * 1.2;
  const estimatedProfitEok = estimatedExitValuationEok - totalProjectCostEok;
  const estimatedIrrPct = Math.min(25, Math.max(5, Math.round((estimatedProfitEok / totalProjectCostEok) * 100 / 2.5)));

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 text-slate-100 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-emerald-400 flex items-center gap-1.5">
          <span>🏗️</span> 개발 잠재력 참고 계산기
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-300 font-semibold border border-emerald-400/20">
          개발형
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-850 border border-slate-800 p-3.5 space-y-2">
        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>예상 신축 연면적 (목표 용적률 {targetFarPct}%)</span>
          <span className="text-sm font-bold text-slate-200">약 {Math.round(expectedTotalFloorAreaPyung)}평</span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>가정 총 공사비</span>
          <span className="text-sm font-bold text-slate-200">약 {constructionCostEok.toFixed(1)}억원</span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>가정 개발이익 / 예상 IRR</span>
          <span className="text-base font-extrabold text-emerald-300">
            약 {estimatedProfitEok.toFixed(1)}억 ({estimatedIrrPct}%대)
          </span>
        </div>

        <div className="pt-2 border-t border-slate-800/80">
          <p className="text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/10 rounded p-1.5 leading-tight">
            ※ 본 계산기는 참고용이며, 실제 인허가·일조권·지구단위계획 및 건축 수지분석 검토가 필수입니다.
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
                <span>목표 용적률</span>
                <span className="text-emerald-300 font-bold">{targetFarPct}%</span>
              </div>
              <input
                type="range"
                min={200}
                max={800}
                step={50}
                value={targetFarPct}
                onChange={(e) => setTargetFarPct(Number(e.target.value))}
                className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-300 font-medium">
                <span>평당 공사비</span>
                <span className="text-teal-300 font-bold">{costPerPyungManwon}만원/평</span>
              </div>
              <input
                type="range"
                min={350}
                max={800}
                step={25}
                value={costPerPyungManwon}
                onChange={(e) => setCostPerPyungManwon(Number(e.target.value))}
                className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
