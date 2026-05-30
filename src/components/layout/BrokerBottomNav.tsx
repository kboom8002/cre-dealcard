"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

const NAV_ITEMS = [
  {
    href: "/broker",
    icon: LayoutDashboard,
    label: "홈",
    id: "nav-home",
    ariaLabel: "브로커 대시보드 홈",
  },
  {
    href: "/broker/clients",
    icon: Users,
    label: "고객",
    id: "nav-clients",
    ariaLabel: "고객 목록",
  },
  {
    href: "/broker/buildings",
    icon: Building2,
    label: "매물",
    id: "nav-buildings",
    ariaLabel: "매물 목록",
  },
  {
    href: "/broker/matching",
    icon: Target,
    label: "매칭",
    id: "nav-matching",
    ariaLabel: "AI 매칭",
  },
  {
    href: "/broker/pipeline",
    icon: GitBranch,
    label: "파이프",
    id: "nav-pipeline",
    ariaLabel: "파이프라인",
  },
] as const;

export default function BrokerBottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();

  return (
    <nav
      role="navigation"
      aria-label="브로커 메인 탐색"
      id="broker-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 glass-medium border-t border-white/10 pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="max-w-lg mx-auto flex items-stretch justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/broker"
              ? pathname === "/broker"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              id={item.id}
              aria-label={item.ariaLabel}
              aria-current={isActive ? "page" : undefined}
              onClick={() => haptic.light()}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5",
                "min-h-[54px] min-w-[52px] flex-1 px-1 py-2 rounded-none",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Spring-animated active background */}
              {isActive && (
                <motion.div
                  layoutId="broker-nav-active"
                  className="absolute inset-x-1 inset-y-1 rounded-xl bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}

              <Icon
                className={cn(
                  "relative transition-all duration-200",
                  isActive
                    ? "w-5 h-5 stroke-[2.2]"
                    : "w-5 h-5 stroke-[1.7]"
                )}
              />
              <span
                className={cn(
                  "relative text-[10px] font-medium leading-none",
                  isActive && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
