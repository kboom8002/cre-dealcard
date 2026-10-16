"use client";

import React from "react";
import { SIMPLE_AUTO_FILLED_ITEMS } from "@/lib/magazine/simple-format";

export function AutoFilledStrip() {
  return (
    <div
      data-testid="simple-autofilled-strip"
      className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-emerald-300">
          ✅ 아래 4가지 항목은 직접 쓰지 않으셔도 매거진에 자동으로 들어갑니다
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {SIMPLE_AUTO_FILLED_ITEMS.map((item) => (
          <div
            key={item.id}
            data-testid={`autofilled-item-${item.id}`}
            className="flex items-start gap-2.5 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2"
          >
            <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-100">{item.label}</p>
              <p className="text-xs text-slate-300 leading-relaxed mt-0.5">{item.detail}</p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
              자동 포함
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
