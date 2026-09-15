"use client";

import React from "react";

export interface AncillaryIncomeItem {
  type: string;
  label?: string;
  annualAmountKrw: number;
  provenance?: string;
}

interface AncillaryIncomeSectionProps {
  stage: "basic" | "pro";
  ancillaryIncomes: AncillaryIncomeItem[];
  setAncillaryIncomes: React.Dispatch<React.SetStateAction<AncillaryIncomeItem[]>>;
}

export function AncillaryIncomeSection({
  stage,
  ancillaryIncomes,
  setAncillaryIncomes,
}: AncillaryIncomeSectionProps) {
  if (stage !== "pro") return null;

  return (
    <div className="col-span-2 mt-2 border-t border-border/40 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold text-muted-foreground">
          📡 비임대 부가수입
        </label>
        <span className="text-[9px] text-muted-foreground/70">
          통신장비, 주차, 간판 등
        </span>
      </div>
      {ancillaryIncomes.map((item, idx) => (
        <div key={idx} className="flex gap-2 mb-2">
          <select
            className="flex-1 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
            value={item.type || "other"}
            onChange={(e) => {
              const updated = [...ancillaryIncomes];
              updated[idx] = { ...item, type: e.target.value };
              setAncillaryIncomes(updated);
            }}
          >
            <option value="telecom_antenna">통신장비 임대</option>
            <option value="telecom_electric">통신장비 전기료</option>
            <option value="parking">주차 수입</option>
            <option value="signage">간판/광고</option>
            <option value="rooftop_solar">태양광</option>
            <option value="ev_charging">전기차 충전</option>
            <option value="other">기타</option>
          </select>
          <input
            type="number"
            placeholder="연간 수입(만원)"
            className="w-28 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:border-primary"
            value={
              item.annualAmountKrw ? Math.round(item.annualAmountKrw / 10000) : ""
            }
            onChange={(e) => {
              const updated = [...ancillaryIncomes];
              updated[idx] = {
                ...item,
                annualAmountKrw: Number(e.target.value) * 10000,
              };
              setAncillaryIncomes(updated);
            }}
          />
          <button
            type="button"
            onClick={() => {
              const updated = ancillaryIncomes.filter((_, i) => i !== idx);
              setAncillaryIncomes(updated);
            }}
            className="text-red-400 text-xs hover:text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const updated = [
            ...ancillaryIncomes,
            {
              type: "other",
              label: "",
              annualAmountKrw: 0,
              provenance: "broker_input",
            },
          ];
          setAncillaryIncomes(updated);
        }}
        className="text-xs text-primary hover:text-primary/80"
      >
        + 부가수입 추가
      </button>
    </div>
  );
}
