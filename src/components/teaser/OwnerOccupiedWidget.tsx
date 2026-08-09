"use client";

import React, { useState } from "react";

interface Props {
  attrs: Record<string, unknown>;
}

export function OwnerOccupiedWidget({ attrs }: Props) {
  const priceEok = Number(attrs.askingPriceKrw || 0) / 100000000;
  const areaPyung = Number(attrs.totalFloorAreaPyung || 0);

  // Smart defaults
  const [monthlyRentManwon, setMonthlyRentManwon] = useState(500); // default 500만원
  const [ltvPct, setLtvPct] = useState(60); // default LTV 60%
  const [isOpen, setIsOpen] = useState(false);

  // Calculations
  const loanEok = priceEok * (ltvPct / 100);
  const equityEok = priceEok - loanEok;

  // Monthly loan payment estimation (assuming 4.5% annual interest, 30y amortization)
  const annualInterestRate = 0.045;
  const monthlyRate = annualInterestRate / 12;
  const totalMonths = 360;
  const loanPrincipalKrw = loanEok * 100000000;
  const monthlyLoanPaymentKrw = loanPrincipalKrw > 0
    ? (loanPrincipalKrw * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
    : 0;
  const monthlyLoanPaymentManwon = Math.round(monthlyLoanPaymentKrw / 10000);

  const tenYearRentExpenseEok = (monthlyRentManwon * 12 * 10) / 10000;
  const diffManwon = monthlyRentManwon - monthlyLoanPaymentManwon;

  let conclusionText = "";
  if (diffManwon > 0) {
    conclusionText = `✅ 매입 시 월 ${diffManwon.toLocaleString()}만원 더 절감됩니다`;
  } else if (diffManwon < 0) {
    conclusionText = `📊 월 ${Math.abs(diffManwon).toLocaleString()}만원 추가 부담으로 내 사옥 자산 축적`;
  } else {
    conclusionText = `⚡ 현재 월 임차료와 매입 시 월 상환액이 거의 동일합니다`;
  }

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 text-slate-100 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-amber-300 flex items-center gap-1.5">
          <span>🏢</span> 사옥 매입 vs 임차 비교
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-semibold border border-amber-400/20">
          자가사용형
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-850 border border-slate-800 p-3.5 space-y-2">
        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>10년 누적 임차 지출 추정</span>
          <span className="text-sm font-bold text-slate-200">{tenYearRentExpenseEok.toFixed(1)}억원 소멸</span>
        </div>

        <div className="flex justify-between items-baseline text-xs text-slate-400">
          <span>매입 시 월 원리금 부담 (LTV {ltvPct}%)</span>
          <span className="text-base font-extrabold text-teal-300">
            월 {monthlyLoanPaymentManwon.toLocaleString()}만원
          </span>
        </div>

        <div className="pt-2 border-t border-slate-800/80">
          <p className="text-xs font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
            {conclusionText}
          </p>
        </div>

        <div className="text-[11px] text-slate-500 text-right">
          가정 실투자금 (자기자본): 약 {equityEok.toFixed(1)}억원
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
                <span>현재 월 임차료</span>
                <span className="text-amber-300 font-bold">{monthlyRentManwon.toLocaleString()}만원</span>
              </div>
              <input
                type="range"
                min={100}
                max={3000}
                step={50}
                value={monthlyRentManwon}
                onChange={(e) => setMonthlyRentManwon(Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-300 font-medium">
                <span>대출 비율 (LTV)</span>
                <span className="text-teal-300 font-bold">{ltvPct}%</span>
              </div>
              <input
                type="range"
                min={30}
                max={80}
                step={5}
                value={ltvPct}
                onChange={(e) => setLtvPct(Number(e.target.value))}
                className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
