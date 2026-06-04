import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Building2,
  ArrowRight,
  TrendingUp,
  Users,
  Zap,
  Radar,
  ClipboardCheck,
  Calculator,
  Radio,
  Clock,
} from "lucide-react";
import { HubHeroClient } from "@/components/hub/HubHeroClient";
import { HubCategoryGrid } from "@/components/hub/HubCategoryGrid";
import { HubBrokerShowcase } from "@/components/hub/HubBrokerShowcase";
import { brokerItemList } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "DealCard Hub | 상업용 부동산의 새로운 기준",
  description:
    "AI 기반 블라인드 딜카드로 상업용 부동산 매매·임대를 안전하고 빠르게. 검증된 중개인, 실시간 시세 리포트, 권역별 매물 탐색.",
  openGraph: {
    title: "DealCard Hub — 상업용 부동산의 새로운 기준",
    description: "블라인드 딜카드 · AI 매칭 · 시세 리포트",
  },
};

export const revalidate = 1800; // 30분

async function fetchHubData() {
  try {
    const supabase = createServiceClient();
    
    // Calculate Monday of the current week in local/UTC time
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const mondayISO = monday.toISOString();

    const [
      { count: deals },
      { count: brokers },
      { count: newThisWeek },
      { data: recentDeals },
      { data: latestPulse },
      { data: latestInsight },
      { data: featuredBrokers },
    ] = await Promise.all([
      supabase
        .from("building_ssot_lite")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "broker"),
      supabase
        .from("building_ssot_lite")
        .select("*", { count: "exact", head: true })
        .gte("created_at", mondayISO),
      supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band, status, created_at")
        .eq("status", "public_signal_ready")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("cre_pulses")
        .select("region, pulse_score, trend, summary_ko, period_label")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("cre_oiticles")
        .select("id, title, excerpt, oiticle_type, slug, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1),
      supabase
        .from("profiles")
        .select(`
          id,
          display_name,
          company,
          photo_url,
          tagline,
          broker_profiles!inner (
            slug,
            specialty_regions,
            specialty_assets,
            bio,
            vibe_vti,
            vibe_trust,
            vibe_valence,
            is_public,
            seo_summary,
            total_deal_count_self,
            is_verified
          )
        `)
        .eq("role", "broker")
        .eq("broker_profiles.is_public", true)
        .limit(3),
    ]);

    const formattedBrokers = (featuredBrokers ?? []).map((p: any) => {
      const bp = p.broker_profiles || {};
      return {
        id: p.id,
        displayName: p.display_name,
        company: p.company,
        photoUrl: p.photo_url,
        tagline: p.tagline,
        slug: bp.slug,
        specialtyRegions: bp.specialty_regions || [],
        specialtyAssets: bp.specialty_assets || [],
        bio: bp.bio,
        vibeVti: bp.vibe_vti,
        vibeTrust: bp.vibe_trust,
        vibeValence: bp.vibe_valence,
        totalDealCount: bp.total_deal_count_self || 0,
        isVerified: bp.is_verified,
        seoSummary: bp.seo_summary
      };
    });

    return {
      deals: deals ?? 0,
      brokers: brokers ?? 0,
      newThisWeek: newThisWeek ?? 0,
      recentDeals: recentDeals ?? [],
      latestPulse: latestPulse ?? [],
      latestInsight: latestInsight?.[0] ?? null,
      featuredBrokers: formattedBrokers,
    };
  } catch (err) {
    console.error("Error fetching Hub data:", err);
    return { deals: 0, brokers: 0, newThisWeek: 0, recentDeals: [], latestPulse: [], latestInsight: null, featuredBrokers: [] };
  }
}


