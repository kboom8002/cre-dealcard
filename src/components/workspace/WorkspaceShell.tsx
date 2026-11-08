"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceBottomNav, DEFAULT_WORKSPACE_TABS } from "./WorkspaceBottomNav";
import { SAVE_STATE_LABELS, formatRelativeKo, type HonestSaveState } from "@/lib/ux/lexicon";

const COL_WIDTHS_STORAGE_KEY = "credeal-workspace-col-widths-v1";
const DEFAULT_LIST_WIDTH = 310;
const MIN_LIST_WIDTH = 220;
const MAX_LIST_WIDTH = 480;
const DEFAULT_PREVIEW_WIDTH = 390;
const MIN_PREVIEW_WIDTH = 300;
const MAX_PREVIEW_WIDTH = 600;

export interface WorkspaceShellProps {
  /** Current active workspace category */
  workspace: "dealcards" | "im" | "magazine" | "inbox" | "common";
  /** Header title for column 1 (default: '① 고르기') */
  listTitle?: string;
  /** Header title for column 2 (default: '② 채우기') */
  editorTitle?: string;
  /** Header title for column 3 (default: '③ 확인하고 보내기') */
  previewTitle?: string;
  /** Slot for Column 1: Item list & filters */
  listSlot?: React.ReactNode;
  /** Slot for Column 2: Main editor form */
  editorSlot?: React.ReactNode;
  /** Slot for Column 3: Real preview rendering */
  previewSlot?: React.ReactNode;
  /** Primary action button mounted at the bottom of Column 3 (56px).
   *  Also mirrored as a sticky bar under the editor when Column 3 is hidden (<1280px / mobile). */
  primaryActionSlot?: React.ReactNode;
  /** Save status badge shown in column 2 header. Prefer `saveState` (honest autosave state). */
  saveStatus?: React.ReactNode;
  /** Honest autosave state → rendered with SAVE_STATE_LABELS (overrides saveStatus when provided) */
  saveState?: HonestSaveState;
  /** Last successful save time (renders "저장됨 ✓ · 3분 전") */
  lastSavedAt?: Date | string | number | null;
  /** Retry handler shown when saveState === 'error' */
  onRetrySave?: () => void;
  /** Optional preview tab toggle buttons (e.g. '[카톡 | 받는 화면]') */
  previewTabSlot?: React.ReactNode;
  /** Optional active building ID override */
  selectedBuildingId?: string | null;
  /** Human-readable label of the selection (announced to screen readers instead of internal IDs) */
  selectedLabel?: string;
  /** Callback when user changes selection */
  onBuildingSelect?: (buildingId: string) => void;
  /** Count badges on top/bottom nav (e.g. { inbox: 3 } = 처리할 자료 요청 3건) */
  navBadges?: Partial<Record<"dealcards" | "im" | "magazine" | "inbox", number>>;
  /** Mobile editor/preview switch labels (default: 채우기 / 미리보기) */
  mobileTabLabels?: { editor: string; preview: string };
  /** Start mobile on the list even if a selection exists (default true when no explicit tab query) */
  mobileStartOnList?: boolean;
  /** Children fallback if editorSlot is omitted */
  children?: React.ReactNode;
}

export const WS_TOPBAR_LINKS = [
  { id: "home", label: "🏠 홈", href: "/broker" },
  { id: "dealcards", label: "📄 딜카드", href: "/broker/w/dealcards" },
  { id: "im", label: "📊 IM", href: "/broker/w/im" },
  { id: "magazine", label: "📰 뉴스레터", href: "/broker/magazine-editor" },
  { id: "inbox", label: "💬 소통함", href: "/broker/w/inbox" },
] as const;

/**
 * WP-P2-02 & WP-P2-06: 3-Column WorkspaceShell
 *
 * Implements the unified desktop 3-column workspace shell:
 * - ① 고르기 (280px-340px list column)
 * - ② 채우기 (min 540px editor column)
 * - ③ 확인하고 보내기 (360px-440px preview column)
 *
 * Features:
 * - Auto-collapses list column to a 72px icon rail below 1280px when editor is constrained.
 * - Collapses preview rail to toggle drawer below 1280px; collapses list below 1024px.
 * - Synchronizes URL query parameters (?buildingId=&tab=) across selections.
 * - Mobile push navigation below 1024px with 5-tab bottom navigation bar.
 */
