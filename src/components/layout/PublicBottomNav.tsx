"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutGrid,
  Building2,
  MessageCircle,
  Sparkles,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  {
    href: "/hub",
    label: "Hub",
    icon: LayoutGrid,
    ariaLabel: "DealCard Hub 홈",
  },
  {
    href: "/deal/gbd",
    label: "딜카드",
    icon: Building2,
    ariaLabel: "딜카드 목록",
  },
  {
    href: "/agora",
    label: "아고라",
    icon: MessageCircle,
    ariaLabel: "CRE 아고라 커뮤니티",
  },
  {
    href: "/services",
    label: "서비스",
    icon: Sparkles,
    ariaLabel: "전문 서비스 파트너",
  },
  {
    href: "/pulse",
    label: "펄스",
    icon: Radio,
    ariaLabel: "CRE 펄스 시그널",
  },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/hub") return pathname === "/hub" || pathname === "/";
  return pathname.startsWith(href);
}

export function PublicBottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Hide on scroll down, reveal on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      if (current > lastScrollY.current + 4) {
        setVisible(false);
      } else if (current < lastScrollY.current - 4) {
        setVisible(true);
      }
      lastScrollY.current = current;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          role="navigation"
          aria-label="주요 탐색"
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 md:hidden",
            "glass-medium border-t border-white/10",
            "pb-[env(safe-area-inset-bottom,0px)]"
          )}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        >
          <div className="flex items-stretch justify-around px-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.ariaLabel}
                  aria-current={active ? "page" : undefined}
                  onClick={() => haptic.light()}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5",
                    "min-h-[56px] min-w-[52px] flex-1 px-1 py-2",
                    "rounded-none transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                    active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {/* Spring-animated active background pill */}
                  {active && (
                    <motion.div
                      layoutId="nav-active-pill"
                      className="absolute inset-x-1 inset-y-1.5 rounded-xl bg-blue-500/12"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 36,
                      }}
                    />
                  )}

                  <div className="relative">
                    <Icon
                      className={cn(
                        "transition-all duration-200",
                        active ? "w-5 h-5 stroke-[2.2]" : "w-5 h-5 stroke-[1.8]"
                      )}
                    />
                    {/* Active dot indicator */}
                    {active && (
                      <motion.div
                        layoutId="nav-dot"
                        className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-blue-400"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      />
                    )}
                  </div>

                  <span
                    className={cn(
                      "text-[10px] font-medium leading-none transition-all duration-200",
                      active ? "font-semibold" : ""
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
