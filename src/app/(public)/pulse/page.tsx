import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import PulseCard from "@/components/pulse/PulseCard";

export const revalidate = 1800; // 30분

export const metadata: Metadata = {
  title: "CRE 시장 펄스 | 주간 시그널 분석 — DealCard",
  description:
    "상업용 부동산 8개 권역의 주간 시장 펄스. 수요·공급·가격·체감 시그널을 AI가 분석하여 전달합니다.",
};

const REGIONS = [
  { slug: "gbd", label: "GBD", emoji: "🏙️" },
  { slug: "ybd", label: "YBD", emoji: "🌊" },
  { slug: "cbd", label: "CBD", emoji: "🏛️" },
  { slug: "seongsu", label: "성수", emoji: "🏭" },
  { slug: "pangyo", label: "판교", emoji: "💻" },
  { slug: "mapo", label: "마포", emoji: "🎨" },
  { slug: "jongno", label: "종로", emoji: "📜" },
  { slug: "hongdae", label: "홍대", emoji: "🎵" },
] as const;

async function getLatestPulses() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cre_pulses")
    .select("id, region, period_type, period_label, pulse_score, trend, summary_ko, key_findings, seo_slug, created_at")
    .eq("status", "published")
    .eq("period_type", "weekly")
    .order("created_at", { ascending: false })
    .limit(16);
  return data ?? [];
}

export default async function PulseMainPage() {
  const pulses = await getLatestPulses();

  // 권역별 최신 1개씩 그룹핑
  const latestByRegion = new Map<string, (typeof pulses)[number]>();
  for (const p of pulses) {
    if (!latestByRegion.has(p.region)) latestByRegion.set(p.region, p);
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "CRE 시장 펄스",
            description: "상업용 부동산 주간 시장 시그널 분석",
            url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr"}/pulse`,
          }),
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-2">
              📡 CRE 시장 펄스
            </h1>
            <p className="text-[10px] text-slate-400">
              8개 권역 · 주간 시그널 · AI 분석
            </p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">
              MARKET INTELLIGENCE
            </p>
            <h2 className="text-lg font-extrabold text-white mb-2 leading-tight">
              파이프라인 데이터가 말하는<br />
              <span className="text-indigo-400">이번 주 시장 온도</span>
            </h2>
            <p className="text-xs text-slate-400">
              매칭·거래·가격·커뮤니티·파트너 5축 시그널 자동 집계
            </p>
          </div>
        </div>

        {/* Region Pulse Grid */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
            권역별 최신 펄스
          </p>

          {latestByRegion.size > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {REGIONS.map(({ slug, label }) => {
                const pulse = latestByRegion.get(slug);
                if (!pulse) return (
                  <div key={slug} className="bg-[#131b2e] border border-slate-800/50 rounded-2xl p-4 opacity-40">
                    <p className="text-[10px] text-slate-600">{label}</p>
                    <p className="text-[9px] text-slate-700 mt-1">데이터 준비 중</p>
                  </div>
                );
                return (
                  <PulseCard
                    key={pulse.id}
                    id={pulse.id}
                    region={pulse.region}
                    periodLabel={pulse.period_label}
                    pulseScore={Number(pulse.pulse_score)}
                    trend={pulse.trend as "up" | "flat" | "down"}
                    summaryKo={pulse.summary_ko}
                    keyFindings={pulse.key_findings}
                    seoSlug={pulse.seo_slug}
                  />
                );
              })}
            </div>
          ) : (
            <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-10 text-center">
              <p className="text-slate-500 text-sm mb-2">아직 생성된 펄스가 없습니다.</p>
              <p className="text-[10px] text-slate-600">주간 펄스는 매주 월요일 자동 생성됩니다.</p>
            </div>
          )}
        </div>

        {/* Past Pulses */}
        {pulses.length > 8 && (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              지난 펄스
            </p>
            <div className="space-y-2">
              {pulses.slice(8).map((p) => (
                <Link
                  key={p.id}
                  href={`/pulse/${p.region}/${p.period_label}`}
                  className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-xl p-3 hover:border-indigo-500/30 transition-all"
                >
                  <span className="text-[10px] font-bold text-indigo-400 w-10">{p.region.toUpperCase()}</span>
                  <span className="text-[10px] text-slate-500 w-16">{p.period_label}</span>
                  <span className={`text-[10px] font-bold ${Number(p.pulse_score) >= 60 ? "text-emerald-400" : "text-amber-400"}`}>
                    {p.pulse_score}
                  </span>
                  <span className="text-[10px] text-slate-600 flex-1 line-clamp-1">{p.summary_ko}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Cross-link to Insights */}
        <Link
          href="/insight"
          className="flex items-center gap-3 bg-gradient-to-r from-purple-900/30 to-slate-900 border border-purple-500/20 rounded-2xl p-4 hover:border-purple-500/40 transition-all group"
        >
          <span className="text-2xl">📝</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">CRE 인사이트</p>
            <p className="text-[10px] text-slate-500">펄스 기반 롱폼 분석 · 전문가 기고</p>
          </div>
          <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </div>
    </main>
  );
}
