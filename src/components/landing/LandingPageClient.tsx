"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { COMPANY_LEGAL_CONFIG } from "@/config/company-legal";
import { useHaptic } from "@/hooks/useHaptic";
import {
  ChevronRight,
  Building2,
  FileSpreadsheet,
  Newspaper,
  Inbox,
  Zap,
} from "lucide-react";

/* ──────────────────────────────────────────────────
   4-Door Commercial Broker Workspace
   ────────────────────────────────────────────────── */
const WORKSPACE_DOORS = [
  {
    id: "newsletter",
    icon: Newspaper,
    emoji: "📰",
    title: "주간/월간 빌딩 뉴스레터",
    tabLabel: "부동산뉴스",
    subtitle: "중개사 실명 브랜드로 정기 시장 브리핑 발송",
    description:
      "권역 실거래 동향과 추천 매물을 엮어\n이메일 웹 매거진으로 전달합니다.",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    glowColor: "rgba(16,185,129,0.16)",
    accentText: "text-emerald-800",
    tag: "DOOR 1 · 부동산뉴스",
  },
  {
    id: "dealcards",
    icon: Zap,
    emoji: "⚡",
    title: "매물 딜카드",
    tabLabel: "딜카드",
    subtitle: "현장 메모 한 줄 → 블라인드 딜카드 즉시 발행",
    description:
      "주소와 현장 메모만 입력하면 공적장부 규격과\n핵심 투자 포인트를 정리한 공유 링크를 만듭니다.",
    gradient: "from-amber-400 via-orange-400 to-rose-400",
    glowColor: "rgba(245,158,11,0.16)",
    accentText: "text-amber-800",
    tag: "DOOR 2 · 딜카드",
  },
  {
    id: "im",
    icon: FileSpreadsheet,
    emoji: "📄",
    title: "10섹션 모바일/PPTX IM",
    tabLabel: "IM",
    subtitle: "Basic IM 투자설명서 원클릭 제작",
    description:
      "투자 포스처에 맞춘 10섹션 모바일 웹 IM과\n고품격 PPTX 투자설명서를 빠르게 완성합니다.",
    gradient: "from-blue-500 via-indigo-500 to-violet-500",
    glowColor: "rgba(99,102,241,0.16)",
    accentText: "text-blue-800",
    tag: "DOOR 3 · IM",
  },
  {
    id: "inbox",
    icon: Inbox,
    emoji: "📬",
    title: "고객 소통함",
    tabLabel: "고객 소통",
    subtitle: "열람 요청 · NDA 승인 · 구독 고객 통합 관리",
    description:
      "블라인드 딜카드·IM 문의와 열람 승인 요청,\n매거진 구독 고객을 한 화면에서 응대합니다.",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    glowColor: "rgba(139,92,246,0.16)",
    accentText: "text-violet-800",
    tag: "DOOR 4 · 고객 소통",
  },
] as const;

const AUTO_PLAY_MS = 5000;

