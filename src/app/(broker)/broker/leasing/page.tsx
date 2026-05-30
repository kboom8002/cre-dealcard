import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "리싱 관리 | DealCard Hub",
  description: "AI 리싱 파이프라인 관리",
  robots: "noindex",
};

export const revalidate = 0;

// ── Types ────────────────────────────────────────────────────────

interface SpaceRow {
  id: string;
  display_name?: string;
  blind_name?: string;
  floor?: string;
  area_private_py?: number;
  asset_type?: string;
  status?: string;
  created_at?: string;
}

interface LeasingPageRow {
  space_id: string;
  slug?: string;
  status?: string;
  title?: string;
}

// ── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    published:      { label: "공개",    cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    generated:      { label: "생성됨",  cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
    review_required:{ label: "검토필요",cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    draft:          { label: "초안",    cls: "bg-slate-700 text-slate-400 border-slate-600" },
  };
  const { label, cls } = map[status ?? "draft"] ?? map.draft;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}


// ── Page ─────────────────────────────────────────────────────────

export default async function LeasingStudioPage() {
  const supabase = createServiceClient();

  const [{ data: spaces }, { data: leasingPages }] = await Promise.all([
    supabase
      .from("spaces")
      .select("id, display_name, blind_name, floor, area_private_py, asset_type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("leasing_pages")
      .select("space_id, slug, status, title"),
  ]);

  const spaceList: SpaceRow[] = spaces ?? [];
  const pageMap = new Map<string, LeasingPageRow>(
    (leasingPages ?? []).map((p: LeasingPageRow) => [p.space_id, p])
  );

  const statusCounts = {
    published: spaceList.filter(s => pageMap.get(s.id)?.status === "published").length,
    generated: spaceList.filter(s => pageMap.get(s.id)?.status === "generated").length,
    draft: spaceList.filter(s => !pageMap.has(s.id) || pageMap.get(s.id)?.status === "draft").length,
  };

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-1.5">
              🏪 리싱 관리
            </h1>
            <p className="text-[10px] text-slate-400">{spaceList.length}개 공간 · AI 파이프라인</p>
          </div>
          <Link
            href="/broker"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← 대시보드
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Pipeline Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "공개 중", count: statusCounts.published, cls: "text-emerald-400" },
            { label: "생성됨",  count: statusCounts.generated,  cls: "text-cyan-400" },
            { label: "초안",    count: statusCounts.draft,       cls: "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <div className={`text-2xl font-extrabold ${s.cls}`}>{s.count}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Space Cards ── */}
        {spaceList.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center space-y-3">
            <p className="text-slate-500 text-sm">등록된 공간이 없습니다.</p>
            <Link
              href="/broker/deal-card/new"
              className="inline-block text-xs text-emerald-400 hover:underline"
            >
              첫 공간 등록하기 →
            </Link>
          </div>
        ) : (
          spaceList.map((space) => {
            const lp = pageMap.get(space.id);
            const name = space.display_name ?? space.blind_name ?? "무제 공간";
            const area = space.area_private_py ? `${space.area_private_py}평` : "";
            const floor = space.floor ? `${space.floor}층` : "";

            return (
              <div
                key={space.id}
                className="bg-[#131b2e] border border-slate-800 hover:border-emerald-500/20 rounded-2xl p-4 transition-all"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{name}</span>
                      {lp && <StatusBadge status={lp.status} />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {[floor, area, space.asset_type].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {lp?.slug && (
                    <Link
                      href={`/leasing/${lp.slug}`}
                      target="_blank"
                      className="text-[10px] text-emerald-400 hover:underline shrink-0"
                    >
                      공개 페이지 ↗
                    </Link>
                  )}
                </div>

                {/* Wizard Link */}
                <Link
                  href={`/broker/leasing/${space.id}`}
                  className="flex items-center justify-between w-full mt-1 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-emerald-500/20 rounded-xl px-4 py-2.5 transition-all"
                >
                  <span className="text-xs text-slate-300 font-medium">🤖 AI 파이프라인 관리</span>
                  <span className="text-xs text-emerald-400">관리 →</span>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
