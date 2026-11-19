"use client";

import React, { useState } from "react";

interface Props {
  attrs: Record<string, unknown>;
}

export function DevelopmentWidget({ attrs }: Props) {
  const priceEok = Number(attrs.askingPriceKrw || 0) / 100000000;
  const landAreaPyung = Number(attrs.landAreaPyung || attrs.effectiveLandAreaPyung || 0);

  // Smart defaults
  const [targetFarPct, setTargetFarPct] = useState(400); // 400%
  const [costPerPyungManwon, setCostPerPyungManwon] = useState(450); // 450만원/평
  const [isOpen, setIsOpen] = useState(false);

  // Calculations
  const expectedTotalFloorAreaPyung = landAreaPyung > 0 ? landAreaPyung * (targetFarPct / 100) : 0;
  const constructionCostEok = (expectedTotalFloorAreaPyung * costPerPyungManwon) / 10000;
  const totalProjectCostEok = priceEok + constructionCostEok + (priceEok * 0.05); // Land + Const + Admin/Tax
  
  // Conservative exit valuation (assuming 20% margin on total project cost)
  const estimatedExitValuationEok = totalProjectCostEok * 1.2;
  const estimatedProfitEok = estimatedExitValuationEok - totalProjectCostEok;
  const estimatedIrrPct =
    totalProjectCostEok > 0
      ? Math.min(25, Math.max(5, Math.round((estimatedProfitEok / totalProjectCostEok) * 100 / 2.5)))
      : 0;
  const hasInputs = landAreaPyung > 0 && totalProjectCostEok > 0;

  return (
    <div className="rounded-2xl bg-white border border-slate-300 p-4 text-slate-900 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-emerald-800 flex items-center gap-1.5">
          <span>🏗️</span> 개발 잠재력 참고 계산기
        </h3>
        <span className="text-sm px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
          개발형
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
        <div className="flex justify-between items-baseline text-sm text-slate-600">
          <span>예상 신축 연면적 (목표 용적률 {targetFarPct}%)</span>
          <span className="text-sm font-bold text-slate-900">
            {landAreaPyung > 0 ? `약 ${Math.round(expectedTotalFloorAreaPyung)}평` : "대지면적 미제공"}
          </span>
        </div>

        <div className="flex justify-between items-baseline text-sm text-slate-600">
          <span>가정 총 공사비</span>
          <span className="text-sm font-bold text-slate-900">
            {landAreaPyung > 0 ? `약 ${constructionCostEok.toFixed(1)}억원` : "—"}
          </span>
        </div>

        <div className="flex justify-between items-baseline text-sm text-slate-600">
          <span>가정 개발이익 / 예상 IRR</span>
          <span className="text-base font-extrabold text-emerald-800">
            {hasInputs
              ? `약 ${estimatedProfitEok.toFixed(1)}억 (${estimatedIrrPct}%대)`
              : "제원 확인 후 산출 가능"}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 leading-snug">
            ※ 본 계산기는 참고용이며, 실제 인허가·일조권·지구단위계획 및 건축 수지분석 검토가 필수입니다.
          </p>
        </div>
      </div>

      {/* Collapsible Slider Inputs */}
      <div className="border-t border-slate-200 pt-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full min-h-[44px] flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-950 py-1.5 transition-colors"
        >
          <span>⚙️ 조건 변경하기</span>
          <span>{isOpen ? "▲ 접기" : "▼ 펼치기"}</span>
        </button>

        {isOpen && (
          <div className="pt-3 space-y-3.5 text-sm">
            <div>
              <div className="flex justify-between mb-1 text-slate-700 font-medium">
                <span>목표 용적률</span>
                <span className="text-emerald-800 font-bold">{targetFarPct}%</span>
              </div>
              <input
                type="range"
                min={200}
                max={800}
                step={50}
                value={targetFarPct}
                onChange={(e) => setTargetFarPct(Number(e.target.value))}
                className="w-full accent-emerald-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-700 font-medium">
                <span>평당 공사비</span>
                <span className="text-teal-700 font-bold">{costPerPyungManwon}만원/평</span>
              </div>
              <input
                type="range"
                min={350}
                max={800}
                step={25}
                value={costPerPyungManwon}
                onChange={(e) => setCostPerPyungManwon(Number(e.target.value))}
                className="w-full accent-teal-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
