import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Building2,
  ArrowRight,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { HubHeroClient } from "@/components/hub/HubHeroClient";
import { HubCategoryGrid } from "@/components/hub/HubCategoryGrid";

export const metadata: Metadata = {
  title: "DealCard Hub | 상업용 부동산의 새로운 기준",
  description:
    "AI 기반 블라인드 딜카드로 상업용 부동산 매매·임대를 안전하고 빠르게. 검증된 중개인, 실시간 시세 리포트, 권역별 매물 탐색.",
  openGraph: {
    title: "DealCard Hub — 상업용 부동산의 새로운 기준",
    description: "블라인드 딜카드 · AI 매칭 · 시세 리포트",
  },
};

export const revalidate = 3600;

async function fetchStats() {
  try {
    const supabase = createServiceClient();
    const [{ count: deals }, { count: brokers }] = await Promise.all([
      supabase
        .from("building_ssot_lite")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "broker"),
    ]);
    return { deals: deals ?? 0, brokers: brokers ?? 0 };
  } catch {
    return { deals: 0, brokers: 0 };
  }
}

export default async function HubPage() {
  const stats = await fetchStats();

  return (
    <main className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <HubHeroClient deals={stats.deals} brokers={stats.brokers} />

      {/* ── Quick Stats Bar ── */}
      <section className="max-w-2xl mx-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              icon: Building2,
              label: "딜카드",
              value: stats.deals,
              color: "text-blue-400",
            },
            {
              icon: Users,
              label: "중개인",
              value: stats.brokers,
              color: "text-emerald-400",
            },
            {
              icon: TrendingUp,
              label: "이번 주 신규",
              value: 12,
              color: "text-amber-400",
            },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="glass-subtle rounded-xl p-3 text-center"
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} strokeWidth={2} />
              <p className="text-base font-bold tabular-nums text-foreground leading-none">
                {value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="max-w-2xl mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            탐색하기
          </p>
          <Link
            href="/explore"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            전체 보기
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <HubCategoryGrid />
      </section>

      {/* ── Broker CTA ── */}
      <section className="max-w-2xl mx-auto px-4 pb-8">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-purple-600/5 to-pink-600/5 p-6">
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-400" strokeWidth={2.5} />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                  중개인 전용
                </span>
              </div>
              <h2 className="text-lg font-bold text-foreground leading-snug mb-1">
                DealCard로<br />전문성을 증명하세요
              </h2>
              <p className="text-xs text-muted-foreground">
                AI 매칭 · 딜카드 생성 · 파이프라인 관리
              </p>
            </div>
            <Link
              href="/login"
              id="hub-cta-broker-login"
              className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-4 py-2.5 text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap"
            >
              시작하기
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
