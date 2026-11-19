"use client";

import React from "react";

interface Props {
  attrs: Record<string, unknown>;
}

export function TradingWidget({ attrs }: Props) {
  const myPricePerPyung = Number(attrs.pricePerPyung || 0);
  const avgPricePerPyung = Number(attrs.comparableAvgPricePerPyung || 0);

  let diffPct = 0;
  let statusLabel = "📊 권역 시세 수준";
  let statusColor = "text-amber-800";
  let bgBadgeColor = "bg-amber-50 border-amber-200";
  let barPositionPct = 50; // default center

  if (myPricePerPyung > 0 && avgPricePerPyung > 0) {
    diffPct = Math.round(((myPricePerPyung - avgPricePerPyung) / avgPricePerPyung) * 100);
    if (diffPct < -5) {
      statusLabel = "🟢 시세 대비 경쟁력 있는 가격";
      statusColor = "text-emerald-800";
      bgBadgeColor = "bg-emerald-50 border-emerald-200";
      barPositionPct = 25;
    } else if (diffPct <= 10) {
      statusLabel = "📊 권역 시세 수준";
      statusColor = "text-amber-800";
      bgBadgeColor = "bg-amber-50 border-amber-200";
      barPositionPct = 50;
    } else {
      // Neutral framing for sellers (CRE Point E)
      statusLabel = "📊 프리미엄 포함 (개발/입지 가치)";
      statusColor = "text-indigo-800";
      bgBadgeColor = "bg-indigo-50 border-indigo-200";
      barPositionPct = 75;
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-300 p-4 text-slate-900 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-sky-800 flex items-center gap-1.5">
          <span>📈</span> 권역 시세 비교
        </h3>
        <span className="text-sm px-2.5 py-0.5 rounded bg-sky-50 text-sky-800 font-semibold border border-sky-200">
          단기매매형
        </span>
      </div>

      {/* Result First Area */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3">
        <div className="flex justify-between items-baseline text-sm text-slate-600">
          <span>매물 평당가</span>
          <span className="text-sm font-bold text-slate-950">
            {myPricePerPyung > 0 ? `평당 ${myPricePerPyung.toLocaleString()}만원` : "확인 중"}
          </span>
        </div>

        <div className="flex justify-between items-baseline text-sm text-slate-600">
          <span>최근 3개월 권역 평균 평당가</span>
          <span className="text-sm font-bold text-slate-800">
            {avgPricePerPyung > 0 ? `평당 ${avgPricePerPyung.toLocaleString()}만원` : "데이터 수집 중"}
          </span>
        </div>

        {/* Visual Gauge Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-sm text-slate-600 font-medium">
            <span>경쟁력 (저평가)</span>
            <span>시세 수준</span>
            <span>프리미엄</span>
          </div>
          <div className="relative w-full h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-emerald-500 via-amber-400 to-indigo-500 opacity-75 w-full"
            />
            <div
              className="absolute top-0 bottom-0 w-2.5 bg-white border-2 border-slate-900 rounded-full shadow-md transform -translate-x-1/2 transition-all duration-300"
              style={{ left: `${barPositionPct}%` }}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <p className={`text-sm font-bold ${statusColor} ${bgBadgeColor} rounded-lg p-2 text-center border`}>
            {statusLabel} {diffPct !== 0 && `(권역 대비 ${diffPct > 0 ? `+${diffPct}` : diffPct}%)`}
          </p>
        </div>
      </div>
    </div>
  );
}
