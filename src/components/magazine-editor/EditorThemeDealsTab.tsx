"use client";

import React, { useId } from "react";
import { motion } from "motion/react";
import { Target, Building2, Check } from "lucide-react";
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
      {/* 테마 섹션 */}
      <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
          <span className="text-label font-bold text-slate-200">금주의 테마</span>
        </div>

        <div className="space-y-2">
          <label htmlFor={titleId} className="text-caption font-semibold text-ink-muted block">
            테마 제목
          </label>
          <input
            id={titleId}
            value={themeTitle}
            onChange={(e) => setThemeTitle(e.target.value)}
            className="w-full min-h-11 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-label text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-ink-subtle"
            placeholder="예: 강남 오피스 공실률 반전의 신호"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={bodyId} className="text-caption font-semibold text-ink-muted block">
            테마 본문 (마크다운)
          </label>
          <textarea
            id={bodyId}
            value={themeBodyMd}
            onChange={(e) => setThemeBodyMd(e.target.value)}
            className="w-full h-32 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-label text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-ink-subtle font-mono"
            placeholder="테마에 대한 심층 분석을 작성하세요...&#10;&#10;마크다운 형식을 지원합니다."
          />
        </div>
      </div>

      {/* 매물 선택 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-label font-semibold text-slate-300">
            주목 매물 ({selectedDealIds.size}/{allDeals.length})
          </p>
          <span className="text-caption text-ink-subtle">
            테마와 연계할 매물을 선택하세요
          </span>
        </div>

        {allDeals.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-8 h-8 opacity-60" />}
            title="등록된 매물이 없습니다"
            description="딜카드를 등록하면 여기에서 매거진에 담을 수 있습니다."
          />
        ) : (
          allDeals.map((deal: any, idx: number) => {
            const dealId = deal.id;
            const isSelected = selectedDealIds.has(dealId);
            return (
              <motion.button
                key={dealId ?? idx}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleDeal(dealId)}
                whileTap={{ scale: 0.98 }}
                className={`w-full min-h-11 text-left p-3 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-rose-500/8 border-rose-500/25"
                    : "bg-slate-800/20 border-slate-700/40 opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0" aria-hidden="true">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-rose-400 bg-rose-500/20 rounded-md p-0.5" />
                    ) : (
                      <div className="w-4 h-4 border border-slate-600 rounded-md" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-label font-bold text-white mb-0.5 line-clamp-1">
                      {deal.assetType || deal.asset_type || "매물"}
                    </p>
                    <p className="text-caption text-ink-subtle line-clamp-1 mb-1.5">
                      {deal.address}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(deal.areaSignal || deal.area_signal) && (
                        <span className="text-caption font-medium text-slate-300 bg-slate-700/60 px-1.5 py-0.5 rounded">
                          {deal.areaSignal || deal.area_signal}
                        </span>
                      )}
                      {deal.price > 0 && (
                        <span className="text-caption font-extrabold text-indigo-300">
                          {fmt(deal.price)}
                        </span>
                      )}
                      {deal.buyerInterestCount > 0 && (
                        <span className="text-caption text-rose-300 bg-rose-500/12 px-1.5 py-0.5 rounded-full">
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
