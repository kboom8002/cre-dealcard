import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerViewer } from "@/lib/server-viewer";

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
  space_type?: string;
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
    published:      { label: "공개",    cls: "bg-emerald-50 text-[#047857] border-emerald-200" },
    generated:      { label: "생성됨",  cls: "bg-cyan-50 text-cyan-800 border-cyan-200" },
    review_required:{ label: "검토필요",cls: "bg-amber-50 text-[#8A4B00] border-amber-200" },
    draft:          { label: "초안",    cls: "bg-slate-100 text-[#515154] border-slate-300" },
  };
  const { label, cls } = map[status ?? "draft"] ?? map.draft;
  return (
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}


// ── Page ─────────────────────────────────────────────────────────

export default async function LeasingStudioPage() {
  // P0-SEC: 서비스 클라이언트(RLS 우회)로 조회하므로 반드시 본인 공간(spaces.created_by)으로 범위를 제한한다.
  // (이전: 모든 사용자의 공간 목록·리싱 페이지가 노출됨) admin 은 전체 조회.
  const viewer = await getServerViewer();
  if (!viewer.userId) {
    redirect(`/login?redirectTo=${encodeURIComponent("/broker/leasing")}`);
  }

  const supabase = createServiceClient();

  let spacesQuery = supabase
    .from("spaces")
    .select("id, display_name, blind_name, floor, area_private_py, space_type, status, created_at");
  if (!viewer.isAdmin) {
    spacesQuery = spacesQuery.eq("created_by", viewer.userId);
  }
  const { data: spaces } = await spacesQuery
    .order("created_at", { ascending: false })
    .limit(50);

  const spaceList: SpaceRow[] = spaces ?? [];
  const spaceIds = spaceList.map((s) => s.id);
  const { data: leasingPages } = spaceIds.length > 0
    ? await supabase
        .from("leasing_pages")
        .select("space_id, slug, status, title")
        .in("space_id", spaceIds)
    : { data: [] as LeasingPageRow[] };

  const pageMap = new Map<string, LeasingPageRow>(
    (leasingPages ?? []).map((p: LeasingPageRow) => [p.space_id, p])
  );

  const statusCounts = {
    published: spaceList.filter(s => pageMap.get(s.id)?.status === "published").length,
    generated: spaceList.filter(s => pageMap.get(s.id)?.status === "generated").length,
    draft: spaceList.filter(s => !pageMap.has(s.id) || pageMap.get(s.id)?.status === "draft").length,
  };

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 ios-glass-chrome border-b border-slate-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-[#1D1D1F] flex items-center gap-1.5">
              🏪 리싱 관리
            </h1>
            <p className="text-sm text-[#515154]">{spaceList.length}개 공간 · AI 파이프라인</p>
          </div>
          <Link
            href="/broker"
            className="text-sm text-[#515154] hover:text-[#1D1D1F] font-medium transition-colors"
          >
            ← 대시보드
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Pipeline Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "공개 중", count: statusCounts.published, cls: "text-[#047857]" },
            { label: "생성됨",  count: statusCounts.generated,  cls: "text-cyan-800" },
            { label: "초안",    count: statusCounts.draft,       cls: "text-[#515154]" },
          ].map(s => (
            <div key={s.label} className="ios-glass-card rounded-2xl p-3 text-center">
              <div className={`text-2xl font-extrabold ${s.cls}`}>{s.count}</div>
              <div className="text-sm text-[#515154] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Space Cards ── */}
        {spaceList.length === 0 ? (
          <div className="ios-glass-card rounded-2xl p-12 text-center space-y-3">
            <p className="text-[#515154] text-sm">등록된 공간이 없습니다.</p>
            <Link
              href="/broker/deal-card/new"
              className="inline-block text-sm font-semibold text-[#047857] hover:underline"
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
                className="ios-glass-card hover:border-emerald-300 rounded-2xl p-4 transition-all"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#1D1D1F]">{name}</span>
                      {lp && <StatusBadge status={lp.status} />}
                    </div>
                    <p className="text-sm text-[#515154] mt-0.5">
                      {[floor, area, space.space_type].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {lp?.slug && (
                    <Link
                      href={`/leasing/${lp.slug}`}
                      target="_blank"
                      className="text-sm font-medium text-[#047857] hover:underline shrink-0"
                    >
                      공개 페이지 ↗
                    </Link>
                  )}
                </div>

                {/* Wizard Link */}
                <Link
                  href={`/broker/leasing/${space.id}`}
                  className="flex items-center justify-between w-full mt-1 bg-slate-100/80 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl px-4 py-2.5 transition-all"
                >
                  <span className="text-sm text-[#1D1D1F] font-medium">🤖 AI 파이프라인 관리</span>
                  <span className="text-sm font-semibold text-[#047857]">관리 →</span>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
