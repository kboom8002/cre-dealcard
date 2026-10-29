"use client";

import React from "react";
import { motion } from "motion/react";
import { SIMPLE_AUTO_FILLED_ITEMS } from "@/lib/magazine/simple-format";
import { SOTA_GENTLE_SPRING } from "@/components/motion/sota-motion";

export function AutoFilledStrip() {
  return (
    <motion.div
      data-testid="simple-autofilled-strip"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SOTA_GENTLE_SPRING}
      className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-3 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold text-emerald-900 tracking-tight">
          ✅ 아래 4가지 항목은 직접 쓰지 않으셔도 매거진에 자동으로 들어갑니다
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SIMPLE_AUTO_FILLED_ITEMS.map((item) => (
          <div
            key={item.id}
            data-testid={`autofilled-item-${item.id}`}
            className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs"
          >
            <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-sm font-extrabold text-slate-900 truncate">{item.label}</p>
                <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                  자동 포함
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600 leading-relaxed mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

