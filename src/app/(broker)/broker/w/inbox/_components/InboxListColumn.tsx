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
  formatClientRoleLabel,
  formatPhoneKo,
  getInboxStatusBadge,
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
  onFilterChange: (next: InboxFilterType) => void;
  onSearchChange: (nextQuery: string) => void;
  onViewModeChange: (nextMode: ListViewMode) => void;
  onSelectThread: (nextId: string) => void;
  onApproveAndSendIm: (thread: InboxThreadItem) => void;
  onOpenNewClientModal: () => void;
  onOpenBulkImportModal: () => void;
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
  busyAction,
  onFilterChange,
  onSearchChange,
  onViewModeChange,
  onSelectThread,
  onApproveAndSendIm,
  onOpenNewClientModal,
  onOpenBulkImportModal,
}: InboxListColumnProps) {
  const listControls = (
    <>
      {/* 한 줄 할 일 막대: 누르면 '할 일' 필터 적용 */}
      <div
        data-testid="inbox-todo-summary-card"
        className="flex min-h-[48px] flex-wrap items-center gap-2 rounded-xl border border-[#FF9500]/35 bg-[#FFF4E5] px-2.5 py-1"
      >
        <button
          type="button"
          data-testid="inbox-todo-summary-filter-btn"
          onClick={() => onFilterChange("todo")}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-1 text-base font-bold text-[#8A4B00] cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
        >
          <span aria-hidden="true">🔔</span>
          <span>지금 할 일 {pendingCount}건</span>
          <span aria-hidden="true">›</span>
        </button>
        {firstPendingThread && (
          <div
            key={`todo-quick-${firstPendingThread.id}`}
            role="button"
            tabIndex={0}
            data-testid={`quick-todo-card-${firstPendingThread.id}`}
            onClick={() => onSelectThread(firstPendingThread.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectThread(firstPendingThread.id);
              }
            }}
            className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            <span
              title={firstPendingThread.clientName}
              className="min-w-0 truncate text-sm font-bold text-[#1D1D1F]"
            >
              {firstPendingThread.clientName}
            </span>
            <button
              type="button"
              data-testid={`quick-approve-btn-${firstPendingThread.id}`}
              disabled={Boolean(busyAction)}
              onClick={(e) => {
                e.stopPropagation();
                onApproveAndSendIm(firstPendingThread);
              }}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#24B63E] to-[#188C2C] px-3 py-1.5 text-sm font-bold text-white shadow-[0_2px_6px_rgba(29,158,52,0.22)] transition hover:brightness-105 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              자료 보내기
            </button>
          </div>
        )}
      </div>

      {/* 1열 기본 필터 탭 3개: 할 일 · 열람 · 전체 고객 (IB-12 — iOS Segmented Control) */}
      <div
        role="tablist"
        aria-label="고객 소통함 필터"
        data-testid="inbox-filter-tabs"
        className="flex flex-wrap gap-1 rounded-2xl border border-white/60 ios-segmented-track bg-[#767680]/[0.11] p-1"
      >
        {(
          [
            { key: "todo", label: "할 일" },
            { key: "views", label: "열람" },
            { key: "all", label: "전체 고객" },
          ] as const
        ).map((flt) => {
          const isSelected =
            activeFilter === flt.key ||
            (flt.key === "views" && activeFilter === "viewed") ||
            (flt.key === "all" &&
              (activeFilter === "vip" ||
                activeFilter === "buyer" ||
                activeFilter === "seller" ||
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
              className={`min-h-[44px] flex-1 min-w-[78px] rounded-xl px-2 py-2 text-sm font-semibold leading-snug break-keep text-center transition-all cursor-pointer ${
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

      {/* 구조화 CRM 세부 필터 칩: 전체 · ⭐ VIP · 매수 · 매도 · 이메일 가능 */}
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
                  ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {chip.label}
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
          placeholder="고객명, 연락처, 회사명, 매물 검색"
          className="min-h-[48px] w-full rounded-2xl border border-slate-900/[0.12] bg-white px-3.5 py-2.5 text-base text-[#1D1D1F] focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 focus:outline-none transition-all"
        />
      </div>

      {/* 상단 고객 등록 액션 바 (직접 등록 + 3-Way 엑셀·명단 대량 등록) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenBulkImportModal}
          data-testid="inbox-open-bulk-import-btn"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-950 whitespace-nowrap transition-colors hover:bg-blue-100 cursor-pointer"
        >
          📋 엑셀·명단 대량 등록
        </button>
        <button
          type="button"
          onClick={onOpenNewClientModal}
          data-testid="open-new-client-modal-btn"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#1D1D1F] whitespace-nowrap transition-colors hover:bg-slate-50 cursor-pointer"
        >
          + 고객 직접 등록
        </button>
      </div>

      <ListToolbar viewMode={viewMode} onViewModeChange={onViewModeChange} />
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
              {activeFilter === "todo"
                ? "현재 대기 중인 할 일이 없습니다."
                : "선택한 조건에 맞는 고객이 없습니다."}
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
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
            getDate={(item) => item.updatedAt}
            getKey={(item) => item.id}
            ariaLabel="고객 목록"
            renderRow={(item) => {
              const statusBadge = getInboxStatusBadge(item);
              return (
                <SimpleListRow
                  testId={`inbox-thread-row-${item.id}`}
                  title={item.clientName}
                  date={item.updatedAt}
                  status={{ label: statusBadge.text, tone: statusBadge.tone }}
                  meta={item.buildingTitle}
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
            const statusBadge = getInboxStatusBadge(item);
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
                    fallbackText={item.clientName.slice(0, 2)}
                    alt={`${item.clientName} 고객`}
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
                          {item.clientName}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {item.id.startsWith("sub_") && item.clientPhone
                          ? `${formatPhoneKo(item.clientPhone)} · ${item.buildingTitle}`
                          : item.buildingTitle}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">
                        {item.latestEvent}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-slate-500 whitespace-nowrap">
                      {formatListDate(item.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </WorkspaceListPanel>
  );
}
