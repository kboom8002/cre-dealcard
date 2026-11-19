import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Building2,
  ArrowRight,
  TrendingUp,
  Users,
  Zap,
  ClipboardCheck,
  BookOpen,
  Clock,
} from "lucide-react";
import { HubHeroClient } from "@/components/hub/HubHeroClient";
import { HubCategoryGrid } from "@/components/hub/HubCategoryGrid";
import { HubBrokerShowcase } from "@/components/hub/HubBrokerShowcase";
import { serializeJsonLd, hubFeaturedBrokersItemList } from "@/lib/schema-org";
import {
  isDemoSeedDisabledForProd,
  resolvePublicDealWorkspaceGuard,
} from "@/lib/og/deal-public-guard";
import {
  evaluateDealCardPublicVisibility,
  PUBLIC_WORKSPACE_ITEM_STATUSES,
} from "@/domain/public-projection/visibility";
import { kstWeekStartIso } from "./hub-week";

export const metadata: Metadata = {
  title: "DealCard Hub | 상업용 부동산의 새로운 기준",
  description:
    "AI 기반 블라인드 딜카드로 상업용 부동산 매매·임대를 안전하고 빠르게. 검증된 공인중개사, 실시간 시세 리포트, 권역별 매물 탐색.",
  alternates: { canonical: "/hub" },
  openGraph: {
    title: "DealCard Hub — 상업용 부동산의 새로운 기준",
    description: "블라인드 딜카드 · AI 매칭 · 시세 리포트",
  },
};

export const revalidate = 1800; // 30분

interface HubCandidateDealRow {
  id: string;
  owner_id?: string | null;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  status?: string | null;
  created_at: string;
}

async function filterPublicHubDeals(
  supabase: ReturnType<typeof createServiceClient>,
  rows: HubCandidateDealRow[],
): Promise<HubCandidateDealRow[]> {
  const readyRows = rows.filter(
    (row) =>
      Boolean(row?.id) &&
      row.status === "public_signal_ready" &&
      !isDemoSeedDisabledForProd(String(row.id)),
  );
  if (readyRows.length === 0) return [];

  const candidateIds = readyRows.map((r) => String(r.id));
  const signalCardMap = new Map<
    string,
    { visibility?: string | null; status?: string | null }
  >();

  try {
    const scTable = supabase.from("building_signal_cards") as unknown as {
      select?: (cols: string) => {
        in?: (
          col: string,
          vals: string[],
        ) => PromiseLike<{ data?: Array<Record<string, unknown>> | null }>;
      };
    };
    const scQuery = scTable?.select?.("building_id, visibility, status");
    const scRes =
      typeof scQuery?.in === "function"
        ? await scQuery.in("building_id", candidateIds)
        : null;
    for (const sc of scRes?.data ?? []) {
      const bId = sc?.building_id ? String(sc.building_id) : "";
      if (bId && !signalCardMap.has(bId)) {
        signalCardMap.set(bId, {
          visibility: typeof sc.visibility === "string" ? sc.visibility : null,
          status: typeof sc.status === "string" ? sc.status : null,
        });
      }
    }
  } catch {
    // Non-blocking when signal cards lookup is unavailable in lightweight test mocks
  }

  const verified = await Promise.all(
    readyRows.map(async (row) => {
      const id = String(row.id);
      const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
      if (guard.blocked) return null;
      if (guard.item && !PUBLIC_WORKSPACE_ITEM_STATUSES.includes(guard.item.status)) {
        return null;
      }

      const sig = signalCardMap.get(id);
      const vis = evaluateDealCardPublicVisibility({
        buildingStatus: row.status ?? "public_signal_ready",
        signalCardVisibility: sig?.visibility ?? null,
        signalCardStatus: sig?.status ?? null,
        workspaceItemStatus: guard.item?.status ?? guard.workspaceItemStatus ?? null,
      });
      return vis.isPublic ? row : null;
    }),
  );

  return verified.filter((item): item is HubCandidateDealRow => item !== null);
}

