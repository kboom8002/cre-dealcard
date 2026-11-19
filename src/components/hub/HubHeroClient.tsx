"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { UnifiedSearchBar } from "../search/UnifiedSearchBar";
import { useRouter } from "next/navigation";

interface HubHeroClientProps {
  deals: number;
  brokers: number;
}

function useHeroCountDisplay(target: number, durationMs: number, delayMs: number): string {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const safeTarget = Math.max(0, Math.round(target));
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    if (reduced || safeTarget === 0) {
      rafId = window.requestAnimationFrame(() => {
        setValue(safeTarget);
      });
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
      };
    }

    const timer = window.setTimeout(() => {
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * safeTarget));
        if (progress < 1) {
          rafId = window.requestAnimationFrame(step);
        }
      };
      rafId = window.requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [target, durationMs, delayMs]);

  return new Intl.NumberFormat("ko-KR").format(value);
}

export function HubHeroClient({ deals, brokers }: HubHeroClientProps) {
  const haptic = useHaptic();
  const router = useRouter();
  const dealsFormatted = useHeroCountDisplay(deals, 1200, 300);
  const brokersFormatted = useHeroCountDisplay(brokers, 1200, 500);

  const handleQuickChipClick = (region: string) => {
    haptic.light();
    router.push(`/search?q=${encodeURIComponent(region)}&type=deal`);
  };

  const quickRegions = [
    { label: "GBD (강남)", value: "GBD" },
    { label: "YBD (여의도)", value: "YBD" },
    { label: "CBD (도심)", value: "CBD" },
    { label: "성수", value: "성수" },
    { label: "판교", value: "판교" },
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-32 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Right Broker Portal Link */}
      <div className="absolute top-4 right-4 z-50">
        <Link
          href="/"
          onClick={() => haptic.light()}
          className="flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all shadow-xs"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          중개인 포털
        </Link>
      </div>

      <div className="relative max-w-2xl mx-auto px-6 pt-16 pb-10 text-center">
        {/* Status pill with count-up */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-1.5 mb-6 shadow-xs"
        >
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-slate-700">
            <span className="font-bold text-slate-900 tabular-nums">{dealsFormatted}</span>개 딜카드
            {" · "}
            <span className="font-bold text-slate-900 tabular-nums">{brokersFormatted}</span>명 중개인
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight mb-4"
        >
          <span className="text-gradient-primary">상업용 부동산의</span>
          <br />
          <span className="text-slate-900">새로운 기준</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm md:text-base text-slate-700 leading-relaxed max-w-md mx-auto mb-8"
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
          <span className="text-sm text-slate-600 mr-1">인기 검색:</span>
          {quickRegions.map((region) => (
            <button
              key={region.value}
              onClick={() => handleQuickChipClick(region.value)}
              className="min-h-[44px] text-sm px-3.5 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-300 transition-all"
              type="button"
            >
              {region.label}
            </button>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center gap-3"
        >
          <Link
            href="/search?type=deal"
            id="hub-cta-radar"
            onClick={() => haptic.medium()}
            className="group relative flex min-h-[48px] items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all active:scale-95 border border-slate-200 shadow-xs"
          >
            매물 딜카드 탐색
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/guide"
            id="hub-cta-guide"
            onClick={() => haptic.light()}
            className="flex min-h-[48px] items-center gap-1.5 px-3 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            가이드 보기
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
