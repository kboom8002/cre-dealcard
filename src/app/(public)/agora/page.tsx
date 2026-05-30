import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import AgoraThreadCard from "@/components/agora/AgoraThreadCard";
import { CATEGORY_META } from "@/domain/agora/qis-seed-generator";
import type { AgoraCategory } from "@/domain/agora/qis-seed-generator";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "상업용 부동산 Q&A 아고라 | CRE 전문 커뮤니티 — DealCard",
  description:
    "매매·임대·투자·법률·세무·시장동향까지 — AI 큐레이션 답변과 실제 블라인드 딜카드가 연결되는 상업용 부동산 전문 Q&A 아고라. 건물주·투자자·임차인·중개인의 리얼한 질문과 답변.",
};

const CATEGORIES = Object.entries(CATEGORY_META) as [AgoraCategory, typeof CATEGORY_META[AgoraCategory]][];

const REGION_META: { slug: string; label: string; emoji: string }[] = [
  { slug: "gbd",     label: "GBD(강남)",  emoji: "🏙️" },
  { slug: "ybd",     label: "YBD(여의도)", emoji: "🌊" },
  { slug: "cbd",     label: "CBD(광화문)", emoji: "🏛️" },
  { slug: "seongsu", label: "성수",       emoji: "🎨" },
  { slug: "pangyo",  label: "판교",       emoji: "💻" },
  { slug: "mapo",    label: "마포",       emoji: "📺" },
  { slug: "jongno",  label: "종로",       emoji: "🏯" },
  { slug: "hongdae", label: "홍대",       emoji: "🎵" },
];

async function getThreads() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("agora_threads")
    .select(`
      id, category, region, title, content,
      author_name, is_seed, tags,
      views, reply_count, is_hot,
      status, created_at
    `)
    .eq("status", "published")
    .order("is_hot", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function getStats() {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("agora_threads")
    .select("*", { count: "exact", head: true })
    .eq("status", "published");
  return { threadCount: count ?? 0 };
}

export default async function AgoraMainPage() {
  const [threads, stats] = await Promise.all([getThreads(), getStats()]);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Schema.org FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "상업용 부동산 Q&A 아고라",
            description: "상업용 부동산 매매·임대·투자·법률·세무 전문 Q&A 커뮤니티",
            url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr"}/agora`,
            about: { "@type": "Thing", name: "상업용 부동산" },
          }),
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-2">
              💬 CRE 아고라
            </h1>
            <p className="text-[10px] text-slate-400">
              질문 {stats.threadCount.toLocaleString()}개 · AI 큐레이션 답변 + 딜카드 연결
            </p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Hero Banner */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-500/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
              AI CURATED Q&A
            </p>
            <h2 className="text-lg font-extrabold text-white mb-2 leading-tight">
              상업용 부동산의 모든 질문,<br />
              <span className="text-blue-400">AI가 답하고 딜카드로 연결</span>
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              매매·임대·투자·법률·세무·금융 — 건물주·투자자·임차인·중개인의 리얼 Q&A
            </p>
            <div className="flex gap-2">
              <Link
                href="/hub"
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                🔍 딜카드 탐색
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-white/15 transition-colors"
              >
                ✍️ 질문하기 (가입 필수)
              </Link>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">카테고리</p>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map(([key, meta]) => (
              <Link
                key={key}
                href={`/agora/${key}`}
                className="bg-[#131b2e] border border-slate-800 rounded-xl p-2.5 text-center hover:border-blue-500/30 hover:bg-[#161f33] transition-all group"
              >
                <div className="text-lg mb-1">{meta.emoji}</div>
                <p className="text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors">
                  {meta.label}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* Region Quick Links */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">권역별 탐색</p>
          <div className="flex gap-2 flex-wrap">
            {REGION_META.map((r) => (
              <Link
                key={r.slug}
                href={`/agora/market?region=${r.slug}`}
                className="text-[10px] font-semibold bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-white hover:border-blue-500/30 px-3 py-1.5 rounded-full transition-all"
              >
                {r.emoji} {r.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Thread List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              최신 질문 · AI 큐레이션
            </p>
            <Link href="/agora/all" className="text-[10px] text-blue-400 hover:text-blue-300">
              전체 보기 →
            </Link>
          </div>

          {threads.length > 0 ? (
            <div className="space-y-3">
              {threads.map((thread) => (
                <AgoraThreadCard
                  key={thread.id}
                  thread={thread as any}
                  detailUrl={`/agora/${thread.category}/${thread.id}`}
                />
              ))}
            </div>
          ) : (
            /* Skeleton seed cards when DB is empty */
            <div className="space-y-3">
              {[
                { title: "강남 오피스 빌딩 매각 시 적정 캡레이트는?", category: "invest", region: "gbd", author: "GBD투자자" },
                { title: "성수동 200평 오피스 임대료 시세는?", category: "lease", region: "seongsu", author: "성수임차인" },
                { title: "오피스 빌딩 매각 시 양도소득세 절세 전략은?", category: "legal", region: null, author: "전국건물주" },
              ].map((s, i) => (
                <div key={i} className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 opacity-60">
                  <div className="flex gap-2 mb-2">
                    <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                      {CATEGORY_META[s.category as AgoraCategory]?.emoji} {CATEGORY_META[s.category as AgoraCategory]?.label}
                    </span>
                    {s.region && <span className="text-[10px] text-slate-600 px-1.5">📍 {s.region}</span>}
                    <span className="text-[10px] text-slate-700">AI 큐레이션</span>
                  </div>
                  <p className="text-xs font-bold text-slate-400">{s.title}</p>
                  <p className="text-[10px] text-slate-600 mt-2">{s.author}</p>
                </div>
              ))}
              <p className="text-center text-[10px] text-slate-600 py-3">
                /api/agora/seed 엔드포인트를 호출하면 시드 질문이 채워집니다.
              </p>
            </div>
          )}
        </div>

        {/* CTA Banner */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700 rounded-2xl p-5 text-center space-y-3">
          <p className="text-xs font-bold text-white">🏢 관련 매물을 직접 탐색하세요</p>
          <p className="text-[10px] text-slate-400">블라인드 딜카드로 정보를 보호하면서 진지한 매수자/임차인만 선별</p>
          <div className="flex gap-2 justify-center">
            <Link href="/hub" className="text-xs font-semibold bg-white text-slate-900 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors">
              딜카드 Hub →
            </Link>
            <Link href="/explore" className="text-xs font-semibold bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl hover:bg-white/15 transition-colors">
              권역 탐색
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
