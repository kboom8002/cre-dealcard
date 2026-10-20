"use client";

import React from "react";
import { motion } from "motion/react";
import { Check, Building2 } from "lucide-react";
import { SIMPLE_DEAL_LIMIT } from "@/lib/magazine/simple-format";
import { SOTA_SPRING } from "@/components/motion/sota-motion";

export interface SimpleDealItem {
  id: string;
  address?: string;
  areaSignal?: string;
  area_signal?: string;
  assetType?: string;
  asset_type?: string;
  price?: number | string;
  buyerInterestCount?: number;
}

export interface SimpleDealPickerProps {
  deals: SimpleDealItem[];
  selectedDealIds: Set<string>;
  onToggleDeal: (dealId: string) => void;
  fmt?: (price: number) => string;
  onLimitReached?: () => void;
}

function formatDealPrice(
  price: number | string | undefined,
  fmt?: (price: number) => string,
): string {
  if (price === undefined || price === null || price === "" || price === 0) return "";
  if (typeof price === "number") {
    if (fmt) return fmt(price);
    if (price >= 100_000_000) return `${(price / 100_000_000).toFixed(1)}억`;
    if (price >= 10_000) return `${Math.round(price / 10_000)}만`;
    return price.toLocaleString();
  }
  return String(price);
}

export function SimpleDealPicker({
  deals,
  selectedDealIds,
  onToggleDeal,
  fmt,
  onLimitReached,
}: SimpleDealPickerProps) {
  const selectedCount = selectedDealIds.size;

  if (!deals || deals.length === 0) {
    return (
      <div
        data-testid="simple-deals-empty"
        className="rounded-xl border border-slate-300 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800/35 p-4 text-left"
      >
        <div className="flex items-start gap-2.5">
          <Building2 className="w-5 h-5 text-blue-700 dark:text-indigo-300 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[15px] font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
            등록된 매물이 없어도 괜찮습니다 — 이번 호는 시장 브리핑과 뉴스 중심으로 발행됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="simple-deal-picker">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">
          터치 한 번으로 이번 호에 실을 매물을 켜거나 끌 수 있습니다
        </span>
        <span
          data-testid="simple-deal-count-badge"
          className="shrink-0 rounded-full border border-blue-300 dark:border-indigo-500/30 bg-blue-50 dark:bg-indigo-500/15 px-3 py-1 text-xs font-extrabold text-blue-900 dark:text-indigo-200"
        >
          {Math.min(selectedCount, SIMPLE_DEAL_LIMIT)} / 최대 {SIMPLE_DEAL_LIMIT}건 선택됨
        </span>
      </div>

      <div className="space-y-2.5">
        {deals.map((deal, idx) => {
          const dealId = String(deal.id ?? idx);
          const isSelected = selectedDealIds.has(dealId);
          const title =
            deal.areaSignal ||
            deal.area_signal ||
            deal.assetType ||
            deal.asset_type ||
            deal.address ||
            "추천 매물";
          const subtitle =
            deal.address && deal.address !== title ? deal.address : deal.assetType || deal.asset_type || "";
          const priceLabel = formatDealPrice(deal.price, fmt);

          return (
            <motion.button
              key={dealId}
              type="button"
              aria-pressed={isSelected}
              data-testid={`simple-deal-card-${dealId}`}
              whileHover={{ y: -1.5 }}
              whileTap={{ scale: 0.985 }}
              transition={SOTA_SPRING}
              onClick={() => {
                if (!isSelected && selectedCount >= SIMPLE_DEAL_LIMIT) {
                  onLimitReached?.();
                  return;
                }
                onToggleDeal(dealId);
              }}
              className={`w-full min-h-[56px] rounded-xl border p-3.5 text-left transition-colors flex items-center gap-3.5 ${
                isSelected
                  ? "border-2 border-blue-600 dark:border-indigo-400 bg-blue-50/90 dark:bg-indigo-500/15 text-slate-900 dark:text-white shadow-[0_4px_12px_rgba(37,99,235,0.10)]"
                  : "border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-slate-800/30 text-slate-800 dark:text-slate-300 hover:border-slate-400 hover:bg-slate-50/70"
              }`}
            >
              <motion.div
                aria-hidden="true"
                animate={{ scale: isSelected ? 1 : 0.95 }}
                transition={SOTA_SPRING}
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 transition-colors ${
                  isSelected
                    ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                    : "border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900/60"
                }`}
              >
                {isSelected && <Check className="w-4 h-4 stroke-[3] text-white" />}
              </motion.div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[16px] font-extrabold text-slate-900 dark:text-white truncate">{title}</p>
                  {priceLabel && (
                    <span className="shrink-0 text-[16px] font-black text-blue-700 dark:text-indigo-300">
                      {priceLabel}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

