import { Metadata } from "next";
import Link from "next/link";
import { 
  Building2, 
  Store, 
  BarChart3, 
  User, 
  ArrowRight, 
  Search, 
  Sparkles, 
  MapPin, 
  Compass, 
  HelpCircle,
  AlertCircle
} from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { UnifiedSearchBar } from "@/components/search/UnifiedSearchBar";
import { BrokerResultCard } from "@/components/search/BrokerResultCard";
import { searchResultsPage, brokerItemList } from "@/lib/schema-org";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    region?: string;
    page?: string;
  }>;
}

const REGIONS = [
  { slug: "all", label: "전체", emoji: "🌐" },
  { slug: "gbd", label: "GBD (강남)", emoji: "🏙️" },
  { slug: "ybd", label: "YBD (여의도)", emoji: "🌊" },
  { slug: "cbd", label: "CBD (도심)", emoji: "🏛️" },
  { slug: "seongsu", label: "성수", emoji: "🎨" },
  { slug: "pangyo", label: "판교", emoji: "💻" },
] as const;

const TABS = [
  { id: "deal", label: "매매", icon: Building2, desc: "블라인드 딜카드", color: "text-blue-400", activeColor: "border-blue-500 bg-blue-500/10 text-blue-400" },
  { id: "space", label: "임대", icon: Store, desc: "임대 공간", color: "text-emerald-400", activeColor: "border-emerald-500 bg-emerald-500/10 text-emerald-400" },
  { id: "market", label: "시세", icon: BarChart3, desc: "AI 시세 리포트", color: "text-purple-400", activeColor: "border-purple-500 bg-purple-500/10 text-purple-400" },
  { id: "broker", label: "중개인", icon: User, desc: "전문 중개인", color: "text-amber-400", activeColor: "border-amber-500 bg-amber-500/10 text-amber-400" },
];

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q = "", type = "deal" } = await searchParams;
  const typeLabel = {
    deal: "매매 딜카드",
    space: "임대 공간",
    market: "시장 시세",
    broker: "전문 중개인",
  }[type] ?? "검색";

  const title = q
    ? `"${q}"에 대한 ${typeLabel} 검색 결과 | DealCard`
    : `상업용 부동산 통합 검색 | DealCard`;
  
  const description = q
    ? `DealCard에서 "${q}" 키워드에 상응하는 최적의 상업용 부동산 ${typeLabel} 검색 결과입니다. 빌딩 매매, 임대 오피스, 시세 정보 및 검증된 중개인 프로필을 확인해 보세요.`
    : `GBD, YBD, CBD 등 서울 주요 권역의 상업용 부동산 매물, 임대 공간, 시장 시세 및 VTI 성향 기반 전문 중개인 매칭 서비스를 제공합니다.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", type = "deal", region = "all", page = "1" } = await searchParams;
  const currentPage = parseInt(page, 10);
  const limit = 12;

  const supabase = createServiceClient();
  let results: any[] = [];
  let totalCount = 0;

  // DB queries matching type
  try {
    if (type === "deal") {
      let query = supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band, status, created_at", { count: "exact" })
        .eq("status", "public_signal_ready")
        .order("created_at", { ascending: false });

      if (region && region !== "all") {
        const regionLabel = {
          gbd: "강남",
          ybd: "여의도",
          cbd: "종로",
          seongsu: "성수",
          pangyo: "판교",
        }[region];
        if (regionLabel) query = query.ilike("area_signal", `%${regionLabel}%`);
      }
      if (q) {
        query = query.or(`area_signal.ilike.%${q}%,asset_type.ilike.%${q}%`);
      }

      const from = (currentPage - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (!error && data) {
        results = data;
        totalCount = count ?? data.length;
      }
    } else if (type === "space") {
      let query = supabase
        .from("lease_spaces")
        .select("id, floor, area_sqm, space_type, deposit, monthly_rent, area_signal, title, status", { count: "exact" })
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (region && region !== "all") {
        const regionLabel = {
          gbd: "강남",
          ybd: "여의도",
          cbd: "종로",
          seongsu: "성수",
          pangyo: "판교",
        }[region];
        if (regionLabel) query = query.ilike("area_signal", `%${regionLabel}%`);
      }
      if (q) {
        query = query.or(`area_signal.ilike.%${q}%,title.ilike.%${q}%,space_type.ilike.%${q}%`);
      }

      const from = (currentPage - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (!error && data) {
        results = data;
        totalCount = count ?? data.length;
      }
    } else if (type === "market") {
      let query = supabase
        .from("cre_pulses")
        .select("region, period_type, pulse_score, trend, summary_ko, period_label, seo_slug", { count: "exact" })
        .eq("status", "published")
        .eq("period_type", "weekly")
        .order("created_at", { ascending: false });

      if (region && region !== "all") {
        query = query.eq("region", region);
      }
      if (q) {
        query = query.ilike("summary_ko", `%${q}%`);
      }

      const from = (currentPage - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (!error && data) {
        results = data;
        totalCount = count ?? data.length;
      }
    } else if (type === "broker") {
      // Query profiles + broker_profiles
      const { data: brokers, error } = await supabase
        .from("profiles")
        .select(`
          id,
          display_name,
          company,
          photo_url,
          tagline,
          broker_profiles!inner (
            slug,
            specialty_regions,
            specialty_assets,
            bio,
            vibe_vti,
            vibe_trust,
            vibe_valence,
            is_public,
            seo_summary,
            total_deal_count_self,
            is_verified
          )
        `)
        .eq("role", "broker")
        .eq("broker_profiles.is_public", true);

      if (!error && brokers) {
        let filtered = brokers;

        // A. Region Filter
        if (region && region !== "all") {
          const reg = region.toLowerCase();
          filtered = filtered.filter((p: any) => {
            const bp = p.broker_profiles || {};
            const regions = bp.specialty_regions || [];
            return regions.some((r: string) => {
              const rLower = r.toLowerCase();
              return (
                rLower.includes(reg) ||
                (reg === "gbd" && (rLower.includes("강남") || rLower.includes("서초"))) ||
                (reg === "ybd" && (rLower.includes("여의도") || rLower.includes("영등포") || rLower.includes("마포"))) ||
                (reg === "cbd" && (rLower.includes("종로") || rLower.includes("중구") || rLower.includes("도심"))) ||
                (reg === "seongsu" && rLower.includes("성수")) ||
                (reg === "pangyo" && rLower.includes("판교"))
              );
            });
          });
        }

        // B. Keyword Filter
        if (q) {
          const qLower = q.toLowerCase();
          filtered = filtered.filter((p: any) => {
            const bp = p.broker_profiles || {};
            const displayName = (p.display_name ?? "").toLowerCase();
            const company = (p.company ?? "").toLowerCase();
            const tagline = (p.tagline ?? "").toLowerCase();
            const bio = (bp.bio ?? "").toLowerCase();
            const seoSummary = (bp.seo_summary ?? "").toLowerCase();
            
            const regions = (bp.specialty_regions ?? []).join(" ").toLowerCase();
            const assets = (bp.specialty_assets ?? []).join(" ").toLowerCase();
            const vti = (bp.vibe_vti ?? "").toLowerCase();
            
            return (
              displayName.includes(qLower) ||
              company.includes(qLower) ||
              tagline.includes(qLower) ||
              bio.includes(qLower) ||
              seoSummary.includes(qLower) ||
              regions.includes(qLower) ||
              assets.includes(qLower) ||
              vti.includes(qLower)
            );
          });
        }

        // C. Sort
        filtered.sort((a: any, b: any) => {
          const aBp = a.broker_profiles || {};
          const bBp = b.broker_profiles || {};
          
          if (aBp.is_verified && !bBp.is_verified) return -1;
          if (!aBp.is_verified && bBp.is_verified) return 1;

          const aDeals = aBp.total_deal_count_self ?? 0;
          const bDeals = bBp.total_deal_count_self ?? 0;
          if (aDeals !== bDeals) return bDeals - aDeals;

          return (a.display_name ?? "").localeCompare(b.display_name ?? "");
        });

        totalCount = filtered.length;

        // D. Paginate
        const start = (currentPage - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        results = paginated.map((p: any) => {
          const bp = p.broker_profiles || {};
          return {
            id: p.id,
            displayName: p.display_name,
            company: p.company,
            photoUrl: p.photo_url,
            tagline: p.tagline,
            slug: bp.slug,
            specialtyRegions: bp.specialty_regions || [],
            specialtyAssets: bp.specialty_assets || [],
            bio: bp.bio,
            vibeVti: bp.vibe_vti,
            vibeTrust: bp.vibe_trust,
            vibeValence: bp.vibe_valence,
            totalDealCount: bp.total_deal_count_self || 0,
            isVerified: bp.is_verified,
            seoSummary: bp.seo_summary
          };
        });
      }
    }
  } catch (err) {
    console.error("Search Page DB Fetch Error:", err);
  }

  // Generate dynamic FAQ items based on the search query
  const faqItems = [
    {
      question: `${q ? `"${q}" 관련 ` : ""}상업용 부동산 검색 필터는 어떻게 작동하나요?`,
      answer: "상단 탭을 통해 매매(블라인드 딜카드), 임대(즉시 입주 공간), 시세(주간 리포트), 중개인(VTI 프로필)의 4개 카테고리를 이동할 수 있으며, 하단의 GBD, YBD, CBD 권역 필터를 클릭해 즉시 타겟 권역을 좁힐 수 있습니다."
    },
    {
      question: "DealCard의 VTI 중개인 매칭 서비스란 무엇인가요?",
      answer: "VTI(Vibe Type Indicator)는 중개인의 고유한 거래 스타일, 소통 정동(Warmth, Energy, Polish 등 7개 차원)을 AI로 분석하여, 고객의 니즈 및 자산에 가장 어울리는 성향의 전문 파트너 중개사를 시각화하여 매칭해 주는 혁신적인 서비스입니다."
    },
    {
      question: "블라인드 딜카드란 무엇이며 어떻게 참여하나요?",
      answer: "매물의 직접적인 상세 주소나 소유주 정보를 보호하면서, 빌딩의 핵심 스펙과 자산가치 신호만을 기반으로 최적의 매수 희망자들의 오퍼를 유도하는 보안 특화 딜메이킹 카드입니다. 상단 검색을 통해 원하는 매매 카드를 찾은 후 중개인 프로필을 통해 바로 상담 신청할 수 있습니다."
    }
  ];

  // Schema.org JSON-LD structured data
  const searchLd = searchResultsPage(q || "상업용 부동산", totalCount);
  const brokerLd = type === "broker" && results.length > 0
    ? brokerItemList(
        results.map((r) => ({
          id: r.slug,
          display_name: r.displayName,
          company: r.company,
          specialty_regions: r.specialtyRegions,
          bio: r.seoSummary || r.bio
        }))
      )
    : null;

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  // Helper to build URL with search params
  const getSearchUrl = (newParams: { q?: string; type?: string; region?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (newParams.q !== undefined ? newParams.q : q) {
      params.set("q", newParams.q !== undefined ? newParams.q! : q);
    }
    const targetType = newParams.type !== undefined ? newParams.type! : type;
    params.set("type", targetType);
    
    const targetRegion = newParams.region !== undefined ? newParams.region! : region;
    if (targetRegion && targetRegion !== "all") {
      params.set("region", targetRegion);
    }
    
    const targetPage = newParams.page !== undefined ? newParams.page! : 1;
    if (targetPage > 1) {
      params.set("page", targetPage.toString());
    }
    return `/search?${params.toString()}`;
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <main className="min-h-screen bg-[#070b13] text-slate-100 pb-20">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(searchLd) }}
      />
      {brokerLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      {/* Hero & Search Header */}
      <div className="relative border-b border-white/5 bg-[#090d18]/50 backdrop-blur-md pt-8 pb-4">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <Compass className="w-5 h-5 text-primary animate-pulse" />
            <h1 className="text-sm font-bold text-slate-400">통합 시맨틱 검색</h1>
            <span className="text-[10px] text-muted-foreground ml-auto">AEO/GEO 최적화 엔진</span>
          </div>

          <div className="w-full max-w-2xl mb-5">
            <UnifiedSearchBar initialValue={q} type={type} />
          </div>

          {/* Tab Menu */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((t) => {
              const TabIcon = t.icon;
              const isActive = type === t.id;
              return (
                <Link
                  key={t.id}
                  href={getSearchUrl({ type: t.id, page: 1 })}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-all shrink-0 ${
                    isActive
                      ? t.activeColor
                      : "bg-white/2.5 border-white/5 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <TabIcon className={`w-3.5 h-3.5 ${isActive ? "" : "text-muted-foreground"}`} />
                  <span>{t.label}</span>
                  {isActive && (
                    <span className="text-[9px] font-normal opacity-80 px-1.5 py-0.5 rounded bg-white/10 ml-0.5">
                      {t.desc}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters & Results Area */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Region Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none mb-6 border-b border-white/5">
          <span className="text-[10px] text-muted-foreground font-semibold shrink-0">권역 필터:</span>
          {REGIONS.map((r) => {
            const isSelected = region === r.slug;
            return (
              <Link
                key={r.slug}
                href={getSearchUrl({ region: r.slug, page: 1 })}
                className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold border transition-all ${
                  isSelected
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-white/2.5 border-white/5 text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Results Heading */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] text-muted-foreground font-bold tracking-wide uppercase">
            {q ? `"${q}" 검색 결과` : "전체 탐색"} ({totalCount}건)
          </p>
        </div>

        {/* Results Listing */}
        {results.length > 0 ? (
          <>
            {type === "broker" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((r: any) => (
                  <BrokerResultCard key={r.id} broker={r} />
                ))}
              </div>
            )}

            {type === "deal" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {results.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/deal/${r.area_signal?.toLowerCase().replace(/[·\s]/g, "").slice(0, 4) || "gbd"}/${r.id}`}
                    className="flex items-center justify-between gap-4 bg-[#0a0f1d] border border-white/5 rounded-2xl p-4 hover:border-blue-500/30 transition-all shadow-md group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate group-hover:text-blue-400 transition-colors">
                          {r.area_signal || "권역 신호"} {r.asset_type || "상업 자산"}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.price_band || "가격 미정"}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {type === "space" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {results.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/space/${r.area_signal?.toLowerCase().slice(0, 4) || "gbd"}/${r.id}`}
                    className="flex items-center justify-between gap-4 bg-[#0a0f1d] border border-white/5 rounded-2xl p-4 hover:border-emerald-500/30 transition-all shadow-md group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate group-hover:text-emerald-400 transition-colors">
                          {r.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.area_sqm ? `${Math.round(r.area_sqm / 3.3058)}평` : ""} · 보증금 {r.deposit || 0}만 / 월 {r.monthly_rent || 0}만
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {type === "market" && (
              <div className="space-y-3">
                {results.map((r: any) => (
                  <Link
                    key={`${r.region}-${r.period_label}`}
                    href={`/pulse/${r.region}/${r.period_label}`}
                    className="flex items-center justify-between gap-4 bg-[#0a0f1d] border border-white/5 rounded-2xl p-4 hover:border-purple-500/30 transition-all shadow-md group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate group-hover:text-purple-400 transition-colors">
                          {r.region.toUpperCase()} 주간 시세 리포트 ({r.period_label})
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.summary_ko}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">시장 펄스</span>
                        <span className="text-sm font-bold text-purple-400">{r.pulse_score}점</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {currentPage > 1 && (
                  <Link
                    href={getSearchUrl({ page: currentPage - 1 })}
                    className="flex items-center justify-center text-xs font-semibold bg-white/2.5 border border-white/5 px-4 h-10 rounded-xl hover:bg-white/5 hover:border-white/10 transition-all"
                  >
                    이전
                  </Link>
                )}
                <span className="text-xs text-muted-foreground px-3">
                  {currentPage} / {totalPages} 페이지
                </span>
                {currentPage < totalPages && (
                  <Link
                    href={getSearchUrl({ page: currentPage + 1 })}
                    className="flex items-center justify-center text-xs font-semibold bg-white/2.5 border border-white/5 px-4 h-10 rounded-xl hover:bg-white/5 hover:border-white/10 transition-all"
                  >
                    다음
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 bg-[#0a0f1d]/30 border border-white/5 rounded-2xl p-6">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-1">검색 결과가 존재하지 않습니다.</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              입력하신 검색어를 확인해 보시거나, 권역 필터를 사용하거나 다른 카테고리 탭을 선택해 보세요.
            </p>
          </div>
        )}

        {/* Dynamic FAQ Accordion Section for SEO/AEO/GEO */}
        <div className="mt-14 pt-8 border-t border-white/5">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">자주 묻는 질문 (FAQ)</h2>
          </div>
          <div className="space-y-4">
            {faqItems.map((item, index) => (
              <div 
                key={index} 
                className="bg-[#0a0f1d] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all"
              >
                <h3 className="text-sm font-bold text-foreground mb-2 flex items-start gap-2">
                  <span className="text-primary font-extrabold shrink-0">Q.</span>
                  <span>{item.question}</span>
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
