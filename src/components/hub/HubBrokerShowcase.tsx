"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { BrokerResultCard, BrokerCardData } from "../search/BrokerResultCard";

interface HubBrokerShowcaseProps {
  brokers: BrokerCardData[];
}

export function HubBrokerShowcase({ brokers }: HubBrokerShowcaseProps) {
  const haptic = useHaptic();

  if (!brokers || brokers.length === 0) return null;

  return (
    <section className="relative overflow-hidden py-12 border-t border-b border-slate-200 bg-slate-50/70">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-72 h-72 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div className="text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-sm font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>전문 권역 기반 공인중개사</span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground">
              공개 활동 파트너 중개사
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              전문 권역과 취급 자산 유형을 기준으로 등록된 공인중개사 프로필을 확인해 보세요.
            </p>
          </div>

          <Link
            href="/search?type=broker"
            onClick={() => haptic.light()}
            className="flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:text-primary/90 transition-colors"
          >
            <span>전체 보기</span>
            <ArrowRight className="w-4 h-4" />
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