async function fetchHubData() {
  try {
    const supabase = createServiceClient();

    // P2 (WP-7.3A): "이번 주" boundary = Monday 00:00 KST.
    const mondayISO = kstWeekStartIso();

    const buildFeaturedBrokersQuery = () => {
      let qBuilder = supabase
        .from("profiles")
        .select(`
          id,
          role,
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
            is_verified
          )
        `);
      if (typeof qBuilder.in === "function") {
        qBuilder = qBuilder.in("role", ["broker", "admin"]);
      } else {
        qBuilder = qBuilder.eq("role", "broker");
      }
      return qBuilder.eq("broker_profiles.is_public", true).limit(20);
    };

    const [
      { data: candidateDeals },
      { count: brokers },
      { data: latestPulse },
      { data: latestInsight },
      { data: featuredBrokers },
    ] = await Promise.all([
      supabase
        .from("building_ssot_lite")
        .select("id, owner_id, area_signal, asset_type, price_band, status, created_at")
        .eq("status", "public_signal_ready")
        .order("created_at", { ascending: false })
        .limit(200),
      // P2 (WP-7.3A): count only brokers that opted into a public profile.
      supabase
        .from("broker_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_public", true),
      supabase
        .from("cre_pulses")
        .select("region, pulse_score, trend, summary_ko, period_label")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("cre_oiticles")
        .select("id, title, excerpt, oiticle_type, slug, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1),
      buildFeaturedBrokersQuery(),
    ]);

    const visibleDeals = await filterPublicHubDeals(
      supabase,
      (candidateDeals ?? []) as HubCandidateDealRow[],
    );

    const verifiedBrokerDealCounts = new Map<string, number>();
    for (const deal of visibleDeals) {
      if (deal.owner_id) {
        const ownerKey = String(deal.owner_id);
        verifiedBrokerDealCounts.set(
          ownerKey,
          (verifiedBrokerDealCounts.get(ownerKey) ?? 0) + 1,
        );
      }
    }

    const deals = visibleDeals.length;
    const newThisWeek = visibleDeals.filter(
      (d) => typeof d.created_at === "string" && d.created_at >= mondayISO,
    ).length;
    const recentDeals: HubDealRow[] = visibleDeals.slice(0, 3).map((d) => ({
      id: d.id,
      area_signal: d.area_signal ?? null,
      asset_type: d.asset_type ?? null,
      price_band: d.price_band ?? null,
      status: d.status ?? "public_signal_ready",
      created_at: d.created_at,
    }));

    interface FeaturedBrokerProfileFields {
      slug?: string | null;
      specialty_regions?: string[] | null;
      specialty_assets?: string[] | null;
      bio?: string | null;
      vibe_vti?: string | null;
      vibe_trust?: number | null;
      vibe_valence?: number | null;
      is_public?: boolean | null;
      seo_summary?: string | null;
      is_verified?: boolean | null;
    }

    interface FeaturedBrokerRow {
      id: string;
      role?: string | null;
      display_name: string | null;
      company: string | null;
      photo_url: string | null;
      tagline: string | null;
      broker_profiles?: FeaturedBrokerProfileFields | FeaturedBrokerProfileFields[] | null;
    }

    const unwrapFeaturedBp = (row: FeaturedBrokerRow): FeaturedBrokerProfileFields => {
      if (Array.isArray(row.broker_profiles)) return row.broker_profiles[0] ?? {};
      return row.broker_profiles ?? {};
    };

    const sortedFeaturedBrokers = ((featuredBrokers ?? []) as FeaturedBrokerRow[])
      .filter((p) => {
        const bp = unwrapFeaturedBp(p);
        if (bp.is_public === false) return false;
        const r = p.role ?? "broker";
        return r === "broker" || r === "admin";
      })
      .sort((a, b) => {
        const aBp = unwrapFeaturedBp(a);
        const bBp = unwrapFeaturedBp(b);
        if (aBp.is_verified && !bBp.is_verified) return -1;
        if (!aBp.is_verified && bBp.is_verified) return 1;
        const aDeals = verifiedBrokerDealCounts.get(String(a.id)) ?? 0;
        const bDeals = verifiedBrokerDealCounts.get(String(b.id)) ?? 0;
        if (aDeals !== bDeals) return bDeals - aDeals;
        return String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""));
      })
      .slice(0, 3);

    const formattedBrokers = sortedFeaturedBrokers.map((p) => {
      const uid = String(p.id);
      const bp = unwrapFeaturedBp(p);
      const cleanSlug = typeof bp.slug === "string" ? bp.slug.trim() : "";
      return {
        id: uid,
        displayName: p.display_name || "공인중개사",
        company: p.company ?? null,
        photoUrl: p.photo_url ?? null,
        tagline: p.tagline ?? null,
        slug: cleanSlug || uid,
        specialtyRegions: bp.specialty_regions || [],
        specialtyAssets: bp.specialty_assets || [],
        bio: bp.bio ?? null,
        vibeVti: bp.vibe_vti ?? null,
        vibeTrust: bp.vibe_trust ?? null,
        vibeValence: bp.vibe_valence ?? null,
        totalDealCount: verifiedBrokerDealCounts.get(uid) ?? 0,
        isVerified: bp.is_verified ?? null,
        seoSummary: bp.seo_summary ?? null,
      };
    });

    return {
      deals,
      brokers: brokers ?? 0,
      newThisWeek,
      recentDeals,
      latestPulse: latestPulse ?? [],
      latestInsight: latestInsight?.[0] ?? null,
      featuredBrokers: formattedBrokers,
    };
  } catch (err) {
    console.error("Error fetching Hub data:", err);
    return { deals: 0, brokers: 0, newThisWeek: 0, recentDeals: [], latestPulse: [], latestInsight: null, featuredBrokers: [] };
  }
}


