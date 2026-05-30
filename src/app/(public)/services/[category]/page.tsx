import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import ServiceCard from "@/components/vendor/ServiceCard";
import { VENDOR_CATEGORY_META } from "@/domain/vendor/vendor-tier";
import type { VendorCategory } from "@/domain/vendor/vendor-tier";

export const revalidate = 3600;

type Params = Promise<{ category: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params;
  const meta = VENDOR_CATEGORY_META[category as VendorCategory];
  if (!meta) return { title: "전문 서비스 | DealCard" };
  return {
    title: `${meta.label} 전문 서비스 파트너 | 상업용 부동산 — DealCard`,
    description: `${meta.desc}. DealCard 인증 ${meta.label} 전문 파트너의 서비스 카드를 비교하세요.`,
  };
}

async function getServiceCards(category: string, region?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("service_cards")
    .select(`
      id, service_category, title, description,
      service_regions, target_assets,
      price_range, price_unit,
      completion_count, avg_rating,
      vendor_profiles!inner (
        company_name, vendor_tier, is_verified
      )
    `)
    .eq("status", "published")
    .eq("visibility", "public")
    .eq("service_category", category)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(30);

  if (region) query = query.contains("service_regions", [region]);

  const { data } = await query;
  return data ?? [];
}

export default async function ServiceCategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ region?: string }>;
}) {
  const { category } = await params;
  const { region } = await searchParams;
  const meta = VENDOR_CATEGORY_META[category as VendorCategory];
  const cards = await getServiceCards(category, region);

  const categories = Object.entries(VENDOR_CATEGORY_META) as [VendorCategory, typeof VENDOR_CATEGORY_META[VendorCategory]][];

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/services" className="text-slate-400 hover:text-white text-xs">← 서비스</Link>
            <span className="text-slate-700">›</span>
            <h1 className="text-sm font-extrabold text-white">
              {meta?.emoji} {meta?.label ?? category}
            </h1>
          </div>
          <Link
            href="/vendor/apply"
            className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            입점 신청
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Category Description */}
        {meta && (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-white mb-1">
              {meta.emoji} {meta.label} 전문 서비스
            </p>
            <p className="text-[10px] text-slate-400">{meta.desc}</p>
          </div>
        )}

        {/* Region Chips */}
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/services/${category}`}
            className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all border ${
              !region
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-emerald-500/30"
            }`}
          >
            전체
          </Link>
          {Object.entries(REGION_LABELS).map(([slug, label]) => (
            <Link
              key={slug}
              href={`/services/${category}?region=${slug}`}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all border ${
                region === slug
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "bg-[#131b2e] border-slate-800 text-slate-400 hover:border-emerald-500/30"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Cards */}
        {cards.length > 0 ? (
          <div className="space-y-3">
            {cards.map((card) => (
              <ServiceCard key={card.id} card={card as any} />
            ))}
          </div>
        ) : (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-10 text-center">
            <p className="text-slate-500 text-sm mb-2">아직 등록된 서비스 카드가 없습니다.</p>
            <p className="text-[10px] text-slate-600">첫 번째 {meta?.label} 파트너가 되어 주세요!</p>
          </div>
        )}

        {/* Other Categories */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">다른 서비스</p>
          <div className="grid grid-cols-4 gap-2">
            {categories.filter(([k]) => k !== category).map(([key, m]) => (
              <Link
                key={key}
                href={`/services/${key}`}
                className="bg-[#131b2e] border border-slate-800 rounded-xl p-2.5 text-center hover:border-emerald-500/30 transition-all"
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
