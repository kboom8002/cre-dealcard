"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Building2,
  Newspaper,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";
import { useState, useEffect } from "react";
import { BrokerMoreMenu } from "@/components/layout/BrokerMoreMenu";

const NAV_ITEMS = [
  {
    href: "/broker",
    icon: LayoutDashboard,
    label: "홈",
    id: "nav-home",
    ariaLabel: "중개인 대시보드 홈",
    exact: true,
  },
  {
    href: "/broker/buildings",
    icon: Building2,
    label: "내 물건",
    id: "nav-buildings",
    ariaLabel: "내 딜카드 및 IM 목록",
    exact: false,
  },
  // Center slot is occupied by the FAB — skip index 2
  /* DORMANT: ux60-focus — 복원 시 docs/rollback/2026-10-18-dormant-features.md 참조
  {
    href: "/broker/matching",
    icon: Target,
    label: "매칭",
    id: "nav-matching",
    ariaLabel: "AI 매칭 결과",
    exact: false,
  },
  */
  {
    href: "/broker/magazine-editor?mode=simple",
    icon: Newspaper,
    label: "소식지",
    id: "nav-magazine",
    ariaLabel: "고객 소식지(매거진) 5분 간편 편집",
    exact: false,
  },
] as const;

export default function BrokerBottomNav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const haptic = useHaptic();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const handleMemoOpened = () => setMoreOpen(false);
    window.addEventListener("universal-memo-opened", handleMemoOpened);
    return () => window.removeEventListener("universal-memo-opened", handleMemoOpened);
  }, []);

  return (
    <>
      {/* More menu sheet */}
      <BrokerMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} userEmail={userEmail} />

      <nav
        role="navigation"
        aria-label="중개인 메인 탐색"
        id="broker-bottom-nav"
        className="relative z-30 mt-12 bg-[#0f172a]/95 backdrop-blur-xl border-t border-amber-500/20 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
      >
        <div className="max-w-5xl mx-auto flex items-stretch justify-around px-2 py-1">
          {/* Left 2 items */}
          {NAV_ITEMS.slice(0, 2).map((item) => {
            const baseHref = item.href.split("?")[0];
            const isActive = item.exact
              ? pathname === baseHref
              : pathname.startsWith(baseHref);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                id={item.id}
                aria-label={item.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                onClick={() => haptic.light()}
                className={cn(
                  "relative flex flex-col sm:flex-row items-center justify-center gap-1.5",
                  "min-h-[56px] min-w-[64px] flex-1 px-2 py-2 rounded-xl",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset",
                  isActive
                    ? "text-amber-300 font-extrabold"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="broker-nav-active"
                    className="absolute inset-x-1 inset-y-1 rounded-xl bg-amber-500/10 border border-amber-500/20"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative transition-all duration-200",
                    isActive ? "w-5 h-5 stroke-[2.4] text-amber-300" : "w-5 h-5 stroke-[1.8]"
                  )}
                />
                <span
                  className={cn(
                    "relative text-[15px] font-bold leading-none tracking-tight",
                    isActive ? "text-amber-300" : "text-slate-300"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Center 1-Click 새 물건 등록 Button */}
          <Link
            href="/broker/deal-card/new"
            prefetch={true}
            id="broker-create-fab"
            aria-label="새로 만들기"
            onClick={() => haptic.medium()}
            className="flex items-center justify-center gap-1.5 my-1.5 px-4 py-2.5 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[15px] shadow-md transition-colors shrink-0"
          >
            <span>➕</span>
            <span>새 물건 등록</span>
          </Link>

          {/* Right 1 item (소식지) */}
          {NAV_ITEMS.slice(2).map((item) => {
            const baseHref = item.href.split("?")[0];
            const isActive = pathname.startsWith(baseHref);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                id={item.id}
                aria-label={item.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                onClick={() => haptic.light()}
                className={cn(
                  "relative flex flex-col sm:flex-row items-center justify-center gap-1.5",
                  "min-h-[56px] min-w-[64px] flex-1 px-2 py-2 rounded-xl",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset",
                  isActive
                    ? "text-amber-300 font-extrabold"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="broker-nav-active"
                    className="absolute inset-x-1 inset-y-1 rounded-xl bg-amber-500/10 border border-amber-500/20"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative transition-all duration-200",
                    isActive ? "w-5 h-5 stroke-[2.4] text-amber-300" : "w-5 h-5 stroke-[1.8]"
                  )}
                />
                <span
                  className={cn(
                    "relative text-[15px] font-bold leading-none tracking-tight",
                    isActive ? "text-amber-300" : "text-slate-300"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* 더보기 */}
          <button
            type="button"
            aria-label="더보기 메뉴"
            onClick={() => {
              haptic.light();
              setMoreOpen(true);
            }}
            className={cn(
              "relative flex flex-col sm:flex-row items-center justify-center gap-1.5",
              "min-h-[56px] min-w-[64px] flex-1 px-2 py-2 rounded-xl",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset",
              moreOpen
                ? "text-amber-300 font-extrabold"
                : "text-slate-300 hover:text-white"
            )}
          >
            {moreOpen && (
              <motion.div
                layoutId="broker-nav-active"
                className="absolute inset-x-1 inset-y-1 rounded-xl bg-amber-500/10 border border-amber-500/20"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <MoreHorizontal
              className={cn(
                "relative transition-all duration-200",
                moreOpen ? "w-5 h-5 stroke-[2.4] text-amber-300" : "w-5 h-5 stroke-[1.8]"
              )}
            />
            <span
              className={cn(
                "relative text-[15px] font-bold leading-none tracking-tight",
                moreOpen ? "text-amber-300" : "text-slate-300"
              )}
            >
              더보기
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
