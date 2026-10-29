"use client";

import React, { useId } from "react";
import { motion } from "motion/react";
import { Target, Building2, Check, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface EditorThemeDealsTabProps {
  themeTitle: string;
  setThemeTitle: (v: string) => void;
  themeBodyMd: string;
  setThemeBodyMd: (v: string) => void;
  allDeals: any[];
  selectedDealIds: Set<string>;
  toggleDeal: (id: string) => void;
  fmt: (price: number) => string;
}

export function formatDealPrice(price: unknown, fmtFn?: (p: number) => string): string {
  if (typeof price === "string" && price.trim()) {
    const trimmed = price.trim();
    if (trimmed.endsWith("원") || trimmed.endsWith("억")) return trimmed;
    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      if (num < 10000) return `${num}억 원`;
      return fmtFn ? fmtFn(num) : `${(num / 100000000).toFixed(1)}억 원`;
    }
    // If it's a non-numeric string (e.g., "협의", "미정", "상담"), return as-is
    if (isNaN(num)) return trimmed;
    // If non-positive number like 0 or negative, return empty string
    if (num <= 0) return "";
    return `${trimmed}억 원`;
  }
  if (typeof price === "number" && price > 0) {
    if (price < 10000) return `${price}억 원`;
    return fmtFn ? fmtFn(price) : `${(price / 100000000).toFixed(1)}억 원`;
  }
  return "";
}

export function EditorThemeDealsTab({
  themeTitle,
  setThemeTitle,
  themeBodyMd,
  setThemeBodyMd,
  allDeals,
  selectedDealIds,
  toggleDeal,
  fmt,
}: EditorThemeDealsTabProps) {
  const uid = useId();
  const titleId = `${uid}-theme-title`;
  const bodyId = `${uid}-theme-body`;

  return (
    <div className="space-y-5">
      {/* 테마 섹션 — Warm Paper Light 고대비 카드 */}
      <div className="space-y-3.5 p-4 sm:p-5 bg-white border border-slate-300 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-[16px] font-extrabold text-slate-900">금주의 테마 브리핑</span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={titleId} className="text-sm font-bold text-slate-700 block">
            테마 제목
          </label>
          <input
            id={titleId}
            value={themeTitle}
            onChange={(e) => setThemeTitle(e.target.value)}
            className="w-full min-h-11 bg-slate-50 border border-slate-300 focus:bg-white rounded-xl px-3.5 py-2.5 text-base font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all placeholder:text-slate-400 placeholder:font-normal"
            placeholder="예: 강남 오피스 공실률 반전과 급매물 분석"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={bodyId} className="text-sm font-bold text-slate-700 block">
            테마 본문 (마크다운)
          </label>
          <textarea
            id={bodyId}
            value={themeBodyMd}
            onChange={(e) => setThemeBodyMd(e.target.value)}
            className="w-full h-32 bg-slate-50 border border-slate-300 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all resize-none placeholder:text-slate-400 font-sans"
            placeholder="테마에 대한 심층 분석을 작성하세요...&#10;&#10;마크다운 형식을 지원합니다."
          />
        </div>
      </div>

      {/* 매물 선택 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[15px] font-extrabold text-slate-900">
            주목 매물 ({selectedDealIds.size}/{allDeals.length})
          </p>
          <span className="text-xs font-semibold text-slate-500">
            소식지에 실을 핵심 추천 매물을 선택하세요
          </span>
        </div>

        {allDeals.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-8 h-8 text-slate-400 opacity-60" />}
            title="등록된 매물이 없습니다"
            description="딜카드 또는 Basic IM을 등록하면 여기에서 매거진에 담을 수 있습니다."
          />
        ) : (
          allDeals.map((deal: any, idx: number) => {
            const dealId = deal.id;
            const isSelected = selectedDealIds.has(dealId);
            const priceLabel = formatDealPrice(deal.price ?? deal.price_band, fmt);
            const title =
              deal.areaSignal ||
              deal.area_signal ||
              deal.assetType ||
              deal.asset_type ||
              deal.address ||
              "추천 매물";
            const hasIm = Boolean(deal.imUrl || deal.hasIm || deal.doc_type === "im_lite");
            const yieldVal = deal.grossYieldNetOfDeposit ?? deal.grossYieldPct;

            return (
              <motion.button
                key={dealId ?? idx}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleDeal(dealId)}
                whileTap={{ scale: 0.985 }}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/90 border-2 border-blue-600 shadow-sm text-slate-900"
                    : "bg-white border-slate-300 hover:border-slate-400 text-slate-800 shadow-2xs"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* 선택 체크박스 */}
                  <div className="mt-1 shrink-0" aria-hidden="true">
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 border-2 border-slate-400 rounded-md bg-white" />
                    )}
                  </div>

                  {/* 대표 사진 썸네일 */}
                  <div className="shrink-0">
                    {deal.photoUrl ? (
                      <img
                        src={deal.photoUrl}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Building2 className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  {/* 매물 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[15px] font-extrabold text-slate-900 truncate">
                        {title}
                      </p>
                      {priceLabel && (
                        <span className="shrink-0 text-[15px] font-black text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-200/60">
                          {priceLabel}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 truncate mb-1.5 font-medium">
                      {deal.address || deal.raw_address}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* IM 연동 배지 */}
                      {hasIm && (
                        <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                          📊 Basic IM 연동됨
                        </span>
                      )}

                      {/* 실질 수익률 배지 */}
                      {yieldVal != null && Number(yieldVal) > 0 && (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          수익률 연 {yieldVal}%
                        </span>
                      )}

                      {/* 매수 관심 고객 수 */}
                      {deal.buyerInterestCount > 0 && (
                        <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full">
                          관심 {deal.buyerInterestCount}명
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
