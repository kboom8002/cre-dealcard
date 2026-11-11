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
    label: "시장 브리핑 글",
    description: "중개사가 직접 전하는 이번 달 시장 흐름과 인사말",
  },
  {
    id: "news_curation",
    label: "핵심 이슈 포스트잇 5선",
    description: "내 권역·관심 분야 맞춤형 카드뉴스(2줄 제목 + 2줄 짧은 해설)",
  },
  {
    id: "featured_deals",
    label: "추천 매물 소개",
    description: "이번 달 고객에게 소개할 핵심 매물과 한 줄 추천글",
  },
  {
    id: "market_data",
    label: "상단 주요 통계 그래픽 2선",
    description: "월간 뉴스레터 상단에 권역별 핵심 비교 그래픽 2개를 배치합니다",
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
  cadence,
}: BlockSelectionGridProps) {
  const visibleBlocks =
    cadence && cadence !== "monthly"
      ? availableBlocks.filter((b) => b.id !== "market_data")
      : availableBlocks;
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
