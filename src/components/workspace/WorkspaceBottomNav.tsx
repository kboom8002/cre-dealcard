"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { WORKSPACE_IDENTITY, type WorkspaceServiceId } from "@/lib/ux/workspace-identity";

export interface WorkspaceTabItem {
  id: "home" | "dealcards" | "im" | "magazine" | "inbox" | "more";
  label: string;
  href: string;
  icon: string;
  badge?: number | string;
}

export const DEFAULT_WORKSPACE_TABS: WorkspaceTabItem[] = [
  { id: "home", label: "홈", href: "/broker", icon: "🏠" },
  { id: "magazine", label: WORKSPACE_IDENTITY.magazine.label, href: WORKSPACE_IDENTITY.magazine.href, icon: WORKSPACE_IDENTITY.magazine.icon },
  { id: "dealcards", label: WORKSPACE_IDENTITY.dealcards.label, href: WORKSPACE_IDENTITY.dealcards.href, icon: WORKSPACE_IDENTITY.dealcards.icon },
  { id: "im", label: WORKSPACE_IDENTITY.im.label, href: WORKSPACE_IDENTITY.im.href, icon: WORKSPACE_IDENTITY.im.icon },
  { id: "inbox", label: WORKSPACE_IDENTITY.inbox.label, href: WORKSPACE_IDENTITY.inbox.href, icon: WORKSPACE_IDENTITY.inbox.icon },
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
      <div className="grid grid-cols-5 min-h-16 h-auto items-stretch max-w-lg mx-auto px-1 py-1.5 gap-0.5">
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

          const identitySpec =
            tab.id !== "home" && tab.id !== "more"
              ? WORKSPACE_IDENTITY[tab.id as WorkspaceServiceId]
              : null;
          const activeClass = identitySpec
            ? identitySpec.bottomTabActiveClass
            : "bg-slate-900/10 text-[#1D1D1F] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";
          const activeBarClass = identitySpec
            ? identitySpec.bottomTabBarClass
            : "bg-[#1D1D1F]";

          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch={false}
              data-testid={`workspace-tab-${tab.id}`}
              data-active={isActive ? "true" : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[48px] min-w-0 overflow-hidden rounded-2xl transition-all px-0.5 pt-2 pb-1 ${
                isActive
                  ? activeClass
                  : "text-[#515154] hover:text-[#1D1D1F] hover:bg-black/[0.04] font-medium"
              }`}
            >
              {/* Active indicator top capsule */}
              {isActive && (
                <span className={`absolute top-0.5 left-3 right-3 h-0.5 rounded-full ${activeBarClass}`} />
              )}

              {/* Icon & optional badge — padded inside link so badge never protrudes outside nav */}
              <div className="relative inline-flex items-center justify-center pt-1 px-2 text-lg leading-none">
                <span>{tab.icon}</span>
                {tab.badge !== undefined && (
                  <span
                    aria-label={`처리할 일 ${tab.badge}건`}
                    className="absolute -top-1 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-gradient-to-b from-[#FF3B5C] to-[#FF2D55] text-white text-sm font-bold leading-none shadow-[0_2px_6px_rgba(255,45,85,0.35)] flex items-center justify-center"
                  >
                    {tab.badge}
                  </span>
                )}
              </div>

              {/* Label: senior minimum 14px caption */}
              <span className="text-sm leading-tight tracking-tighter text-center break-keep mt-0.5 max-w-full">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default WorkspaceBottomNav;
