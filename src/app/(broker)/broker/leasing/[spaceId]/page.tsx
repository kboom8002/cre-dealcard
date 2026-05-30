import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import SpaceWizard from "./SpaceWizard";

interface PageProps {
  params: Promise<{ spaceId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { spaceId } = await params;
  const supabase = createServiceClient();
  const { data: space } = await supabase
    .from("spaces")
    .select("display_name, blind_name")
    .eq("id", spaceId)
    .single();

  const name = space?.display_name ?? space?.blind_name ?? "공간";
  return {
    title: `${name} 리싱 관리 | DealCard Hub`,
    robots: "noindex",
  };
}

export const revalidate = 0;

// ── Status Badge ─────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    published:        { label: "공개 중",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    page_generated:   { label: "페이지 생성됨", cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
    visual_classified:{ label: "사진 분류됨",  cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    generated:        { label: "생성됨",    cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
    review_required:  { label: "검토 필요", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    draft:            { label: "초안",      cls: "bg-slate-700 text-slate-400 border-slate-600" },
    intake:           { label: "접수",      cls: "bg-slate-700 text-slate-400 border-slate-600" },
  };
  const { label, cls } = map[status ?? "draft"] ?? map.draft;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

export default async function SpaceLeasingPage({ params }: PageProps) {
  const { spaceId } = await params;
  const supabase = createServiceClient();

  const [
    { data: space },
    { data: tenantFits },
    { data: vibeFit },
    { data: leasingPage },
    { data: inquiries },
    { data: campaignCopies },
  ] = await Promise.all([
    supabase.from("spaces").select("*").eq("id", spaceId).single(),
    supabase
      .from("tenant_fit_results")
      .select("id, target_tenant_type, fit_level, fit_score, safe_summary")
      .eq("space_id", spaceId)
      .order("fit_score", { ascending: false }),
    supabase
      .from("vibe_fit_results")
      .select("id, vibe_summary, vibe_tags, vad")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("leasing_pages")
      .select("id, slug, status, title, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("leasing_inquiries")
      .select("id, status, prospect, requirement, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("campaign_copies")
      .select("id, copy_type, title, body, status, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!space) notFound();

  const name = space.display_name ?? space.blind_name ?? "무제 공간";
  const area = space.area_private_py ? `${space.area_private_py}평` : "";
  const floor = space.floor ? `${space.floor}층` : "";

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-extrabold text-white">{name}</h1>
              <StatusBadge status={space.status} />
            </div>
            <p className="text-[10px] text-slate-500">
              {[floor, area, space.asset_type].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link
            href="/broker/leasing"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← 리싱 관리
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5">

        {/* ── AI 파이프라인 위저드 ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            🤖 AI 파이프라인
          </h2>
          <SpaceWizard
            spaceId={spaceId}
            spaceName={name}
            initialSlug={leasingPage?.slug}
            initialLeasingPageId={leasingPage?.id}
          />
        </section>

        {/* ── 현재 리싱 페이지 ── */}
        {leasingPage && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-400">현재 리싱 페이지</h2>
              <StatusBadge status={leasingPage.status} />
            </div>
            <p className="text-sm font-semibold text-white">{leasingPage.title}</p>
            <div className="flex gap-2 mt-3">
              <a
                href={`/leasing/${leasingPage.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-xs font-semibold py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                공개 페이지 열기 ↗
              </a>
            </div>
          </section>
        )}

        {/* ── TenantFit 결과 ── */}
        {(tenantFits?.length ?? 0) > 0 && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h2 className="text-xs font-bold text-slate-400 mb-3">임차인 적합도 분석</h2>
            <div className="space-y-2">
              {(tenantFits ?? []).map((fit) => (
                <div key={fit.id} className="flex items-center justify-between">
                  <span className="text-xs text-white font-medium">{fit.target_tenant_type}</span>
                  <div className="flex items-center gap-2">
                    {fit.fit_score != null && (
                      <span className="text-[10px] text-slate-400">{fit.fit_score}점</span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      fit.fit_level === "high_potential"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : fit.fit_level === "medium_potential"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}>
                      {fit.fit_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── VibeFit ── */}
        {vibeFit && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h2 className="text-xs font-bold text-slate-400 mb-2">분위기 분석</h2>
            <p className="text-[11px] text-slate-300 leading-relaxed">{vibeFit.vibe_summary}</p>
            {Array.isArray(vibeFit.vibe_tags) && vibeFit.vibe_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(vibeFit.vibe_tags as string[]).slice(0, 6).map((tag) => (
                  <span key={tag} className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 캠페인 카피 ── */}
        {(campaignCopies?.length ?? 0) > 0 && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h2 className="text-xs font-bold text-slate-400 mb-3">생성된 카피</h2>
            <div className="space-y-3">
              {(campaignCopies ?? []).map((copy) => (
                <div key={copy.id} className="border-l-2 border-cyan-500/30 pl-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">{copy.copy_type}</span>
                    {copy.title && <span className="text-[11px] text-white font-semibold">{copy.title}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{copy.body}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(copy.body)}
                    className="text-[10px] text-slate-600 hover:text-emerald-400 transition-colors mt-1"
                  >
                    복사
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 문의 목록 ── */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-400">
              문의 {(inquiries?.length ?? 0) > 0 ? `(${inquiries!.length}건)` : ""}
            </h2>
          </div>
          {(inquiries?.length ?? 0) === 0 ? (
            <p className="text-[11px] text-slate-600">아직 문의가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {(inquiries ?? []).map((inq) => {
                const prospect = inq.prospect as { display_name?: string; company_name?: string } | null;
                const req = inq.requirement as { tenant_category?: string; tour_interest?: boolean } | null;
                return (
                  <div key={inq.id} className="flex items-center justify-between border border-white/5 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-[11px] text-white font-medium">
                        {prospect?.company_name ?? prospect?.display_name ?? "익명"}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {req?.tenant_category ?? "업종 미확인"}
                        {req?.tour_interest ? " · 투어 관심" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        inq.status === "qualified"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-700 text-slate-400 border-slate-600"
                      }`}>
                        {inq.status}
                      </span>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(inq.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
