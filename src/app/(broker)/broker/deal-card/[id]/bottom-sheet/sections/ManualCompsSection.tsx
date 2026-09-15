"use client";

import React from "react";

export interface ManualComp {
  address: string;
  dealAmount: string;
  area: string;
  dealYear: string;
  dealMonth: string;
  buildingUse: string;
  memo: string;
}

interface ManualCompsSectionProps {
  stage: "basic" | "pro";
  manualComps: ManualComp[];
  setManualComps: React.Dispatch<React.SetStateAction<ManualComp[]>>;
}

export function ManualCompsSection({
  stage,
  manualComps,
  setManualComps,
}: ManualCompsSectionProps) {
  if (stage !== "pro") return null;

  return (
    <div className="col-span-2 rounded-xl border border-border/40 bg-secondary/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground">
          📊 유사 건물 실거래가 (선택)
        </label>
        {manualComps.length < 5 && (
          <button
            type="button"
            onClick={() =>
              setManualComps((prev) => [
                ...prev,
                {
                  address: "",
                  dealAmount: "",
                  area: "",
                  dealYear: String(new Date().getFullYear()),
                  dealMonth: String(new Date().getMonth() + 1),
                  buildingUse: "근린생활시설",
                  memo: "",
                },
              ])
            }
            className="text-[10px] text-primary hover:text-primary/80 font-medium"
          >
            + 사례 추가
          </button>
        )}
      </div>
      {manualComps.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60">
          API 자동 조회 외에 직접 조사한 유사 실거래가를 추가하면 벤치마킹 정확도가 높아집니다.
        </p>
      )}
      {manualComps.map((comp, ci) => (
        <div
          key={ci}
          className="rounded-lg border border-border/30 bg-background/50 p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground">
              사례 {ci + 1}
            </span>
            <button
              type="button"
              onClick={() =>
                setManualComps((prev) => prev.filter((_, i) => i !== ci))
              }
              className="text-[10px] text-rose-400 hover:text-rose-300"
            >
              삭제
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={comp.address}
              onChange={(e) => {
                const v = e.target.value;
                setManualComps((prev) =>
                  prev.map((c, i) => (i === ci ? { ...c, address: v } : c))
                );
              }}
              placeholder="주소 (예: 서교동 395-12)"
              className="col-span-2 text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <input
              type="number"
              value={comp.dealAmount}
              onChange={(e) => {
                const v = e.target.value;
                setManualComps((prev) =>
                  prev.map((c, i) => (i === ci ? { ...c, dealAmount: v } : c))
                );
              }}
              placeholder="거래가 (만원)"
              className="text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <input
              type="number"
              value={comp.area}
              onChange={(e) => {
                const v = e.target.value;
                setManualComps((prev) =>
                  prev.map((c, i) => (i === ci ? { ...c, area: v } : c))
                );
              }}
              placeholder="연면적 (㎡)"
              className="text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <div className="flex gap-1">
              <input
                type="number"
                value={comp.dealYear}
                onChange={(e) => {
                  const v = e.target.value;
                  setManualComps((prev) =>
                    prev.map((c, i) => (i === ci ? { ...c, dealYear: v } : c))
                  );
                }}
                placeholder="년"
                className="w-1/2 text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
              />
              <input
                type="number"
                value={comp.dealMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setManualComps((prev) =>
                    prev.map((c, i) => (i === ci ? { ...c, dealMonth: v } : c))
                  );
                }}
                placeholder="월"
                className="w-1/2 text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
              />
            </div>
            <select
              value={comp.buildingUse}
              onChange={(e) => {
                const v = e.target.value;
                setManualComps((prev) =>
                  prev.map((c, i) => (i === ci ? { ...c, buildingUse: v } : c))
                );
              }}
              className="text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="근린생활시설">근린생활시설</option>
              <option value="업무시설">업무시설</option>
              <option value="판매시설">판매시설</option>
              <option value="숙박시설">숙박시설</option>
              <option value="공장">공장/물류</option>
              <option value="기타">기타</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
