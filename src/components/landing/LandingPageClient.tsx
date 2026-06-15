"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useHaptic } from "@/hooks/useHaptic";
import {
  ChevronRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Building2,
  Mic,
  BarChart3,
  Users,
  Volume2,
} from "lucide-react";

/* ──────────────────────────────────────────────────
   7 Killer Features — immersive carousel content
   ────────────────────────────────────────────────── */
const FEATURES = [
  {
    id: "memo",
    icon: Mic,
    emoji: "🎙️",
    title: "유니버설 메모",
    subtitle: "말 한마디가 딜이 됩니다",
    description:
      "음성이든 텍스트든, 메모만 던지세요.\nAI가 매물·매수자·메모를 자동 분류합니다.",
    gradient: "from-violet-600 via-purple-600 to-indigo-700",
    glowColor: "rgba(139,92,246,0.35)",
    accentText: "text-violet-300",
    tag: "CORE",
  },
  {
    id: "dealcard",
    icon: Zap,
    emoji: "⚡",
    title: "30초 딜카드",
    subtitle: "카톡 메모 → AI 구조화",
    description:
      "메모 한 줄을 붙여넣으면 AI가\n7섹션 블라인드 딜카드를 즉시 생성합니다.",
    gradient: "from-amber-600 via-orange-600 to-red-600",
    glowColor: "rgba(245,158,11,0.35)",
    accentText: "text-amber-300",
    tag: "SIGNATURE",
  },
  {
    id: "persona",
    icon: Sparkles,
    emoji: "🧠",
    title: "AI 매수자 페르소나",
    subtitle: "이 건물, 누가 사겠습니까?",
    description:
      "매물 신호를 분석해 3명의 가상 매수자 프로필과\n맞춤 접근 전략을 자동 생성합니다.",
    gradient: "from-cyan-600 via-blue-600 to-indigo-600",
    glowColor: "rgba(34,211,238,0.3)",
    accentText: "text-cyan-300",
    tag: "AI",
  },
  {
    id: "im",
    icon: Volume2,
    emoji: "📄",
    title: "모바일 IM + 음성 브리핑",
    subtitle: "프리미엄 투자설명서를 2분 만에",
    description:
      "7섹션 아코디언 IM을 자동 생성하고,\nTTS 음성 브리핑까지 한번에 제공합니다.",
    gradient: "from-emerald-600 via-teal-600 to-cyan-700",
    glowColor: "rgba(16,185,129,0.35)",
    accentText: "text-emerald-300",
    tag: "PREMIUM",
  },
  {
    id: "matching",
    icon: Users,
    emoji: "🎯",
    title: "6축 AI 정밀 매칭",
    subtitle: "S/A/B/C 등급 자동 추천",
    description:
      "권역·자산·규모·가격·목적·타이밍\n6가지 축으로 매물-매수자를 자동 매칭합니다.",
    gradient: "from-blue-600 via-indigo-600 to-purple-700",
    glowColor: "rgba(99,102,241,0.35)",
    accentText: "text-blue-300",
    tag: "MATCHING",
  },
  {
    id: "blind",
    icon: ShieldCheck,
    emoji: "🔒",
    title: "Gate 블라인드 보안",
    subtitle: "상세주소는 승인 후에만 공개",
    description:
      "매도자 정보는 철저히 가려지고,\n관심 매수자의 열람 요청을 중개인이 직접 통제합니다.",
    gradient: "from-slate-600 via-zinc-700 to-neutral-800",
    glowColor: "rgba(100,116,139,0.3)",
    accentText: "text-slate-300",
    tag: "SECURITY",
  },
  {
    id: "pipeline",
    icon: BarChart3,
    emoji: "📊",
    title: "파이프라인 & ROI",
    subtitle: "내 성과를 데이터로 관리",
    description:
      "8단계 딜 파이프라인, 체류 경고 시스템,\n주간 리포트로 딜 클로징 확률을 높입니다.",
    gradient: "from-rose-600 via-pink-600 to-fuchsia-700",
    glowColor: "rgba(244,63,94,0.3)",
    accentText: "text-rose-300",
    tag: "ANALYTICS",
  },
];

const AUTO_PLAY_MS = 5000;

