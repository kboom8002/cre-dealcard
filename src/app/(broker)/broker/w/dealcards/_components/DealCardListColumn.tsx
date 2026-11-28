"use client";

import React from "react";
import {
  DateGroupedList,
  ListThumbnail,
  ListToolbar,
  RowIconActionButton,
  SimpleListRow,
  WorkspaceListPanel,
  type ActiveFilterChip,
} from "@/components/workspace/list/WorkspaceList";
import { Copy, Trash2 } from "lucide-react";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import {
  classifyDealCardOriginGroup,
  summarizeMemoOneLine,
  type DealCardOriginGroup,
  type UnconvertedMemoItem,
} from "@/lib/deal-card/memo-pairing";
import { POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";
import {
  ORIGIN_GROUP_TABS,
  POSTURE_FILTER_TABS,
  ROUTING_TYPE_BADGE,
  describeDealCardStatus,
  isSampleDealCardItem,
  type BuildingListItem,
  type SimpleListEntry,
} from "./dealcards-types";

export interface DealCardListColumnProps {
  totalVisibleCount: number;
  searchQuery: string;
  viewMode: ListViewMode;
  originGroupFilter: "all" | DealCardOriginGroup;
  postureFilter: "all" | "income" | "owner_value";
  collapsedGroups: Record<DealCardOriginGroup, boolean>;
  showOtherMemos: boolean;
  hiddenNonDealMemoCount: number;
  aiMemoDealCards: BuildingListItem[];
  manualDealCards: BuildingListItem[];
  filteredDealCards: BuildingListItem[];
  filteredUnconvertedMemos: UnconvertedMemoItem[];
  resolvedActiveId: string | null;
  selectedMemoOnly: UnconvertedMemoItem | null;
  syncedServerIds: ReadonlySet<string>;
  onCreateNew: () => void;
  onSearchChange: (next: string) => void;
  onViewModeChange: (next: ListViewMode) => void;
  onOriginGroupFilterChange: (next: "all" | DealCardOriginGroup) => void;
  onPostureFilterChange: (next: "all" | "income" | "owner_value") => void;
  onToggleGroupCollapse: (group: DealCardOriginGroup) => void;
  onToggleShowOtherMemos: () => void;
  onSelectDealCard: (id: string) => void;
  onSelectUnconvertedMemo: (memo: UnconvertedMemoItem) => void;
  onDuplicateItem: (item: BuildingListItem, e: React.MouseEvent) => void;
  onDeleteItem: (item: BuildingListItem, e: React.MouseEvent) => void;
  onGenerateFromMemo: (memo: UnconvertedMemoItem) => void;
  onDeleteUnconvertedMemo: (memo: UnconvertedMemoItem, e: React.MouseEvent) => void;
  isSingleUntouchedStarter?: boolean;
}

export function DealCardListColumn({
  totalVisibleCount,
  searchQuery,
  viewMode,
  originGroupFilter,
  postureFilter,
  collapsedGroups,
  showOtherMemos,
  hiddenNonDealMemoCount,
  aiMemoDealCards,
  manualDealCards,
  filteredDealCards,
  filteredUnconvertedMemos,
  resolvedActiveId,
  selectedMemoOnly,
  syncedServerIds,
  onCreateNew,
  onSearchChange,
  onViewModeChange,
  onOriginGroupFilterChange,
  onPostureFilterChange,
  onToggleGroupCollapse,
  onToggleShowOtherMemos,
  onSelectDealCard,
  onSelectUnconvertedMemo,
  onDuplicateItem,
  onDeleteItem,
  onGenerateFromMemo,
  onDeleteUnconvertedMemo,
  isSingleUntouchedStarter = false,
}: DealCardListColumnProps) {
  const includeMemosInSimpleList =
    originGroupFilter === "unconverted_memo" ||
    (originGroupFilter === "all" && postureFilter === "all");
  const simpleListDealCards =
    originGroupFilter === "ai_memo"
      ? aiMemoDealCards
      : originGroupFilter === "manual"
      ? manualDealCards
      : originGroupFilter === "unconverted_memo"
      ? []
      : filteredDealCards;
  const simpleListEntries: SimpleListEntry[] = [
    ...simpleListDealCards.map(
      (item): SimpleListEntry => ({ kind: "dealcard", key: `dc:${item.id}`, item })
    ),
    ...(includeMemosInSimpleList ? filteredUnconvertedMemos : []).map(
      (memo): SimpleListEntry => ({ kind: "memo", key: `memo:${memo.id}`, memo })
    ),
  ];

  const activeListFilters: ActiveFilterChip[] = [];
  if (originGroupFilter !== "all") {
    activeListFilters.push({
      key: "origin",
      label: ORIGIN_GROUP_TABS.find((t) => t.id === originGroupFilter)?.chipLabel || "",
      onClear: () => onOriginGroupFilterChange("all"),
    });
  }
  if (postureFilter !== "all") {
    activeListFilters.push({
      key: "posture",
      label: POSTURE_FILTER_TABS.find((t) => t.id === postureFilter)?.chipLabel || "",
      onClear: () => onPostureFilterChange("all"),
    });
  }

  const renderSimpleListRow = (entry: SimpleListEntry) => {
    if (entry.kind === "memo") {
      const memo = entry.memo;
      return (
        <SimpleListRow
          testId={`unconverted-memo-item-${memo.id}`}
          title={summarizeMemoOneLine(memo.memoText, 46) || "빈 메모"}
          date={memo.updatedAt || memo.createdAt}
          status={{ label: "메모만 저장", tone: "draft" }}
          selected={selectedMemoOnly?.id === memo.id}
          onSelect={() => onSelectUnconvertedMemo(memo)}
          dataAttrs={{ "data-origin-group": "unconverted_memo" }}
          actions={
            <RowIconActionButton
              testId={`unconverted-memo-delete-${memo.id}`}
              label={`${summarizeMemoOneLine(memo.memoText, 24) || "빈 메모"} 삭제`}
              tone="danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(e) => onDeleteUnconvertedMemo(memo, e)}
            />
          }
        />
      );
    }
    const item = entry.item;
    const itemDate =
      (item as BuildingListItem & { updatedAtIso?: string }).updatedAtIso || item.updatedAt;
    const { statusTitle, simpleStatus, rowTitle } = describeDealCardStatus(item);
    const isSample = isSampleDealCardItem(item, syncedServerIds);
    return (
      <SimpleListRow
        testId={`dealcard-item-${item.id}`}
        title={rowTitle}
        date={itemDate}
        meta={isSample ? "[체험 예시]" : undefined}
        status={{
          ...simpleStatus,
          testId: `dealcard-status-badge-${item.id}`,
          title: statusTitle,
        }}
        selected={!selectedMemoOnly && item.id === resolvedActiveId}
        onSelect={() => onSelectDealCard(item.id)}
        dataAttrs={{ "data-origin-group": classifyDealCardOriginGroup(item) }}
        actions={
          <>
            <RowIconActionButton
              testId={`dealcard-duplicate-${item.id}`}
              label={`${rowTitle} 복제`}
              icon={<Copy className="h-4 w-4" aria-hidden="true" />}
              onClick={(e) => onDuplicateItem(item, e)}
            />
            <RowIconActionButton
              testId={`dealcard-delete-${item.id}`}
              label={`${rowTitle} ${isSingleUntouchedStarter ? "입력 비우기" : "삭제"}`}
              tone="danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(e) => onDeleteItem(item, e)}
            />
          </>
        }
      />
    );
  };

  const renderDealCardRow = (item: BuildingListItem) => {
    const isSelected = !selectedMemoOnly && item.id === resolvedActiveId;
    const itemPosture = item.card4.posture || "income";
    const postureLabel = POSTURE_LABELS[itemPosture].shortBadge;
    const originGroup = classifyDealCardOriginGroup(item);
    const memoPreview = summarizeMemoOneLine(item.memoText, 34);
    const { itemBlind, isCardReady, rowTitle } = describeDealCardStatus(item);
    const isSample = isSampleDealCardItem(item, syncedServerIds);
    const thumbFallback =
      (item.card4.region || item.region || item.title || "").trim().split(/\s+/).pop() || "";
    const thumbSrc =
      item.status === "sent" && syncedServerIds.has(item.id)
        ? `/api/og/deal/${encodeURIComponent(item.id)}/kakao-v2`
        : null;

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "true" : "false"}
        data-origin-group={originGroup}
        data-testid={`dealcard-item-${item.id}`}
        onClick={() => onSelectDealCard(item.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectDealCard(item.id);
          }
        }}
        className={`relative min-h-[68px] p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          isSelected
            ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
            : "bg-white/82 border-slate-900/[0.075] hover:bg-white/95"
        }`}
      >
        {isSelected && (
          <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 bg-[#007AFF] rounded-r-full" />
        )}

        <div className="flex items-start gap-1.5 pl-1.5">
          <ListThumbnail
            src={thumbSrc}
            fallbackText={thumbFallback}
            alt={`${item.title || "딜카드"} 카톡 미리보기`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 pl-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {isSample && (
                  <span
                    data-testid="dealcard-list-sample-badge"
                    className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-sm font-extrabold text-amber-950"
                  >
                    [체험 예시]
                  </span>
                )}
                <h3
                  data-single-line-title="true"
                  title={item.card4.headline || item.title}
                  className={`text-base break-keep ${
                    isSelected ? "font-bold text-[#0040DD]" : "font-bold text-[#1D1D1F]"
                  }`}
                >
                  {item.awaitingMemoGeneration && !item.region
                    ? "새 메모 · 딜카드 작성 중"
                    : item.title || "새 딜카드"}
                </h3>
              </div>
              <span
                data-testid={`dealcard-status-badge-${item.id}`}
                title={
                  !itemBlind.isValid
                    ? "지번·건물명 등 비공개 식별 정보를 확인해 주세요"
                    : item.status === "sent"
                    ? "고객에게 카톡·링크로 발송된 딜카드입니다"
                    : isCardReady
                    ? "필수 항목 입력 완료 — [카톡으로 보내기]를 누르면 '보냄'으로 전환됩니다"
                    : "권역·용도·면적·가격대와 장점 1개 이상을 입력하면 '준비 완료'가 됩니다"
                }
                className={`text-sm px-2.5 py-0.5 rounded-full font-semibold shrink-0 border ${
                  !itemBlind.isValid
                    ? "bg-[#FF2D55]/12 text-[#C8102E] border-[#FF2D55]/25"
                    : item.status === "sent"
                    ? "bg-[#28CD41]/12 text-[#116B22] border-[#28CD41]/25"
                    : isCardReady
                    ? "bg-[#007AFF]/12 text-[#0040DD] border-[#007AFF]/25"
                    : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08]"
                }`}
              >
                {!itemBlind.isValid
                  ? "⚠ 확인 필요"
                  : item.status === "sent"
                  ? TERMS.statusSent
                  : isCardReady
                  ? "준비 완료"
                  : TERMS.statusDraft}
              </span>
            </div>

            {memoPreview && (
              <p
                data-testid={`dealcard-paired-memo-preview-${item.id}`}
                className="pl-2 mt-1 text-sm text-[#515154] bg-slate-100/85 px-2.5 py-0.5 rounded-lg border border-slate-200/80 break-keep"
              >
                📝 {memoPreview}
              </p>
            )}

            <div className="mt-1.5 pt-1 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 pl-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-sm text-[#515154] font-medium">
                <span className="font-bold text-[#1D1D1F]">
                  {item.priceBand || "가격 미입력"}
                </span>
                <span>·</span>
                <span>{postureLabel}</span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <RowIconActionButton
                  testId={`dealcard-duplicate-${item.id}`}
                  label={`${rowTitle} 복제`}
                  icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                  onClick={(e) => onDuplicateItem(item, e)}
                />
                <RowIconActionButton
                  testId={`dealcard-delete-${item.id}`}
                  label={`${rowTitle} ${isSingleUntouchedStarter ? "입력 비우기" : "삭제"}`}
                  tone="danger"
                  icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  onClick={(e) => onDeleteItem(item, e)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUnconvertedMemoRow = (memo: UnconvertedMemoItem) => {
    const isSelected = selectedMemoOnly?.id === memo.id;
    const preview = summarizeMemoOneLine(memo.memoText, 46);
    const badgeLabel = ROUTING_TYPE_BADGE[memo.routingType] || "매물 메모";

    return (
      <div
        key={memo.id}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "true" : "false"}
        data-origin-group="unconverted_memo"
        data-testid={`unconverted-memo-item-${memo.id}`}
        onClick={() => onSelectUnconvertedMemo(memo)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectUnconvertedMemo(memo);
          }
        }}
        className={`relative min-h-[68px] p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          isSelected
            ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
            : "bg-amber-50/45 border-amber-300/70 hover:bg-white/95"
        }`}
      >
        {isSelected && (
          <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 bg-[#007AFF] rounded-r-full" />
        )}

        <div className="flex items-start justify-between gap-2 pl-2">
          <p className="text-sm font-bold text-[#1D1D1F] break-keep leading-snug">
            📝 {preview || "빈 메모"}
          </p>
          <span className="text-sm px-2 py-0.5 rounded-full font-semibold shrink-0 bg-amber-100 text-amber-900 border border-amber-300">
            미생성
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pl-2 mt-1.5">
          <span className="text-sm text-[#515154] font-medium">{badgeLabel}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid={`unconverted-memo-generate-${memo.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onGenerateFromMemo(memo);
              }}
              className="min-h-[44px] text-sm font-bold px-3 py-1 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white cursor-pointer"
            >
              딜카드 생성
            </button>
            <RowIconActionButton
              testId={`unconverted-memo-delete-${memo.id}`}
              label={`${summarizeMemoOneLine(memo.memoText, 24) || "빈 메모"} 삭제`}
              tone="danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(e) => onDeleteUnconvertedMemo(memo, e)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <WorkspaceListPanel
      testId="dealcard-airtable-list"
      bodyLabel={<>내 딜카드 목록 {totalVisibleCount}건</>}
      controls={
        <>
          <button
            type="button"
            onClick={onCreateNew}
            data-testid="workspace-new-dealcard-btn"
            className="w-full min-h-[52px] rounded-2xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-base flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <span>＋</span>
            <span>새 딜카드 만들기</span>
          </button>

          <div className="relative">
            <label htmlFor="dealcard-search-input" className="sr-only">
              딜카드 및 원본 메모 검색
            </label>
            <input
              id="dealcard-search-input"
              data-testid="dealcard-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="지역, 용도, 번지·원본 메모로 찾기..."
              className="w-full min-h-[48px] px-3.5 rounded-2xl bg-white/92 border border-slate-900/[0.12] text-base text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 transition-all"
            />
          </div>

          <ListToolbar
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            activeFilters={activeListFilters}
            filterPanel={
              <>
                <p className="px-1 text-sm font-bold text-[#3A3A3C]">생성 방식</p>
                <div
                  role="tablist"
                  aria-label="생성 방식 및 메모 그룹별 보기"
                  data-testid="dealcard-group-switcher"
                  className="flex flex-wrap gap-1 p-1 rounded-2xl ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
                >
                  {ORIGIN_GROUP_TABS.map((tab) => {
                    const active = originGroupFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`dealcard-group-tab-${tab.id}`}
                        onClick={() => onOriginGroupFilterChange(tab.id)}
                        className={`min-h-[44px] flex-1 min-w-[68px] px-2 py-1 rounded-xl text-sm font-semibold leading-snug break-keep text-center flex items-center justify-center transition-all cursor-pointer ${
                          active
                            ? "ios-segmented-pill bg-white text-[#0055D4]"
                            : "text-[#3A3A3C] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <p className="px-1 pt-1 text-sm font-bold text-[#3A3A3C]">매물 유형</p>
                <div
                  role="tablist"
                  aria-label="매물 유형별 보기"
                  data-testid="dealcard-posture-switcher"
                  className="grid grid-cols-3 gap-1 p-1 rounded-2xl ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
                >
                  {POSTURE_FILTER_TABS.map((tab) => {
                    const active = postureFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`dealcard-posture-tab-${tab.id}`}
                        onClick={() => onPostureFilterChange(tab.id)}
                        className={`min-h-[44px] px-2 py-1 rounded-xl text-sm font-semibold leading-snug break-keep text-center flex items-center justify-center transition-all cursor-pointer ${
                          active
                            ? "ios-segmented-pill bg-white text-[#0055D4]"
                            : "text-[#3A3A3C] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </>
            }
          />
        </>
      }
    >
      <div className="space-y-3" role={viewMode === "detailed" ? "list" : undefined}>
        {totalVisibleCount === 0 && searchQuery.trim() ? (
          <div
            data-testid="dealcard-empty-search"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              &lsquo;{searchQuery.trim()}&rsquo; 검색 결과와 일치하는 메모·딜카드가 없습니다.
            </p>
            <button
              type="button"
              data-testid="dealcard-clear-search-btn"
              onClick={() => onSearchChange("")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              검색어 지우기
            </button>
          </div>
        ) : totalVisibleCount === 0 && postureFilter !== "all" ? (
          <div
            data-testid="dealcard-empty-filter"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              선택한 유형의 딜카드가 아직 없습니다.
            </p>
            <button
              type="button"
              onClick={() => onPostureFilterChange("all")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              전체 보기
            </button>
          </div>
        ) : viewMode === "simple" ? (
          <>
            {simpleListEntries.length > 0 ? (
              <DateGroupedList
                items={simpleListEntries}
                getDate={(entry) =>
                  entry.kind === "memo"
                    ? entry.memo.updatedAt || entry.memo.createdAt
                    : (entry.item as BuildingListItem & { updatedAtIso?: string }).updatedAtIso ||
                      entry.item.updatedAt
                }
                getKey={(entry) => entry.key}
                renderRow={renderSimpleListRow}
                ariaLabel="내 딜카드 목록"
              />
            ) : (
              <p
                data-testid="dealcard-empty-simple"
                className="px-3 py-4 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-[#515154] text-center"
              >
                목록이 비어 있습니다.
              </p>
            )}
            {includeMemosInSimpleList && hiddenNonDealMemoCount > 0 && (
              <button
                type="button"
                data-testid="toggle-other-memos-btn"
                onClick={onToggleShowOtherMemos}
                className="w-full min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold transition cursor-pointer"
              >
                {showOtherMemos
                  ? "매수 조건·일정 메모 숨기기"
                  : `매수 조건·일정 메모 ${hiddenNonDealMemoCount}건 함께 보기`}
              </button>
            )}
          </>
        ) : (
          <>
            {(originGroupFilter === "all" || originGroupFilter === "ai_memo") && (
              <div
                data-testid="dealcard-group-section-ai_memo"
                className="space-y-2"
              >
                <button
                  type="button"
                  onClick={() => onToggleGroupCollapse("ai_memo")}
                  aria-expanded={!collapsedGroups.ai_memo}
                  className="w-full min-h-[44px] flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-[#1D1D1F] text-sm font-bold transition cursor-pointer"
                >
                  <span>AI 메모 생성 딜카드 ({aiMemoDealCards.length}건)</span>
                  <span>{collapsedGroups.ai_memo ? "▸" : "▾"}</span>
                </button>
                {!collapsedGroups.ai_memo &&
                  (aiMemoDealCards.length > 0 ? (
                    <div className="space-y-2.5">
                      {aiMemoDealCards.map((item) => renderDealCardRow(item))}
                    </div>
                  ) : (
                    originGroupFilter === "ai_memo" && (
                      <p className="px-3 py-4 rounded-2xl bg-white border border-slate-200 text-sm text-[#515154] text-center break-keep">
                        메모로 생성한 딜카드가 아직 없습니다.
                      </p>
                    )
                  ))}
              </div>
            )}

            {(originGroupFilter === "all" || originGroupFilter === "unconverted_memo") && (
              <div
                data-testid="dealcard-group-section-unconverted_memo"
                className="space-y-2"
              >
                <button
                  type="button"
                  onClick={() => onToggleGroupCollapse("unconverted_memo")}
                  aria-expanded={!collapsedGroups.unconverted_memo}
                  className="w-full min-h-[44px] flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-[#1D1D1F] text-sm font-bold transition cursor-pointer"
                >
                  <span>딜카드 미생성 메모 ({filteredUnconvertedMemos.length}건)</span>
                  <span>{collapsedGroups.unconverted_memo ? "▸" : "▾"}</span>
                </button>
                {!collapsedGroups.unconverted_memo && (
                  <div className="space-y-2">
                    {filteredUnconvertedMemos.length > 0 ? (
                      filteredUnconvertedMemos.map((memo) => renderUnconvertedMemoRow(memo))
                    ) : (
                      <p className="px-3 py-3 rounded-2xl bg-white border border-slate-200 text-sm text-[#515154] text-center break-keep">
                        보관 중인 미생성 매물 메모가 없습니다.
                      </p>
                    )}

                    {hiddenNonDealMemoCount > 0 && (
                      <button
                        type="button"
                        data-testid="toggle-other-memos-btn"
                        onClick={onToggleShowOtherMemos}
                        className="w-full min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition cursor-pointer"
                      >
                        {showOtherMemos
                          ? "매수 조건·일정 메모 숨기기"
                          : `매수 조건·일정 메모 ${hiddenNonDealMemoCount}건 함께 보기`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {(originGroupFilter === "all" || originGroupFilter === "manual") &&
              (originGroupFilter === "manual" || manualDealCards.length > 0) && (
                <div
                  data-testid="dealcard-group-section-manual"
                  className="space-y-2"
                >
                  <button
                    type="button"
                    onClick={() => onToggleGroupCollapse("manual")}
                    aria-expanded={!collapsedGroups.manual}
                    className="w-full min-h-[44px] flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-[#1D1D1F] text-sm font-bold transition cursor-pointer"
                  >
                    <span>직접 작성 딜카드 ({manualDealCards.length}건)</span>
                    <span>{collapsedGroups.manual ? "▸" : "▾"}</span>
                  </button>
                  {!collapsedGroups.manual &&
                    (manualDealCards.length > 0 ? (
                      <div className="space-y-2.5">
                        {manualDealCards.map((item) => renderDealCardRow(item))}
                      </div>
                    ) : (
                      <p className="px-3 py-4 rounded-2xl bg-white/80 border border-slate-200 text-sm text-[#515154] text-center break-keep">
                        메모 없이 직접 입력한 딜카드가 아직 없습니다.
                      </p>
                    ))}
                </div>
              )}
          </>
        )}
      </div>
    </WorkspaceListPanel>
  );
}