const QUICK_TOOLS = [
  {
    href: "/building-radar",
    icon: Radar,
    label: "빌딩 레이더",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    href: "/owner-readiness",
    icon: ClipboardCheck,
    label: "매각 준비도",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    href: "/insight/tools",
    icon: Calculator,
    label: "세금 계산기",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
] as const;

const PULSE_TREND_COLOR: Record<string, string> = {
  up: "text-emerald-400",
  flat: "text-amber-400",
  down: "text-rose-400",
};

const PULSE_TREND_ICON: Record<string, string> = {
  up: "📈",
  flat: "➡️",
  down: "📉",
};

export default async function HubPage() {
  const data = await fetchHubData();
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 6
      ? "🌙 새벽에도 딜은 계속됩니다"
      : hour < 12
      ? "🌅 좋은 아침입니다"
      : hour < 18
      ? "☀️ 활발한 오후입니다"
      : "🌆 오늘 하루도 수고하셨습니다";

  return (
    <main className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <HubHeroClient deals={data.deals} brokers={data.brokers} />

      {/* ── Quick Stats Bar ── */}
      <section className="max-w-2xl mx-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Building2, label: "딜카드", value: data.deals, color: "text-blue-400" },
            { icon: Users, label: "중개인", value: data.brokers, color: "text-emerald-400" },
            { icon: TrendingUp, label: "이번 주 신규", value: data.newThisWeek, color: "text-amber-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="glass-subtle rounded-xl p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} strokeWidth={2} />
              <p className="text-base font-bold tabular-nums text-foreground leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 빠른 도구 (Quick Tools) ── */}
      <section className="max-w-2xl mx-auto px-4 pb-5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">
          빠른 도구
        </p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={`flex flex-col items-center gap-2 rounded-2xl border ${tool.border} ${tool.bg} p-4 text-center hover:scale-[1.02] transition-all active:scale-[0.97]`}
              >
                <div className={`w-9 h-9 rounded-xl ${tool.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${tool.color}`} strokeWidth={2} />
                </div>
                <p className={`text-[10px] font-bold ${tool.color}`}>{tool.label}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── 시장 펄스 미니 위젯 ── */}
      {data.latestPulse.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-5">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-indigo-400" />
              시장 펄스
            </p>
            <Link
              href="/pulse"
              className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors"
            >
              전체 보기 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {data.latestPulse.map((p: any) => (
              <Link
                key={p.region}
                href={`/pulse/${p.region}/${p.period_label}`}
                className="shrink-0 bg-[#131b2e] border border-indigo-500/20 rounded-xl px-3 py-2.5 hover:border-indigo-500/40 transition-all"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase">
                    {p.region}
                  </span>
                  <span className={`text-[10px] font-bold ${PULSE_TREND_COLOR[p.trend] ?? "text-slate-400"}`}>
                    {PULSE_TREND_ICON[p.trend] ?? ""} {p.pulse_score}
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 w-28 line-clamp-2 leading-relaxed">
                  {p.summary_ko}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 최신 딜카드 캐러셀 ── */}
      {data.recentDeals.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-5">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              최신 딜카드
            </p>
            <Link
              href="/explore"
              className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
            >
              전체 탐색 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {data.recentDeals.map((deal: any) => (
              <Link
                key={deal.id}
                href={`/deal/${deal.area_signal?.toLowerCase().replace(/[·\s]/g, "").replace("강남", "gbd").replace("여의도", "ybd").replace("종로", "cbd") || "gbd"}/${deal.id}`}
                className="shrink-0 w-44 bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
                  <span className="text-[10px] font-bold text-blue-400">{deal.area_signal}</span>
                </div>
                <p className="text-xs font-semibold text-foreground line-clamp-1">
                  {deal.asset_type || "상업용 건물"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  {deal.price_band || "가격 협의"}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(deal.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Schema.org Broker ItemList ── */}
      {data.featuredBrokers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              brokerItemList(
                data.featuredBrokers.map((b) => ({
                  id: b.slug,
                  display_name: b.displayName,
                  company: b.company,
                  specialty_regions: b.specialtyRegions,
                  bio: b.seoSummary || b.bio,
                }))
              )
            ),
          }}
        />
      )}

      {/* ── 전문 중개인 쇼케이스 (NEW) ── */}
      <HubBrokerShowcase brokers={data.featuredBrokers} />

      {/* ── 오늘의 인사이트 ── */}
      {data.latestInsight && (
        <section className="max-w-2xl mx-auto px-4 pb-5 pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              오늘의 인사이트
            </p>
            <Link
              href="/insight"
              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5 transition-colors"
            >
              더보기 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <Link
            href={`/insight/${data.latestInsight.slug}`}
            className="block bg-gradient-to-br from-rose-900/20 to-slate-900 border border-rose-500/20 rounded-2xl p-4 hover:border-rose-500/40 transition-all"
          >
            <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
              {data.latestInsight.oiticle_type?.replace(/_/g, " ")}
            </span>
            <h3 className="text-sm font-bold text-foreground mt-1 leading-snug line-clamp-2">
              {data.latestInsight.title}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
              {data.latestInsight.excerpt}
            </p>
          </Link>
        </section>
      )}

      {/* ── Categories ── */}
      <section className="max-w-2xl mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
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
              href="/onboarding"
              id="hub-cta-broker-login"
              className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-4 py-2.5 text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap"
            >
              📸 Vibe 명함 만들기
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
