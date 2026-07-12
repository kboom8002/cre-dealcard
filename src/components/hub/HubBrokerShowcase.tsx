"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { UserCheck, ArrowRight, Sparkles } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { BrokerResultCard, BrokerCardData } from "../search/BrokerResultCard";

interface HubBrokerShowcaseProps {
  brokers: BrokerCardData[];
}

export function HubBrokerShowcase({ brokers }: HubBrokerShowcaseProps) {
  const haptic = useHaptic();

  if (!brokers || brokers.length === 0) return null;

  return (
    <section className="relative overflow-hidden py-14 border-t border-b border-white/5 bg-gradient-to-b from-transparent via-[#090d17]/30 to-transparent">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-72 h-72 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div className="text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/10 bg-amber-500/5 text-amber-400 text-[10px] font-bold mb-3">
              <Sparkles className="w-3 h-3" />
              <span>VTI 성향 기반 전문 중개인</span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground">
              검증된 파트너 중개사
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              AI가 매수 성향과 전문 권역을 분석하여 고객님에게 최적화된 최고의 전문 중개인을 매칭해 드립니다.
            </p>
          </div>

          <Link
            href="/search?type=broker"
            onClick={() => haptic.light()}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/90 transition-colors"
          >
            <span>전체 보기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brokers.slice(0, 3).map((broker, idx) => (
            <motion.div
              key={broker.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <BrokerResultCard broker={broker} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
