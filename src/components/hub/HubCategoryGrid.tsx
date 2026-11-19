"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  Building2,
  StoreIcon,
  Sparkles,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  {
    href: "/deal/gbd",
    icon: Building2,
    title: "매매 딜카드",
    subtitle: "블라인드 매물 탐색",
    gradient: "from-blue-600/10 to-blue-400/5",
    border: "border-blue-500/20 hover:border-blue-500/40",
    iconColor: "text-blue-700",
    iconBg: "bg-blue-500/10",
    badge: "HOT",
    badgeColor: "bg-blue-100 text-blue-800",
  },
  {
    href: "/space/gbd",
    icon: StoreIcon,
    title: "임대 공간",
    subtitle: "즉시 입주 가능 공간",
    gradient: "from-emerald-600/10 to-emerald-400/5",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    iconColor: "text-emerald-700",
    iconBg: "bg-emerald-500/10",
  },
  {
    href: "/magazine",
    icon: FileText,
    title: "주간 매거진",
    subtitle: "권역별 빌딩 시장 브리핑",
    gradient: "from-indigo-600/10 to-indigo-400/5",
    border: "border-indigo-500/20 hover:border-indigo-500/40",
    iconColor: "text-indigo-700",
    iconBg: "bg-indigo-500/10",
  },
  {
    href: "/guide",
    icon: Sparkles,
    title: "이용 가이드",
    subtitle: "블라인드 딜카드·IM 안내",
    gradient: "from-amber-500/10 to-teal-400/5",
    border: "border-amber-500/25 hover:border-amber-500/45",
    iconColor: "text-amber-800",
    iconBg: "bg-amber-500/10",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function HubCategoryGrid() {
  const haptic = useHaptic();

  return (
    <motion.div
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        return (
          <motion.div key={cat.href} variants={itemVariants}>
            <Link
              href={cat.href}
              onClick={() => haptic.light()}
              className={cn(
                "group relative flex flex-col p-4 rounded-2xl border transition-all duration-200",
                "bg-gradient-to-br",
                cat.gradient,
                cat.border,
                "hover:shadow-elevation-2 active:scale-95"
              )}
            >
              {/* Badge */}
              {cat.badge && (
                <span
                  className={cn(
                    "absolute top-3 right-3 text-sm font-bold px-2 py-0.5 rounded-full uppercase tracking-wide",
                    cat.badgeColor
                  )}
                >
                  {cat.badge}
                </span>
              )}

              {/* Icon */}
              <div
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center mb-3",
                  cat.iconBg
                )}
              >
                <Icon
                  className={cn("w-4.5 h-4.5", cat.iconColor)}
                  strokeWidth={2}
                />
              </div>

              {/* Text */}
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {cat.title}
                </p>
                <p className="text-sm text-slate-600 mt-0.5 leading-snug">
                  {cat.subtitle}
                </p>
              </div>

              {/* Arrow hint on hover */}
              <ArrowUpRight
                className={cn(
                  "absolute bottom-3 right-3 w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
                  cat.iconColor
                )}
                strokeWidth={2.5}
              />
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
