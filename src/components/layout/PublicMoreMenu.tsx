"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Building2,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicMoreMenuProps {
  open: boolean;
  onClose: () => void;
}

export const PUBLIC_MORE_MENU_SECTIONS = [
  {
    label: "중개인 전용",
    items: [
      {
        href: "/",
        icon: Building2,
        title: "중개인 포털 홈",
        desc: "내 파이프라인 및 AI 매칭 관리",
        color: "text-blue-700",
        bg: "bg-blue-50",
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
        color: "text-rose-700",
        bg: "bg-rose-50",
      },
    ],
  },
] as const;

const SECTIONS = PUBLIC_MORE_MENU_SECTIONS;

export function PublicMoreMenu({ open, onClose }: PublicMoreMenuProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-white text-slate-900 border-t border-slate-200 shadow-2xl rounded-t-3xl",
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
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-base font-bold text-slate-900">더보기</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 pb-3 space-y-5">
              {SECTIONS.map((section) => (
                <div key={section.label}>
                  <p className="text-sm font-bold text-slate-600 px-1 mb-2">
                    {section.label}
                  </p>
                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className="flex items-center gap-3.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 min-h-[56px] hover:border-slate-300 hover:bg-slate-100 transition-all group"
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.bg)}>
                            <Icon className={cn("w-5 h-5", item.color)} strokeWidth={2.2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-bold text-slate-900 leading-snug mb-0.5">
                              {item.title}
                            </p>
                            <p className="text-sm text-slate-600 leading-snug">{item.desc}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors shrink-0" />
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
