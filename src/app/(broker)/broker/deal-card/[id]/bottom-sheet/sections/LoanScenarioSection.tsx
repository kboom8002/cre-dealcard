"use client";

import React from "react";

interface LoanScenarioSectionProps {
  ltvPct: string;
  setLtvPct: (v: string) => void;
  loanInterestPct: string;
  setLoanInterestPct: (v: string) => void;
  loanTermYears: string;
  setLoanTermYears: (v: string) => void;
  targetIrrPct: string;
  setTargetIrrPct: (v: string) => void;
  loanAmountManwon?: number | null;
  askingPriceManwon?: number | null;
  monthlyRentKrw?: number | null;
}

export function LoanScenarioSection({
  ltvPct, setLtvPct,
  loanInterestPct, setLoanInterestPct,
  loanTermYears, setLoanTermYears,
  targetIrrPct, setTargetIrrPct,
  loanAmountManwon,
  askingPriceManwon,
  monthlyRentKrw,
}: LoanScenarioSectionProps) {
  const ltv = parseFloat(ltvPct) || 0;
  const interest = parseFloat(loanInterestPct) || 0;
  const loan = loanAmountManwon ?? 0;
  const price = askingPriceManwon ?? 0;
  const rent = monthlyRentKrw ?? 0;

  // Auto-calc LTV hint from loan/price
  const autoLtv = price > 0 && loan > 0 ? ((loan / price) * 100).toFixed(1) : null;

  // Monthly interest (이자만 상환)
  const monthlyInterestManwon = loan > 0 && interest > 0
    ? Math.round(loan * interest / 100 / 12)
    : null;

  // 자기자본수익률 = (연 임대수익 - 연 이자) / 자기자본
  const equity = price > 0 ? price - loan : 0;
  const annualRent = rent > 0 ? rent * 12 : 0;
  const annualInterest = monthlyInterestManwon ? monthlyInterestManwon * 12 : 0;
  const equityYield = equity > 0 && annualRent > 0
    ? (((annualRent - annualInterest * 10000) / (equity * 10000)) * 100).toFixed(1)
    : null;

  return (
    <div className="col-span-2 mt-3 border-t border-blue-500/30 pt-4 bg-blue-500/5 p-3.5 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-blue-300">🏦 대출 시나리오</label>
        <span className="text-[10px] text-blue-400/80 font-medium">LTV 및 금리 조건 입력</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">LTV 비율 (%)</label>
          <input
            type="number"
            step="1"
            placeholder={autoLtv ?? "40"}
            value={ltvPct}
            onChange={(e) => setLtvPct(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
          {autoLtv && !ltvPct && <p className="text-[10px] text-muted-foreground mt-0.5">자동 계산: {autoLtv}%</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">대출 금리 (%)</label>
          <input
            type="number"
            step="0.1"
            placeholder="4.5"
            value={loanInterestPct}
            onChange={(e) => setLoanInterestPct(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">대출 기간 (년)</label>
          <input
            type="number"
            step="1"
            placeholder="5"
            value={loanTermYears}
            onChange={(e) => setLoanTermYears(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">목표 IRR (%)</label>
          <input
            type="number"
            step="0.1"
            placeholder="선택 입력"
            value={targetIrrPct}
            onChange={(e) => setTargetIrrPct(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>
      {(monthlyInterestManwon || equityYield) && (
        <div className="flex justify-between text-xs text-blue-300 font-semibold pt-1 border-t border-blue-500/20">
          {monthlyInterestManwon && <span>월 이자 부담: ~{monthlyInterestManwon.toLocaleString()}만원</span>}
          {equityYield && <span>자기자본수익률: ~{equityYield}%</span>}
        </div>
      )}
    </div>
  );
}