export function LandingPageClient() {
  const haptic = useHaptic();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimers = useCallback(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    const step = 100 / (AUTO_PLAY_MS / 50);
    progressRef.current = setInterval(() => {
      setProgress((p) => Math.min(p + step, 100));
    }, 50);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % WORKSPACE_DOORS.length);
      setProgress(0);
    }, AUTO_PLAY_MS);
  }, []);

  useEffect(() => {
    startTimers();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [startTimers]);

  const goToSlide = (idx: number) => {
    haptic.light();
    setCurrentIndex(idx);
    setProgress(0);
    startTimers();
  };

  const feat = WORKSPACE_DOORS[currentIndex];

  return (
    <main className="min-h-screen bg-[#F5F4F0] text-slate-900 flex flex-col items-center justify-center p-5 relative overflow-hidden">
      {/* ── Ambient subtle paper tints ── */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[160px] pointer-events-none transition-all duration-[1200ms]"
        style={{
          background: feat.glowColor,
          top: "10%",
          left: "-10%",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full blur-[140px] pointer-events-none transition-all duration-[1200ms]"
        style={{
          background: feat.glowColor,
          bottom: "5%",
          right: "-8%",
          opacity: 0.7,
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="w-full max-w-md z-10 flex flex-col items-center py-6">
        {/* ── Brand Logo ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-3 flex items-center gap-3"
        >
          <div className="w-11 h-11 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5 text-blue-700" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            {COMPANY_LEGAL_CONFIG.serviceName}
          </h1>
        </motion.div>

        {/* ── 4-Door Summary Tagline ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-sm text-slate-700 text-center font-medium mb-6 leading-relaxed break-keep"
        >
          주간/월간 빌딩 뉴스레터 · 매물 딜카드 · 10섹션 모바일/PPTX IM · 고객 소통함
        </motion.p>

        {/* ── 4-Door Feature Carousel ── */}
        <div className="w-full relative mb-3" style={{ minHeight: 260 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`w-full rounded-3xl bg-gradient-to-br ${feat.gradient} p-[1.5px] shadow-lg`}
            >
              <div className="rounded-[22px] bg-white p-6 flex flex-col items-center text-center min-h-[248px] justify-center relative overflow-hidden">
                {/* Tag badge */}
                <span
                  className={`absolute top-4 right-4 text-sm font-bold tracking-wide px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 ${feat.accentText}`}
                >
                  {feat.tag}
                </span>

                {/* Number indicator */}
                <span className="absolute top-4 left-4 text-sm font-mono text-slate-500 font-semibold">
                  {String(currentIndex + 1).padStart(2, "0")}/{String(WORKSPACE_DOORS.length).padStart(2, "0")}
                </span>

                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: 0.1,
                  }}
                  className="mb-4 w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center shadow-sm"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {feat.emoji}
                  </span>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-xl font-extrabold text-slate-950 mb-1"
                >
                  {feat.title}
                </motion.h2>

                {/* Subtitle */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`text-sm font-semibold ${feat.accentText} mb-3`}
                >
                  {feat.subtitle}
                </motion.p>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-sm text-slate-700 leading-relaxed whitespace-pre-line max-w-[300px]"
                >
                  {feat.description}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Dot indicators + progress ── */}
        <div className="flex items-center gap-1.5 mb-5">
          {WORKSPACE_DOORS.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => goToSlide(idx)}
              className="relative p-1 min-h-[44px] flex items-center justify-center"
              aria-label={`${f.title} 슬라이드 보기`}
            >
              <div
                className={`rounded-full transition-all duration-300 ${
                  currentIndex === idx
                    ? "w-7 h-2 bg-slate-900"
                    : "w-2 h-2 bg-slate-300 hover:bg-slate-400"
                }`}
              />
              {currentIndex === idx && (
                <div
                  className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-2 rounded-full bg-blue-600/35 origin-left"
                  style={{
                    transform: `scaleX(${progress / 100})`,
                    transition: "transform 50ms linear",
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── 4-Door Quick Switcher Strip ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full grid grid-cols-4 gap-2 mb-6"
        >
          {WORKSPACE_DOORS.map((f, idx) => {
            const FIcon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl transition-all duration-200 ${
                  currentIndex === idx
                    ? "bg-white border border-slate-400 shadow-sm"
                    : "bg-white/60 border border-slate-200 hover:bg-white"
                }`}
              >
                <FIcon
                  className={`w-4 h-4 transition-colors ${
                    currentIndex === idx ? "text-slate-950" : "text-slate-500"
                  }`}
                />
                <span
                  className={`text-sm font-bold tracking-tight transition-colors ${
                    currentIndex === idx ? "text-slate-950" : "text-slate-600"
                  }`}
                >
                  {f.tabLabel}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* ── CTAs ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="w-full flex flex-col gap-3"
        >
          <Link
            href="/login"
            onClick={() => haptic.medium()}
            className="group w-full min-h-[54px] flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-[16px] font-bold py-3.5 rounded-2xl shadow-md transition-all active:scale-[0.98]"
          >
            중개사 워크스페이스 로그인
            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/signup"
            onClick={() => haptic.light()}
            className="w-full min-h-[50px] flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 text-[16px] font-semibold py-3 rounded-2xl transition-colors"
          >
            무료 얼리액세스 회원가입
          </Link>
        </motion.div>

        {/* ── Legal & Operator Footer ── */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 w-full border-t border-slate-300 pt-5 text-center space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-700">
            <Link
              href="/terms"
              onClick={() => haptic.light()}
              className="min-h-[44px] inline-flex items-center hover:text-slate-950 underline underline-offset-4 transition-colors py-1"
            >
              서비스 이용약관
            </Link>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <Link
              href="/privacy"
              onClick={() => haptic.light()}
              className="min-h-[44px] inline-flex items-center font-bold text-slate-900 hover:text-slate-950 underline underline-offset-4 transition-colors py-1"
            >
              개인정보처리방침
            </Link>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <Link
              href="/guide"
              onClick={() => haptic.light()}
              className="min-h-[44px] inline-flex items-center hover:text-slate-950 underline underline-offset-4 transition-colors py-1"
            >
              서비스 안내
            </Link>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {COMPANY_LEGAL_CONFIG.companyName} · {COMPANY_LEGAL_CONFIG.address}
            {COMPANY_LEGAL_CONFIG.businessRegNumber
              ? ` · 사업자등록번호 ${COMPANY_LEGAL_CONFIG.businessRegNumber}`
              : ""}
            <br />
            고객지원: {COMPANY_LEGAL_CONFIG.supportEmail} · 개인정보문의:{" "}
            {COMPANY_LEGAL_CONFIG.privacyContactEmail}
          </p>
        </motion.footer>
      </div>
    </main>
  );
}
