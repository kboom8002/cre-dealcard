import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import AgoraThreadCard from "@/components/agora/AgoraThreadCard";
import { CATEGORY_META } from "@/domain/agora/qis-seed-generator";
import type { AgoraCategory } from "@/domain/agora/qis-seed-generator";
import { faqPage } from "@/lib/schema-org";

export const revalidate = 3600;

type Params = Promise<{ category: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params;
  const meta = CATEGORY_META[category as AgoraCategory];
  if (!meta) return { title: "CRE 아고라 | DealCard" };
  return {
    title: `상업용 부동산 ${meta.label} Q&A | CRE 아고라 — DealCard`,
    description: `${meta.label} 관련 질문과 AI 큐레이션 답변. ${meta.desc}. 관련 딜카드 자동 연결.`,
  };
}

async function getThreadsByCategory(category: string, region?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("agora_threads")
    .select(`
      id, category, region, title, content,
      author_name, is_seed, tags,
      views, reply_count, is_hot,
      status, created_at, ai_answer
    `)
    .eq("status", "published")
    .eq("category", category)
    .order("is_hot", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (region) {
    query = query.or(`region.eq.${region},region.is.null`);
  }

  const { data } = await query;
  return data ?? [];
}

export default async function AgoraCategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ region?: string }>;
}) {
  const { category } = await params;
  const { region } = await searchParams;
  const meta = CATEGORY_META[category as AgoraCategory];
  const threads = await getThreadsByCategory(category, region);

  const categories = Object.entries(CATEGORY_META) as [AgoraCategory, typeof CATEGORY_META[AgoraCategory]][];

  // Generate FAQ items from threads with AI answers
  const faqThreads = threads.filter((t) => t.ai_answer).slice(0, 5);
  const faqItems = faqThreads.map((t) => ({
    question: t.title,
    answer: `${t.content.slice(0, 150)}... \n\n[답변]: ${t.ai_answer}`,
  }));

  if (faqItems.length === 0) {
    faqItems.push({
      question: `상업용 부동산 ${meta?.label ?? category}에 대해 자주 묻는 질문은 무엇인가요?`,
      answer: meta?.desc ?? "전문 질문과 AI 큐레이션 답변을 확인해 보세요.",
    });
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Schema.org FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqPage(faqItems)).replace(/</g, "\\u003c"),
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/agora" className="text-slate-400 hover:text-white text-xs">← 아고라</Link>
            <span className="text-slate-700">›</span>
            <h1 className="text-sm font-extrabold text-white">
              {meta?.emoji} {meta?.label ?? category} Q&A
            </h1>
          </div>
          <button className="text-[10px] bg-blue-500 hover:bg-blue-400 text-white font-bold px-3 py-1.5 rounded-lg transition-colors">
            ✍️ 질문하기
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Category Description */}
        {meta && (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-white mb-1">
              {meta.emoji} {meta.label}에 대해 궁금한 것이 있으신가요?
            </p>
            <p className="text-[10px] text-slate-400">{meta.desc}</p>
          </div>
        )}

        {/* Region Filter Chips */}
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/agora/${category}`}
            className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all border ${
              !region
                ? "bg-blue-500 border-blue-500 text-white"
                : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-blue-500/30 hover:text-white"
            }`}
          >
            전체
          </Link>
          {Object.entries(REGION_LABELS).map(([slug, label]) => (
            <Link
              key={slug}
              href={`/agora/${category}?region=${slug}`}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all border ${
                region === slug
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-blue-500/30 hover:text-white"
              }`}
            >
              {label.split("(")[0]}
            </Link>
          ))}
        </div>

        {/* Thread List */}
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
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-10 text-center">
            <p className="text-slate-500 text-sm mb-2">아직 질문이 없습니다.</p>
            <p className="text-[10px] text-slate-600">첫 번째 질문을 올려보세요!</p>
          </div>
        )}

        {/* Other Categories */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">다른 카테고리</p>
          <div className="grid grid-cols-4 gap-2">
            {categories.filter(([k]) => k !== category).map(([key, m]) => (
              <Link
                key={key}
                href={`/agora/${key}`}
                className="bg-[#131b2e] border border-slate-800 rounded-xl p-2.5 text-center hover:border-blue-500/30 transition-all"
              >
                <div className="text-base mb-1">{m.emoji}</div>
                <p className="text-[9px] font-bold text-slate-400">{m.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
