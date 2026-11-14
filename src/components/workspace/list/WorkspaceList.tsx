"use client";

import React, { useId, useState } from "react";
import type { ListViewMode } from "./useListViewMode";
import {
  formatListDate,
  groupItemsByListDate,
  type ListDateValue,
} from "@/lib/workspace/list-date";

/* ─────────────────────────────────────────────────────────────────────────────
 * Shared left-list primitives for the 4 broker workspaces.
 * Layout: [WorkspaceListPanel] = sticky white control zone + gray list body.
 * ───────────────────────────────────────────────────────────────────────────── */

export interface WorkspaceListPanelProps {
  /** Root testid (keeps legacy contracts such as "im-list-slot") */
  testId?: string;
  /** Sticky control zone content (primary button, search, toolbar) */
  controls: React.ReactNode;
  /** List body header label, e.g. "목록 12건" */
  bodyLabel?: React.ReactNode;
  /** Optional right side of the body header (e.g. "최신순") */
  bodyLabelRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Cancels WorkspaceShell's list padding (p-3) so the control zone spans edge to edge,
 * then renders a solid white sticky control zone and a gray list body underneath.
 */
export function WorkspaceListPanel({
  testId,
  controls,
  bodyLabel,
  bodyLabelRight,
  children,
  className = "",
}: WorkspaceListPanelProps) {
  return (
    <div data-testid={testId} className={`-m-3 flex min-h-full flex-col ${className}`}>
      <div
        data-testid="ws-list-control-zone"
        className="sticky -top-3 z-10 space-y-2.5 border-b-2 border-slate-300 bg-white px-3 pb-3 pt-3 shadow-[0_8px_14px_-10px_rgba(15,23,42,0.28)]"
      >
        {controls}
      </div>
      <div data-testid="ws-list-body" className="flex-1 bg-[#F2F2F7] px-3 pb-6 pt-2.5">
        {(bodyLabel || bodyLabelRight) && (
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
            <span
              data-testid="ws-list-body-label"
              className="text-sm font-bold text-[#3A3A3C]"
            >
              {bodyLabel}
            </span>
            {bodyLabelRight ? (
              <span className="text-sm font-semibold text-[#6E6E73]">{bodyLabelRight}</span>
            ) : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── 보기 전환 (간단히 | 자세히) ─────────────────────────────────────────── */

export interface ListViewToggleProps {
  mode: ListViewMode;
  onChange: (next: ListViewMode) => void;
}

export function ListViewToggle({ mode, onChange }: ListViewToggleProps) {
  const options: Array<{ id: ListViewMode; label: string }> = [
    { id: "simple", label: "간단히" },
    { id: "detailed", label: "자세히" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold text-[#3A3A3C] whitespace-nowrap">보기</span>
      <div
        role="group"
        aria-label="목록 보기 방식"
        data-testid="ws-list-view-toggle"
        className="inline-flex items-center rounded-xl border border-slate-300 bg-slate-100 p-0.5"
      >
        {options.map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              data-testid={`ws-list-view-${opt.id}`}
              onClick={() => onChange(opt.id)}
              className={`min-h-[44px] rounded-[10px] px-3 text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? "bg-white text-[#0040DD] shadow-[0_1px_3px_rgba(15,23,42,0.18)]"
                  : "text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 툴바: 보기 전환 + 필터 접기 + 활성 필터 칩 ─────────────────────────── */

export interface ActiveFilterChip {
  key: string;
  label: string;
  onClear: () => void;
}

export interface ListToolbarProps {
  viewMode: ListViewMode;
  onViewModeChange: (next: ListViewMode) => void;
  /** Filter panel content. Always mounted (hidden when folded) to keep tab testids queryable. */
  filterPanel?: React.ReactNode;
  /** Active (non-default) filters shown as removable chips */
  activeFilters?: ActiveFilterChip[];
  /** Extra element placed at the right of the toolbar row (e.g. 발행 주기 선택) */
  extra?: React.ReactNode;
  /** Filter button label (default "필터") */
  filterLabel?: string;
}

export function ListToolbar({
  viewMode,
  onViewModeChange,
  filterPanel,
  activeFilters = [],
  extra,
  filterLabel = "필터",
}: ListToolbarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activeCount = activeFilters.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListViewToggle mode={viewMode} onChange={onViewModeChange} />
        <div className="flex items-center gap-1.5">
          {extra}
          {filterPanel ? (
            <button
              type="button"
              data-testid="ws-list-filter-toggle"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-xl border px-3 text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                open || activeCount > 0
                  ? "border-[#007AFF] bg-[#EAF3FF] text-[#0040DD]"
                  : "border-slate-300 bg-white text-[#1D1D1F] hover:bg-slate-50"
              }`}
            >
              <span>{filterLabel}</span>
              {activeCount > 0 ? (
                <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#007AFF] px-1.5 text-sm font-bold text-white">
                  {activeCount}
                </span>
              ) : null}
              <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </button>
          ) : null}
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="ws-list-active-filters">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              data-testid={`ws-list-active-filter-${f.key}`}
              onClick={f.onClear}
              aria-label={`${f.label} 필터 해제`}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#007AFF]/30 bg-[#EAF3FF] px-3 text-sm font-semibold text-[#0040DD] cursor-pointer hover:bg-[#DCEBFF]"
            >
              <span>{f.label}</span>
              <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}

      {filterPanel ? (
        <div
          id={panelId}
          data-testid="ws-list-filter-panel"
          hidden={!open}
          className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
        >
          {filterPanel}
        </div>
      ) : null}
    </div>
  );
}

/* ── 간단히 보기 행 ─────────────────────────────────────────────────────── */

export type ListStatusTone = "draft" | "ready" | "sent" | "warn" | "action" | "muted";

const TONE_STYLES: Record<ListStatusTone, { text: string; dot: string; mark: string }> = {
  draft: { text: "text-[#515154]", dot: "border-2 border-[#8E8E93] bg-transparent", mark: "" },
  ready: { text: "text-[#0040DD]", dot: "bg-[#007AFF]", mark: "" },
  sent: { text: "text-[#116B22]", dot: "bg-[#28A745]", mark: "" },
  warn: { text: "text-[#C8102E]", dot: "bg-[#FF2D55]", mark: "▲ " },
  action: { text: "text-[#8A4B00]", dot: "bg-[#FF9500]", mark: "" },
  muted: { text: "text-[#6E6E73]", dot: "bg-[#C7C7CC]", mark: "" },
};

export interface SimpleListRowStatus {
  label: string;
  tone: ListStatusTone;
  testId?: string;
  title?: string;
}

export interface SimpleListRowProps {
  /** Row testid — MUST keep legacy prefixes (dealcard-item- / im-item- / inbox-thread-row- / magazine-edition-item-) */
  testId: string;
  title: string;
  date: ListDateValue;
  status?: SimpleListRowStatus;
  /** Small extra text after the status (e.g. "주간", "잠원권역 근생빌딩") */
  meta?: React.ReactNode;
  selected?: boolean;
  onSelect: () => void;
  /** Extra data-* attributes preserved for tests/analytics */
  dataAttrs?: Record<string, string>;
  /** Override the "now" used for date formatting (tests) */
  now?: Date;
}

export function SimpleListRow({
  testId,
  title,
  date,
  status,
  meta,
  selected = false,
  onSelect,
  dataAttrs,
  now,
}: SimpleListRowProps) {
  const tone = status ? TONE_STYLES[status.tone] : null;
  const dateLabel = formatListDate(date, now);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={testId}
      data-list-row="simple"
      data-selected={selected ? "true" : "false"}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      {...(dataAttrs || {})}
      className={`relative flex min-h-[3.5rem] cursor-pointer flex-col justify-center gap-0.5 overflow-hidden rounded-xl border py-2.5 pl-4 pr-3 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#007AFF]/60 ${
        selected
          ? "border-[#007AFF] bg-[#EAF3FF] shadow-[0_2px_8px_rgba(0,122,255,0.16)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-[#FAFAFC]"
      }`}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[#007AFF]" />
      )}
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span
          data-single-line-title="true"
          title={title}
          className={`ws-simple-row-title min-w-0 flex-1 truncate text-base font-bold break-keep ${
            selected ? "text-[#0040DD]" : "text-[#1D1D1F]"
          }`}
        >
          {selected && (
            <span aria-hidden="true" className="mr-1">
              ✓
            </span>
          )}
          {selected && <span className="sr-only">선택됨: </span>}
          {title}
        </span>
        <span
          data-testid={`${testId}-date`}
          className="shrink-0 text-sm font-semibold tabular-nums text-[#6E6E73] whitespace-nowrap"
        >
          {dateLabel}
        </span>
      </div>
      {(status || meta) && (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {status && tone && (
            <span
              data-testid={status.testId}
              title={status.title}
              className={`inline-flex shrink-0 items-center gap-1.5 font-semibold ${tone.text}`}
            >
              <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              <span>
                {tone.mark}
                {status.label}
              </span>
            </span>
          )}
          {status && meta ? (
            <span aria-hidden="true" className="text-[#AEAEB2]">
              ·
            </span>
          ) : null}
          {meta ? <span className="min-w-0 truncate text-[#6E6E73]">{meta}</span> : null}
        </div>
      )}
    </div>
  );
}

/* ── 날짜 묶음 목록 ─────────────────────────────────────────────────────── */

export interface DateGroupedListProps<T> {
  items: readonly T[];
  getDate: (item: T) => ListDateValue;
  getKey: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  /** Optional override of "now" (tests) */
  now?: Date;
  ariaLabel?: string;
}

export function DateGroupedList<T>({
  items,
  getDate,
  getKey,
  renderRow,
  now,
  ariaLabel = "목록",
}: DateGroupedListProps<T>) {
  const groups = groupItemsByListDate(items, getDate, now);
  return (
    <div data-testid="ws-date-grouped-list" className="space-y-3">
      {groups.map((g) => (
        <section key={g.bucket} aria-label={`${g.label} ${g.items.length}건`}>
          <h4
            data-testid={`ws-date-group-${g.bucket}`}
            className="px-1 pb-1.5 text-sm font-bold text-[#6E6E73]"
          >
            {g.label}
            <span className="ml-1 font-semibold text-[#8E8E93]">{g.items.length}</span>
          </h4>
          <div role="list" aria-label={`${ariaLabel} · ${g.label}`} className="space-y-1.5">
            {g.items.map((item) => (
              <div role="listitem" key={getKey(item)}>
                {renderRow(item)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── 자세히 보기 썸네일 ─────────────────────────────────────────────────── */

export interface ListThumbnailProps {
  src?: string | null;
  /** 1~2 characters shown when there is no image (e.g. "서교") */
  fallbackText: string;
  alt: string;
}

export function ListThumbnail({ src, fallbackText, alt }: ListThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;
  return (
    <div
      data-testid="ws-list-thumbnail"
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="text-sm font-bold text-[#3A3A3C] break-keep text-center leading-tight px-1">
          {fallbackText.slice(0, 2) || "·"}
        </span>
      )}
    </div>
  );
}

/* ── 선택 항목 작업 막대 (간단히 보기 전용: 복제 · 삭제를 행에서 편집 화면으로 이동) ── */

export interface SelectedItemActionsProps {
  /** e.g. "서교동 근생빌딩" */
  itemLabel: string;
  onDuplicate?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  duplicateLabel?: string;
  deleteLabel?: string;
}

export function SelectedItemActions({
  itemLabel,
  onDuplicate,
  onDelete,
  duplicateLabel = "복제하기",
  deleteLabel = "삭제하기",
}: SelectedItemActionsProps) {
  if (!onDuplicate && !onDelete) return null;
  return (
    <div
      data-testid="ws-selected-item-actions"
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <span className="sr-only">{itemLabel} 작업</span>
      {onDuplicate && (
        <button
          type="button"
          data-testid="ws-selected-duplicate-btn"
          onClick={onDuplicate}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-[#1D1D1F] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
        >
          {duplicateLabel}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          data-testid="ws-selected-delete-btn"
          onClick={onDelete}
          className="min-h-[44px] rounded-xl border border-[#FF2D55]/30 bg-[#FF2D55]/[0.06] px-3.5 text-sm font-bold text-[#C8102E] hover:bg-[#FF2D55]/[0.12] cursor-pointer whitespace-nowrap"
        >
          {deleteLabel}
        </button>
      )}
    </div>
  );
}
