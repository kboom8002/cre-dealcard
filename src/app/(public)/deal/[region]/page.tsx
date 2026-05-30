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
    title: `${label} 상업용 부동산 매각 매물 | DealCard Hub`,
    description: `${label} 권역의 블라인드 상업용 부동산 매각 매물을 안전하게 검토하세요. AI 딜카드 기반 매물 정보 보호.`,
    openGraph: { title: `${label} 매각 매물 — DealCard Hub` },
  };
}

export const revalidate = 3600;

export default async function DealRegionPage({ params }: PageProps) {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const supabase = createServiceClient();

  let query = supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (region !== "all") {
    query = query.ilike("area_signal", `%${region}%`);
  }

  const { data: buildings } = await query;
  const items = buildings ?? [];

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-1.5">
              🏢 {label} 매각 매물
            </h1>
            <p className="text-[10px] text-slate-400">{items.length}건의 블라인드 딜카드</p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white transition-colors">← Hub</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-3.5">
        {items.length > 0 ? (
          items.map((b) => (
            <Link
              key={b.id}
              href={`/deal/${region}/${b.id}`}
              className="block bg-[#131b2e] border border-slate-800 hover:border-blue-500/30 rounded-2xl p-4 transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
                  {b.asset_type || "빌딩"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  b.status === "active" ? "bg-green-500/10 text-green-400" : "bg-slate-700 text-slate-400"
                }`}>
                  {b.status === "active" ? "활성" : b.status || "검토중"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white mt-2">
                {b.area_signal || label} {b.asset_type || "상업용"} 매각
              </h3>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                <span>📍 {b.area_signal || "미공개"}</span>
                <span>💰 {b.price_band || "가격대 비공개"}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="bg-[#121824] border border-slate-800 rounded-2xl p-10 text-center text-slate-500 space-y-1">
            <p className="text-xs font-semibold">이 권역에 등록된 매물이 없습니다.</p>
            <p className="text-[10px]">다른 권역을 탐색해보세요.</p>
            <Link href="/explore" className="inline-block mt-3 text-xs text-primary hover:underline">
              권역 탐색하기 →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
