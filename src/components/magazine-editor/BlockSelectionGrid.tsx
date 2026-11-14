"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";

export interface NewsletterBlockItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_NEWSLETTER_BLOCKS: readonly Omit<NewsletterBlockItem, "enabled">[] = [
  {
    id: "field_note",
    label: "시장 브리핑",
    description: "5줄 이내(500자)로 핵심 시장 흐름을 전합니다",
  },
  {
    id: "news_curation",
    label: "핵심 이슈 브리핑",
    description: "70대 매수자도 쉽게 이해하는 분야별 이슈 카드",
  },
  {
    id: "featured_deals",
    label: "추천 매물",
    description: "고객에게 소개할 핵심 매물과 한 줄 추천글",
  },
] as const;

export interface BlockSelectionGridProps {
  sections: { id: string; enabled: boolean }[];
  onToggleSection: (sectionId: string, nextEnabled: boolean) => void;
  availableBlocks?: readonly Omit<NewsletterBlockItem, "enabled">[];
  cadence?: "daily" | "weekly" | "monthly";
}

export function BlockSelectionGrid({
  sections,
  onToggleSection,
  availableBlocks = DEFAULT_NEWSLETTER_BLOCKS,
  cadence: _cadence,
}: BlockSelectionGridProps) {
  const visibleBlocks = availableBlocks.filter((b) => b.id !== "market_data");
  const isEnabled = (id: string) => {
    const found = sections.find((s) => s.id === id);
    return found ? found.enabled : true;
  };

  return (
    <section
      data-testid="block-selection-grid"
      aria-label="포함할 코너 켜기 및 끄기"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-slate-900">
            포함할 코너 켜기/끄기
          </h3>
        </div>
        <span className="text-sm font-bold text-slate-600">
          켜진 코너만 고객 화면에 보입니다
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleBlocks.map((block) => {
          const enabled = isEnabled(block.id);
          return (
            <button
              key={block.id}
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${block.label} 코너 포함 여부`}
              data-testid={`block-switch-${block.id}`}
              onClick={() => onToggleSection(block.id, !enabled)}
              className={`min-h-[48px] w-full rounded-xl border p-4 text-left transition-all flex items-center justify-between gap-3 ${
                enabled
                  ? "border-blue-600 bg-blue-50/60 text-slate-900 shadow-2xs"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="min-w-0 space-y-1">
                <p className="text-base font-extrabold text-slate-900">
                  {block.label}
                </p>
                <p className="text-sm font-medium text-slate-600">
                  {block.description}
                </p>
              </div>

              <span
                className={`shrink-0 inline-flex min-h-[36px] min-w-[64px] items-center justify-center rounded-full px-3 py-1 text-sm font-extrabold ${
                  enabled
                    ? "bg-blue-700 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {enabled ? "포함됨" : "제외됨"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
