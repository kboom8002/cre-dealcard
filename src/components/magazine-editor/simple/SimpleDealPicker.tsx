"use client";

import React from "react";
import { Check, Building2 } from "lucide-react";
import { SIMPLE_DEAL_LIMIT } from "@/lib/magazine/simple-format";

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
        className="rounded-xl border border-slate-700/70 bg-slate-800/35 p-4 text-left"
      >
        <div className="flex items-start gap-2.5">
          <Building2 className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-slate-200 leading-relaxed">
            등록된 매물이 없어도 괜찮습니다 — 이번 호는 시장 브리핑과 뉴스 중심으로 발행됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" data-testid="simple-deal-picker">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">
          터치 한 번으로 이번 호에 실을 매물을 켜거나 끌 수 있습니다
        </span>
        <span
          data-testid="simple-deal-count-badge"
          className="shrink-0 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-bold text-indigo-200"
        >
          {Math.min(selectedCount, SIMPLE_DEAL_LIMIT)} / 최대 {SIMPLE_DEAL_LIMIT}건 선택됨
        </span>
      </div>

      <div className="space-y-2">
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
            <button
              key={dealId}
              type="button"
              aria-pressed={isSelected}
              data-testid={`simple-deal-card-${dealId}`}
              onClick={() => {
                if (!isSelected && selectedCount >= SIMPLE_DEAL_LIMIT) {
                  onLimitReached?.();
                  return;
                }
                onToggleDeal(dealId);
              }}
              className={`w-full min-h-[56px] rounded-xl border p-3.5 text-left transition-all flex items-center gap-3 ${
                isSelected
                  ? "border-indigo-400/60 bg-indigo-500/15 text-white shadow-sm"
                  : "border-slate-700/70 bg-slate-800/30 text-slate-300 hover:border-slate-600"
              }`}
            >
              <div
                aria-hidden="true"
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                  isSelected
                    ? "border-indigo-400 bg-indigo-500 text-white"
                    : "border-slate-500 bg-slate-900/60"
                }`}
              >
                {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[16px] font-bold text-white truncate">{title}</p>
                  {priceLabel && (
                    <span className="shrink-0 text-[16px] font-extrabold text-indigo-300">
                      {priceLabel}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-xs text-slate-300 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
