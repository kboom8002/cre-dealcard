"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceBottomNav, DEFAULT_WORKSPACE_TABS } from "./WorkspaceBottomNav";
import { SAVE_STATE_LABELS, formatRelativeKo, type HonestSaveState } from "@/lib/ux/lexicon";
import { FontScaleToggle } from "./FontScaleToggle";
import { QaFeedbackPinWidget } from "./QaFeedbackPinWidget";

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
  { id: "magazine", label: "📰 뉴스레터", href: "/broker/w/newsletter" },
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

  // State sync from URL query params (WP-P2-06) — support legacy ?id= alongside ?buildingId=
  const queryBuildingId = searchParams.get("buildingId") || searchParams.get("id");
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

  // 소통함 "처리할 자료 요청" 배지 — 모든 작업공간 공통 (60초 폴링, 비활성 탭 정지, 실패 시 조용히 숨김)
  const [inboxPending, setInboxPending] = useState<number>(0);
  useEffect(() => {
    if (navBadges?.inbox !== undefined) return;
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      fetch("/api/broker/inbox/pending-count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.ok && typeof d.count === "number") setInboxPending(d.count);
        })
        .catch(() => {});
    };
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        load();
      }
    };
    load();
    const t = setInterval(load, 60_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      cancelled = true;
      clearInterval(t);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
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
      ? "text-[#C8102E] bg-[#FF2D55]/10 border-[#FF2D55]/25 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
      : saveState === "saving" || saveState === "dirty"
      ? "text-[#8A4B00] bg-[#FF9500]/10 border-[#FF9500]/25 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
      : "text-[#3A3A3C] bg-[#767680]/10 border-slate-900/[0.08] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";

  // Responsive layout state
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isListDrawerOpen, setIsListDrawerOpen] = useState(false);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor" | "preview">("list");
  const [ariaAnnouncement, setAriaAnnouncement] = useState("");

  useEffect(() => {
    const handleOpenPreview = () => {
      setIsPreviewDrawerOpen(true);
    };
    window.addEventListener("workspace:open-preview", handleOpenPreview);
    return () => window.removeEventListener("workspace:open-preview", handleOpenPreview);
  }, []);

  // Close <1280px preview drawer on Escape or when viewport widens to >=1280px (xl)
  useEffect(() => {
    if (!isPreviewDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPreviewDrawerOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 1280) {
        setIsPreviewDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isPreviewDrawerOpen]);

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
  const listClickSearchBeforeRef = useRef("");
  const prevSearchStrRef = useRef(searchParams.toString());

  // If a child list item navigated while leaving ?tab=list in URL, clean tab->editor without losing new entity ID
  useEffect(() => {
    const currentStr = searchParams.toString();
    const searchChanged = prevSearchStrRef.current !== currentStr;
    prevSearchStrRef.current = currentStr;
    if (searchChanged && suppressListQueryRef.current && searchParams.get("tab") === "list") {
      const params = new URLSearchParams(currentStr);
      if (params.has("buildingId")) {
        params.delete("id");
      }
      params.set("tab", "editor");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, pathname, router]);

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

      const baseSearch =
        typeof window !== "undefined" && window.location.search
          ? window.location.search
          : searchParams.toString();
      const params = new URLSearchParams(baseSearch);
      params.set("buildingId", buildingId);
      params.delete("id");
      if (!params.has("tab") || params.get("tab") === "list") {
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
      const baseSearch =
        typeof window !== "undefined" && window.location.search
          ? window.location.search
          : searchParams.toString();
      const params = new URLSearchParams(baseSearch);
      if (params.has("buildingId")) {
        params.delete("id");
      }
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`);
      setMobileView(tab);
    },
    [searchParams, pathname, router]
  );

  // Bidirectional Preview -> Editor handoff: close <1280px preview drawer and flip mobile preview/list -> editor
  useEffect(() => {
    const handleFocusEditor = (evt: Event) => {
      const detail = (evt as CustomEvent<{ unitId?: string; label?: string }>).detail;
      setIsPreviewDrawerOpen(false);
      if (mobileView !== "editor" || searchParams.get("tab") === "preview") {
        suppressListQueryRef.current = true;
        handleSelectTab("editor");
      }
      if (detail?.label) {
        setAriaAnnouncement(`${detail.label} 편집으로 이동`);
      }
    };
    window.addEventListener("workspace:focus-editor", handleFocusEditor);
    return () => window.removeEventListener("workspace:focus-editor", handleFocusEditor);
  }, [mobileView, searchParams, handleSelectTab]);

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
        className={`${isLeft ? "hidden lg:flex" : "hidden xl:flex"} w-3 shrink-0 cursor-col-resize items-center justify-center group z-30 select-none touch-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          activeResizer === side ? "bg-[#007AFF]/15" : "hover:bg-[#007AFF]/10"
        }`}
      >
        <div
          className={`w-1 h-12 rounded-full transition-all ${
            activeResizer === side
              ? "bg-[#007AFF] scale-y-110 shadow-[0_0_8px_rgba(0,122,255,0.45)]"
              : "bg-slate-400/50 group-hover:bg-[#007AFF] shadow-[0_1px_1px_rgba(255,255,255,0.8)]"
          }`}
        />
      </div>
    );
  };

  return (
    <div
      data-testid="workspace-shell"
      data-workspace={workspace}
      className="flex flex-col h-[100dvh] bg-[#F5F5F7] text-[#1D1D1F] overflow-hidden"
    >
      {/* ── Aria Live Announcement Region ── */}
      <div className="sr-only" role="status" aria-live="polite">
        {ariaAnnouncement || (activeBuildingId && !selectedLabel ? `선택된 매물: ${activeBuildingId}` : "")}
      </div>

      {/* ── Fixed 56px Topbar (Apple iOS Floating Frosted Chrome) ── */}
      <header
        data-testid="workspace-topbar"
        className="h-14 shrink-0 ios-glass-chrome bg-white/75 backdrop-blur-2xl backdrop-saturate-[190%] border-b border-slate-900/[0.075] px-2.5 sm:px-4 flex items-center justify-between gap-2 z-30 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_20px_-4px_rgba(15,23,42,0.04)]"
      >
        <nav
          aria-label="작업공간 메뉴"
          className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 bg-[#767680]/[0.08] p-1 rounded-2xl border border-white/60 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] max-w-fit"
        >
          {WS_TOPBAR_LINKS.map((link) => {
            const isActive =
              link.id === workspace ||
              (link.id === "home" && pathname === "/broker") ||
              (link.id === "magazine" &&
                (pathname.startsWith("/broker/magazine-editor") ||
                  pathname.startsWith("/broker/w/magazine") ||
                  pathname.startsWith("/broker/w/newsletter"))) ||
              (link.id !== "home" && pathname.startsWith(link.href));
            const badge = link.id !== "home" ? effectiveBadges[link.id as "dealcards" | "im" | "magazine" | "inbox"] : undefined;

            return (
              <Link
                key={link.id}
                href={link.href}
                prefetch={false}
                data-testid={`workspace-nav-${link.id}`}
                data-active-pill={isActive ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`relative px-2.5 sm:px-3.5 py-1.5 min-h-[42px] sm:min-h-[44px] rounded-xl text-sm sm:text-base font-semibold flex items-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-gradient-to-b from-[#1A88FF] to-[#007AFF] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(0,122,255,0.28)]"
                    : "text-[#3A3A3C] hover:text-[#1D1D1F] hover:bg-white/60"
                }`}
              >
                {link.label}
                {badge && badge > 0 ? (
                  <span
                    data-testid={`workspace-nav-badge-${link.id}`}
                    aria-label={`처리할 일 ${badge}건`}
                    className="min-w-[22px] h-5 sm:h-6 px-1.5 rounded-full bg-gradient-to-b from-[#FF3B5C] to-[#FF2D55] text-white text-sm font-bold shadow-[0_2px_6px_rgba(255,45,85,0.35)] flex items-center justify-center"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Right tools / indicators (Translucent Glass Pills) */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {/* Font Density Toggle (표준 15px / 큰글씨 17px / 아주 크게 21px) */}
          <FontScaleToggle className="hidden md:inline-flex items-center ios-segmented-track bg-[#767680]/[0.10] p-0.5 rounded-xl border border-white/60 shrink-0" />

          {/* Desktop Preview Drawer Toggle (when 1024px-1279px) */}
          <button
            type="button"
            onClick={() => setIsPreviewDrawerOpen(!isPreviewDrawerOpen)}
            data-testid="workspace-preview-toggle-btn"
            aria-expanded={isPreviewDrawerOpen}
            className="hidden lg:inline-flex xl:hidden items-center gap-1 px-3.5 py-1.5 min-h-[44px] rounded-xl ios-glass-pill bg-white/78 hover:bg-white/95 border border-slate-900/[0.08] text-base font-semibold text-[#1D1D1F] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>{isPreviewDrawerOpen ? "미리보기 닫기" : "미리보기 열기"}</span>
          </button>

          <Link
            href="/broker/profile"
            prefetch={false}
            data-testid="workspace-nav-profile"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded-xl ios-glass-pill bg-white/78 hover:bg-white/95 border border-slate-900/[0.08] text-base font-semibold text-[#1D1D1F] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all whitespace-nowrap"
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
        {/* ── Column 1: 목록 (Frosted Sidebar, draggable width, 72px rail collapse on lg+ only) ── */}
        <aside
          data-testid="workspace-col-list"
          data-col-width={isRailCollapsed ? 72 : listColWidth}
          className={`shrink-0 border-r border-slate-900/[0.075] bg-white/68 backdrop-blur-2xl backdrop-saturate-[180%] flex flex-col ${
            activeResizer ? "" : "transition-all duration-200"
          } z-20 ${
            mobileView !== "list" ? "hidden lg:flex" : "flex w-full lg:w-auto pb-16 lg:pb-0"
          } ${
            isRailCollapsed
              ? "lg:w-[72px]"
              : "lg:w-[var(--ws-list-w)]"
          }`}
        >
          {/* List Header — mobile (<1024px) always renders listTitle regardless of isRailCollapsed */}
          <div className="h-14 border-b border-slate-900/[0.06] px-4 flex items-center justify-between gap-2 shrink-0 bg-white/72 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <h2
              className={`text-lg font-bold text-[#1D1D1F] tracking-tight whitespace-nowrap truncate ${
                isRailCollapsed ? "lg:hidden" : ""
              }`}
            >
              {listTitle}
            </h2>
            <button
              type="button"
              onClick={() => setIsRailCollapsed(!isRailCollapsed)}
              data-testid="workspace-rail-toggle"
              aria-label={isRailCollapsed ? "목록 펼치기" : "목록 접기 (레일)"}
              className="hidden lg:flex items-center justify-center w-11 h-11 rounded-xl hover:bg-black/[0.05] text-[#3A3A3C] text-base font-semibold transition-colors cursor-pointer ml-auto"
              title={isRailCollapsed ? "목록 펼치기" : "목록 접기"}
            >
              {isRailCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {/* List Content — rail compact only on lg+ (>=1024px); <1024px always renders full listSlot */}
          {isRailCollapsed && (
            <div
              className="hidden lg:flex flex-1 flex-col items-center py-4 gap-3"
              data-testid="workspace-rail-compact"
            >
              <button
                type="button"
                onClick={() => setIsRailCollapsed(false)}
                className="w-12 h-12 rounded-xl ios-glass-pill bg-white/85 border border-slate-900/[0.08] text-[#1D1D1F] font-semibold text-base flex items-center justify-center hover:bg-white transition-all cursor-pointer"
                title="목록 펼치기"
                aria-label="목록 펼치기"
              >
                ☰
              </button>
            </div>
          )}
          <div
            className={`flex-1 overflow-y-auto p-3 ${isRailCollapsed ? "lg:hidden" : ""}`}
            onClickCapture={() => {
              listClickSearchBeforeRef.current =
                typeof window !== "undefined" ? window.location.search : "";
            }}
            onClick={(e) => {
              if (e.defaultPrevented) return;
              const target = e.target as HTMLElement | null;
              if (!target) return;
              if (
                target.closest(
                  '[data-testid*="delete-"], [data-testid*="duplicate-"], [data-testid^="im-posture-tab-"], [data-testid^="dealcard-posture-tab-"], [data-testid^="inbox-filter-"], [data-testid^="edition-filter-"], input, select, textarea'
                )
              ) {
                return;
              }
              const matchedItem = target.closest<HTMLElement>(
                '[data-testid^="dealcard-item-"], [data-testid^="im-item-"], [data-testid^="inbox-thread-"], [data-testid^="inbox-item-"], [data-testid="inbox-todo-card"], [data-testid^="issue-card-"], [data-testid^="mag-issue-"], [data-testid^="magazine-edition-item-"], [data-testid="workspace-new-dealcard-btn"], [data-testid="im-create-new-btn"], [data-testid="new-issue-btn"], [data-testid="new-newsletter-btn"]'
              );
              if (matchedItem) {
                suppressListQueryRef.current = true;
                setMobileView("editor");

                const searchBefore = listClickSearchBeforeRef.current;
                const searchAfter =
                  typeof window !== "undefined" ? window.location.search : "";
                const beforeParams = new URLSearchParams(
                  searchBefore || searchParams.toString()
                );
                const liveParams = new URLSearchParams(
                  searchAfter || searchParams.toString()
                );

                // If child synchronously mutated window.location.search (tab or entity), never overwrite
                if (searchAfter !== searchBefore) {
                  if (
                    liveParams.get("tab") !== "list" ||
                    liveParams.get("buildingId") !== beforeParams.get("buildingId") ||
                    liveParams.get("id") !== beforeParams.get("id") ||
                    liveParams.get("thread") !== beforeParams.get("thread") ||
                    liveParams.get("threadId") !== beforeParams.get("threadId") ||
                    liveParams.get("editionId") !== beforeParams.get("editionId")
                  ) {
                    return;
                  }
                }

                // If child clicked a create/jump button or a different entity ID than the stale URL's entity,
                // child's own router.replace handles navigation — do not clobber with stale params!
                const testId = matchedItem.getAttribute("data-testid") || "";
                const isCreateOrJumpBtn =
                  testId === "workspace-new-dealcard-btn" ||
                  testId === "im-create-new-btn" ||
                  testId === "new-issue-btn" ||
                  testId === "new-newsletter-btn" ||
                  testId === "inbox-todo-card";
                if (isCreateOrJumpBtn) {
                  return;
                }

                const itemPrefixes = [
                  "dealcard-item-",
                  "im-item-",
                  "inbox-thread-",
                  "inbox-item-",
                  "issue-card-",
                  "mag-issue-",
                  "magazine-edition-item-",
                ];
                let clickedItemId: string | null = null;
                for (const prefix of itemPrefixes) {
                  if (testId.startsWith(prefix)) {
                    clickedItemId = testId.slice(prefix.length);
                    break;
                  }
                }

                const urlEntityId =
                  liveParams.get("buildingId") ||
                  liveParams.get("id") ||
                  liveParams.get("thread") ||
                  liveParams.get("threadId") ||
                  liveParams.get("editionId");

                if (clickedItemId && clickedItemId !== urlEntityId) {
                  return;
                }

                if (liveParams.get("tab") === "list") {
                  if (liveParams.has("buildingId")) {
                    liveParams.delete("id");
                  }
                  liveParams.set("tab", "editor");
                  router.replace(`${pathname}?${liveParams.toString()}`);
                }
              }
            }}
          >
            {listSlot}
          </div>
        </aside>

        {renderResizer("left")}

        {/* ── Column 2: 채우기 (Main Studio Canvas, min 420px, flex-1) ── */}
        <main
          data-testid="workspace-col-editor"
          className={`flex-1 flex flex-col min-w-0 lg:min-w-[420px] bg-transparent overflow-y-auto ${
            mobileView === "list"
              ? "hidden lg:flex"
              : mobileView === "preview"
              ? "hidden lg:flex"
              : "flex"
          }`}
        >
          {/* Editor Header — aligned on the exact same max-w-4xl horizontal axis as Editor Body */}
          <div className="h-14 border-b border-slate-900/[0.07] px-3 sm:px-5 flex items-center shrink-0 bg-white/78 backdrop-blur-2xl backdrop-saturate-[190%] sticky top-0 z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_12px_-2px_rgba(15,23,42,0.03)]">
            <div className="w-full max-w-4xl mx-auto flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  type="button"
                  data-testid="workspace-mobile-back-to-list-btn"
                  onClick={() => {
                    suppressListQueryRef.current = false;
                    setMobileView("list");
                    const baseSearch =
                      typeof window !== "undefined" && window.location.search
                        ? window.location.search
                        : searchParams.toString();
                    const params = new URLSearchParams(baseSearch);
                    if (params.has("buildingId")) {
                      params.delete("id");
                    }
                    params.set("tab", "list");
                    router.replace(`${pathname}?${params.toString()}`);
                  }}
                  className="lg:hidden px-2.5 sm:px-3 min-h-[44px] sm:min-h-[48px] rounded-xl ios-glass-pill bg-white/80 border border-slate-900/[0.08] text-sm sm:text-base font-semibold text-[#1D1D1F] hover:bg-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  ‹ 목록
                </button>
                <h2 className="text-base sm:text-xl font-bold text-[#1D1D1F] tracking-tight whitespace-nowrap truncate">
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
                    className={`flex items-center gap-1.5 text-sm sm:text-base font-semibold px-2.5 sm:px-3 py-1 rounded-full border whitespace-nowrap shrink-0 ${saveTone}`}
                  >
                    <span>{renderedSaveStatus}</span>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="workspace-editor-preview-drawer-btn"
                  onClick={() => setIsPreviewDrawerOpen(!isPreviewDrawerOpen)}
                  aria-expanded={isPreviewDrawerOpen}
                  className="hidden lg:inline-flex xl:hidden items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/10 hover:bg-[#007AFF]/15 text-sm font-semibold text-[#0040DD] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all cursor-pointer shrink-0"
                >
                  <span>{isPreviewDrawerOpen ? "미리보기 닫기" : "미리보기 열기"}</span>
                </button>

                {mobileView === "editor" && (
                  <div className="lg:hidden flex items-center ios-segmented-track bg-[#767680]/[0.11] p-0.5 rounded-xl border border-white/60 shrink-0">
                    <button
                      type="button"
                      data-testid="mobile-tab-editor"
                      onClick={() => handleSelectTab("editor")}
                      aria-pressed={true}
                      className="px-3 min-h-[44px] text-sm font-semibold rounded-[10px] transition-all ios-segmented-pill bg-white text-[#007AFF]"
                    >
                      {mobileTabLabels.editor}
                    </button>
                    <button
                      type="button"
                      data-testid="mobile-tab-preview"
                      onClick={() => handleSelectTab("preview")}
                      aria-pressed={false}
                      className="px-3 min-h-[44px] text-sm font-semibold rounded-[10px] transition-all text-[#3A3A3C]"
                    >
                      {mobileTabLabels.preview}
                    </button>
                  </div>
                )}
              </div>
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
              className="xl:hidden sticky bottom-0 z-10 p-3 border-t border-slate-900/[0.075] bg-white/82 backdrop-blur-2xl backdrop-saturate-[190%] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
            >
              {primaryActionSlot}
            </div>
          )}
        </main>

        {renderResizer("right")}

        {/* Translucent backdrop behind Column 3 drawer on 1024-1279px (lg only) */}
        {isPreviewDrawerOpen && (
          <div
            data-testid="workspace-preview-drawer-backdrop"
            data-modal-backdrop="true"
            aria-hidden="true"
            onClick={() => setIsPreviewDrawerOpen(false)}
            className="hidden lg:block xl:hidden fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px]"
          />
        )}

        {/* ── Column 3: 확인하고 보내기 (Frosted Preview Dock, draggable width) ── */}
        <aside
          data-testid="workspace-col-preview"
          data-col-width={previewColWidth}
          className={`shrink-0 border-l border-slate-900/[0.075] bg-white/76 backdrop-blur-2xl backdrop-saturate-[185%] flex flex-col z-20 ${
            mobileView === "preview"
              ? "flex w-full lg:w-[var(--ws-preview-w)] fixed inset-x-0 top-14 bottom-0 lg:static"
              : "hidden xl:flex lg:w-[var(--ws-preview-w)]"
          } ${
            isPreviewDrawerOpen
              ? "lg:flex lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:z-40 lg:w-[var(--ws-preview-w)] lg:shadow-[0_24px_48px_rgba(15,23,42,0.16)] xl:static xl:inset-auto xl:z-auto xl:w-[var(--ws-preview-w)] xl:shadow-none"
              : ""
          }`}
        >
          {/* Preview Header */}
          <div className="min-h-14 py-1.5 border-b border-slate-900/[0.06] px-3 flex flex-wrap items-center justify-between gap-1.5 shrink-0 bg-white/72 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                data-testid="mobile-preview-back-btn"
                onClick={() => {
                  suppressListQueryRef.current = false;
                  setMobileView("list");
                  const baseSearch =
                    typeof window !== "undefined" && window.location.search
                      ? window.location.search
                      : searchParams.toString();
                  const params = new URLSearchParams(baseSearch);
                  if (params.has("buildingId")) {
                    params.delete("id");
                  }
                  params.set("tab", "list");
                  router.replace(`${pathname}?${params.toString()}`);
                }}
                className="lg:hidden px-2.5 sm:px-3 min-h-[44px] sm:min-h-[48px] rounded-xl ios-glass-pill bg-white/80 border border-slate-900/[0.08] text-sm sm:text-base font-semibold text-[#1D1D1F] hover:bg-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                ‹ 목록
              </button>
              <h2 className={`${previewTabSlot ? "text-sm" : "text-base sm:text-lg"} font-bold text-[#1D1D1F] tracking-tight whitespace-nowrap`}>
                {previewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {previewTabSlot}
              {isPreviewDrawerOpen && (
                <button
                  type="button"
                  onClick={() => setIsPreviewDrawerOpen(false)}
                  aria-label="미리보기 닫기"
                  className="hidden lg:inline-flex xl:hidden px-2.5 min-h-[44px] items-center justify-center rounded-xl ios-glass-pill bg-white/85 border border-slate-900/[0.08] text-[#1D1D1F] text-sm font-semibold hover:bg-white cursor-pointer"
                >
                  ✕ 닫기
                </button>
              )}
              {mobileView === "preview" && (
                <div className="lg:hidden flex items-center ios-segmented-track bg-[#767680]/[0.11] p-0.5 rounded-xl border border-white/60 shrink-0">
                  <button
                    type="button"
                    data-testid="mobile-tab-editor"
                    onClick={() => handleSelectTab("editor")}
                    aria-pressed={false}
                    className="px-3 min-h-[44px] text-sm font-semibold rounded-[10px] transition-all text-[#3A3A3C]"
                  >
                    {mobileTabLabels.editor}
                  </button>
                  <button
                    type="button"
                    data-testid="mobile-tab-preview"
                    onClick={() => handleSelectTab("preview")}
                    aria-pressed={true}
                    className="px-3 min-h-[44px] text-sm font-semibold rounded-[10px] transition-all ios-segmented-pill bg-white text-[#007AFF]"
                  >
                    {mobileTabLabels.preview}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Real Preview Content (single scroll container) */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#F5F5F7]/65">
            {previewSlot}
          </div>

          {/* Primary Action Button (The sole primary button on screen: 56px) */}
          {primaryActionSlot && (
            <div
              data-testid="workspace-primary-action-container"
              className="p-4 border-t border-slate-900/[0.07] bg-white/82 backdrop-blur-2xl shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
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

      {/* ── In-App QA Pin Widget (?qa=1 또는 검수 모드 활성화 시 표시) ── */}
      <QaFeedbackPinWidget workspace={workspace} />
    </div>
  );
}

export default WorkspaceShell;