const QUICK_TOOLS = [
  {
    href: "/search?type=deal",
    icon: ClipboardCheck,
    label: "공개 딜카드 탐색",
    desc: "권역·용도별 블라인드 매물 검색",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    href: "/guide",
    icon: BookOpen,
    label: "이용 가이드",
    desc: "매각·매입 절차 및 중개보수 안내",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
] as const;

interface HubDealRow {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  status?: string | null;
  created_at: string;
}

export default async function HubPage() {
  const data = await fetchHubData();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      {/* ── Hero ── */}
      <HubHeroClient deals={data.deals} brokers={data.brokers} />

      {/* ── Quick Stats Bar ── */}
      <section className="max-w-2xl mx-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Building2, label: "딜카드", value: data.deals, color: "text-blue-700" },
            { icon: Users, label: "공인중개사", value: data.brokers, color: "text-emerald-700" },
            { icon: TrendingUp, label: "이번 주 신규", value: data.newThisWeek, color: "text-amber-800" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} strokeWidth={2} />
              <p className="text-base font-bold tabular-nums text-slate-900 leading-none">{value}</p>
              <p className="text-sm text-slate-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 빠른 도구 (Quick Tools) ── */}
      <section className="max-w-2xl mx-auto px-4 pb-5">
        <p className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-2.5">
          빠른 도구
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={`${tool.href}-${tool.label}`}
                href={tool.href}
                className={`flex flex-col items-center gap-2 rounded-2xl border ${tool.border} ${tool.bg} p-4 min-h-[88px] text-center hover:scale-[1.02] transition-all active:scale-[0.97]`}
              >
                <div className={`w-9 h-9 rounded-xl ${tool.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${tool.color}`} strokeWidth={2} />
                </div>
                <p className={`text-sm font-bold ${tool.color}`}>{tool.label}</p>
                <p className="text-sm text-slate-600">{tool.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* DORMANT: 시장 펄스 미니 위젯 — pulse 전체 휴면 */}

      {/* ── 최신 딜카드 캐러셀 ── */}
      {data.recentDeals.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-5">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">
              최신 딜카드
            </p>
            <Link
              href="/search?type=deal"
              className="text-sm text-blue-700 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px]"
            >
              전체 탐색 <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {(data.recentDeals as HubDealRow[]).map((deal) => (
              <Link
                key={deal.id}
                href={`/dc/${encodeURIComponent(deal.id)}`}
                className="shrink-0 w-48 bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-400 transition-all"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-700" strokeWidth={2} />
                  <span className="text-sm font-bold text-blue-700">{deal.area_signal}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 line-clamp-1">
                  {deal.asset_type || "상업용 건물"}
                </p>
                <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">
                  {deal.price_band || "가격 협의"}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span className="text-sm text-slate-600">
                    {new Date(deal.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Schema.org Broker ItemList ── */}
      {data.featuredBrokers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(
              hubFeaturedBrokersItemList(
                data.featuredBrokers.map((b) => ({
                  id: b.id,
                  slug: b.slug,
                  display_name: b.displayName,
                  company: b.company,
                  specialty_regions: b.specialtyRegions,
                  bio: b.seoSummary || b.bio,
                }))
              )
            ),
          }}
        />
      )}

      {/* ── 전문 공인중개사 쇼케이스 (NEW) ── */}
      <HubBrokerShowcase brokers={data.featuredBrokers} />

      {/* ── 모바일 IM 안내 및 공개 매물 ── */}
      <section className="max-w-2xl mx-auto px-4 pb-5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
            📄 AI 모바일 투자설명서(IM)
          </p>
          <span className="text-sm text-blue-700 font-semibold px-2.5 py-0.5 bg-blue-50 rounded-full border border-blue-200">
            공인중개사 워크스페이스
          </span>
        </div>
        <p className="text-sm text-slate-600 mb-3 leading-relaxed">
          공인중개사가 매물 메모와 렌트롤을 입력하면 공적장부 검증을 거친 모바일·PPTX 투자설명서를 빠르게 생성할 수 있습니다.
        </p>
        {data.recentDeals.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {(data.recentDeals as HubDealRow[]).map((deal) => (
              <Link
                key={`im-preview-${deal.id}`}
                href={`/dc/${encodeURIComponent(deal.id)}`}
                className="shrink-0 w-56 bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-4 transition-all"
              >
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-bold bg-blue-50 text-blue-700 mb-2">
                  📄 공개 매물 카드
                </div>
                <p className="text-sm font-bold text-blue-700 mb-0.5 line-clamp-1">
                  {deal.price_band || "가격 협의"}
                </p>
                <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug mb-1.5">
                  {deal.area_signal || "권역 비공개"}
                </p>
                <p className="text-sm text-slate-600 line-clamp-1">
                  {deal.asset_type || "상업용 빌딩"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              현재 공개 열람 가능한 매물이 없습니다.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              공인중개사 계정으로 로그인하면 블라인드 딜카드와 10섹션 모바일·PPTX IM을 직접 제작하고 전용 공유 링크를 발급할 수 있습니다.
            </p>
          </div>
        )}
      </section>

      {/* DORMANT: 오늘의 인사이트 — insight 전체 휴면 */}

      {/* ── Categories ── */}
      <section className="max-w-2xl mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">
            탐색하기
          </p>
          <Link
            href="/search?type=deal"
            className="text-sm text-blue-700 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px]"
          >
            전체 보기
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <HubCategoryGrid />
      </section>

      {/* ── Broker CTA ── */}
      <section className="max-w-2xl mx-auto px-4 pb-8">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-800" strokeWidth={2.5} />
                <span className="text-sm font-semibold text-amber-800 uppercase tracking-wide">
                  공인중개사 전용
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 leading-snug mb-1">
                DealCard로<br />전문성을 증명하세요
              </h2>
              <p className="text-sm text-slate-600">
                AI 매칭 · 딜카드 생성 · 파이프라인 관리
              </p>
            </div>
            <Link
              href="/login"
              id="hub-cta-broker-login"
              className="shrink-0 flex items-center gap-1.5 min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl px-4 py-2.5 text-sm shadow-xs transition-all active:scale-95 whitespace-nowrap"
            >
              공인중개사 시작하기
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
