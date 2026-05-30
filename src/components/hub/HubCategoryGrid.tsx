"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  StoreIcon,
  MapPin,
  BarChart3,
  MessageCircle,
  Sparkles,
  Radio,
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
    gradient: "from-blue-600/20 to-blue-400/5",
    border: "border-blue-500/20 hover:border-blue-400/40",
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
    badge: "HOT",
    badgeColor: "bg-blue-500/20 text-blue-300",
  },
  {
    href: "/space/gbd",
    icon: StoreIcon,
    title: "임대 공간",
    subtitle: "즉시 입주 가능 공간",
    gradient: "from-emerald-600/20 to-emerald-400/5",
    border: "border-emerald-500/20 hover:border-emerald-400/40",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  {
    href: "/explore",
    icon: MapPin,
    title: "권역 탐색",
    subtitle: "GBD · YBD · CBD · 성수",
    gradient: "from-amber-600/20 to-amber-400/5",
    border: "border-amber-500/20 hover:border-amber-400/40",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  {
    href: "/market/gbd",
    icon: BarChart3,
    title: "시세 리포트",
    subtitle: "AI 자동 생성 시장 분석",
    gradient: "from-purple-600/20 to-purple-400/5",
    border: "border-purple-500/20 hover:border-purple-400/40",
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/10",
  },
  {
    href: "/agora",
    icon: MessageCircle,
    title: "CRE 아고라",
    subtitle: "AI Q&A · 딜카드 연결",
    gradient: "from-cyan-600/20 to-cyan-400/5",
    border: "border-cyan-500/20 hover:border-cyan-400/40",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
  },
  {
    href: "/services",
    icon: Sparkles,
    title: "전문 서비스",
    subtitle: "인테리어·법률·관리·금융",
    gradient: "from-emerald-600/20 to-teal-400/5",
    border: "border-emerald-500/20 hover:border-teal-400/40",
    iconColor: "text-teal-400",
    iconBg: "bg-teal-500/10",
  },
  {
    href: "/pulse",
    icon: Radio,
    title: "CRE 펄스",
    subtitle: "주간 시장 시그널 분석",
    gradient: "from-indigo-600/20 to-indigo-400/5",
    border: "border-indigo-500/20 hover:border-indigo-400/40",
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/10",
    badge: "NEW",
    badgeColor: "bg-indigo-500/20 text-indigo-300",
  },
  {
    href: "/insight",
    icon: FileText,
    title: "인사이트",
    subtitle: "롱폼 분석·전문가 기고",
    gradient: "from-rose-600/20 to-pink-400/5",
    border: "border-rose-500/20 hover:border-rose-400/40",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
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
                    "absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
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
                <p className="text-sm font-bold text-foreground leading-tight">
                  {cat.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
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
