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
  { id: "magazine", label: "뉴스레터", href: "/broker/magazine-editor", icon: "📰" },
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
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)] ${className}`}
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const isActive = activeTabId
            ? activeTabId === tab.id
            : tab.href === "/broker"
            ? pathname === "/broker"
            : tab.id === "magazine"
            ? pathname.startsWith("/broker/magazine-editor") || pathname.startsWith("/broker/w/magazine")
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              data-testid={`workspace-tab-${tab.id}`}
              data-active={isActive ? "true" : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[48px] min-w-[48px] rounded-xl transition-colors py-1 ${
                isActive
                  ? "text-blue-700 font-extrabold"
                  : "text-slate-600 hover:text-slate-900 font-bold"
              }`}
            >
              {/* Active indicator top bar */}
              {isActive && (
                <span className="absolute top-0 left-2 right-2 h-1 bg-blue-600 rounded-full" />
              )}

              {/* Icon & optional badge */}
              <div className="relative text-xl leading-none">
                <span>{tab.icon}</span>
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-sm font-bold flex items-center justify-center">
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
