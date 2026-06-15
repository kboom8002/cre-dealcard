"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Search, Building2 } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { useHaptic } from "@/hooks/useHaptic";
import { UnifiedSearchBar } from "../search/UnifiedSearchBar";
import { useRouter } from "next/navigation";

interface HubHeroClientProps {
  deals: number;
  brokers: number;
}

export function HubHeroClient({ deals, brokers }: HubHeroClientProps) {
  const haptic = useHaptic();
  const router = useRouter();
  const dealsCount = useCountUp(deals, { duration: 1200, delay: 300 });
  const brokersCount = useCountUp(brokers, { duration: 1200, delay: 500 });

  const handleQuickChipClick = (region: string) => {
    haptic.light();
    router.push(`/search?q=${encodeURIComponent(region)}&type=deal`);
  };

  const quickRegions = [
    { label: "GBD (강남)", value: "GBD" },
    { label: "YBD (여의도)", value: "YBD" },
    { label: "CBD (도심)", value: "CBD" },
    { label: "성수", value: "성수" },
    { label: "판교", value: "판교" }
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-32 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Right Broker Portal Link */}
      <div className="absolute top-4 right-4 z-50">
        <Link
          href="/"
          onClick={() => haptic.light()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-all backdrop-blur-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          중개인 포털
        </Link>
      </div>

      <div className="relative max-w-2xl mx-auto px-6 pt-14 pb-10 text-center">

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
          className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight mb-4"
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
          className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-md mx-auto mb-8"
        >
          AI 블라인드 딜카드로 매물 정보를 보호하면서
          <br />
          최적의 매수자와 전문 중개인을 연결해 드립니다.
        </motion.p>

        {/* Search Bar - Principal CTA for SEO/UX conversion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xl mx-auto mb-4"
        >
          <UnifiedSearchBar />
        </motion.div>

        {/* Popular Quick Search Chips */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center justify-center gap-2 mb-8"
        >
          <span className="text-xs text-muted-foreground mr-1">인기 검색:</span>
          {quickRegions.map((region) => (
            <button
              key={region.value}
              onClick={() => handleQuickChipClick(region.value)}
              className="text-xs px-2.5 py-1 rounded-full border border-white/5 bg-white/2.5 text-muted-foreground hover:text-foreground hover:bg-white/5 hover:border-white/10 transition-all"
              type="button"
            >
              {region.label}
            </button>
          ))}
        </motion.div>

        {/* CTA Buttons - Shifted below search bar and styled secondary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center gap-3"
        >
          <Link
            href="/building-radar"
            id="hub-cta-radar"
            onClick={() => haptic.medium()}
            className="group relative flex items-center gap-2 bg-white/5 hover:bg-white/10 text-foreground font-medium rounded-xl px-5 py-2.5 text-xs transition-all active:scale-95 border border-white/10"
          >
            무료 딜 검진
            <ArrowRight className="w-3 h-3 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/guide"
            id="hub-cta-guide"
            onClick={() => haptic.light()}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            가이드 보기
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
