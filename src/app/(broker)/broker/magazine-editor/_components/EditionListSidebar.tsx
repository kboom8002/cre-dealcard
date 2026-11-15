"use client";

import React, { useMemo } from "react";
import { FilePlus2, Search, Trash2 } from "lucide-react";
import {
  DateGroupedList,
  ListThumbnail,
  ListToolbar,
  SimpleListRow,
  WorkspaceListPanel,
  type ActiveFilterChip,
} from "@/components/workspace/list/WorkspaceList";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import {
  NEWSLETTER_CADENCES,
  NEWSLETTER_CADENCE_META,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import type { SavedEditionSummary } from "./magazine-workspace-types";

export function editionCadenceLabelOf(ed: SavedEditionSummary): string {
  return ed.cadence === "special"
    ? "호외"
    : NEWSLETTER_CADENCE_META[ed.cadence ?? "monthly"].label;
}

export function editionDisplayTitle(ed: SavedEditionSummary): string {
  return ed.title || `${ed.slug} 뉴스레터`;
}

export function editionListDate(ed: SavedEditionSummary): string | null {
  return ed.issueDate || ed.publishedAt || ed.updatedAt || null;
}

export interface EditionListSidebarProps {
  editions: SavedEditionSummary[];
  editionId: string | null;
  cadence: NewsletterCadence;
  yearMonthLabel: string;
  editionCadenceFilter: NewsletterCadence | "special" | "all";
  onChangeEditionCadenceFilter: (next: NewsletterCadence | "special" | "all") => void;
  editionStatusFilter: "all" | "draft" | "published";
  onChangeEditionStatusFilter: (next: "all" | "draft" | "published") => void;
  editionSearchQuery: string;
  onChangeEditionSearchQuery: (q: string) => void;
  listViewMode: ListViewMode;
  onChangeListViewMode: (mode: ListViewMode) => void;
  onStartNewThisMonth: () => void;
  onChangeCadence: (next: NewsletterCadence) => void;
  onSelectExistingEdition: (ed: SavedEditionSummary) => void;
  onDuplicateEdition: (
    ed: SavedEditionSummary,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onRequestDeleteEdition: (
    ed: SavedEditionSummary,
    e?: React.MouseEvent<HTMLButtonElement>,
  ) => void;
}

export function EditionListSidebar({
  editions,
  editionId,
  cadence,
  yearMonthLabel,
  editionCadenceFilter,
  onChangeEditionCadenceFilter,
  editionStatusFilter,
  onChangeEditionStatusFilter,
  editionSearchQuery,
  onChangeEditionSearchQuery,
  listViewMode,
  onChangeListViewMode,
  onStartNewThisMonth,
  onChangeCadence,
  onSelectExistingEdition,
  onDuplicateEdition,
  onRequestDeleteEdition,
}: EditionListSidebarProps) {
  const cadenceMeta = NEWSLETTER_CADENCE_META[cadence];

  const cadenceCounts = NEWSLETTER_CADENCES.reduce<Record<NewsletterCadence, number>>(
    (acc, key) => {
      acc[key] = editions.filter((e) => (e.cadence ?? "monthly") === key).length;
      return acc;
    },
    { daily: 0, weekly: 0, monthly: 0 },
  );
  const specialCount = editions.filter((e) => e.cadence === "special").length;

  const visibleEditions = useMemo(() => {
    const trimmedSearch = editionSearchQuery.trim().toLowerCase();
    return editions.filter((e) => {
      if (
        editionCadenceFilter !== "all" &&
        (e.cadence ?? "monthly") !== editionCadenceFilter
      ) {
        return false;
      }
      if (editionStatusFilter === "published" && e.status !== "published") {
        return false;
      }
      if (editionStatusFilter === "draft" && e.status === "published") {
        return false;
      }
      if (trimmedSearch) {
        const haystack = `${e.title} ${e.slug} ${e.issueDate ?? ""}`.toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });
  }, [editions, editionCadenceFilter, editionStatusFilter, editionSearchQuery]);

  const filterTabs: Array<{ key: NewsletterCadence | "special" | "all"; label: string }> = [
    { key: "all", label: `전체 (${editions.length})` },
    ...NEWSLETTER_CADENCES.map((key) => ({
      key,
      label: `${NEWSLETTER_CADENCE_META[key].label} (${cadenceCounts[key]})`,
    })),
    ...(specialCount > 0 ? [{ key: "special" as const, label: `호외 (${specialCount})` }] : []),
  ];

  const editionActiveFilters: ActiveFilterChip[] = [];
  if (editionStatusFilter !== "all") {
    editionActiveFilters.push({
      key: "status",
      label: `상태: ${editionStatusFilter === "published" ? "발행됨" : "작성 중"}`,
      onClear: () => onChangeEditionStatusFilter("all"),
    });
  }
  if (editionCadenceFilter !== "all") {
    editionActiveFilters.push({
      key: "cadence",
      label: `주기: ${
        editionCadenceFilter === "special"
          ? "호외"
          : NEWSLETTER_CADENCE_META[editionCadenceFilter].label
      }`,
      onClear: () => onChangeEditionCadenceFilter("all"),
    });
  }

  const editionEmptyState =
    visibleEditions.length === 0 ? (
      <p className="text-sm font-medium text-slate-600 py-2 px-1">
        {editions.length === 0
          ? `아직 발행한 이전 호가 없습니다. ${cadenceMeta.periodWord} 첫 ${cadenceMeta.label} 뉴스레터를 시작해 보세요.`
          : "검색 조건에 맞는 뉴스레터가 없습니다."}
      </p>
    ) : null;

  return (
    <WorkspaceListPanel
      testId="magazine-list-slot"
      className="text-slate-900"
      bodyLabel={<>지난 뉴스레터 {visibleEditions.length}건</>}
      controls={
        <>
          <button
            type="button"
            data-testid="new-newsletter-btn"
            onClick={onStartNewThisMonth}
            className="w-full min-h-[48px] rounded-xl bg-blue-700 px-4 py-2.5 text-base font-extrabold text-white shadow-xs transition hover:bg-blue-800 flex items-center justify-center gap-2"
          >
            <FilePlus2 className="h-5 w-5" aria-hidden="true" />
            <span>{cadenceMeta.newButtonLabel}</span>
          </button>
          <h2
            data-testid="current-issue-label"
            className="truncate px-1 text-sm font-bold text-slate-600"
          >
            {yearMonthLabel} 뉴스레터
          </h2>

          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-bold text-slate-700">
              발행 주기
            </span>
            <div
              role="radiogroup"
              aria-label="뉴스레터 발행 주기 선택"
              data-testid="quickstart-cadence-selector"
              className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5"
            >
              {NEWSLETTER_CADENCES.map((key) => {
                const meta = NEWSLETTER_CADENCE_META[key];
                const selected = cadence === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`quickstart-cadence-${key}`}
                    onClick={() => onChangeCadence(key)}
                    className={`min-h-[44px] rounded-lg px-2 py-1.5 text-sm font-extrabold whitespace-nowrap transition ${
                      selected
                        ? "bg-blue-700 text-white shadow-xs"
                        : "bg-transparent text-slate-700 hover:bg-white"
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={editionSearchQuery}
              onChange={(e) => onChangeEditionSearchQuery(e.target.value)}
              placeholder="제목 또는 날짜 검색..."
              aria-label="이전 호 제목 또는 날짜 검색"
              data-testid="edition-search-input"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <ListToolbar
            viewMode={listViewMode}
            onViewModeChange={onChangeListViewMode}
            activeFilters={editionActiveFilters}
            filterPanel={
              <>
                <div className="space-y-1">
                  <p className="px-0.5 text-sm font-bold text-slate-600">상태</p>
                  <div
                    role="group"
                    aria-label="발행 상태별 보기"
                    className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
                  >
                    {(
                      [
                        { key: "all", label: "전체" },
                        { key: "draft", label: "작성 중" },
                        { key: "published", label: "발행됨" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        data-testid={`edition-status-filter-${st.key}`}
                        aria-pressed={editionStatusFilter === st.key}
                        onClick={() => onChangeEditionStatusFilter(st.key)}
                        className={`min-h-[40px] rounded-lg px-2 py-1 text-sm font-bold transition ${
                          editionStatusFilter === st.key
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="px-0.5 text-sm font-bold text-slate-600">주기</p>
                  <div
                    role="tablist"
                    aria-label="이전 호 주기별 보기"
                    className="flex flex-wrap gap-1.5"
                  >
                    {filterTabs.map((tab) => {
                      const activeFilter = editionCadenceFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={activeFilter}
                          data-testid={`edition-filter-${tab.key}`}
                          data-active-pill={activeFilter ? "true" : undefined}
                          onClick={() => onChangeEditionCadenceFilter(tab.key)}
                          style={
                            activeFilter
                              ? { backgroundColor: "#1D4ED8", color: "#FFFFFF" }
                              : { backgroundColor: "#F1F5F9", color: "#334155" }
                          }
                          className={`min-h-[40px] rounded-lg px-2.5 py-1 text-sm font-bold transition ${
                            activeFilter
                              ? "bg-blue-700 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            }
          />
        </>
      }
    >
      {editionEmptyState ??
        (listViewMode === "simple" ? (
          <DateGroupedList
            items={visibleEditions}
            getDate={editionListDate}
            getKey={(ed) => ed.id}
            ariaLabel="지난 뉴스레터"
            renderRow={(ed) => (
              <SimpleListRow
                testId={`magazine-edition-item-${ed.id}`}
                title={editionDisplayTitle(ed)}
                date={editionListDate(ed)}
                status={
                  ed.status === "published"
                    ? { label: "발행됨", tone: "sent" }
                    : { label: "작성 중", tone: "draft" }
                }
                meta={
                  <span data-testid={`edition-cadence-badge-${ed.id}`}>
                    {editionCadenceLabelOf(ed)}
                  </span>
                }
                selected={editionId === ed.id}
                onSelect={() => onSelectExistingEdition(ed)}
              />
            )}
          />
        ) : (
          <ul className="space-y-2" role="list">
            {visibleEditions.map((ed) => {
              const isCurrent = editionId === ed.id;
              const edCadenceLabel = editionCadenceLabelOf(ed);
              return (
                <li key={ed.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid={`magazine-edition-item-${ed.id}`}
                    data-selected={isCurrent ? "true" : "false"}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => onSelectExistingEdition(ed)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectExistingEdition(ed);
                      }
                    }}
                    className={`w-full min-h-[48px] rounded-xl border p-3 text-left transition flex items-start gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isCurrent
                        ? "border-blue-600 bg-blue-50/70 text-slate-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <ListThumbnail
                      fallbackText={edCadenceLabel}
                      alt={`${editionDisplayTitle(ed)} 표지`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900 truncate">
                          {editionDisplayTitle(ed)}
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                          {ed.status === "published" ? "발행됨" : "작성 중"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-600 truncate">
                          <span
                            data-testid={`edition-cadence-badge-${ed.id}`}
                            className="mr-1 rounded bg-blue-50 px-1.5 py-0.5 text-sm font-extrabold text-blue-800"
                          >
                            {edCadenceLabel}
                          </span>
                          {ed.slug} · 추천 매물 {ed.dealCount}건
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-testid={`edition-duplicate-btn-${ed.id}`}
                            aria-label={`${ed.title || ed.slug} 복제`}
                            onClick={(e) => onDuplicateEdition(ed, e)}
                            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-bold text-slate-700 hover:bg-slate-100"
                          >
                            복제
                          </button>
                          <button
                            type="button"
                            data-testid={`edition-delete-btn-${ed.id}`}
                            aria-label={`${ed.title || ed.slug} 삭제`}
                            onClick={(e) => onRequestDeleteEdition(ed, e)}
                            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2.5 py-1 text-sm font-bold text-rose-800 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>삭제</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </WorkspaceListPanel>
  );
}
