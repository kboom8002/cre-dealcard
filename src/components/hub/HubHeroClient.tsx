"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Search } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { useHaptic } from "@/hooks/useHaptic";

interface HubHeroClientProps {
  deals: number;
  brokers: number;
}

export function HubHeroClient({ deals, brokers }: HubHeroClientProps) {
  const haptic = useHaptic();
  const dealsCount = useCountUp(deals, { duration: 1200, delay: 300 });
  const brokersCount = useCountUp(brokers, { duration: 1200, delay: 500 });

  return (
    <section className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-32 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-6 pt-14 pb-8 text-center">

        {/* Status pill with count-up */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 glass-subtle rounded-full px-4 py-1.5 mb-6"
        >
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">
            <span
              ref={dealsCount.ref as React.RefObject<HTMLSpanElement>}
              className="font-bold text-foreground tabular-nums"
            >
              {dealsCount.formatted}
            </span>
            개 딜카드 ·{" "}
            <span className="font-bold text-foreground tabular-nums">
              {brokersCount.formatted}
            </span>
            명 중개인
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-3xl font-extrabold leading-tight tracking-tight mb-4"
        >
          <span className="text-gradient-primary">
            상업용 부동산의
          </span>
          <br />
          <span className="text-foreground">새로운 기준</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto mb-8"
        >
          AI 블라인드 딜카드로 매물 정보를 보호하면서
          <br />
          최적의 매수자를 찾아드립니다.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center gap-3"
        >
          {/* Primary CTA — Von Restorff effect via glow */}
          <Link
            href="/building-radar"
            id="hub-cta-radar"
            onClick={() => haptic.medium()}
            className="group relative flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-6 py-3 text-sm shadow-lg transition-all active:scale-95 animate-glow-pulse"
          >
            <Search className="w-4 h-4" strokeWidth={2.5} />
            무료 딜 검진
            <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Secondary CTA */}
          <Link
            href="/guide"
            id="hub-cta-guide"
            onClick={() => haptic.light()}
            className="flex items-center gap-1.5 glass-subtle rounded-xl px-5 py-3 text-sm font-medium text-foreground hover:bg-white/10 transition-colors active:scale-95"
          >
            가이드 보기
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
