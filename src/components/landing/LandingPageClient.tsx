"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useHaptic } from "@/hooks/useHaptic";
import { ChevronRight, ShieldCheck, Zap, Sparkles, Building2 } from "lucide-react";

const FEATURES = [
  {
    id: "feature-1",
    icon: <Zap className="w-8 h-8 text-amber-400" />,
    title: "30초 만에 끝나는 모바일 IM",
    description: "카톡 메모만 붙여넣으세요. AI가 7섹션 구조의 완벽한 딜카드를 즉시 생성합니다.",
    color: "from-amber-500/20 to-orange-500/5",
    border: "border-amber-500/20"
  },
  {
    id: "feature-2",
    icon: <Sparkles className="w-8 h-8 text-primary" />,
    title: "AI 기반 정밀 매칭",
    description: "매물과 매수자 조건을 분석하여 S/A 등급의 최적 매칭을 자동으로 추천합니다.",
    color: "from-blue-500/20 to-indigo-500/5",
    border: "border-blue-500/20"
  },
  {
    id: "feature-3",
    icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
    title: "철저한 블라인드 보안",
    description: "매도자의 자산 정보는 철저히 가려지고, 오직 조건이 맞는 매수자에게만 공개됩니다.",
    color: "from-emerald-500/20 to-teal-500/5",
    border: "border-emerald-500/20"
  }
];

export function LandingPageClient() {
  const haptic = useHaptic();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto slide
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FEATURES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-0 w-72 h-72 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md z-10 flex flex-col items-center text-center">
        
        {/* Brand Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-10 flex items-center gap-3"
        >
          <div className="w-12 h-12 bg-primary/20 rounded-2xl border border-primary/30 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">DealCard</h1>
        </motion.div>

        {/* Carousel */}
        <div className="w-full h-56 relative mb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4 }}
              className={`absolute inset-0 w-full h-full rounded-3xl border bg-gradient-to-br ${FEATURES[currentIndex].color} ${FEATURES[currentIndex].border} p-8 flex flex-col items-center justify-center backdrop-blur-md shadow-xl`}
            >
              <div className="mb-4 bg-background/50 p-4 rounded-full border border-white/5">
                {FEATURES[currentIndex].icon}
              </div>
              <h2 className="text-xl font-bold text-white mb-3">{FEATURES[currentIndex].title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                {FEATURES[currentIndex].description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Indicators */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {FEATURES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  haptic.light();
                  setCurrentIndex(idx);
                }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  currentIndex === idx ? "w-6 bg-primary" : "bg-white/20"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full flex flex-col gap-3 mt-10"
        >
          <Link
            href="/login"
            onClick={() => haptic.medium()}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-bold py-4 rounded-2xl shadow-[0_4px_20px_rgba(59,130,246,0.3)] transition-all active:scale-[0.98]"
          >
            중개인 로그인 / 회원가입
            <ChevronRight className="w-5 h-5" />
          </Link>
          
          <Link
            href="/hub"
            onClick={() => haptic.light()}
            className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-semibold py-3.5 rounded-2xl transition-colors"
          >
            일반 사용자 홈으로 가기
          </Link>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8"
        >
          <Link
            href="/guide"
            onClick={() => haptic.light()}
            className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 transition-colors"
          >
            DealCard 서비스 이용 가이드
          </Link>
        </motion.div>

      </div>
    </main>
  );
}
