"use client";

import React from "react";

interface VacancySectionProps {
  vacancyPct: number | "";
  setVacancyPct: (v: number | "") => void;
  vacancySignal?: string | null;
}

/**
 * W-2: Vacancy rate selector & memo conflict warning — extracted from im-data-bottom-sheet.tsx
 */
export function VacancySection({
  vacancyPct,
  setVacancyPct,
  vacancySignal,
}: VacancySectionProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
        📊 현재 공실률
      </label>
      <div className="grid grid-cols-4 gap-2">
        {[0, 10, 20].map((pct) => (
          <button
            key={pct}
            type="button"
            data-vacancy-btn
            onClick={() => setVacancyPct(pct === vacancyPct ? "" : pct)}
            className={`py-2.5 text-sm font-semibold rounded-xl border-2 transition-all ${
              vacancyPct === pct && typeof vacancyPct === "number"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:bg-secondary"
            }`}
          >
            {pct === 0 ? "만실" : `~${pct}%`}
          </button>
        ))}
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="직접"
            value={
              typeof vacancyPct === "number" && ![0, 10, 20].includes(vacancyPct)
                ? vacancyPct
                : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              setVacancyPct(
                v === "" ? "" : Math.min(100, Math.max(0, Number(v)))
              );
            }}
            className={`w-full py-2 text-sm font-semibold rounded-xl border-2 text-center transition-all ${
              typeof vacancyPct === "number" && ![0, 10, 20].includes(vacancyPct)
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:bg-secondary"
            }`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
            %
          </span>
        </div>
      </div>
      {typeof vacancyPct === "number" && vacancyPct > 0 && (
        <p className="text-xs text-amber-500 mt-1.5">
          ⚠️ 공실률 {vacancyPct}% 반영
        </p>
      )}
      {/* 메모 파싱된 공실 정보와 사용자 입력 충돌 경고 */}
      {typeof vacancyPct === "number" && vacancySignal && (() => {
        const sig = vacancySignal.toLowerCase();
        const memoHasVacancy = sig.includes("공실") && !sig.includes("만실");
        const memoIsFull = sig.includes("만실");
        if (vacancyPct === 0 && memoHasVacancy) {
          return (
            <p className="text-xs text-yellow-400 mt-1.5 bg-yellow-500/10 p-2 rounded-lg">
              💡 메모에 &quot;{vacancySignal}&quot;로 기재되어 있습니다. 만실이 맞으시면 그대로 진행하세요.
            </p>
          );
        }
        if (vacancyPct > 0 && memoIsFull) {
          return (
            <p className="text-xs text-yellow-400 mt-1.5 bg-yellow-500/10 p-2 rounded-lg">
              💡 메모에 &quot;만실&quot;로 기재되어 있지만 공실률 {vacancyPct}%를 선택하셨습니다. 맞으시면 그대로 진행하세요.
            </p>
          );
        }
        return null;
      })()}
    </div>
  );
}
