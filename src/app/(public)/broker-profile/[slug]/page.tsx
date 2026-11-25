import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { serializeJsonLd, realEstateAgent, breadcrumb } from "@/lib/schema-org";
import {
  isDemoSeedDisabledForProd,
  resolvePublicDealWorkspaceGuard,
} from "@/lib/og/deal-public-guard";
import {
  evaluateDealCardPublicVisibility,
  PUBLIC_WORKSPACE_ITEM_STATUSES,
} from "@/domain/public-projection/visibility";
import { loadPublicBrokerProfile } from "./load-broker-profile";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { PhoneActionButton } from "@/components/common/PhoneActionButton";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface BrokerPublicDealRow {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  status?: string | null;
  created_at?: string | null;
}

async function getBrokerPublicDeals(
  supabase: ReturnType<typeof createServiceClient>,
  ownerId: string,
): Promise<{
  deals: BrokerPublicDealRow[];
  dealCount: number;
  regions: string[];
}> {
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .eq("owner_id", ownerId)
    .eq("status", "public_signal_ready")
    .order("created_at", { ascending: false })
    .limit(100);

  const readyRows = ((buildings ?? []) as BrokerPublicDealRow[]).filter(
    (row) =>
      Boolean(row?.id) &&
      row.status === "public_signal_ready" &&
      !isDemoSeedDisabledForProd(String(row.id)),
  );

  if (readyRows.length === 0) {
    return { deals: [], dealCount: 0, regions: [] };
  }

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

  const visibleDeals = verified.filter(
    (item): item is BrokerPublicDealRow => item !== null,
  );
  const regions = [
    ...new Set(
      visibleDeals
        .map((d) => (typeof d.area_signal === "string" ? d.area_signal : ""))
        .filter(Boolean),
    ),
  ];

  return {
    deals: visibleDeals.slice(0, 6),
    dealCount: visibleDeals.length,
    regions,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const broker = await loadPublicBrokerProfile(slug);
  if (!broker) {
    return {
      title: "공인중개사 프로필",
      robots: { index: false, follow: false },
    };
  }
  const name = broker.displayName || "공인중개사";
  const verifiedSuffix = broker.isVerified ? " 크리딜 검증 프로필." : "";
  const pageTitle = `${name} | 상업용 부동산 전문 공인중개사`;
  const pageDesc = `${name} 공인중개사의 전문 권역, 실적, 블라인드 매물을 확인하세요.${verifiedSuffix}`;
  const ogImageUrl = `${getCanonicalSiteUrl()}/api/og/broker/${encodeURIComponent(slug)}`;
  return {
    title: pageTitle,
    description: pageDesc,
    alternates: { canonical: broker.canonicalPath },
    openGraph: {
      title: `${name} — 상업용 부동산 전문 공인중개사`,
      description: pageDesc,
      url: broker.canonicalPath,
      siteName: "크리딜 (CREDEAL)",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${name} 공인중개사 프로필`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — 상업용 부동산 전문 공인중개사`,
      description: pageDesc,
      images: [ogImageUrl],
    },
  };
}

export const revalidate = 3600;

export default async function BrokerProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const broker = await loadPublicBrokerProfile(slug);
  if (!broker) return notFound();

  const supabase = createServiceClient();
  const profile = { id: broker.profileId, display_name: broker.displayName };

  const { deals, dealCount, regions } = await getBrokerPublicDeals(
    supabase,
    profile.id,
  );
  const effectiveRegions =
    broker.specialtyRegions.length > 0
      ? Array.from(new Set([...broker.specialtyRegions, ...regions]))
      : regions;
  const dealAssetTypes = Array.from(
    new Set(
      deals
        .map((d) => (typeof d.asset_type === "string" ? d.asset_type.trim() : ""))
        .filter(Boolean),
    ),
  );
  const effectiveAssets =
    broker.specialtyAssets.length > 0
      ? broker.specialtyAssets
      : dealAssetTypes;
  const canonicalSlug = (broker.slug && broker.slug.trim()) || slug;
  let contactPhone: string | null =
    typeof (broker as { phone?: unknown }).phone === "string" &&
    (broker as { phone?: string }).phone!.trim()
      ? (broker as { phone?: string }).phone!.trim()
      : null;
  if (!contactPhone) {
    try {
      const { data: phoneRow } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", profile.id)
        .limit(1)
        .maybeSingle();
      const rawPhone = (phoneRow as { phone?: unknown } | null)?.phone;
      if (typeof rawPhone === "string" && rawPhone.trim()) {
        contactPhone = rawPhone.trim();
      }
    } catch {
      // non-blocking when lightweight test mocks omit phone lookup
    }
  }

  const schemaData = realEstateAgent({
    id: profile.id,
    slug: canonicalSlug,
    display_name: profile.display_name,
    company: broker.company,
    phone: contactPhone,
    specialty_regions: effectiveRegions,
    bio: broker.bio,
  });

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "공인중개사 프로필", item: broker.canonicalPath },
  ];
  const breadcrumbSchema = breadcrumb(breadcrumbSteps);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schemaData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbSchema).replace(/</g, "\\u003c"),
        }}
      />

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link
            href="/hub"
            className="inline-flex min-h-[48px] items-center px-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Hub
          </Link>
          {broker.isVerified ? (
            <span
              data-testid="broker-profile-verified-badge"
              className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-semibold"
            >
              Verified Broker
            </span>
          ) : null}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm space-y-4">
          {broker.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={broker.photoUrl}
              alt={profile.display_name || "공인중개사"}
              className="w-16 h-16 rounded-full object-cover border border-slate-200 mx-auto"
            />
          ) : (
            <div className="w-16 h-16 bg-blue-50 border border-blue-200 text-blue-700 rounded-full flex items-center justify-center text-2xl font-bold mx-auto">
              {(profile.display_name || "B").charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{profile.display_name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {broker.company || "상업용 부동산 전문 공인중개사"}
            </p>
            {broker.tagline && (
              <p className="text-sm font-medium text-blue-800 mt-1.5">{broker.tagline}</p>
            )}
          </div>
          {broker.bio && (
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3 text-left">
              {broker.bio}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {effectiveRegions.length > 0 && (
              <span className="bg-slate-100 border border-slate-200 text-slate-800 rounded-full px-3 py-1">
                📍 {effectiveRegions.join(", ")}
              </span>
            )}
            {effectiveAssets.length > 0 && (
              <span className="bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-3 py-1">
                🏢 {effectiveAssets.join(", ")}
              </span>
            )}
            <span className="bg-slate-100 border border-slate-200 text-slate-800 rounded-full px-3 py-1">
              📋 {dealCount}건
            </span>
          </div>
        </div>

        {/* Stats Grid (distinct stat labels) */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "공개 딜카드", value: `${dealCount}건`, icon: "📋" },
            { label: "전문 권역", value: `${effectiveRegions.length}개`, icon: "📍" },
            {
              label: "주력 자산군",
              value: effectiveAssets.length > 0 ? `${effectiveAssets.length}종` : "상업용",
              icon: "🏢",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-xs"
            >
              <span className="text-lg">{s.icon}</span>
              <p className="text-base font-bold text-slate-900 mt-1">{s.value}</p>
              <p className="text-sm text-slate-600">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Deals */}
        {deals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              최근 블라인드 딜카드
            </h2>
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/dc/${encodeURIComponent(d.id)}`}
                className="block min-h-[48px] bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-4 shadow-xs transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-semibold shrink-0">
                      {d.asset_type || "빌딩"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {d.area_signal} {d.asset_type}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-slate-600 shrink-0">
                    {d.price_band || "비공개"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center shadow-sm space-y-3">
          <p className="text-sm text-slate-700">이 공인중개사에게 문의하시겠습니까?</p>
          {contactPhone && (
            <PhoneActionButton
              phone={contactPhone}
              variant="inline"
              callLabel="📞 전화 문의"
              copyLabel="번호 복사"
              cardTestId="broker-profile-phone-cta"
              callTestId="broker-profile-call-btn"
              copyTestId="broker-profile-copy-phone-btn"
            />
          )}
          <Link
            href={`/expert-note/request?broker=${encodeURIComponent(canonicalSlug)}`}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors active:scale-[0.98]"
            id="cta-contact-broker"
          >
            💬 의뢰하기
          </Link>
        </div>
      </div>
    </main>
  );
}
