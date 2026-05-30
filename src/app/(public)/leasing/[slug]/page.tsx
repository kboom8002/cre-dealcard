import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import InquiryForm from "./InquiryForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: page } = await supabase
    .from("leasing_pages")
    .select("title, seo")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!page) return { title: "공간 정보 | DealCard Hub" };

  const seo = page.seo as Record<string, string> | null;
  return {
    title: seo?.meta_title ?? page.title ?? "공간 정보 | DealCard Hub",
    description: seo?.meta_description ?? undefined,
    robots: seo?.noindex ? "noindex" : "index,follow",
    openGraph: seo?.og_image_url ? { images: [seo.og_image_url] } : undefined,
  };
}

export const revalidate = 3600;

// ── Sub-components ───────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function FitBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    high_potential:    { label: "높은 가능성", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    medium_potential:  { label: "검토 여지",   cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
    limited_potential: { label: "제한적",      cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    weak_fit:          { label: "적합 어려움", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  };
  const { label, cls } = map[level] ?? { label: level, cls: "bg-slate-700 text-slate-300 border-slate-600" };
  return (
    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default async function LeasingSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: page } = await supabase
    .from("leasing_pages")
    .select("*, leasing_page_sections(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!page) notFound();

  const sections = ((page.leasing_page_sections ?? []) as Array<{
    id: string; section_type: string; title: string;
    markdown?: string; content_json?: Record<string, unknown>;
    visibility?: string; sort_order: number;
  }>).sort((a, b) => a.sort_order - b.sort_order);

  const { data: tenantFitRows } = await supabase
    .from("tenant_fit_results")
    .select("target_tenant_type, fit_level, fit_score, safe_summary")
    .eq("space_id", page.space_id)
    .order("fit_score", { ascending: false })
    .limit(5);

  const tenantFits = tenantFitRows ?? [];

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-cyan-900/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative max-w-2xl mx-auto px-4 pt-14 pb-10">
          <Link href="/hub" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors mb-6">
            ← Hub
          </Link>
          <div className="space-y-3">
            <h1 className="text-2xl font-extrabold text-white leading-tight">{page.title}</h1>
            {page.subtitle && <p className="text-sm text-slate-300">{page.subtitle}</p>}
            {page.answer_hero && (
              <div className="mt-4 bg-white/5 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-sm text-slate-200 leading-relaxed">{page.answer_hero}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Tenant Fit Quick Summary ── */}
      {tenantFits.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 mb-4">
          <SectionCard>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              임차인 유형별 적합도
            </h2>
            <div className="space-y-3">
              {(tenantFits as Array<{ target_tenant_type: string; fit_level: string; fit_score: number; safe_summary: string }>).map((fit) => (
                <div key={fit.target_tenant_type}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{fit.target_tenant_type}</span>
                    <FitBadge level={fit.fit_level} />
                    {fit.fit_score != null && (
                      <span className="text-[10px] text-slate-400">{fit.fit_score}점</span>
                    )}
                  </div>
                  {fit.safe_summary && (
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {fit.safe_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </section>
      )}

      {/* ── Sections ── */}
      <div className="max-w-2xl mx-auto px-4 space-y-4 pb-6">
        {sections.map((section) => {
          if (section.visibility === "broker_internal") return null;
          return (
            <SectionCard key={section.id}>
              <h2 className="text-sm font-bold text-white mb-3">{section.title}</h2>
              {section.section_type === "risk_check_needed" ? (
                <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <span className="text-lg">⚠️</span>
                  <p className="text-xs text-amber-200 leading-relaxed">
                    {section.markdown ?? "확인이 필요한 사항이 있습니다."}
                  </p>
                </div>
              ) : section.section_type === "inquiry_cta" ? (
                <div className="text-center space-y-3">
                  <p className="text-xs text-slate-400">{section.markdown ?? "관심이 있으신가요?"}</p>
                  <a
                    href="#inquiry"
                    className="inline-block bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    문의하기 ↓
                  </a>
                </div>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {section.markdown ?? ""}
                </p>
              )}
            </SectionCard>
          );
        })}

        {/* ── Boundary Note ── */}
        {page.boundary_note && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 leading-relaxed">⚖️ {page.boundary_note}</p>
          </div>
        )}

        {/* ── Inline Inquiry Form ── */}
        <div id="inquiry" className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">문의하기</h2>
          <InquiryForm
            spaceId={page.space_id}
            leasingPageId={page.id}
            slug={slug}
          />
        </div>
      </div>
    </main>
  );
}
