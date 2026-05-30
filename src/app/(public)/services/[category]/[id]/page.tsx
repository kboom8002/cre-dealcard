import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { VENDOR_CATEGORY_META } from "@/domain/vendor/vendor-tier";
import type { VendorCategory, VendorTier } from "@/domain/vendor/vendor-tier";
import { breadcrumb } from "@/lib/schema-org";

export const revalidate = 3600;

type Params = Promise<{ category: string; id: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

/* ── Data ─────────────────────────────────────────────────────── */

async function getServiceCard(id: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("service_cards")
    .select(`
      *,
      vendor_profiles!inner (
        id, company_name, company_desc, vendor_category, vendor_tier,
        is_verified, license_verified, license_info,
        specialty_regions, portfolio_urls
      )
    `)
    .eq("id", id)
    .eq("status", "published")
    .single();
  return data;
}

async function getRelatedCards(category: string, currentId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("service_cards")
    .select("id, service_category, title, vendor_profiles!inner(company_name)")
    .eq("service_category", category)
    .eq("status", "published")
    .neq("id", currentId)
    .limit(3);
  return data ?? [];
}

/* ── Metadata ─────────────────────────────────────────────────── */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, id } = await params;
  const card = await getServiceCard(id);
  if (!card) return { title: "서비스 카드 | DealCard" };

  const meta = VENDOR_CATEGORY_META[category as VendorCategory];
  const vendor = card.vendor_profiles;

  return {
    title: `${card.title} | ${vendor.company_name} — DealCard ${meta?.label ?? ""} 서비스`,
    description: card.description.slice(0, 160),
    openGraph: {
      title: card.title,
      description: card.description.slice(0, 160),
    },
    alternates: {
      canonical: `/services/${category}/${id}`,
    },
  };
}

/* ── Page ─────────────────────────────────────────────────────── */

export default async function ServiceCardDetailPage({ params }: { params: Params }) {
  const { category, id } = await params;
  const card = await getServiceCard(id);
  if (!card) notFound();

  const relatedCards = await getRelatedCards(category, id);
  const meta = VENDOR_CATEGORY_META[category as VendorCategory];
  const vendor = card.vendor_profiles;
  const tierLabel = vendor.vendor_tier === "premium" ? "Premium" : vendor.vendor_tier === "pro" ? "Pro" : null;

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dealcard.kr";

  function renderStars(rating: number | null) {
    if (!rating) return "평점 없음";
    const full = Math.floor(rating);
    return "★".repeat(full) + (rating % 1 >= 0.5 ? "☆" : "") + ` ${rating.toFixed(1)}`;
  }

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: card.title,
    description: card.description,
    url: `${BASE_URL}/services/${category}/${id}`,
    provider: {
      "@type": "Organization",
      name: vendor.company_name,
      description: vendor.company_desc,
    },
    areaServed: card.service_regions?.map((r: string) => ({
      "@type": "Place",
      name: REGION_LABELS[r] ?? r,
    })),
    ...(card.avg_rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: card.avg_rating,
        reviewCount: card.completion_count,
      },
    }),
  };

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "전문 서비스", item: "/services" },
    { name: meta?.label ?? category, item: `/services?category=${category}` },
    { name: card.title, item: `/services/${category}/${id}` },
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
          <Link href="/services" className="hover:text-white">서비스</Link>
          <span className="text-slate-700">›</span>
          <Link href={`/services/${category}`} className="hover:text-white">
            {meta?.emoji} {meta?.label}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-emerald-900/20 to-transparent border-b border-slate-800 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-4 flex-wrap">
            <span className="text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">
              {meta?.emoji} {meta?.label}
            </span>
            {tierLabel && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                tierLabel === "Premium"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}>
                {tierLabel}
              </span>
            )}
            {vendor.is_verified && (
              <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-full">
                ✓ DealCard 인증
              </span>
            )}
          </div>

          <h1 className="text-xl font-extrabold text-white leading-snug mb-2">
            {card.title}
          </h1>

          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 text-[9px]">
              {vendor.company_name.charAt(0)}
            </div>
            <span className="font-semibold text-slate-300">{vendor.company_name}</span>
            <span>·</span>
            <span className="text-amber-400">{renderStars(card.avg_rating)}</span>
            <span>·</span>
            <span>완료 {card.completion_count}건</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* 서비스 상세 */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">서비스 설명</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {card.description}
            </p>
          </div>

          {card.portfolio_summary && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">포트폴리오</p>
              <p className="text-xs text-slate-400 leading-relaxed">{card.portfolio_summary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
            <div>
              <p className="text-[9px] text-slate-600 mb-1">서비스 지역</p>
              <div className="flex gap-1 flex-wrap">
                {card.service_regions?.map((r: string) => (
                  <span key={r} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {REGION_LABELS[r]?.split("(")[0] ?? r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 mb-1">가격 범위</p>
              <p className="text-xs text-white font-semibold">
                {card.price_range ?? "문의"}{card.price_unit ? ` / ${card.price_unit}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* 공급자 정보 */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">서비스 공급자</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center text-xl font-bold text-emerald-400">
              {vendor.company_name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{vendor.company_name}</p>
              <p className="text-[10px] text-slate-400">{meta?.label} 전문</p>
            </div>
          </div>
          {vendor.company_desc && (
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{vendor.company_desc}</p>
          )}
          <div className="flex gap-3 text-[10px]">
            {vendor.license_verified && (
              <span className="text-emerald-500">✓ 자격증 검증</span>
            )}
            {vendor.license_info && (
              <span className="text-slate-500">{vendor.license_info}</span>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-br from-emerald-900/30 to-slate-900 border border-emerald-500/20 rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm font-bold text-white">이 서비스에 관심이 있으신가요?</p>
          <p className="text-[10px] text-slate-400">
            견적 문의를 보내시면 파트너가 24시간 내 연락드립니다.
          </p>
          <button className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-colors">
            📩 견적 문의하기
          </button>
          <p className="text-[9px] text-slate-600">리드 전환 시 건당 수수료가 적용됩니다</p>
        </div>

        {/* Related */}
        {relatedCards.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              같은 카테고리 서비스
            </p>
            <div className="space-y-2">
              {relatedCards.map((rc: any) => (
                <Link
                  key={rc.id}
                  href={`/services/${rc.service_category}/${rc.id}`}
                  className="flex items-center gap-2 bg-[#131b2e] border border-slate-800 rounded-xl p-3 hover:border-emerald-500/30 transition-all"
                >
                  <span className="text-[10px] text-slate-500">•</span>
                  <span className="text-xs text-slate-300 line-clamp-1 flex-1">{rc.title}</span>
                  <span className="text-[10px] text-slate-600">{rc.vendor_profiles?.company_name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
