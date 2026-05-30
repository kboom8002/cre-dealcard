"use client";

import { motion } from "motion/react";
import {
  FilePlus,
  Building2,
  UserPlus,
  Search,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useHaptic } from "@/hooks/useHaptic";

const ACTIONS = [
  {
    href: "/broker/deal-card/new",
    icon: FilePlus,
    label: "매매 딜카드 등록",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20 hover:border-blue-400/40",
    description: "새 매매물건 카드 생성",
  },
  {
    href: "/broker/lease-card/new",
    icon: Building2,
    label: "임대차 딜카드 등록",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-400/40",
    description: "새 임대차 카드 생성",
  },
  {
    href: "/broker/buyer-intents/new",
    icon: UserPlus,
    label: "매수 의향서 등록",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20 hover:border-purple-400/40",
    description: "매수 고객 의향 등록",
  },
  {
    href: "/broker/matching",
    icon: Search,
    label: "AI 매칭 실행",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20 hover:border-amber-400/40",
    description: "매물-고객 자동 매칭",
  },
] as const;

export function QuickActions() {
  const haptic = useHaptic();

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
        빠른 액션
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {ACTIONS.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 + 0.2, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={action.href}
                onClick={() => haptic.light()}
                className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition-all active:scale-95 hover:shadow-elevation-1 ${action.bg}`}
              >
                <div className="shrink-0">
                  <Icon className={`w-5 h-5 ${action.color}`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground leading-tight">
                    {action.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">
                    {action.description}
                  </p>
                </div>
                <ArrowRight
                  className={`w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ${action.color}`}
                  strokeWidth={2.5}
                />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
