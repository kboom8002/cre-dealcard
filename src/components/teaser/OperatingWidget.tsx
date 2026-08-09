"use client";

import React, { useState } from "react";

interface Props {
  attrs: Record<string, unknown>;
}

export function OperatingWidget({ attrs }: Props) {
  const priceEok = Number(attrs.askingPriceKrw || 0) / 100000000;
  const spec = (attrs.hospitalitySpec as Record<string, unknown>) || {};
  
  const initialRoomCount = Number(spec.totalRoomCount || attrs.roomCount || 30);
  const initialAdr = Number(spec.averageDailyRate || 10); // 10만원/박
  const initialOcc = Number(spec.occupancyRate || 70); // 70%

  // Smart defaults
  const [adrManwon, setAdrManwon] = useState(initialAdr > 0 ? initialAdr : 10);
  const [occPct, setOccPct] = useState(initialOcc > 0 ? initialOcc : 70);
  const [isOpen, setIsOpen] = useState(false);

  // Calculations
  const revParManwon = (adrManwon * (occPct / 100)); // RevPAR (만원)
  const annualRevenueEok = (initialRoomCount * revParManwon * 365) / 10000;
  
  // Assuming 25% GOP margin for operating asset
  const gopMarginPct = Number(spec.gopMargin || 25);
  const annualGopEok = annualRevenueEok * (gopMarginPct / 100);
  const paybackYears = annualGopEok > 0 && priceEok > 0 ? (priceEok / annualGopEok).toFixed(1) : "-";

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 text-slate-100 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-orange-400 flex items-center gap-1.5">
          <span>🏨</span> 운영 수익 시뮬레이터
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-orange-400/10 text-orange-300 font-semibold border border-orange-400/20">
          운영형 ({initialRoomCount}실)
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-850 border border-slate-800 p-3.5 space-y-2">
        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>객실당 매출 (RevPAR)</span>
          <span className="text-sm font-bold text-slate-200">일 {revParManwon.toFixed(1)}만원</span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>예상 연간 총 매출 / GOP</span>
          <span className="text-sm font-bold text-slate-200">
            연 {annualRevenueEok.toFixed(1)}억 (GOP {annualGopEok.toFixed(1)}억)
          </span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>추정 투자 회수기간</span>
          <span className="text-base font-extrabold text-orange-300">
            약 {paybackYears}년
          </span>
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
                <span>객실 평균 단가 (ADR)</span>
                <span className="text-orange-300 font-bold">{adrManwon}만원/박</span>
              </div>
              <input
                type="range"
                min={3}
                max={50}
                step={1}
                value={adrManwon}
                onChange={(e) => setAdrManwon(Number(e.target.value))}
                className="w-full accent-orange-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-300 font-medium">
                <span>객실 점유율 (OCC)</span>
                <span className="text-teal-300 font-bold">{occPct}%</span>
              </div>
              <input
                type="range"
                min={30}
                max={95}
                step={5}
                value={occPct}
                onChange={(e) => setOccPct(Number(e.target.value))}
                className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
