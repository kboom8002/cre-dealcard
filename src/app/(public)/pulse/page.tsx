import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import PulseCard from "@/components/pulse/PulseCard";
import OiticleCard from "@/components/pulse/OiticleCard";
import { OITICLE_TYPES } from "@/domain/pulse/oiticle-types";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";

export const revalidate = 1800; // 30분

export const metadata: Metadata = {
  title: "CRE 시장 인텔리전스 | 펄스·인사이트·전문가 — DealCard",
  description:
    "상업용 부동산 8개 권역의 주간 시장 펄스, 롱폼 인사이트, 전문가 기고를 한 곳에서. AI 분석 + 중개인 전문 콘텐츠.",
};

const REGIONS = [
  { slug: "gbd", label: "GBD", emoji: "🏙️" },
  { slug: "ybd", label: "YBD", emoji: "🌊" },
  { slug: "cbd", label: "CBD", emoji: "🏛️" },
  { slug: "seongsu", label: "성수", emoji: "🎨" },
  { slug: "pangyo", label: "판교", emoji: "💻" },
  { slug: "mapo", label: "마포", emoji: "📺" },
  { slug: "jongno", label: "종로", emoji: "🏯" },
  { slug: "hongdae", label: "홍대", emoji: "🎵" },
] as const;

type Tab = "signal" | "insight" | "expert";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "signal", label: "시그널", emoji: "📡" },
  { id: "insight", label: "인사이트", emoji: "📝" },
  { id: "expert", label: "전문가", emoji: "👔" },
];

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

async function getOiticles(type?: string, authorType?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("cre_oiticles")
    .select("id, oiticle_type, title, slug, excerpt, cover_image, author_type, author_name, regions, tags, views, likes, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (type) query = query.eq("oiticle_type", type);
  if (authorType) query = query.eq("author_type", authorType);

  const { data } = await query;
  return data ?? [];
}

const OITICLE_TYPE_LIST = Object.entries(OITICLE_TYPES) as [OiticleTypeCode, typeof OITICLE_TYPES[OiticleTypeCode]][];

export default async function PulseMainPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const { tab: tabParam, type } = await searchParams;
  const activeTab: Tab = (tabParam === "insight" || tabParam === "expert") ? tabParam : "signal";

  const [pulses, oiticles] = await Promise.all([
    activeTab === "signal" ? getLatestPulses() : Promise.resolve([]),
    activeTab !== "signal"
      ? getOiticles(type, activeTab === "expert" ? "broker" : undefined)
      : Promise.resolve([]),
  ]);

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
            name: "CRE 시장 인텔리전스",
            description: "상업용 부동산 시장 펄스·인사이트·전문가 기고",
            url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr"}/pulse`,
          }),
        }}
      />

      {/* ── Sticky Header + Tab Bar ── */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-extrabold text-white flex items-center gap-2">
                🧠 시장 인텔리전스
              </h1>
              <p className="text-[10px] text-slate-400">
                시그널 · 인사이트 · 전문가 기고
              </p>
            </div>
            <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-slate-800 -mx-0">
            {TABS.map((t) => {
              const active = activeTab === t.id;
              const href = t.id === "signal" ? "/pulse" : `/pulse?tab=${t.id}`;
              return (
                <Link
                  key={t.id}
                  href={href}
                  className={`flex-1 text-center pb-2.5 pt-1 text-xs font-semibold border-b-2 transition-all ${
                    active
                      ? "border-indigo-400 text-white"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t.emoji} {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ═══ TAB: 시그널 ═══ */}
        {activeTab === "signal" && (
          <>
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
          </>
        )}

        {/* ═══ TAB: 인사이트 ═══ */}
        {activeTab === "insight" && (
          <>
            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/20 rounded-2xl p-5">
              <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">DATA-DRIVEN INSIGHTS</p>
                <h2 className="text-base font-extrabold text-white leading-tight">
                  시장 시그널이 만든 <span className="text-purple-400">깊이 있는 분석</span>
                </h2>
              </div>
            </div>

            {/* Type filter */}
            <div className="flex gap-2 flex-wrap">
              <Link
                href="/pulse?tab=insight"
                className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${!type ? "bg-purple-500 border-purple-500 text-white" : "bg-[#131b2e] border-slate-800 text-slate-400"}`}
              >
                전체
              </Link>
              {OITICLE_TYPE_LIST.map(([code, meta]) => (
                <Link
                  key={code}
                  href={`/pulse?tab=insight&type=${code}`}
                  className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${type === code ? "bg-purple-500 border-purple-500 text-white" : "bg-[#131b2e] border-slate-800 text-slate-400"}`}
                >
                  {meta.emoji} {meta.label}
                </Link>
              ))}
            </div>

            {oiticles.length > 0 ? (
              <div className="space-y-3">
                {oiticles.map((o) => (
                  <OiticleCard
                    key={o.id}
                    id={o.id}
                    oiticleType={o.oiticle_type as OiticleTypeCode}
                    title={o.title}
                    slug={o.slug}
                    excerpt={o.excerpt}
                    authorType={o.author_type as OiticleAuthorType}
                    authorName={o.author_name}
                    regions={o.regions}
                    tags={o.tags}
                    views={o.views}
                    likes={o.likes}
                    publishedAt={o.published_at}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-10 text-center">
                <p className="text-slate-500 text-sm mb-2">아직 게시된 인사이트가 없습니다.</p>
                <p className="text-[10px] text-slate-600">월간 시세 분석은 매월 1일 자동 생성됩니다.</p>
              </div>
            )}

            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700 rounded-2xl p-5 text-center space-y-2">
              <p className="text-sm font-bold text-white">전문 인사이트를 공유해 주세요</p>
              <p className="text-[10px] text-slate-400">중개인·벤더 파트너라면 직접 기고할 수 있습니다.</p>
              <Link
                href="/insight/contribute"
                className="inline-flex items-center gap-1.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                ✍️ 기고하기
              </Link>
            </div>
          </>
        )}

        {/* ═══ TAB: 전문가 ═══ */}
        {activeTab === "expert" && (
          <>
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-900/30 to-slate-900 border border-amber-500/20 rounded-2xl p-5">
              <div className="relative">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">EXPERT NOTES</p>
                <h2 className="text-base font-extrabold text-white leading-tight">
                  검증된 전문가의 <span className="text-amber-400">현장 인사이트</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">중개인·변호사·세무사·감정평가사가 직접 작성</p>
              </div>
            </div>

            {oiticles.length > 0 ? (
              <div className="space-y-3">
                {oiticles.map((o) => (
                  <OiticleCard
                    key={o.id}
                    id={o.id}
                    oiticleType={o.oiticle_type as OiticleTypeCode}
                    title={o.title}
                    slug={o.slug}
                    excerpt={o.excerpt}
                    authorType={o.author_type as OiticleAuthorType}
                    authorName={o.author_name}
                    regions={o.regions}
                    tags={o.tags}
                    views={o.views}
                    likes={o.likes}
                    publishedAt={o.published_at}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-10 text-center">
                <p className="text-slate-500 text-sm mb-2">아직 전문가 기고가 없습니다.</p>
                <Link
                  href="/expert-note/request"
                  className="inline-flex mt-2 items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                >
                  👔 전문가 노트 요청하기
                </Link>
              </div>
            )}
          </>
        )}

      </div>
    </main>
  );
}
