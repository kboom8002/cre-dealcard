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
  CalendarCheck,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BrokerMoreMenuProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
}

const SECTIONS = [
  {
    label: "핵심 업무 도구",
    items: [
      {
        href: "/broker/magazine-editor?mode=simple",
        icon: Palette,
        title: "주간 소식지(매거진) 만들기",
        desc: "5분 간편 작성 · 이메일 발송 · 카톡 링크 복사",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/clients",
        icon: Users,
        title: "고객 · 구독자 명단",
        desc: "소식지 받는 고객 관리 · 연락처 · 메모",
        color: "text-blue-400",
        bg: "bg-blue-500/10",
      },
      /* DORMANT: ux60-focus — 복원 시 docs/rollback/2026-10-18-dormant-features.md 참조
      {
        href: "/broker/memos",
        icon: StickyNote,
        title: "메모함",
        desc: "저장된 유니버설 메모 관리",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/schedule",
        icon: CalendarCheck,
        title: "임장 일정 관리",
        desc: "가용 슬롯 · 예약 현황 · 대기열",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
      },
      {
        href: "/broker/circles",
        icon: Users,
        title: "내 서클 (팀 매칭)",
        desc: "신뢰 동료 자산 공유 · 팀 AI 매칭",
        color: "text-amber-300",
        bg: "bg-amber-500/10",
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
        href: "/broker/funnel",
        icon: GitBranch,
        title: "행동 퍼널 분석",
        desc: "딜카드 열람부터 계약까지 전환율 시각화",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
      },
      {
        href: "/broker/campaign",
        icon: FileText,
        title: "캠페인 카피 AI",
        desc: "인스타그램, 블로그, 문자용 홍보 문구 자동 생성",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      */
      /* DORMANT: leasing-studio — AI 리싱 스튜디오 (복구 시 주석 해제)
      {
        href: "/broker/leasing",
        icon: Store,
        title: "AI 리싱 스튜디오",
        desc: "사진 분류 → 적합성 분석 → 리싱 페이지",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      */
    ],
  },
  /* DORMANT: public-pages — 시장 인텔리전스 섹션 전체 (복구 시 주석 해제)
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
  */
  {
    label: "내 정보 · 안내",
    items: [
      {
        href: "/broker/profile",
        icon: UserCircle,
        title: "내 프로필 · 사무소 정보",
        desc: "이름 · 상호 · 연락처 · 사진 편집",
        color: "text-slate-300",
        bg: "bg-slate-500/10",
      },
      {
        href: "/broker/tutorial",
        icon: BookOpen,
        title: "쉬운 이용 안내 (사진·영상 매뉴얼)",
        desc: "1분 딜카드 · PPTX 제안서(IM) · 주간 소식지 단계별 사용법",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
    ],
  },
] as const;

const SUPER_ADMIN_EMAILS = ["kboom8002@gmail.com"];

const ADMIN_SECTION = {
  label: "Super Admin",
  items: [
    {
      href: "/broker/golden-admin",
      icon: Shield,
      title: "Golden Set / Glossary",
      desc: "Golden Set, Prompt, Few-shot, Terminology",
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
  ],
};

export function BrokerMoreMenu({ open, onClose, userEmail }: BrokerMoreMenuProps) {
  const isSuperAdmin = userEmail && SUPER_ADMIN_EMAILS.includes(userEmail);
  const allSections = isSuperAdmin ? [...SECTIONS, ADMIN_SECTION] : SECTIONS;
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
              <p className="text-[16px] font-bold text-white">전체 메뉴</p>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 pb-3 space-y-5">
              {allSections.map((section) => (
                <div key={section.label}>
                  <p className="text-[13px] font-bold text-slate-400 px-1 mb-2">
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
                          className="flex items-center gap-3.5 bg-[#131b2e] border border-slate-800 rounded-xl px-4 py-3.5 min-h-[56px] hover:border-slate-600 transition-all group"
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.bg)}>
                            <Icon className={cn("w-5 h-5", item.color)} strokeWidth={2.2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-bold text-white leading-snug mb-0.5">
                              {item.title}
                            </p>
                            <p className="text-[13px] text-slate-300 leading-snug">{item.desc}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors shrink-0" />
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
