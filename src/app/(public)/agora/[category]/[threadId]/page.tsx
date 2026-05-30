import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import AgoraAiAnswer from "@/components/agora/AgoraAiAnswer";
import { breadcrumb } from "@/lib/schema-org";
import { CATEGORY_META } from "@/domain/agora/qis-seed-generator";
import type { AgoraCategory } from "@/domain/agora/qis-seed-generator";

export const revalidate = 3600;

type Params = Promise<{ category: string; threadId: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

/* ── Data Fetching ─────────────────────────────────────────────── */

async function getThread(category: string, threadId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("agora_threads")
    .select("*")
    .eq("id", threadId)
    .eq("category", category)
    .eq("status", "published")
    .single();
  return data;
}

async function getMatchedDeals(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band")
    .in("id", ids);
  return data ?? [];
}

async function getRelatedThreads(category: string, currentId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("agora_threads")
    .select("id, category, title")
    .eq("category", category)
    .eq("status", "published")
    .neq("id", currentId)
    .limit(3);
  return data ?? [];
}

async function getReplies(threadId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("agora_replies")
    .select("id, author_name, author_role, content, is_ai, upvotes, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);
  return data ?? [];
}

/* ── Metadata ─────────────────────────────────────────────────── */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, threadId } = await params;
  const thread = await getThread(category, threadId);
  if (!thread) return { title: "CRE 아고라 | DealCard" };

  const meta = CATEGORY_META[category as AgoraCategory];
  const regionLabel = thread.region ? REGION_LABELS[thread.region] : "";

  return {
    title: `${thread.title} | 상업용 부동산 ${meta?.label ?? ""} Q&A — DealCard`,
    description: `${thread.content.slice(0, 150)}...`,
    openGraph: {
      title: thread.title,
      description: thread.content.slice(0, 150),
      type: "article",
    },
    alternates: {
      canonical: `/agora/${category}/${threadId}`,
    },
  };
}

/* ── Page ─────────────────────────────────────────────────────── */

export default async function AgoraThreadPage({ params }: { params: Params }) {
  const { category, threadId } = await params;

  const [thread, relatedThreads, replies] = await Promise.all([
    getThread(category, threadId),
    getRelatedThreads(category, threadId),
    getReplies(threadId),
  ]);

  if (!thread) notFound();

  const matchedDeals = await getMatchedDeals(thread.matched_deal_ids ?? []);
  const meta = CATEGORY_META[category as AgoraCategory];
  const regionLabel = thread.region ? REGION_LABELS[thread.region] : null;

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr";

  // Schema.org QAPage + FAQPage 이중 마크업
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    name: thread.title,
    description: thread.content.slice(0, 200),
    url: `${BASE_URL}/agora/${category}/${threadId}`,
    mainEntity: {
      "@type": "Question",
      name: thread.title,
      text: thread.content,
      dateCreated: thread.created_at,
      author: { "@type": "Person", name: thread.author_name },
      answerCount: (replies.length || 0) + 1,
      acceptedAnswer: thread.ai_answer
        ? {
            "@type": "Answer",
            text: thread.ai_answer.slice(0, 500),
            author: { "@type": "Organization", name: "DealCard AI" },
            dateCreated: thread.created_at,
          }
        : undefined,
    },
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "오늘";
    if (days === 1) return "어제";
    if (days < 7) return `${days}일 전`;
    return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  }

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "아고라", item: "/agora" },
    { name: meta?.label ?? category, item: `/agora/${category}` },
    { name: thread.title, item: `/agora/${category}/${threadId}` },
  ];
  const breadcrumbSchema = breadcrumb(breadcrumbSteps);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c"),
        }}
      />

      {/* Header */}
      <header className="bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-2 text-xs text-slate-400">
          <Link href="/agora" className="hover:text-white">아고라</Link>
          <span className="text-slate-700">›</span>
          <Link href={`/agora/${category}`} className="hover:text-white">
            {meta?.emoji} {meta?.label}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-[#0d1424] border-b border-slate-800 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-4 flex-wrap">
            <span className="text-[10px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full">
              {meta?.emoji} {meta?.label}
            </span>
            {regionLabel && (
              <span className="text-[10px] bg-slate-700/50 text-slate-400 px-2.5 py-1 rounded-full">
                📍 {regionLabel}
              </span>
            )}
            {thread.is_hot && (
              <span className="text-[10px] font-bold bg-orange-500/20 border border-orange-500/30 text-orange-400 px-2.5 py-1 rounded-full">
                🔥 인기 질문
              </span>
            )}
          </div>

          <h1 className="text-xl font-extrabold text-white leading-snug mb-4">
            {thread.title}
          </h1>

          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400 text-[9px]">
              {thread.author_name.charAt(0)}
            </div>
            <span className="text-slate-400">{thread.author_name}</span>
            <span>·</span>
            <span>{timeAgo(thread.created_at)}</span>
            <span>·</span>
            <span>조회 {thread.views}</span>
            <span>·</span>
            <span>답변 {thread.reply_count}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 질문 본문 */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {thread.content}
          </p>
          {thread.tags?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-4 pt-4 border-t border-slate-800">
              {thread.tags.map((tag: string) => (
                <span key={tag} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-lg">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI 큐레이션 답변 + 딜카드 매칭 */}
        {thread.ai_answer && (
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              🤖 AI 큐레이션 답변
            </h2>
            <AgoraAiAnswer
              aiAnswer={thread.ai_answer}
              matchedDeals={matchedDeals}
              marketReportRegion={thread.market_report_region}
              relatedThreads={relatedThreads}
            />
          </div>
        )}

        {/* 댓글 섹션 */}
        {replies.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              💬 커뮤니티 댓글 ({replies.length})
            </h2>
            <div className="space-y-3">
              {replies.map((reply: any) => (
                <div key={reply.id} className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center text-sm">
                        {reply.is_ai ? "🤖" : "👤"}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white">{reply.author_name}</p>
                        <p className="text-[9px] text-slate-600">{reply.author_role} · {timeAgo(reply.created_at)}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600">👍 {reply.upvotes}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{reply.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 댓글 작성 (가입 필수) */}
        <div className="bg-gradient-to-br from-slate-800/40 to-slate-900 border border-slate-700 rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm font-bold text-white">답변 또는 댓글 작성</p>
          <p className="text-[10px] text-slate-400">
            실전 경험과 지식을 나눠 주세요. 댓글 작성은 로그인 후 이용 가능합니다.
          </p>
          <div className="flex gap-2 justify-center">
            <Link
              href="/auth/login"
              className="text-xs font-bold bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-xl transition-colors"
            >
              로그인하고 참여
            </Link>
            <Link href="/agora" className="text-xs text-slate-400 hover:text-white px-3 py-2">
              목록으로 ←
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
