"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Users,
  GitBranch,
  Palette,
  Store,
  CreditCard,
  Radio,
  FileText,
  Calculator,
  UserCircle,
  Bell,
  BookOpen,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BrokerMoreMenuProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    label: "업무 도구",
    items: [
      {
        href: "/broker/memos",
        icon: StickyNote,
        title: "메모함",
        desc: "저장된 유니버설 메모 관리",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/clients",
        icon: Users,
        title: "고객 CRM",
        desc: "고객 관리 · 연락처 · 메모",
        color: "text-blue-400",
        bg: "bg-blue-500/10",
      },
      {
        href: "/broker/pipeline",
        icon: GitBranch,
        title: "딜 파이프라인",
        desc: "8단계 딜 진행 현황",
        color: "text-purple-400",
        bg: "bg-purple-500/10",
      },
      {
        href: "/broker/studio",
        icon: Palette,
        title: "콘텐츠 스튜디오",
        desc: "뉴스레터 큐레이션 · AI 화법 · 화이트라벨",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/leasing",
        icon: Store,
        title: "AI 리싱 스튜디오",
        desc: "사진 분류 → 적합성 분석 → 리싱 페이지",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      {
        href: "/broker/my-card",
        icon: CreditCard,
        title: "Vibe AI 명함",
        desc: "프로필 사진 Vibe 분석 → 상보 배경 명함 생성",
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
      },
    ],
  },
  {
    label: "시장 인텔리전스",
    items: [
      {
        href: "/pulse",
        icon: Radio,
        title: "CRE 펄스",
        desc: "8개 권역 주간 시장 시그널",
        color: "text-indigo-400",
        bg: "bg-indigo-500/10",
      },
      {
        href: "/insight",
        icon: FileText,
        title: "CRE 인사이트",
        desc: "롱폼 분석 · 전문가 기고",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
      },
      {
        href: "/insight/tools",
        icon: Calculator,
        title: "세금 · DD 도구",
        desc: "취득세/양도세 시뮬레이터 · DD 체크리스트",
        color: "text-teal-400",
        bg: "bg-teal-500/10",
      },
    ],
  },
  {
    label: "설정",
    items: [
      {
        href: "/broker/profile",
        icon: UserCircle,
        title: "프로필 관리",
        desc: "이름 · 전문 권역 · 소개 편집",
        color: "text-slate-400",
        bg: "bg-slate-500/10",
      },
      {
        href: "/guide",
        icon: BookOpen,
        title: "이용 가이드",
        desc: "플랫폼 사용법 & FAQ",
        color: "text-slate-400",
        bg: "bg-slate-500/10",
      },
    ],
  },
] as const;

export function BrokerMoreMenu({ open, onClose }: BrokerMoreMenuProps) {
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
              "max-h-[88vh] overflow-y-auto"
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
