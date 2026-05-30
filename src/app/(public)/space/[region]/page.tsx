import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

const REGION_MAP: Record<string, string> = {
  gbd: "GBD (강남권역)", ybd: "YBD (여의도권역)", cbd: "CBD (종로/을지로)",
  seongsu: "성수", pangyo: "판교", mapo: "마포/홍대", jongno: "종로", hongdae: "홍대",
  all: "전체 지역",
};

interface PageProps { params: Promise<{ region: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  return {
    title: `${label} 상업용 임대 공간 | DealCard Hub`,
    description: `${label} 권역의 오피스·리테일·F&B 임대 공간을 블라인드로 탐색하세요.`,
  };
}

export const revalidate = 3600;

export default async function SpaceRegionPage({ params }: PageProps) {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const supabase = createServiceClient();

  // Query lease-type buildings or all buildings with lease data
  let query = supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (region !== "all") {
    query = query.ilike("area_signal", `%${region}%`);
  }

  const { data: spaces } = await query;
  const items = spaces ?? [];

  const SPACE_TYPES = [
    { icon: "📁", label: "오피스", filter: "office" },
    { icon: "🛍️", label: "리테일", filter: "retail" },
    { icon: "☕", label: "F&B", filter: "f_and_b" },
    { icon: "📦", label: "물류/창고", filter: "warehouse" },
  ];

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-1.5">
              🏪 {label} 임대 공간
            </h1>
            <p className="text-[10px] text-slate-400">{items.length}건의 임대 가능 공간</p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Space Type Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {SPACE_TYPES.map((st) => (
            <span
              key={st.filter}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-[#121824] border border-slate-800 text-slate-400"
            >
              {st.icon} {st.label}
            </span>
          ))}
        </div>

        {/* Space Cards */}
        {items.length > 0 ? (
          items.map((s) => (
            <div
              key={s.id}
              className="bg-[#131b2e] border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-4 transition-all"
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  {s.asset_type || "공간"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {s.status === "active" ? "🟢 즉시 입주" : "검토중"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white mt-2">
                {s.area_signal || label} 임대 공간
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                📍 {s.area_signal || "미공개"} · {s.price_band || "임대료 문의"}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <Link
                  href={`/deal/${region}/${s.id}`}
                  className="text-xs text-emerald-400 font-medium hover:underline"
                >
                  상세 정보 요청 →
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[#121824] border border-slate-800 rounded-2xl p-10 text-center text-slate-500 space-y-1">
            <p className="text-xs font-semibold">이 권역에 등록된 임대 공간이 없습니다.</p>
            <Link href="/explore" className="inline-block mt-3 text-xs text-primary hover:underline">
              다른 권역 탐색 →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