export function LandingPageClient() {
  const haptic = useHaptic();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoPlay = useCallback(() => {
    // Progress bar
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(0);
    const step = 100 / (AUTO_PLAY_MS / 50);
    progressRef.current = setInterval(() => {
      setProgress((p) => Math.min(p + step, 100));
    }, 50);

    // Slide advance
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FEATURES.length);
      setProgress(0);
    }, AUTO_PLAY_MS);
  }, []);

  useEffect(() => {
    startAutoPlay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [startAutoPlay]);

  const goToSlide = (idx: number) => {
    haptic.light();
    setCurrentIndex(idx);
    setProgress(0);
    startAutoPlay();
  };

  const feat = FEATURES[currentIndex];
  const Icon = feat.icon;

  return (
    <main className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-5 relative overflow-hidden select-none">
      {/* ── Ambient blurs ── */}
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
          opacity: 0.5,
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="w-full max-w-md z-10 flex flex-col items-center">
        {/* ── Logo ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="w-11 h-11 bg-primary/20 rounded-2xl border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            DealCard
          </h1>
        </motion.div>

        {/* ── Tagline ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-xs text-slate-500 tracking-widest uppercase font-medium mb-6"
        >
          AI-Powered CRE Deal Platform
        </motion.p>

        {/* ── Feature Carousel ── */}
        <div className="w-full relative mb-3" style={{ minHeight: 260 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`w-full rounded-3xl bg-gradient-to-br ${feat.gradient} p-[1px] shadow-2xl`}
              style={{
                boxShadow: `0 20px 60px -15px ${feat.glowColor}, 0 0 0 1px rgba(255,255,255,0.05)`,
              }}
            >
              <div className="rounded-3xl bg-black/40 backdrop-blur-xl p-6 flex flex-col items-center text-center min-h-[240px] justify-center relative overflow-hidden">
                {/* Tag badge */}
                <span
                  className={`absolute top-4 right-4 text-[9px] font-bold tracking-widest px-2.5 py-1 rounded-full border border-white/10 bg-white/5 ${feat.accentText}`}
                >
                  {feat.tag}
                </span>

                {/* Number indicator */}
                <span className="absolute top-4 left-4 text-[10px] font-mono text-white/20">
                  {String(currentIndex + 1).padStart(2, "0")}/{String(FEATURES.length).padStart(2, "0")}
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
                  className="mb-4 w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm"
                >
                  <span className="text-3xl">{feat.emoji}</span>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-xl font-extrabold text-white mb-1"
                >
                  {feat.title}
                </motion.h2>

                {/* Subtitle */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`text-xs font-semibold ${feat.accentText} mb-3`}
                >
                  {feat.subtitle}
                </motion.p>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-[13px] text-slate-300/90 leading-relaxed whitespace-pre-line max-w-[280px]"
                >
                  {feat.description}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Dot indicators + progress ── */}
        <div className="flex items-center gap-1.5 mb-8">
          {FEATURES.map((f, idx) => (
            <button
              key={f.id}
              onClick={() => goToSlide(idx)}
              className="relative p-0.5"
              aria-label={`Go to ${f.title}`}
            >
              <div
                className={`rounded-full transition-all duration-300 ${
                  currentIndex === idx
                    ? "w-7 h-2 bg-white"
                    : "w-2 h-2 bg-white/15 hover:bg-white/30"
                }`}
              />
              {/* Progress overlay on active dot */}
              {currentIndex === idx && (
                <div
                  className="absolute inset-0.5 rounded-full bg-white/40 origin-left"
                  style={{
                    transform: `scaleX(${progress / 100})`,
                    transition: "transform 50ms linear",
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Mini feature strip (quick glance) ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full flex gap-1 mb-6 overflow-x-auto scrollbar-none"
        >
          {FEATURES.map((f, idx) => {
            const FIcon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => goToSlide(idx)}
                className={`shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 ${
                  currentIndex === idx
                    ? "bg-white/10 border border-white/15 scale-105"
                    : "bg-white/[0.03] border border-transparent hover:bg-white/5"
                }`}
                style={{ minWidth: 52 }}
              >
                <FIcon
                  className={`w-3.5 h-3.5 transition-colors ${
                    currentIndex === idx ? "text-white" : "text-white/30"
                  }`}
                />
                <span
                  className={`text-[8px] font-bold tracking-wide transition-colors ${
                    currentIndex === idx ? "text-white/90" : "text-white/20"
                  }`}
                >
                  {f.tag}
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
            className="group w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-bold py-4 rounded-2xl shadow-[0_4px_25px_rgba(59,130,246,0.35)] transition-all active:scale-[0.98]"
          >
            중개인 로그인 / 회원가입
            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/hub"
            onClick={() => haptic.light()}
            className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-semibold py-3.5 rounded-2xl transition-colors"
          >
            일반 사용자 홈으로 가기
          </Link>
        </motion.div>

        {/* ── Footer ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 flex items-center gap-4"
        >
          <Link
            href="/guide"
            onClick={() => haptic.light()}
            className="text-[10px] text-slate-600 hover:text-slate-400 underline underline-offset-4 transition-colors"
          >
            서비스 이용 가이드
          </Link>
          <span className="text-slate-800">•</span>
          <Link
            href="/explore"
            onClick={() => haptic.light()}
            className="text-[10px] text-slate-600 hover:text-slate-400 underline underline-offset-4 transition-colors"
          >
            매물 탐색
          </Link>
          <span className="text-slate-800">•</span>
          <Link
            href="/pulse"
            onClick={() => haptic.light()}
            className="text-[10px] text-slate-600 hover:text-slate-400 underline underline-offset-4 transition-colors"
          >
            시장 펄스
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
