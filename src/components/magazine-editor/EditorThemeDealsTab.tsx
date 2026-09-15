"use client";

import React from "react";
import { motion } from "motion/react";
import { Target, Building2, Check } from "lucide-react";

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
  return (
    <div className="space-y-5">
      {/* 테마 섹션 */}
      <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">금주의 테마</span>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-slate-400">
            테마 제목
          </label>
          <input
            value={themeTitle}
            onChange={(e) => setThemeTitle(e.target.value)}
            className="w-full bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
            placeholder="예: 강남 오피스 공실률 반전의 신호"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-slate-400">
            테마 본문 (마크다운)
          </label>
          <textarea
            value={themeBodyMd}
            onChange={(e) => setThemeBodyMd(e.target.value)}
            className="w-full h-32 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600 font-mono"
            placeholder="테마에 대한 심층 분석을 작성하세요...&#10;&#10;마크다운 형식을 지원합니다."
          />
        </div>
      </div>

      {/* 매물 선택 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-300">
            주목 매물 ({selectedDealIds.size}/{allDeals.length})
          </p>
          <span className="text-[10px] text-slate-500">
            테마와 연계할 매물을 선택하세요
          </span>
        </div>

        {allDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Building2 className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">등록된 매물이 없습니다.</p>
          </div>
        ) : (
          allDeals.map((deal: any, idx: number) => {
            const dealId = deal.id;
            const isSelected = selectedDealIds.has(dealId);
            return (
              <motion.button
                key={dealId ?? idx}
                onClick={() => toggleDeal(dealId)}
                whileTap={{ scale: 0.98 }}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-rose-500/8 border-rose-500/25"
                    : "bg-slate-800/20 border-slate-700/40 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-rose-400 bg-rose-500/20 rounded-md p-0.5" />
                    ) : (
                      <div className="w-4 h-4 border border-slate-600 rounded-md" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white mb-0.5 line-clamp-1">
                      {deal.assetType || deal.asset_type || "매물"}
                    </p>
                    <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">
                      {deal.address}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(deal.areaSignal || deal.area_signal) && (
                        <span className="text-[9px] font-medium text-slate-300 bg-slate-700/60 px-1.5 py-0.5 rounded">
                          {deal.areaSignal || deal.area_signal}
                        </span>
                      )}
                      {deal.price > 0 && (
                        <span className="text-[10px] font-extrabold text-indigo-300">
                          {fmt(deal.price)}
                        </span>
                      )}
                      {deal.buyerInterestCount > 0 && (
                        <span className="text-[9px] text-rose-300 bg-rose-500/12 px-1.5 py-0.5 rounded-full">
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