export function WorkspaceShell({
  workspace,
  listTitle = "① 고르기",
  editorTitle = "② 채우기",
  previewTitle = "③ 확인하고 보내기",
  listSlot,
  editorSlot,
  previewSlot,
  primaryActionSlot,
  saveStatus,
  saveState,
  lastSavedAt,
  onRetrySave,
  previewTabSlot,
  selectedBuildingId,
  selectedLabel,
  onBuildingSelect,
  navBadges,
  mobileTabLabels = { editor: "채우기", preview: "미리보기" },
  mobileStartOnList = false,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State sync from URL query params (WP-P2-06)
  const queryBuildingId = searchParams.get("buildingId");
  const rawQueryTab = searchParams.get("tab");
  const queryTab = rawQueryTab || "editor";

  const activeBuildingId = selectedBuildingId ?? queryBuildingId;

  // Re-render every 30s so "3분 전" stays truthful
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!saveState) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [saveState]);

  // 소통함 "처리할 자료 요청" 배지 — 모든 작업공간 공통 (60초 폴링, 실패 시 조용히 숨김)
  const [inboxPending, setInboxPending] = useState<number>(0);
  useEffect(() => {
    if (navBadges?.inbox !== undefined) return;
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/broker/inbox/pending-count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.ok && typeof d.count === "number") setInboxPending(d.count);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [navBadges?.inbox]);
  const effectiveBadges: Partial<Record<"dealcards" | "im" | "magazine" | "inbox", number>> = {
    ...navBadges,
    inbox: navBadges?.inbox ?? (inboxPending > 0 ? inboxPending : undefined),
  };

  const renderedSaveStatus: React.ReactNode = saveState
    ? (() => {
        const base = SAVE_STATE_LABELS[saveState];
        if (!base) return null;
        const rel = saveState === "saved" ? formatRelativeKo(lastSavedAt ?? null) : "";
        const text = rel ? `${base} · ${rel}` : base;
        if (saveState === "error" && onRetrySave) {
          return (
            <button
              type="button"
              onClick={onRetrySave}
              className="underline decoration-2 underline-offset-2 text-rose-800 font-extrabold cursor-pointer"
            >
              {text}
            </button>
          );
        }
        return text;
      })()
    : saveStatus;
  const saveTone =
    saveState === "error" || saveState === "conflict" || saveState === "offline"
      ? "text-rose-800 bg-rose-50 border-rose-300"
      : saveState === "saving" || saveState === "dirty"
      ? "text-amber-900 bg-amber-50 border-amber-300"
      : "text-slate-700 bg-slate-100 border-slate-200";

  // Responsive layout state
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isListDrawerOpen, setIsListDrawerOpen] = useState(false);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor" | "preview">("list");
  const [ariaAnnouncement, setAriaAnnouncement] = useState("");

  // Draggable 3-column widths state (Req 7)
  const [listColWidth, setListColWidth] = useState<number>(DEFAULT_LIST_WIDTH);
  const [previewColWidth, setPreviewColWidth] = useState<number>(DEFAULT_PREVIEW_WIDTH);
  const [activeResizer, setActiveResizer] = useState<"left" | "right" | null>(null);
  const dragStateRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);

  // Load persisted column widths on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.listColWidth === "number") {
          setListColWidth(
            Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, parsed.listColWidth))
          );
        }
        if (typeof parsed?.previewColWidth === "number") {
          setPreviewColWidth(
            Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, parsed.previewColWidth))
          );
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const persistColumnWidths = useCallback((nextListW: number, nextPreviewW: number) => {
    try {
      window.localStorage.setItem(
        COL_WIDTHS_STORAGE_KEY,
        JSON.stringify({ listColWidth: nextListW, previewColWidth: nextPreviewW })
      );
    } catch {
      // ignore
    }
  }, []);


  const clampList = (w: number) => Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(w)));
  const clampPreview = (w: number) => Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, Math.round(w)));

  const handleStartResize = useCallback(
    (side: "left" | "right", e: React.MouseEvent | React.PointerEvent) => {
      e.preventDefault();
      if (side === "left" && isRailCollapsed) {
        setIsRailCollapsed(false);
      }
      const startWidth = side === "left" ? listColWidth : previewColWidth;
      dragStateRef.current = {
        side,
        startX: e.clientX,
        startWidth,
      };
      setActiveResizer(side);
    },
    [isRailCollapsed, listColWidth, previewColWidth]
  );

  const handleResetColumnWidth = useCallback(
    (side: "left" | "right") => {
      if (side === "left") {
        setIsRailCollapsed(false);
        setListColWidth(DEFAULT_LIST_WIDTH);
        persistColumnWidths(DEFAULT_LIST_WIDTH, previewColWidth);
      } else {
        setPreviewColWidth(DEFAULT_PREVIEW_WIDTH);
        persistColumnWidths(listColWidth, DEFAULT_PREVIEW_WIDTH);
      }
    },
    [listColWidth, previewColWidth, persistColumnWidths]
  );

  /** Keyboard resize: ←/→ 16px, Shift 48px, Home = 기본값 */
  const handleResizerKeyDown = useCallback(
    (side: "left" | "right", e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === "Home") {
        e.preventDefault();
        handleResetColumnWidth(side);
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (side === "left") {
        const next = clampList(listColWidth + dir * step);
        setIsRailCollapsed(false);
        setListColWidth(next);
        persistColumnWidths(next, previewColWidth);
      } else {
        // 오른쪽 손잡이를 오른쪽으로 옮기면 3열이 좁아진다
        const next = clampPreview(previewColWidth - dir * step);
        setPreviewColWidth(next);
        persistColumnWidths(listColWidth, next);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listColWidth, previewColWidth, persistColumnWidths, handleResetColumnWidth]
  );

  useEffect(() => {
    if (!activeResizer) return;

    let latestListW = listColWidth;
    let latestPreviewW = previewColWidth;

    const handleMove = (e: MouseEvent | PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const deltaX = e.clientX - st.startX;

      if (st.side === "left") {
        const clamped = clampList(st.startWidth + deltaX);
        latestListW = clamped;
        setListColWidth(clamped);
      } else {
        const clamped = clampPreview(st.startWidth - deltaX);
        latestPreviewW = clamped;
        setPreviewColWidth(clamped);
      }
    };

    const handleUp = () => {
      dragStateRef.current = null;
      setActiveResizer(null);
      persistColumnWidths(latestListW, latestPreviewW);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResizer, persistColumnWidths]);

  const suppressListQueryRef = useRef(false);

  // Auto-switch mobile view if a selection is present (unless the page asks to start on the list)
  useEffect(() => {
    if (rawQueryTab === "list" && !suppressListQueryRef.current) {
      setMobileView("list");
      return;
    }
    if (activeBuildingId) {
      if (mobileStartOnList && !rawQueryTab && !suppressListQueryRef.current) {
        setMobileView("list");
      } else {
        setMobileView(queryTab === "preview" ? "preview" : "editor");
      }
      setAriaAnnouncement(selectedLabel ? `선택: ${selectedLabel}` : "");
    } else {
      setMobileView("list");
    }
  }, [activeBuildingId, queryTab, rawQueryTab, mobileStartOnList, selectedLabel]);

  // Synchronize buildingId into query string without full reload (WP-P2-06)
  const handleSelectBuilding = useCallback(
    (buildingId: string) => {
      onBuildingSelect?.(buildingId);

      const params = new URLSearchParams(searchParams.toString());
      params.set("buildingId", buildingId);
      if (!params.has("tab")) {
        params.set("tab", "editor");
      }
      router.replace(`${pathname}?${params.toString()}`);
      setIsListDrawerOpen(false);
    },
    [onBuildingSelect, searchParams, pathname, router]
  );
  void handleSelectBuilding;
  void isListDrawerOpen;

  // Synchronize tab into query string (WP-P2-06)
  const handleSelectTab = useCallback(
    (tab: "editor" | "preview") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`);
      setMobileView(tab);
    },
    [searchParams, pathname, router]
  );

  const bottomTabs = DEFAULT_WORKSPACE_TABS.map((t) => {
    const n = effectiveBadges[t.id as keyof typeof effectiveBadges];
    return n && n > 0 ? { ...t, badge: n > 99 ? "99+" : n } : t;
  });

  const renderResizer = (side: "left" | "right") => {
    const isLeft = side === "left";
    const now = isLeft ? listColWidth : previewColWidth;
    return (
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={isLeft ? "목록 너비 조절" : "미리보기 너비 조절"}
        aria-valuenow={now}
        aria-valuemin={isLeft ? MIN_LIST_WIDTH : MIN_PREVIEW_WIDTH}
        aria-valuemax={isLeft ? MAX_LIST_WIDTH : MAX_PREVIEW_WIDTH}
        data-testid={isLeft ? "workspace-resizer-left" : "workspace-resizer-right"}
        onMouseDown={(e) => handleStartResize(side, e)}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") handleStartResize(side, e);
        }}
        onKeyDown={(e) => handleResizerKeyDown(side, e)}
        onDoubleClick={() => handleResetColumnWidth(side)}
        title="끌어서 너비 조절 · 두 번 누르면 처음 크기"
        className={`${isLeft ? "hidden lg:flex" : "hidden xl:flex"} w-3 shrink-0 cursor-col-resize items-center justify-center group z-30 select-none touch-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          activeResizer === side ? "bg-blue-600/20" : "hover:bg-blue-500/15"
        }`}
      >
        <div
          className={`w-1 h-12 rounded-full transition-colors ${
            activeResizer === side ? "bg-blue-600" : "bg-slate-300 group-hover:bg-blue-500"
          }`}
        />
      </div>
    );
  };

  return (
    <div
      data-testid="workspace-shell"
      data-workspace={workspace}
      className="flex flex-col h-[100dvh] bg-[#F3F2EE] text-[#0F172A] overflow-hidden"
    >
      {/* ── Aria Live Announcement Region ── */}
      <div className="sr-only" role="status" aria-live="polite">
        {ariaAnnouncement || (activeBuildingId && !selectedLabel ? `선택된 매물: ${activeBuildingId}` : "")}
      </div>

      {/* ── Fixed 56px Topbar ── */}
      <header
        data-testid="workspace-topbar"
        className="h-14 shrink-0 bg-white border-b border-slate-300 px-2.5 sm:px-4 flex items-center justify-between gap-2 z-30 shadow-2xs"
      >
        <nav aria-label="작업공간 메뉴" className="flex items-center gap-1 sm:gap-3 overflow-x-auto no-scrollbar min-w-0 flex-1">
          {WS_TOPBAR_LINKS.map((link) => {
            const isActive =
              link.id === workspace ||
              (link.id === "home" && pathname === "/broker") ||
              (link.id === "magazine" && (pathname.startsWith("/broker/magazine-editor") || pathname.startsWith("/broker/w/magazine"))) ||
              (link.id !== "home" && pathname.startsWith(link.href));
            const badge = link.id !== "home" ? effectiveBadges[link.id as "dealcards" | "im" | "magazine" | "inbox"] : undefined;

            return (
              <Link
                key={link.id}
                href={link.href}
                data-testid={`workspace-nav-${link.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`relative px-2 sm:px-3 py-1.5 min-h-[44px] sm:min-h-[48px] rounded-lg text-sm sm:text-base font-extrabold flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-blue-700 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {link.label}
                {badge && badge > 0 ? (
                  <span
                    data-testid={`workspace-nav-badge-${link.id}`}
                    aria-label={`처리할 일 ${badge}건`}
                    className="min-w-[22px] h-5 sm:h-6 px-1.5 rounded-full bg-rose-600 text-white text-sm font-extrabold flex items-center justify-center"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Right tools / indicators */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {/* Desktop Preview Drawer Toggle (when 1024px-1279px) */}
          <button
            type="button"
            onClick={() => setIsPreviewDrawerOpen(!isPreviewDrawerOpen)}
            data-testid="workspace-preview-toggle-btn"
            aria-expanded={isPreviewDrawerOpen}
            className="hidden lg:inline-flex xl:hidden items-center gap-1 px-3 py-1.5 min-h-[48px] rounded-lg border border-slate-300 text-base font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span>{isPreviewDrawerOpen ? "미리보기 닫기" : "미리보기 열기"}</span>
          </button>

          <Link
            href="/broker/profile"
            data-testid="workspace-nav-profile"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 min-h-[48px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-base font-extrabold text-slate-800 transition-colors whitespace-nowrap"
          >
            <span>내 프로필</span>
          </Link>
        </div>
      </header>

      {/* ── 3-Column Workspace Body ── */}
      <div
        className="flex-1 flex overflow-hidden relative"
        style={
          {
            "--ws-list-w": `${listColWidth}px`,
            "--ws-preview-w": `${previewColWidth}px`,
          } as React.CSSProperties
        }
      >
        {/* ── Column 1: 목록 (draggable width, 72px rail collapse) ── */}
        <aside
          data-testid="workspace-col-list"
          data-col-width={isRailCollapsed ? 72 : listColWidth}
          className={`shrink-0 border-r border-slate-300 bg-[#FAF9F5] flex flex-col ${
            activeResizer ? "" : "transition-all duration-200"
          } z-20 ${
            mobileView !== "list" ? "hidden lg:flex" : "flex w-full lg:w-auto pb-16 lg:pb-0"
          } ${
            isRailCollapsed
              ? "lg:w-[72px]"
              : "lg:w-[var(--ws-list-w)]"
          }`}
        >
          {/* List Header */}
          <div className="h-14 border-b border-slate-300 px-4 flex items-center justify-between gap-2 shrink-0 bg-white/70">
            {!isRailCollapsed && (
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight whitespace-nowrap truncate">
                {listTitle}
              </h2>
            )}
            <button
              type="button"
              onClick={() => setIsRailCollapsed(!isRailCollapsed)}
              data-testid="workspace-rail-toggle"
              aria-label={isRailCollapsed ? "목록 펼치기" : "목록 접기 (레일)"}
              className="hidden lg:flex items-center justify-center w-12 h-12 rounded-lg hover:bg-slate-200 text-slate-600 text-base font-bold transition-colors cursor-pointer ml-auto"
              title={isRailCollapsed ? "목록 펼치기" : "목록 접기"}
            >
              {isRailCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {/* List Content */}
          {isRailCollapsed ? (
            <div
              className="flex-1 flex flex-col items-center py-4 gap-3"
              data-testid="workspace-rail-compact"
            >
              <button
                type="button"
                onClick={() => setIsRailCollapsed(false)}
                className="w-12 h-12 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-base flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer"
                title="목록 펼치기"
                aria-label="목록 펼치기"
              >
                ☰
              </button>
            </div>
          ) : (
            <div
              className="flex-1 overflow-y-auto p-3"
              onClick={(e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;
                if (
                  target.closest(
                    '[data-testid*="delete-"], [data-testid*="duplicate-"], [data-testid^="im-posture-tab-"], [data-testid^="dealcard-posture-tab-"], [data-testid^="inbox-filter-"], input, select'
                  )
                ) {
                  return;
                }
                if (
                  target.closest(
                    '[data-testid^="dealcard-item-"], [data-testid^="im-item-"], [data-testid^="inbox-thread-"], [data-testid^="inbox-item-"], [data-testid="inbox-todo-card"], [data-testid^="issue-card-"], [data-testid^="mag-issue-"], [data-testid^="magazine-edition-item-"], [data-testid="workspace-new-dealcard-btn"], [data-testid="im-create-new-btn"], [data-testid="new-issue-btn"], [data-testid="new-newsletter-btn"]'
                  )
                ) {
                  suppressListQueryRef.current = true;
                  setMobileView("editor");
                  if (searchParams.get("tab") === "list") {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", "editor");
                    router.replace(`${pathname}?${params.toString()}`);
                  }
                }
              }}
            >
              {listSlot}
            </div>
          )}
        </aside>

        {renderResizer("left")}

        {/* ── Column 2: 채우기 (Editor column, min 420px, flex-1) ── */}
        <main
          data-testid="workspace-col-editor"
          className={`flex-1 flex flex-col min-w-0 lg:min-w-[420px] bg-[#F3F2EE] overflow-y-auto ${
            mobileView === "list"
              ? "hidden lg:flex"
              : mobileView === "preview"
              ? "hidden lg:flex"
              : "flex"
          }`}
        >
          {/* Editor Header */}
          <div className="h-14 border-b border-slate-300 px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                data-testid="workspace-mobile-back-to-list-btn"
                onClick={() => {
                  suppressListQueryRef.current = false;
                  setMobileView("list");
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("tab", "list");
                  router.replace(`${pathname}?${params.toString()}`);
                }}
                className="lg:hidden px-2.5 sm:px-3 min-h-[44px] sm:min-h-[48px] rounded-lg border border-slate-300 text-sm sm:text-base font-extrabold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                ‹ 목록
              </button>
              <h2 className="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap truncate">
                {editorTitle}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {renderedSaveStatus && (
                <div
                  data-testid="workspace-save-status"
                  data-save-state={saveState}
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-1.5 text-sm sm:text-base font-bold px-2.5 sm:px-3 py-1 rounded-full border whitespace-nowrap shrink-0 ${saveTone}`}
                >
                  <span>{renderedSaveStatus}</span>
                </div>
              )}

              {mobileView === "editor" && (
                <div className="lg:hidden flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 shrink-0">
                  <button
                    type="button"
                    data-testid="mobile-tab-editor"
                    onClick={() => handleSelectTab("editor")}
                    aria-pressed={true}
                    className="px-2.5 min-h-[40px] text-sm font-bold rounded-md transition-colors bg-white text-blue-700 shadow-2xs"
                  >
                    {mobileTabLabels.editor}
                  </button>
                  <button
                    type="button"
                    data-testid="mobile-tab-preview"
                    onClick={() => handleSelectTab("preview")}
                    aria-pressed={false}
                    className="px-2.5 min-h-[40px] text-sm font-bold rounded-md transition-colors text-slate-600"
                  >
                    {mobileTabLabels.preview}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Editor Body */}
          <div className="flex-1 p-3 sm:p-5 max-w-4xl w-full mx-auto pb-8">
            {editorSlot || children}
          </div>

          {/* Primary action mirror when Column 3 is hidden (<1280px desktop, mobile editor) */}
          {primaryActionSlot && (
            <div
              data-testid="workspace-primary-action-mirror"
              className="xl:hidden sticky bottom-0 z-10 p-3 border-t border-slate-300 bg-white/95 backdrop-blur-sm"
            >
              {primaryActionSlot}
            </div>
          )}
        </main>

        {renderResizer("right")}

        {/* ── Column 3: 확인하고 보내기 (Preview/Action column, draggable width) ── */}
        <aside
          data-testid="workspace-col-preview"
          data-col-width={previewColWidth}
          className={`shrink-0 border-l border-slate-300 bg-white flex flex-col z-20 ${
            mobileView === "preview"
              ? "flex w-full lg:w-[var(--ws-preview-w)] fixed inset-x-0 top-14 bottom-0 lg:static"
              : "hidden xl:flex lg:w-[var(--ws-preview-w)]"
          } ${
            isPreviewDrawerOpen ? "lg:flex lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:w-[var(--ws-preview-w)] lg:shadow-2xl" : ""
          }`}
        >
          {/* Preview Header */}
          <div className="h-14 border-b border-slate-300 px-3.5 flex items-center justify-between gap-2 shrink-0 bg-[#FAF9F5]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                data-testid="mobile-preview-back-btn"
                onClick={() => {
                  suppressListQueryRef.current = false;
                  setMobileView("list");
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("tab", "list");
                  router.replace(`${pathname}?${params.toString()}`);
                }}
                className="lg:hidden px-2.5 sm:px-3 min-h-[44px] sm:min-h-[48px] rounded-lg border border-slate-300 text-sm sm:text-base font-extrabold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                ‹ 목록
              </button>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight whitespace-nowrap truncate">
                {previewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {previewTabSlot}
              {mobileView === "preview" && (
                <div className="lg:hidden flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 shrink-0">
                  <button
                    type="button"
                    data-testid="mobile-tab-editor"
                    onClick={() => handleSelectTab("editor")}
                    aria-pressed={false}
                    className="px-2.5 min-h-[40px] text-sm font-bold rounded-md transition-colors text-slate-600"
                  >
                    {mobileTabLabels.editor}
                  </button>
                  <button
                    type="button"
                    data-testid="mobile-tab-preview"
                    onClick={() => handleSelectTab("preview")}
                    aria-pressed={true}
                    className="px-2.5 min-h-[40px] text-sm font-bold rounded-md transition-colors bg-white text-blue-700 shadow-2xs"
                  >
                    {mobileTabLabels.preview}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Real Preview Content (single scroll container) */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#F8FAFC]">
            {previewSlot}
          </div>

          {/* Primary Action Button (The sole primary button on screen: 56px) */}
          {primaryActionSlot && (
            <div
              data-testid="workspace-primary-action-container"
              className="p-4 border-t border-slate-300 bg-white shrink-0"
            >
              {primaryActionSlot}
            </div>
          )}
        </aside>
      </div>

      {/* ── Mobile 5-Tab Bottom Navigation (<1024px) ── */}
      <WorkspaceBottomNav
        tabs={bottomTabs}
        activeTabId={workspace}
        hideOnDetail={mobileView !== "list"}
      />
    </div>
  );
}

export default WorkspaceShell;
