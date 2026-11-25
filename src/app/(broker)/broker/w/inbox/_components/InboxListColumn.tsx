"use client";

import React from "react";
import {
  WorkspaceListPanel,
  ListToolbar,
  SimpleListRow,
  DateGroupedList,
  ListThumbnail,
} from "@/components/workspace/list/WorkspaceList";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  type InboxFilterType,
  type InboxThreadItem,
  computePriorityContactSignal,
  formatClientRoleLabel,
  formatPhoneKo,
  getInboxStatusBadge,
  getInboxThreadDisplayTitle,
  isAnonymousViewerThread,
  isPriorityHotThread,
  isValidCallPhone,
  matchesInboxThreadFilter,
} from "./inbox-types";

export interface InboxListColumnProps {
  threads: InboxThreadItem[];
  filteredThreads: InboxThreadItem[];
  pendingCount: number;
  firstPendingThread?: InboxThreadItem;
  activeThread: InboxThreadItem | null;
  activeFilter: InboxFilterType;
  searchQuery: string;
  viewMode: ListViewMode;
  busyAction: string | null;
  hotOnly?: boolean;
  onToggleHotOnly?: () => void;
  onFilterChange: (next: InboxFilterType) => void;
  onSearchChange: (nextQuery: string) => void;
  onViewModeChange: (nextMode: ListViewMode) => void;
  onSelectThread: (nextId: string) => void;
  onApproveAndSendIm?: (thread: InboxThreadItem) => void;
  onOpenNewClientModal: () => void;
  onOpenBulkImportModal: () => void;
  hasMoreClients?: boolean;
  loadingMoreClients?: boolean;
  totalClientsCount?: number | null;
  onLoadMoreClients?: () => void;
  onQuickEditClient?: (thread: InboxThreadItem) => void;
  onQuickDeleteClient?: (thread: InboxThreadItem) => void;
  onQuickArchiveThread?: (thread: InboxThreadItem) => void;
}

const CRM_FILTER_CHIPS: ReadonlyArray<{
  key: InboxFilterType;
  label: string;
  testId: string;
}> = [
  { key: "all", label: "전체", testId: "inbox-crm-chip-all" },
  { key: "vip", label: "⭐ VIP", testId: "inbox-filter-chip-vip" },
  { key: "buyer", label: "매수", testId: "inbox-filter-chip-buyer" },
  { key: "seller", label: "매도", testId: "inbox-filter-chip-seller" },
  { key: "newsletter", label: "뉴스레터 구독", testId: "inbox-filter-chip-newsletter" },
  { key: "emailable", label: "이메일 가능", testId: "inbox-filter-chip-emailable" },
];

