import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { OITICLE_TYPES, AUTHOR_TYPE_META } from "@/domain/pulse/oiticle-types";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";
import { breadcrumb } from "@/lib/schema-org";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

async function getOiticle(slug: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cre_oiticles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  // Increment views
  if (data) {
    await supabase.rpc("increment_oiticle_views", { oiticle_id: data.id });
  }

  return data;
}

async function getRelated(type: string, currentSlug: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cre_oiticles")
    .select("id, oiticle_type, title, slug, excerpt, author_name")
    .eq("oiticle_type", type)
    .eq("status", "published")
    .neq("slug", currentSlug)
    .order("published_at", { ascending: false })
    .limit(3);
  return data ?? [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const oiticle = await getOiticle(slug);
  if (!oiticle) return { title: "CRE 인사이트 | DealCard" };

  return {
    title: oiticle.seo_title ?? oiticle.title,
    description: oiticle.seo_description ?? oiticle.excerpt,
    openGraph: {
      title: oiticle.title,
      description: oiticle.excerpt,
      type: "article",
      publishedTime: oiticle.published_at,
    },
    alternates: { canonical: `/insight/${slug}` },
  };
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-white mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-white mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-extrabold text-white mt-8 mb-3">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, '<li class="text-sm text-slate-300 ml-4 list-disc">$1</li>')
    .replace(/^---$/gm, '<hr class="border-slate-800 my-6" />')
    .replace(/\n\n/g, '</p><p class="text-sm text-slate-300 leading-relaxed mb-3">')
    .replace(/\n/g, "<br />");
}

export default async function InsightDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const oiticle = await getOiticle(slug);
  if (!oiticle) notFound();

  const related = await getRelated(oiticle.oiticle_type, slug);
  const typeDef = OITICLE_TYPES[oiticle.oiticle_type as OiticleTypeCode];
  const authorMeta = AUTHOR_TYPE_META[oiticle.author_type as OiticleAuthorType];

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: oiticle.title,
    description: oiticle.excerpt,
    url: `${BASE_URL}/insight/${slug}`,
    datePublished: oiticle.published_at,
    dateModified: oiticle.updated_at,
    author: {
      "@type": oiticle.author_type === "ai" ? "Organization" : "Person",
      name: oiticle.author_name,
    },
    publisher: { "@type": "Organization", name: "DealCard" },
    ...(oiticle.tags?.length > 0 && { keywords: oiticle.tags.join(", ") }),
  };

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "인사이트", item: "/insight" },
    { name: typeDef?.label ?? "아티클", item: `/insight?type=${oiticle.oiticle_type}` },
    { name: oiticle.title, item: `/insight/${slug}` },
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
          <Link href="/insight" className="hover:text-white">📝 인사이트</Link>
          <span className="text-slate-700">›</span>
          <span className="text-purple-400">{typeDef?.emoji} {typeDef?.label}</span>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-purple-900/20 to-transparent border-b border-slate-800 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-4 flex-wrap">
            <span className="text-[10px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full">
              {typeDef?.emoji} {typeDef?.label}
            </span>
            {oiticle.regions?.map((r: string) => (
              <span key={r} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full">
                {REGION_LABELS[r] ?? r}
              </span>
            ))}
          </div>

          <h1 className="text-xl font-extrabold text-white leading-snug mb-4">
            {oiticle.title}
          </h1>

          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-purple-500/20 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400 text-[9px]">
                {oiticle.author_name.charAt(0)}
              </div>
              <span className="font-semibold text-slate-300">{oiticle.author_name}</span>
              <span className="text-purple-400 text-[9px]">{authorMeta?.badge}</span>
            </div>
            <span>·</span>
            <span>{oiticle.published_at ? new Date(oiticle.published_at).toLocaleDateString("ko-KR") : ""}</span>
            <span>·</span>
            <span>👁 {oiticle.views}</span>
            <span>♥ {oiticle.likes}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Body */}
        <article className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6">
          <div
            className="prose-sm text-slate-300 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: `<p class="text-sm text-slate-300 leading-relaxed mb-3">${renderMarkdown(oiticle.body_md)}</p>`,
            }}
          />
        </article>

        {/* Tags */}
        {oiticle.tags?.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {oiticle.tags.map((tag: string) => (
              <Link
                key={tag}
                href={`/insight?tag=${encodeURIComponent(tag)}`}
                className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full hover:bg-slate-700 transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              관련 인사이트
            </p>
            <div className="space-y-2">
              {related.map((r: any) => (
                <Link
                  key={r.id}
                  href={`/insight/${r.slug}`}
                  className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-xl p-3 hover:border-purple-500/30 transition-all"
                >
                  <span className="text-[10px] text-purple-400">{OITICLE_TYPES[r.oiticle_type as OiticleTypeCode]?.emoji}</span>
                  <span className="text-xs text-slate-300 flex-1 line-clamp-1">{r.title}</span>
                  <span className="text-[9px] text-slate-600">{r.author_name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
