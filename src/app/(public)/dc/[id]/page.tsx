import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { realEstateListing, breadcrumb } from "@/lib/schema-org";

interface PageProps { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("building_ssot_lite")
    .select("area_signal, asset_type, price_band")
    .eq("id", id)
    .single();

  const label = data?.area_signal || "상업용 부동산";
  const asset = data?.asset_type || "상업용 부동산";
  const price = data?.price_band || "";

  return {
    title: `${label} ${asset} 매각 ${price ? `| ${price}` : ""} | DealCard`,
    description: `${label} 권역 ${asset} 블라인드 매각 매물. DealCard의 Gate 시스템으로 안전하게 검토하세요.`,
    openGraph: {
      title: `${label} ${asset} 매각 — DealCard`,
      description: `블라인드 딜카드로 안전한 매물 검토. ${price || "가격 비공개"}`,
      images: [`/api/og/deal/${id}`],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select("*")
    .eq("id", id)
    .single();

  if (!building) return notFound();

  const regionLabel = building.area_signal || "전체";
  const schemaData = realEstateListing(building);
  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "딜카드", item: "/hub" },
    { name: `${regionLabel} ${building.asset_type || "상업용"} 매각`, item: `/dc/${id}` },
  ];
  const breadcrumbSchema = breadcrumb(breadcrumbSteps);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">
            ← 돌아가기
          </Link>
          <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
            Blind DealCard
          </span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Main Card */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          {/* Gradient Banner */}
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/10 px-5 py-6 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-0.5 rounded-full font-medium">
                📍 {building.area_signal || "비공개"}
              </span>
              <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-0.5 rounded-full font-medium">
                🏢 {building.asset_type || "상업용"}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">
              {building.area_signal || "비공개 권역"} {building.asset_type || "빌딩"} 매각
            </h1>
            {building.price_band && (
              <p className="text-lg font-bold text-blue-400">{building.price_band}</p>
            )}
          </div>

          {/* Details */}
          <div className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0b0f19] rounded-xl p-3 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-medium">권역</p>
                <p className="text-sm font-bold text-white mt-1">{building.area_signal || "비공개"}</p>
              </div>
              <div className="bg-[#0b0f19] rounded-xl p-3 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-medium">자산유형</p>
                <p className="text-sm font-bold text-white mt-1">{building.asset_type || "비공개"}</p>
              </div>
              <div className="bg-[#0b0f19] rounded-xl p-3 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-medium">가격대</p>
                <p className="text-sm font-bold text-white mt-1">{building.price_band || "비공개"}</p>
              </div>
              <div className="bg-[#0b0f19] rounded-xl p-3 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-medium">상태</p>
                <p className="text-sm font-bold text-green-400 mt-1">
                  {building.status === "active" ? "활성" : building.status || "검토중"}
                </p>
              </div>
            </div>

            {/* Safety Notice */}
            <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-white flex items-center gap-1">🔒 블라인드 처리 안내</p>
              <p className="text-[10px] leading-relaxed">
                매도자 보호를 위해 정확한 건물 주소, 호실, 소유자 정보는 비공개 처리되어 있습니다.
                하단 연락처 제출 후 NDA 기반으로 상세 정보를 제공합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Gate CTA */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">📞 상세 정보 요청</h2>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            연락처를 남겨주시면 담당 중개사가 NDA 체결 후 상세 자료를 전달합니다.
          </p>
          <form className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="성함 또는 기업명"
                className="bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              />
              <input
                type="text"
                placeholder="연락처"
                className="bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-xs transition-colors active:scale-[0.98]"
              id="cta-deal-gate-request"
            >
              🔒 상세 정보 요청하기 (무료)
            </button>
          </form>
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <Link
            href="/building-radar"
            className="text-xs text-primary hover:underline"
          >
            🔍 다른 건물도 AI로 검진해보기 →
          </Link>
        </div>
      </div>
    </main>
  );
}