export function InboxListColumn({
  threads,
  filteredThreads,
  pendingCount,
  firstPendingThread,
  activeThread,
  activeFilter,
  searchQuery,
  viewMode,
  hotOnly = false,
  onToggleHotOnly,
  onFilterChange,
  onSearchChange,
  onViewModeChange,
  onSelectThread,
  onOpenNewClientModal,
  onOpenBulkImportModal,
  hasMoreClients = false,
  loadingMoreClients = false,
  onLoadMoreClients,
}: InboxListColumnProps) {
  const [mobileExtraOpen, setMobileExtraOpen] = React.useState(false);

  const allCount = threads.length;
  const registeredCount = threads.filter((t) => !isAnonymousViewerThread(t)).length;
  const anonymousCount = threads.filter((t) => isAnonymousViewerThread(t)).length;

  const baseTabThreads = threads.filter((t) =>
    matchesInboxThreadFilter(t, activeFilter, searchQuery)
  );
  const hotCount = baseTabThreads.filter((t) => isPriorityHotThread(t)).length;

  const activeCrmChip = CRM_FILTER_CHIPS.find(
    (c) => c.key !== "all" && c.key === activeFilter
  );
  const toolbarActiveFilters = activeCrmChip
    ? [
        {
          key: `crm-${activeCrmChip.key}`,
          label: activeCrmChip.label,
          onClear: () => onFilterChange("all"),
        },
      ]
    : [];

  const listControls = (
    <>
      {/* 1열 최상단 단일 [+ 고객 등록] 버튼 (모달에서 직접/엑셀 통합) */}
      <div>
        <button
          type="button"
          onClick={onOpenNewClientModal}
          data-testid="open-new-client-modal-btn"
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-base font-bold text-white shadow-xs transition-colors hover:bg-[#1E40AF] cursor-pointer whitespace-nowrap"
        >
          + 고객 등록
        </button>
      </div>

      {/* IM 승인 대기 알림 바 — 실제 승인 대기(pending_gate > 0)가 있을 때만 표시 (0건 모순 제거) */}
      {pendingCount > 0 && (
        <div
          data-testid="inbox-todo-summary-card"
          className="flex min-h-[48px] flex-col gap-1.5 rounded-xl border border-[#FF9500]/35 bg-[#FFF4E5] px-2.5 py-2"
        >
          <button
            type="button"
            data-testid="inbox-todo-summary-filter-btn"
            onClick={() => onFilterChange("todo")}
            className="inline-flex min-h-[44px] w-full items-center justify-between gap-1 rounded-lg px-1 text-base font-bold text-[#8A4B00] cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            <span className="inline-flex items-center gap-1 min-w-0 truncate">
              <span aria-hidden="true">🔔</span>
              <span>IM 승인 대기 {pendingCount}건</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          {firstPendingThread && (
            <div
              key={`todo-quick-${firstPendingThread.id}`}
              data-testid={`quick-todo-card-${firstPendingThread.id}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                onSelectThread(firstPendingThread.id);
              }}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg pt-1 border-t border-[#FF9500]/20"
            >
              <button
                type="button"
                onClick={() => onSelectThread(firstPendingThread.id)}
                title={
                  firstPendingThread.clientCompany?.trim()
                    ? `${firstPendingThread.clientName} (${firstPendingThread.clientCompany.trim()})`
                    : firstPendingThread.clientName
                }
                className="min-w-0 flex-1 min-h-[44px] truncate rounded-lg px-1 text-left text-sm font-bold text-[#1D1D1F] cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
              >
                {firstPendingThread.clientName}
                {firstPendingThread.clientCompany?.trim() ? (
                  <>
                    {" "}
                    <span className="font-extrabold text-indigo-950">
                      ({firstPendingThread.clientCompany.trim()})
                    </span>
                  </>
                ) : null}
              </button>
              <button
                type="button"
                data-testid={`quick-review-btn-${firstPendingThread.id}`}
                onClick={() => onSelectThread(firstPendingThread.id)}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm font-bold text-amber-950 shadow-2xs transition hover:bg-amber-50 cursor-pointer whitespace-nowrap"
              >
                확인·승인하기 ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* 1열 기본 3분할 탭: 전체 · 연락처 고객 · 익명 열람 */}
      <div
        role="tablist"
        aria-label="고객 소통함 분류"
        data-testid="inbox-filter-tabs"
        className="ios-segmented-track flex flex-wrap gap-1 rounded-[12px] border border-white/60 bg-[#767680]/[0.11] p-[3px] overflow-hidden"
      >
        {(
          [
            { key: "all", label: `전체 (${allCount})` },
            { key: "registered", label: `연락처 고객 (${registeredCount})` },
            { key: "anonymous", label: `익명 열람 (${anonymousCount})` },
          ] as const
        ).map((flt) => {
          const isSelected =
            activeFilter === flt.key ||
            (flt.key === "anonymous" &&
              (activeFilter === "views" || activeFilter === "viewed")) ||
            (flt.key === "all" &&
              (activeFilter === "todo" ||
                activeFilter === "vip" ||
                activeFilter === "buyer" ||
                activeFilter === "seller" ||
                activeFilter === "newsletter" ||
                activeFilter === "emailable" ||
                activeFilter === "clients"));
          return (
            <button
              key={flt.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`inbox-filter-chip-${flt.key}`}
              onClick={() => onFilterChange(flt.key)}
              className={`min-h-[44px] flex-1 min-w-[78px] rounded-[9px] px-2 py-2 text-sm font-semibold leading-snug break-keep text-center transition-all cursor-pointer ${
                isSelected
                  ? "ios-segmented-pill bg-white text-[#007AFF]"
                  : "bg-transparent text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {flt.label}
            </button>
          );
        })}
      </div>

      {/* 검색창 */}
      <div>
        <label htmlFor="inbox-search-input" className="sr-only">
          고객명, 연락처, 회사명, 매물명 또는 상담 메모 검색
        </label>
        <input
          id="inbox-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="이름, 회사명, 연락처, 매물 검색"
          className="min-h-[48px] w-full rounded-2xl border border-slate-900/[0.12] bg-white px-3.5 py-2.5 text-base text-[#1D1D1F] focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 focus:outline-none transition-all"
        />
      </div>

      {/* 숫자 정합성 보장: 관심 높음 토글 칩 + 표시 건수 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid="inbox-hot-only-chip"
          aria-pressed={hotOnly}
          onClick={() => onToggleHotOnly?.()}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
            hotOnly
              ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
              : "border-slate-300 bg-white text-[#1D1D1F] hover:bg-slate-50"
          }`}
        >
          <span>관심 높음만 ({hotCount})</span>
        </button>
        <span
          data-testid="inbox-list-visible-count"
          className="text-sm font-semibold text-slate-600 whitespace-nowrap"
        >
          표시 {filteredThreads.length}건
        </span>
      </div>

      {/* 모바일(1024px 미만) 세부 필터 · 보기 전환 접이식 토글 */}
      <button
        type="button"
        data-testid="inbox-mobile-controls-toggle"
        aria-expanded={mobileExtraOpen}
        onClick={() => setMobileExtraOpen((prev) => !prev)}
        className="flex lg:hidden min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        <span className="min-w-0 text-left leading-snug break-keep">
          세부 필터 · 보기 방식
        </span>
        <span aria-hidden="true" className="shrink-0 whitespace-nowrap">
          {mobileExtraOpen ? "접기 ▲" : "열기 ▼"}
        </span>
      </button>

      {/* 접이식 필터(필터 ▾) + 간단히/자세히 보기 통일 */}
      <div className={mobileExtraOpen ? "block" : "hidden lg:block"}>
        <ListToolbar
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          activeFilters={toolbarActiveFilters}
          filterPanel={
            <div className="space-y-1.5">
              <p className="px-0.5 text-sm font-bold text-slate-600">고객 조건</p>
              <div
                role="group"
                aria-label="고객 조건 필터"
                data-testid="inbox-crm-filter-chips"
                className="flex flex-wrap items-center gap-1.5"
              >
                {CRM_FILTER_CHIPS.map((chip) => {
                  const isPressed = activeFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      aria-pressed={isPressed}
                      data-testid={chip.testId}
                      onClick={() => onFilterChange(chip.key)}
                      className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        isPressed
                          ? "border-blue-500 bg-blue-50/90 text-blue-950 shadow-2xs"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>
          }
        />
      </div>
    </>
  );

  return (
    <WorkspaceListPanel
      testId="inbox-list-slot"
      bodyLabel={<>목록 {filteredThreads.length}건</>}
      controls={listControls}
    >
      <div className="space-y-2">
        {threads.length === 0 ? (
          <div
            data-testid="inbox-empty-state"
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"
          >
            <p className="text-base font-bold text-slate-900">
              아직 도착한 요청이 없어요. 딜카드를 보내면 고객의 IM 요청이 여기에 모입니다.
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              관심 고객을 직접 등록하거나 엑셀·연락처 명단을 한 번에 불러와 맞춤 자료를 발송해 보세요.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onOpenNewClientModal}
                data-testid="empty-state-add-client-btn"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer"
              >
                + 고객 직접 등록
              </button>
              <button
                type="button"
                onClick={onOpenBulkImportModal}
                data-testid="inbox-empty-bulk-import-btn"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-base font-bold text-blue-950 shadow-2xs transition hover:bg-blue-100 cursor-pointer"
              >
                📋 엑셀·명단 대량 등록
              </button>
            </div>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-base font-semibold text-slate-800">
              {hotOnly
                ? "선택한 조건에서 관심 높음 고객이 없습니다."
                : activeFilter === "todo"
                ? "현재 승인 대기 중인 요청이 없습니다."
                : "선택한 조건에 맞는 고객이 없습니다."}
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                if (hotOnly && onToggleHotOnly) onToggleHotOnly();
                onFilterChange("all");
              }}
              className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              전체 고객 보기
            </button>
          </div>
        ) : viewMode === "simple" ? (
          <DateGroupedList
            items={filteredThreads}
            getDate={(item) => item.lastActivityAt || item.updatedAt}
            getKey={(item) => item.id}
            ariaLabel="고객 목록"
            renderRow={(item) => {
              const statusBadge = getInboxStatusBadge(item);
              const isAnon = isAnonymousViewerThread(item);
              const displayTitle = getInboxThreadDisplayTitle(item);
              const prioritySignal =
                item.gateStatus !== "pending" ? computePriorityContactSignal(item) : null;
              const cleanCompany = item.clientCompany?.trim() || "";
              const cleanEmail = !cleanCompany ? item.clientEmail?.trim() || "" : "";
              const trailingParts = isAnon
                ? [
                    "미등록 열람자",
                    item.openCount > 0 ? `${item.openCount}회 열람` : "",
                    prioritySignal?.isPriority ? "🔥 먼저 연락" : "",
                  ].filter(Boolean)
                : [
                    displayTitle !== item.buildingTitle ? item.buildingTitle : "",
                    cleanEmail,
                    prioritySignal?.isPriority ? "🔥 먼저 연락" : "",
                  ].filter(Boolean);
              const metaNode =
                cleanCompany || trailingParts.length > 0 ? (
                  <>
                    {!isAnon && cleanCompany ? (
                      <span className="font-bold text-indigo-900">
                        🏢 {cleanCompany}
                      </span>
                    ) : null}
                    {!isAnon && cleanCompany && trailingParts.length > 0 ? " · " : null}
                    {trailingParts.join(" · ")}
                  </>
                ) : undefined;
              return (
                <SimpleListRow
                  testId={`inbox-thread-row-${item.id}`}
                  title={displayTitle}
                  date={item.lastActivityAt || item.updatedAt}
                  status={{ label: statusBadge.text, tone: statusBadge.tone }}
                  meta={metaNode}
                  selected={activeThread?.id === item.id}
                  onSelect={() => onSelectThread(item.id)}
                  dataAttrs={{ "data-unread": item.isRead ? "false" : "true" }}
                />
              );
            }}
          />
        ) : (
          filteredThreads.map((item) => {
            const isSelected = activeThread?.id === item.id;
            const isAnon = isAnonymousViewerThread(item);
            const displayTitle = getInboxThreadDisplayTitle(item);
            const statusBadge = getInboxStatusBadge(item);
            const prioritySignal =
              item.gateStatus !== "pending" ? computePriorityContactSignal(item) : null;
            const showVipBadge = item.isVip === true || item.clientGrade === "VIP";
            const showRoleBadge =
              item.clientRole && item.clientRole !== "buyer" && !item.id.startsWith("view_");
            const showBounceBadge =
              item.emailDeliveryStatus === "bounced" ||
              item.emailDeliveryStatus === "complained";

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                data-selected={isSelected ? "true" : "false"}
                data-testid={`inbox-thread-row-${item.id}`}
                onClick={() => onSelectThread(item.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectThread(item.id);
                  }
                }}
                className={`rounded-xl border p-3.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/50 shadow-xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ListThumbnail
                    fallbackText={displayTitle.slice(0, 2)}
                    alt={`${displayTitle} 항목`}
                  />
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${statusBadge.cls}`}
                        >
                          {statusBadge.text}
                        </span>
                        {showVipBadge && (
                          <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-sm font-bold text-amber-900">
                            ⭐ VIP
                          </span>
                        )}
                        {prioritySignal?.isPriority && (
                          <span
                            data-testid={`inbox-priority-badge-${item.id}`}
                            className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-sm font-bold text-amber-900"
                          >
                            🔥 먼저 연락
                          </span>
                        )}
                        {showRoleBadge && (
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-800">
                            {formatClientRoleLabel(item.clientRole)}
                          </span>
                        )}
                        {showBounceBadge && (
                          <span className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-sm font-bold text-rose-900">
                            {item.emailDeliveryStatus === "complained"
                              ? "수신차단"
                              : "⚠️ 반송"}
                          </span>
                        )}
                        <span className="truncate text-base font-bold text-slate-900">
                          {displayTitle}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {isAnon
                          ? `미등록 열람자 · ${item.latestEvent}`
                          : item.id.startsWith("sub_") && isValidCallPhone(item.clientPhone)
                          ? `${formatPhoneKo(item.clientPhone)} · ${item.buildingTitle}`
                          : item.buildingTitle}
                      </p>
                      {!isAnon && (item.clientCompany?.trim() || item.clientEmail?.trim()) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                          {item.clientCompany?.trim() && (
                            <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-sm font-bold text-indigo-950">
                              🏢 {item.clientCompany.trim()}
                            </span>
                          )}
                          {item.clientEmail?.trim() && (
                            <span className="truncate text-sm font-medium text-slate-700">
                              {item.clientEmail.trim()}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">
                        {item.latestEvent}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="shrink-0 text-sm text-slate-500 whitespace-nowrap">
                        {formatListDate(item.lastActivityAt || item.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {hasMoreClients && onLoadMoreClients ? (
          <div className="pt-2">
            <button
              type="button"
              data-testid="inbox-load-more-clients"
              disabled={loadingMoreClients}
              onClick={onLoadMoreClients}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {loadingMoreClients ? "불러오는 중..." : "더 보기"}
            </button>
          </div>
        ) : null}
      </div>
    </WorkspaceListPanel>
  );
}
