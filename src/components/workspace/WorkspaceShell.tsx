"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceBottomNav } from "./WorkspaceBottomNav";

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
  /** Primary action button mounted at the bottom of Column 3 (56px) */
  primaryActionSlot?: React.ReactNode;
  /** Save status badge shown in column 2 header (e.g., '저장됨 · 방금') */
  saveStatus?: React.ReactNode;
  /** Optional preview tab toggle buttons (e.g. '[카톡 | 받는 화면]') */
  previewTabSlot?: React.ReactNode;
  /** Optional active building ID override */
  selectedBuildingId?: string | null;
  /** Callback when user changes selection */
  onBuildingSelect?: (buildingId: string) => void;
  /** Children fallback if editorSlot is omitted */
  children?: React.ReactNode;
}

const WS_TOPBAR_LINKS = [
  { id: "home", label: "🏠 홈", href: "/broker" },
  { id: "dealcards", label: "📄 딜카드", href: "/broker/w/dealcards" },
  { id: "im", label: "📊 IM", href: "/broker/w/im" },
  { id: "magazine", label: "📰 뉴스레터", href: "/broker/w/magazine" },
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
  previewTabSlot,
  selectedBuildingId,
  onBuildingSelect,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State sync from URL query params (WP-P2-06)
  const queryBuildingId = searchParams.get("buildingId");
  const queryTab = searchParams.get("tab") || "editor";

  const activeBuildingId = selectedBuildingId ?? queryBuildingId;

  // Responsive layout state
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isListDrawerOpen, setIsListDrawerOpen] = useState(false);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor" | "preview">("list");
  const [ariaAnnouncement, setAriaAnnouncement] = useState("");

  // Auto-switch mobile view if buildingId is present
  useEffect(() => {
    if (activeBuildingId) {
      setMobileView(queryTab === "preview" ? "preview" : "editor");
      setAriaAnnouncement(`선택된 매물: ${activeBuildingId}`);
    } else {
      setMobileView("list");
    }
  }, [activeBuildingId, queryTab]);

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

  return (
    <div
      data-testid="workspace-shell"
      data-workspace={workspace}
      className="flex flex-col h-[100dvh] bg-[#F3F2EE] text-[#0F172A] overflow-hidden"
    >
      {/* ── Aria Live Announcement Region ── */}
      <div className="sr-only" role="status" aria-live="polite">
        {ariaAnnouncement}
      </div>

      {/* ── Fixed 56px Topbar ── */}
      <header
        data-testid="workspace-topbar"
        className="h-14 shrink-0 bg-white border-b border-slate-300 px-4 flex items-center justify-between z-30 shadow-2xs"
      >
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          {WS_TOPBAR_LINKS.map((link) => {
            const isActive =
              link.id === workspace ||
              (link.id === "home" && pathname === "/broker") ||
              pathname.startsWith(link.href);

            return (
              <Link
                key={link.id}
                href={link.href}
                data-testid={`workspace-nav-${link.id}`}
                className={`px-3 py-1.5 min-h-[40px] rounded-lg text-sm sm:text-base font-extrabold flex items-center transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-blue-700 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right tools / indicators */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile Preview/Editor Switcher (<1024px) */}
          <div className="lg:hidden flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => handleSelectTab("editor")}
              className={`px-2.5 py-1 text-sm font-bold rounded-md transition-colors ${
                mobileView === "editor"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600"
              }`}
            >
              ✏️ 채우기
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab("preview")}
              className={`px-2.5 py-1 text-sm font-bold rounded-md transition-colors ${
                mobileView === "preview"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600"
              }`}
            >
              👁 미리보기
            </button>
          </div>

          {/* Desktop Preview Drawer Toggle (when 1024px-1279px) */}
          <button
            type="button"
            onClick={() => setIsPreviewDrawerOpen(!isPreviewDrawerOpen)}
            data-testid="workspace-preview-toggle-btn"
            className="hidden lg:inline-flex xl:hidden items-center gap-1 px-3 py-1.5 min-h-[40px] rounded-lg border border-slate-300 text-sm font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span>{isPreviewDrawerOpen ? "미리보기 닫기 ✕" : "미리보기 열기 👁"}</span>
          </button>
        </div>
      </header>

      {/* ── 3-Column Workspace Body ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── Column 1: ① 고르기 (List column, 300px default, 72px rail collapse) ── */}
        <aside
          data-testid="workspace-col-list"
          className={`shrink-0 border-r border-slate-300 bg-[#FAF9F5] flex flex-col transition-all duration-200 z-20 ${
            // Mobile: hidden if viewing editor/preview, visible if viewing list
            mobileView !== "list" ? "hidden lg:flex" : "flex w-full lg:w-auto"
          } ${
            isRailCollapsed
              ? "lg:w-[72px]"
              : "lg:w-[300px] xl:w-[320px]"
          }`}
        >
          {/* List Header */}
          <div className="h-14 border-b border-slate-300 px-4 flex items-center justify-between shrink-0 bg-white/70">
            {!isRailCollapsed && (
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                {listTitle}
              </h2>
            )}
            {/* Rail collapse button on desktop */}
            <button
              type="button"
              onClick={() => setIsRailCollapsed(!isRailCollapsed)}
              data-testid="workspace-rail-toggle"
              aria-label={isRailCollapsed ? "목록 펼치기" : "목록 접기 (레일)"}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors cursor-pointer ml-auto"
              title={isRailCollapsed ? "목록 펼치기" : "72px 레일로 접기"}
            >
              {isRailCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {listSlot}
          </div>
        </aside>

        {/* ── Column 2: ② 채우기 (Editor column, min 540px, flex-1) ── */}
        <main
          data-testid="workspace-col-editor"
          className={`flex-1 flex flex-col min-w-0 bg-[#F3F2EE] overflow-y-auto ${
            mobileView === "list"
              ? "hidden lg:flex"
              : mobileView === "preview"
              ? "hidden lg:flex"
              : "flex"
          }`}
        >
          {/* Editor Header */}
          <div className="h-14 border-b border-slate-300 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-3">
              {/* Mobile Back Button to List */}
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="lg:hidden px-2.5 py-1 min-h-[38px] rounded-lg border border-slate-300 text-sm font-extrabold text-slate-800 hover:bg-slate-100"
              >
                ‹ 목록
              </button>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {editorTitle}
              </h2>
            </div>

            {/* Autosave status indicator */}
            {saveStatus && (
              <div
                data-testid="workspace-save-status"
                className="flex items-center gap-1.5 text-sm font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200"
              >
                <span>{saveStatus}</span>
              </div>
            )}
          </div>

          {/* Editor Body */}
          <div className="flex-1 p-4 sm:p-6 max-w-4xl w-full mx-auto pb-24 lg:pb-8">
            {editorSlot || children}
          </div>
        </main>

        {/* ── Column 3: ③ 확인하고 보내기 (Preview/Action column, 380px-420px) ── */}
        <aside
          data-testid="workspace-col-preview"
          className={`shrink-0 border-l border-slate-300 bg-white flex flex-col z-20 ${
            // Mobile: only show if mobileView === 'preview'
            mobileView === "preview"
              ? "flex w-full fixed inset-x-0 top-14 bottom-16 lg:static lg:bottom-0"
              : "hidden xl:flex xl:w-[400px] 2xl:w-[440px]"
          } ${
            isPreviewDrawerOpen ? "lg:flex lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:w-[420px] lg:shadow-2xl" : ""
          }`}
        >
          {/* Preview Header */}
          <div className="h-14 border-b border-slate-300 px-4 flex items-center justify-between shrink-0 bg-[#FAF9F5]">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              {previewTitle}
            </h2>
            {previewTabSlot}
          </div>

          {/* Real Preview Content */}
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
        activeTabId={workspace}
        hideOnDetail={mobileView !== "list"}
      />
    </div>
  );
}

export default WorkspaceShell;
