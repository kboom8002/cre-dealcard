"use client";

import React from "react";
import { Copy, Trash2 } from "lucide-react";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { IM_POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import {
  WorkspaceListPanel,
  ListToolbar,
  SimpleListRow,
  DateGroupedList,
  ListThumbnail,
  RowIconActionButton,
} from "@/components/workspace/list/WorkspaceList";
import {
  IM_POSTURE_FILTER_TABS,
  isSampleSeedImItem,
  resolveKnownTestAssetUrl,
  resolveRenderablePhotoSrc,
  type ImListItem,
  type ImPostureFilterKey,
} from "./im-workspace-types";

export interface ImListSidebarProps {
  filteredItems: ImListItem[];
  selectedItemId: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ListViewMode;
  onViewModeChange: (m: ListViewMode) => void;
  postureFilter: ImPostureFilterKey;
  onPostureFilterChange: (next: ImPostureFilterKey) => void;
  onCreateNew: () => void;
  onSelectItem: (id: string) => void;
  onDuplicateItem: (item: ImListItem, e: React.MouseEvent) => void;
  onDeleteItem: (item: ImListItem, e: React.MouseEvent) => void;
}

export function ImListSidebar({
  filteredItems,
  selectedItemId,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  postureFilter,
  onPostureFilterChange,
  onCreateNew,
  onSelectItem,
  onDuplicateItem,
  onDeleteItem,
}: ImListSidebarProps) {
  const activeImPostureTab =
    postureFilter !== "all"
      ? IM_POSTURE_FILTER_TABS.find((tab) => tab.id === postureFilter)
      : undefined;

  return (
    <WorkspaceListPanel
      testId="im-list-slot"
      bodyLabel={<>보유 IM 목록 {filteredItems.length}건</>}
      controls={
        <>
          <button
            type="button"
            data-testid="im-create-new-btn"
            onClick={onCreateNew}
            className="w-full min-h-[52px] px-4 py-3 bg-gradient-to-b from-[#1A88FF] to-[#007AFF] text-white rounded-2xl font-semibold text-base hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,122,255,0.28)]"
          >
            <span>+ 새 IM 만들기</span>
          </button>

          <div>
            <label htmlFor="im-search-input" className="sr-only">
              IM 검색
            </label>
            <input
              id="im-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="매물 이름 또는 주소로 찾기..."
              className="w-full min-h-[48px] px-3.5 bg-white text-base rounded-2xl border border-slate-900/[0.12] focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 outline-none transition-all"
            />
          </div>

          <ListToolbar
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            activeFilters={
              activeImPostureTab
                ? [
                    {
                      key: "im-posture",
                      label: activeImPostureTab.label,
                      onClear: () => onPostureFilterChange("all"),
                    },
                  ]
                : []
            }
            filterPanel={
              <div className="space-y-1.5">
                <p className="px-0.5 text-sm font-bold text-[#3A3A3C]">
                  매물 유형
                </p>
                <div
                  role="tablist"
                  aria-label="매물 유형별 IM 보기"
                  data-testid="im-posture-switcher"
                  className="grid grid-cols-4 gap-1 p-[3px] rounded-[12px] overflow-hidden ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
                >
                  {IM_POSTURE_FILTER_TABS.map((tab) => {
                    const active = postureFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`im-posture-tab-${tab.id}`}
                        onClick={() => onPostureFilterChange(tab.id)}
                        className={`min-h-[44px] px-1.5 py-1 rounded-[9px] text-sm font-semibold flex items-center justify-center transition-all cursor-pointer ${
                          active
                            ? "ios-segmented-pill bg-white text-[#007AFF]"
                            : "text-[#3A3A3C] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            }
          />
        </>
      }
    >
      {filteredItems.length === 0 ? (
        <div
          data-testid="im-empty-list-state"
          className="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-3"
        >
          <p className="text-sm font-bold text-[#1D1D1F] break-keep">
            등록된 물건이 없습니다
          </p>
          {searchQuery.trim() && (
            <button
              type="button"
              data-testid="im-clear-search-btn"
              onClick={() => onSearchChange("")}
              className="min-h-[44px] px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              검색어 지우기
            </button>
          )}
        </div>
      ) : viewMode === "simple" ? (
        <DateGroupedList
          items={filteredItems}
          getDate={(item) => item.updatedAt}
          getKey={(item) => item.id}
          ariaLabel="보유 IM 목록"
          renderRow={(item) => {
            const isSample = isSampleSeedImItem(item);
            return (
              <SimpleListRow
                testId={`im-item-${item.id}`}
                title={item.title || "새 IM"}
                date={item.updatedAt}
                status={
                  item.status === "published"
                    ? { label: TERMS.statusPublished, tone: "sent" }
                    : { label: TERMS.statusDraft, tone: "draft" }
                }
                meta={
                  isSample ? (
                    <span
                      data-testid={`im-sample-badge-${item.id}`}
                      className="inline-flex items-center rounded-md bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-sm font-extrabold text-amber-950 shrink-0"
                    >
                      [체험 예시]
                    </span>
                  ) : undefined
                }
                selected={item.id === selectedItemId}
                onSelect={() => onSelectItem(item.id)}
                actions={
                  <>
                    <RowIconActionButton
                      testId={`im-duplicate-${item.id}`}
                      label={`${item.title || "새 IM"} 복제`}
                      icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                      onClick={(e) => onDuplicateItem(item, e)}
                    />
                    <RowIconActionButton
                      testId={`im-delete-${item.id}`}
                      label={`${item.title || "새 IM"} 삭제`}
                      tone="danger"
                      icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                      onClick={(e) => onDeleteItem(item, e)}
                    />
                  </>
                }
              />
            );
          }}
        />
      ) : (
        <div className="space-y-2.5" role="list">
          {filteredItems.map((item) => {
            const isSelected = item.id === selectedItemId;
            const isSample = isSampleSeedImItem(item);
            const itemPostureLabel =
              IM_POSTURE_LABELS[item.investmentPosture || "core_income"] ||
              "임대수익용";

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                data-testid={`im-item-${item.id}`}
                data-selected={isSelected ? "true" : "false"}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelectItem(item.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectItem(item.id);
                  }
                }}
                className={`w-full min-h-[88px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
                  isSelected
                    ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
                    : "bg-white/82 border-slate-900/[0.075] hover:bg-white/95"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#007AFF] rounded-r-full" />
                )}
                <div className="flex items-start gap-3 pl-2">
                  <ListThumbnail
                    src={
                      resolveRenderablePhotoSrc(item.photos?.[0]) ||
                      resolveKnownTestAssetUrl(item.photoNames?.[0])
                    }
                    fallbackText={(item.title || item.address || "IM").trim()}
                    alt={`${item.title || "새 IM"} 대표 사진`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSample && (
                          <span
                            data-testid={`im-sample-badge-${item.id}`}
                            className="inline-flex items-center rounded-md bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-sm font-extrabold text-amber-950 shrink-0"
                          >
                            [체험 예시]
                          </span>
                        )}
                        <span
                          data-single-line-title="true"
                          title={item.title}
                          className="font-bold text-base text-[#1D1D1F] break-keep truncate"
                        >
                          {item.title || "새 IM"}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold px-2.5 py-0.5 rounded-full shrink-0 border ${
                          item.status === "published"
                            ? "bg-[#28CD41]/12 text-[#116B22] border-[#28CD41]/25"
                            : "bg-[#FF9500]/12 text-[#8A4B00] border-[#FF9500]/25"
                        }`}
                      >
                        {item.status === "published"
                          ? TERMS.statusPublished
                          : TERMS.statusDraft}
                      </span>
                    </div>
                    <p className="text-sm text-[#515154] break-keep">
                      {item.address || "주소 미입력"}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[#1D1D1F] mt-2 pt-2 border-t border-slate-900/[0.06]">
                      <div className="flex items-center gap-2">
                        <span>
                          {item.askingPriceManwon && item.askingPriceManwon > 0
                            ? formatPriceRange(item.askingPriceManwon * 10000)
                            : "가격 미입력"}
                        </span>
                        <span>·</span>
                        <span className="text-[#116B22]">
                          {item.grossYieldPct > 0
                            ? `수익률 ${item.grossYieldPct}%`
                            : itemPostureLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RowIconActionButton
                          testId={`im-duplicate-${item.id}`}
                          label={`${item.title || "새 IM"} 복제`}
                          icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateItem(item, e);
                          }}
                        />
                        <RowIconActionButton
                          testId={`im-delete-${item.id}`}
                          label={`${item.title || "새 IM"} 삭제`}
                          tone="danger"
                          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem(item, e);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceListPanel>
  );
}
