import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import OiticleCard from "@/components/pulse/OiticleCard";
import { OITICLE_TYPES } from "@/domain/pulse/oiticle-types";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "CRE 인사이트 | 상업용 부동산 분석·가이드·전망 — DealCard",
  description:
    "시세 분석, 거래 사례, 법률 가이드, 투자 분석까지 — DealCard AI와 전문가가 만든 상업용 부동산 롱폼 인사이트.",
};

const TYPES = Object.entries(OITICLE_TYPES) as [OiticleTypeCode, typeof OITICLE_TYPES[OiticleTypeCode]][];

async function getOiticles(type?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("cre_oiticles")
    .select(`
      id, oiticle_type, title, slug, excerpt,
      cover_image, author_type, author_name,
      regions, tags, views, likes,
      published_at
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(30);

  if (type) query = query.eq("oiticle_type", type);

  const { data } = await query;
  return data ?? [];
}

export default async function InsightMainPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const oiticles = await getOiticles(type);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "CRE 인사이트",
            description: "상업용 부동산 롱폼 분석 콘텐츠",
          }),
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-2">
              📝 CRE 인사이트
            </h1>
            <p className="text-[10px] text-slate-400">
              AI 분석 · 전문가 기고 · 데이터 기반
            </p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
              DATA-DRIVEN INSIGHTS
            </p>
            <h2 className="text-lg font-extrabold text-white mb-2 leading-tight">
              시장 시그널이 만든<br />
              <span className="text-purple-400">깊이 있는 인사이트</span>
            </h2>
            <p className="text-xs text-slate-400">
              펄스 데이터 기반 자동 분석 + 중개인·벤더 전문가 기고
            </p>
          </div>
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/insight"
            className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
              !type
                ? "bg-purple-500 border-purple-500 text-white"
                : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-purple-500/30"
            }`}
          >
            전체
          </Link>
          {TYPES.map(([code, meta]) => (
            <Link
              key={code}
              href={`/insight?type=${code}`}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                type === code
                  ? "bg-purple-500 border-purple-500 text-white"
                  : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-purple-500/30"
              }`}
            >
              {meta.emoji} {meta.label}
            </Link>
          ))}
        </div>

        {/* Oiticle List */}
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

        {/* CTA — Contribute */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700 rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm font-bold text-white">전문 인사이트를 공유해 주세요</p>
          <p className="text-[10px] text-slate-400">
            중개인·벤더 파트너라면 직접 기고할 수 있습니다.<br />
            게시된 기고에는 프로필과 서비스 카드가 자동 연결됩니다.
          </p>
          <Link
            href="/insight/contribute"
            className="inline-flex items-center gap-1.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            ✍️ 기고하기
          </Link>
        </div>

        {/* Cross-link to Pulse */}
        <Link
          href="/pulse"
          className="flex items-center gap-3 bg-gradient-to-r from-indigo-900/30 to-slate-900 border border-indigo-500/20 rounded-2xl p-4 hover:border-indigo-500/40 transition-all group"
        >
          <span className="text-2xl">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">CRE 시장 펄스</p>
            <p className="text-[10px] text-slate-500">주간 시그널 · 8개 권역</p>
          </div>
          <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </div>
    </main>
  );
}
