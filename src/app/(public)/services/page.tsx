import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import ServiceCard from "@/components/vendor/ServiceCard";
import { VENDOR_CATEGORY_META } from "@/domain/vendor/vendor-tier";
import type { VendorCategory } from "@/domain/vendor/vendor-tier";
import {
  Hammer,
  Scale,
  Calculator,
  Wrench,
  Banknote,
  ClipboardList,
  Shield,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Star,
} from "lucide-react";
import { ScrollRevealList, ScrollRevealItem } from "@/components/motion/ScrollReveal";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "전문 서비스 파트너 | 인테리어·법률·관리·금융 — DealCard",
  description:
    "상업용 부동산 인테리어, 법률 자문, 건물관리, 금융 서비스까지 — DealCard 인증 전문 파트너를 만나보세요. 서비스 카드로 비교하고, 바로 문의하세요.",
};

// Map emoji → Lucide icon
const CATEGORY_ICONS: Record<VendorCategory, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  interior: Hammer,
  legal: Scale,
  tax: Calculator,
  pm_fm: Wrench,
  finance: Banknote,
  appraisal: ClipboardList,
  insurance: Shield,
};

const CATEGORY_COLORS: Record<VendorCategory, { icon: string; border: string; bg: string }> = {
  interior: { icon: "text-orange-400", border: "border-orange-500/20 hover:border-orange-400/40", bg: "bg-orange-500/10" },
  legal: { icon: "text-blue-400", border: "border-blue-500/20 hover:border-blue-400/40", bg: "bg-blue-500/10" },
  tax: { icon: "text-green-400", border: "border-green-500/20 hover:border-green-400/40", bg: "bg-green-500/10" },
  pm_fm: { icon: "text-slate-400", border: "border-slate-500/20 hover:border-slate-400/40", bg: "bg-slate-500/10" },
  finance: { icon: "text-amber-400", border: "border-amber-500/20 hover:border-amber-400/40", bg: "bg-amber-500/10" },
  appraisal: { icon: "text-purple-400", border: "border-purple-500/20 hover:border-purple-400/40", bg: "bg-purple-500/10" },
  insurance: { icon: "text-teal-400", border: "border-teal-500/20 hover:border-teal-400/40", bg: "bg-teal-500/10" },
};

const CATEGORIES = Object.entries(VENDOR_CATEGORY_META) as [
  VendorCategory,
  (typeof VENDOR_CATEGORY_META)[VendorCategory]
][];

async function getFeaturedServices() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("service_cards")
    .select(`
      id, service_category, title, description,
      service_regions, price_range, price_unit,
      completion_count, avg_rating,
      vendor_profiles!inner (
        company_name, vendor_tier, is_verified
      )
    `)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(6);
  return data ?? [];
}

async function getStats() {
  const supabase = createServiceClient();
  const [{ count: vendors }, { count: cards }] = await Promise.all([
    supabase
      .from("vendor_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_verified", true),
    supabase
      .from("service_cards")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
  ]);
  return { vendors: vendors ?? 0, cards: cards ?? 0 };
}

export default async function ServicesPage() {
  const [featured, stats] = await Promise.all([
    getFeaturedServices(),
    getStats(),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "CRE 전문 서비스 파트너",
            description: "상업용 부동산 인테리어, 법률, 관리, 금융 전문 서비스",
            url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr"}/services`,
          }),
        }}
      />

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 glass-medium border-b border-white/8 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" strokeWidth={2} />
              전문 서비스
            </h1>
            <p className="text-xs text-muted-foreground">
              인증 파트너{" "}
              <span className="font-semibold text-foreground">{stats.vendors}</span>개사 ·
              서비스 카드{" "}
              <span className="font-semibold text-foreground">{stats.cards}</span>개
            </p>
          </div>
          <Link
            href="/hub"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Hub
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* ── Hero ── */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/30 to-background p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={2} />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                VERIFIED PARTNERS
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-foreground mb-2 leading-tight">
              거래 그 이후까지,{" "}
              <span className="text-emerald-400">인증된 전문가와 함께</span>
            </h2>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              인테리어·법률·세무·관리·금융 — 자격증 검증된 CRE 전문 파트너
            </p>
            <Link
              href="/vendor/apply"
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors active:scale-95"
            >
              파트너 입점 신청
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── Category Grid ── */}
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            서비스 카테고리
          </p>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map(([key, meta]) => {
              const Icon = CATEGORY_ICONS[key];
              const colors = CATEGORY_COLORS[key];
              return (
                <Link
                  key={key}
                  href={`/services/${key}`}
                  className={`bg-card border ${colors.border} rounded-xl p-3 text-center hover:shadow-elevation-1 transition-all group active:scale-95`}
                >
                  <div
                    className={`w-8 h-8 mx-auto mb-1.5 rounded-lg flex items-center justify-center ${colors.bg}`}
                  >
                    <Icon
                      className={`w-4 h-4 ${colors.icon}`}
                      strokeWidth={1.8}
                    />
                  </div>
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {meta.label}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Featured Services ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              추천 서비스 카드
            </p>
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" />
              평점 높은 순
            </div>
          </div>

          {featured.length > 0 ? (
            <ScrollRevealList className="grid grid-cols-2 gap-3" staggerDelay={0.07}>
              {featured.map((card) => (
                <ScrollRevealItem key={card.id}>
                  <ServiceCard card={card as never} />
                </ScrollRevealItem>
              ))}
            </ScrollRevealList>
          ) : (
            <div className="glass-subtle rounded-2xl p-8 text-center">
              <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground mb-1">
                아직 등록된 서비스 카드가 없습니다.
              </p>
              <p className="text-xs text-muted-foreground/60">
                첫 번째 파트너가 되어 주세요!
              </p>
            </div>
          )}
        </div>

        {/* ── Vendor Tier CTA ── */}
        <div className="glass-subtle rounded-2xl p-5 space-y-4 border border-border">
          <p className="text-xs font-bold text-foreground text-center">
            서비스 파트너 입점 Tier
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { tier: "Basic", price: "무료", cards: "3개", leads: "10건/월", highlight: false },
              { tier: "Pro", price: "29만/월", cards: "10개", leads: "50건/월", highlight: true },
              { tier: "Premium", price: "79만/월", cards: "무제한", leads: "무제한", highlight: false },
            ].map((t) => (
              <div
                key={t.tier}
                className={`rounded-xl p-3 text-center border transition-all ${
                  t.highlight
                    ? "border-emerald-500/40 bg-emerald-500/5 scale-105 shadow-elevation-1"
                    : "border-border bg-card"
                }`}
              >
                {t.highlight && (
                  <span className="inline-block text-[9px] font-bold bg-emerald-500/20 text-emerald-300 rounded-full px-1.5 py-0.5 mb-1 uppercase">
                    추천
                  </span>
                )}
                <p className="text-xs font-bold text-foreground mb-1">{t.tier}</p>
                <p className="text-xs text-emerald-400 font-bold mb-2">{t.price}</p>
                <p className="text-xs text-muted-foreground">카드 {t.cards}</p>
                <p className="text-xs text-muted-foreground">리드 {t.leads}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            + 리드 전환 시 건당 수수료 (Basic/Pro: 5만 원, Premium: 3만 원)
          </p>
        </div>

      </div>
    </main>
  );
}
