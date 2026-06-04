import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { realEstateAgent, breadcrumb } from "@/lib/schema-org";

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  return {
    title: `${name} | 상업용 부동산 전문 중개인 — DealCard`,
    description: `${name} 중개인의 전문 권역, 실적, 블라인드 매물을 확인하세요. DealCard 검증 프로필.`,
    openGraph: {
      title: `${name} — 상업용 부동산 전문 중개인`,
      images: [`/api/og/broker/${slug}`],
    },
  };
}

export const revalidate = 3600;

export default async function BrokerProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const supabase = createServiceClient();

  // Find broker profile by slug first, or fallback to name ilike / id matches
  let profileId: string | null = null;
  const { data: bpBySlug } = await supabase
    .from("broker_profiles")
    .select("user_id")
    .eq("slug", decodedSlug)
    .limit(1)
    .maybeSingle();

  if (bpBySlug) {
    profileId = bpBySlug.user_id;
  }

  let query = supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("role", "broker");

  if (profileId) {
    query = query.eq("id", profileId);
  } else {
    const nameFromSlug = decodedSlug.replace(/-/g, " ");
    query = query.or(`id.eq.${decodedSlug},display_name.ilike.%${decodedSlug}%,display_name.ilike.%${nameFromSlug}%`);
  }

  const { data: profile } = await query.limit(1).single();

  if (!profile) return notFound();

  // Get broker's buildings
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const deals = buildings ?? [];

  // Get stats
  const { count: dealCount } = await supabase
    .from("building_ssot_lite")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", profile.id);

  // Compute specialty regions
  const regions = [...new Set(deals.map((d) => d.area_signal).filter(Boolean))];

  const schemaData = realEstateAgent({
    id: profile.id,
    display_name: profile.display_name,
    specialty_regions: regions,
  });

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "중개사 프로필", item: `/broker-profile/${slug}` },
  ];
  const breadcrumbSchema = breadcrumb(breadcrumbSteps);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
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

      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
          <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
            Verified Broker
          </span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-purple-600/20 to-blue-600/10 border border-purple-500/20 rounded-2xl p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl font-bold mx-auto">
            {(profile.display_name || "B").charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{profile.display_name}</h1>
            <p className="text-xs text-slate-400 mt-1">상업용 부동산 전문 중개인</p>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs">
            {regions.length > 0 && (
              <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
                📍 {regions.join(", ")}
              </span>
            )}
            <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
              📋 {dealCount ?? 0}건
            </span>
          </div>
        </div>

        {/* Vibe AI 명함 연결 */}
        <Link
          href={`/vibe-card/${slug}`}
          className="block bg-gradient-to-r from-cyan-600/10 to-purple-600/10 border border-cyan-500/20 hover:border-cyan-500/40 rounded-xl p-4 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">✨</span>
              <div>
                <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Vibe AI 명함 보기
                </p>
                <p className="text-[10px] text-slate-500">
                  데이터 기반 신뢰 프로필 카드
                </p>
              </div>
            </div>
            <span className="text-slate-500 group-hover:text-cyan-400 transition-colors text-xs">→</span>
          </div>
        </Link>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "딜카드", value: `${dealCount ?? 0}건`, icon: "📋" },
            { label: "전문 권역", value: `${regions.length}개`, icon: "📍" },
            { label: "활성 딜", value: `${deals.filter((d) => d.status === "active").length}건`, icon: "🔥" },
          ].map((s, i) => (
            <div key={i} className="bg-[#131b2e] border border-slate-800 rounded-xl p-3 text-center">
              <span className="text-lg">{s.icon}</span>
              <p className="text-sm font-bold text-white mt-1">{s.value}</p>
              <p className="text-[10px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Deals */}
        {deals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              최근 블라인드 딜카드
            </h2>
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/deal/${(d.area_signal || "all").toLowerCase()}/${d.id}`}
                className="block bg-[#131b2e] border border-slate-800 hover:border-purple-500/30 rounded-xl p-3.5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                      {d.asset_type || "빌딩"}
                    </span>
                    <span className="text-xs font-medium text-white">
                      {d.area_signal} {d.asset_type}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">{d.price_band || "비공개"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 text-center space-y-3">
          <p className="text-xs text-slate-400">이 중개인에게 문의하시겠습니까?</p>
          <Link
            href={`/expert-note/request?broker=${encodeURIComponent(profile.display_name || "")}`}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors active:scale-[0.98]"
            id="cta-contact-broker"
          >
            💬 전문가 상담 요청
          </Link>
        </div>
      </div>
    </main>
  );
}
