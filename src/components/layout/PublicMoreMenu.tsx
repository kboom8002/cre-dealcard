"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Radar,
  ClipboardCheck,
  Building2,
  Scale,
  Wrench,
  BookOpen,
  Calculator,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicMoreMenuProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    label: "딜 도구",
    items: [
      {
        href: "/building-radar",
        icon: Radar,
        title: "빌딩 레이더",
        desc: "주소 → 딜 리포트 즉시 생성",
        color: "text-blue-400",
        bg: "bg-blue-500/10",
      },
      {
        href: "/owner-readiness",
        icon: ClipboardCheck,
        title: "매각 준비도 체크",
        desc: "10개 항목 자가 진단 & IM 자격 확인",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      {
        href: "/insight/tools",
        icon: Calculator,
        title: "세금 · DD 도구",
        desc: "취득세/양도세 시뮬레이터 · DD 체크리스트",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
    ],
  },
  {
    label: "파트너 & 서비스",
    items: [
      {
        href: "/services",
        icon: Wrench,
        title: "전문 서비스",
        desc: "인테리어 · 법률 · 세무 · PM · 금융",
        color: "text-teal-400",
        bg: "bg-teal-500/10",
      },
      {
        href: "/marketplace",
        icon: Building2,
        title: "비공개 임대 마켓",
        desc: "블라인드 공실 AI 필터 검색",
        color: "text-purple-400",
        bg: "bg-purple-500/10",
      },
    ],
  },
  {
    label: "가이드 & 정보",
    items: [
      {
        href: "/guide",
        icon: BookOpen,
        title: "이용 가이드",
        desc: "매매·임대·투자 3단계 가이드 & FAQ",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
      },
      {
        href: "/services/legal",
        icon: Scale,
        title: "법률 · 세무 상담",
        desc: "검증된 CRE 전문 파트너",
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
      },
    ],
  },
] as const;

export function PublicMoreMenu({ open, onClose }: PublicMoreMenuProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-[#0e1424] border-t border-slate-800 rounded-t-3xl",
              "pb-[calc(env(safe-area-inset-bottom,0px)+70px)]",
              "max-h-[85vh] overflow-y-auto"
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-sm font-bold text-white">더보기</p>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-2 space-y-5">
              {SECTIONS.map((section) => (
                <div key={section.label}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-2">
                    {section.label}
                  </p>
                  <div className="space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-xl px-4 py-3 hover:border-slate-700 transition-all group"
                        >
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.bg)}>
                            <Icon className={cn("w-4 h-4", item.color)} strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white leading-none mb-0.5">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-slate-500 leading-snug">{item.desc}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
