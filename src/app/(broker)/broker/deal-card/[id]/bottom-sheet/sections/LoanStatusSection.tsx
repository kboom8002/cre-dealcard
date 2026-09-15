"use client";

import React from "react";

interface LoanStatusSectionProps {
  stage: "basic" | "pro";
  loanStatus: string;
  setLoanStatus: (status: string) => void;
  loanAmount: string;
  setLoanAmount: (amount: string) => void;
  loanAmountRef: React.RefObject<HTMLInputElement | null>;
  handleEnterKey: (
    e: React.KeyboardEvent,
    nextRef: React.RefObject<HTMLInputElement | null> | null
  ) => void;
  prefillLoanAmount?: number;
}

export function LoanStatusSection({
  stage,
  loanStatus,
  setLoanStatus,
  loanAmount,
  setLoanAmount,
  loanAmountRef,
  handleEnterKey,
  prefillLoanAmount,
}: LoanStatusSectionProps) {
  if (stage !== "pro") return null;

  return (
    <div className="col-span-2">
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
        🏦 대출 현황
      </label>
      <div className="flex gap-2">
        {[
          { value: "confirmed", label: "대출 있음", icon: "💰" },
          { value: "no_loan", label: "무대출 확인", icon: "✅" },
          { value: "unknown", label: "미확인", icon: "❓" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLoanStatus(opt.value)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
              loanStatus === opt.value
                ? "bg-primary/20 border-primary/50 text-primary border"
                : "bg-secondary/50 border-border text-muted-foreground border hover:border-primary/40"
            }`}
          >
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>
      {loanStatus === "confirmed" && (
        <div className="relative mt-2">
          <input
            ref={loanAmountRef}
            type="number"
            inputMode="numeric"
            min="0"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
            onKeyDown={(e) => handleEnterKey(e, null)}
            placeholder="예: 100000"
            className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            만원
          </span>
        </div>
      )}
      {loanStatus === "unknown" && (
        <p className="mt-2 text-[10px] text-amber-500">
          ⚠️ 등기부등본 미열람 — 자기자본 산출 시 대출 미반영 안내가 IM에 표시됩니다
        </p>
      )}
      {prefillLoanAmount &&
        loanAmount === String(prefillLoanAmount) &&
        loanStatus === "confirmed" && (
          <span className="text-[10px] text-blue-400 mt-1 block">
            📋 딜카드에서 자동 입력
          </span>
        )}
    </div>
  );
}
