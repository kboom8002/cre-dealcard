"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface WorkspaceTabItem {
  id: "home" | "dealcards" | "im" | "magazine" | "inbox" | "more";
  label: string;
  href: string;
  icon: string;
  badge?: number | string;
}

export const DEFAULT_WORKSPACE_TABS: WorkspaceTabItem[] = [
  { id: "home", label: "홈", href: "/broker", icon: "🏠" },
  { id: "dealcards", label: "딜카드", href: "/broker/w/dealcards", icon: "📄" },
  { id: "im", label: "IM", href: "/broker/w/im", icon: "📊" },
  { id: "magazine", label: "뉴스레터", href: "/broker/w/newsletter", icon: "📰" },
  { id: "inbox", label: "소통함", href: "/broker/w/inbox", icon: "💬" },
];

export interface WorkspaceBottomNavProps {
  /** Override or customize tabs */
  tabs?: WorkspaceTabItem[];
  /** Hide the bottom bar when viewing or editing detail content */
  hideOnDetail?: boolean;
  /** Active workspace identifier */
  activeTabId?: string;
  className?: string;
}

/**
 * WP-P2-03: WorkspaceBottomNav
 *
 * 5-tab mobile bottom navigation bar shown below 1024px.
 * Follows senior accessibility: >= 48px touch targets, min 14px caption,
 * high-contrast borders, safe-area inset padding.
 */
export function WorkspaceBottomNav({
  tabs = DEFAULT_WORKSPACE_TABS,
  hideOnDetail = false,
  activeTabId,
  className = "",
}: WorkspaceBottomNavProps) {
  const pathname = usePathname();

  if (hideOnDetail) {
    return null;
  }

  return (
    <nav
      data-testid="workspace-bottom-nav"
      aria-label="모바일 하단 내비게이션"
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 ios-glass-chrome bg-white/80 backdrop-blur-2xl backdrop-saturate-[190%] border-t border-white/75 shadow-[0_-4px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] pb-[env(safe-area-inset-bottom,0px)] ${className}`}
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1.5 py-1 gap-1">
        {tabs.map((tab) => {
          const matchesPath =
            tab.href === "/broker"
              ? pathname === "/broker"
              : tab.id === "magazine"
              ? pathname.startsWith("/broker/magazine-editor") ||
                pathname.startsWith("/broker/w/magazine") ||
                pathname.startsWith("/broker/w/newsletter")
              : pathname.startsWith(tab.href);
          const isActive =
            activeTabId && activeTabId !== "common"
              ? activeTabId === tab.id ||
                (tab.id === "magazine" && pathname.startsWith("/broker/w/newsletter"))
              : matchesPath;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch={false}
              data-testid={`workspace-tab-${tab.id}`}
              data-active={isActive ? "true" : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[48px] min-w-[48px] rounded-2xl transition-all py-1 ${
                isActive
                  ? "bg-[#007AFF]/10 text-[#0051D5] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  : "text-[#515154] hover:text-[#1D1D1F] hover:bg-black/[0.04] font-medium"
              }`}
            >
              {/* Active indicator top capsule */}
              {isActive && (
                <span className="absolute top-0.5 left-4 right-4 h-0.5 bg-[#007AFF] rounded-full" />
              )}

              {/* Icon & optional badge */}
              <div className="relative text-xl leading-none">
                <span>{tab.icon}</span>
                {tab.badge !== undefined && (
                  <span
                    aria-label={`처리할 일 ${tab.badge}건`}
                    className="absolute -top-1.5 -right-3 min-w-[22px] h-[22px] px-1 rounded-full bg-gradient-to-b from-[#FF3B5C] to-[#FF2D55] text-white text-sm font-bold shadow-[0_2px_6px_rgba(255,45,85,0.35)] flex items-center justify-center"
                  >
                    {tab.badge}
                  </span>
                )}
              </div>

              {/* Label: senior minimum 14px caption */}
              <span className="text-sm tracking-tight mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default WorkspaceBottomNav;
