import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { evaluateDealCardPublicVisibility } from "@/domain/public-projection/visibility";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { isUuid } from "@/lib/im-lite/quick-generate-store";
import { isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";
import {
  allowDealPublicMemoryFallback,
  extractSnapshotCard4,
  resolvePublicDealWorkspaceGuard,
} from "@/lib/og/deal-public-guard";

const REGION_MAP: Record<string, string> = {
  gbd: "GBD (강남권역)",
  ybd: "YBD (여의도권역)",
  cbd: "CBD (종로/을지로)",
  seongsu: "성수",
  pangyo: "판교",
  mapo: "마포/홍대",
  jongno: "종로",
  hongdae: "홍대",
  all: "전체",
};

interface PageProps {
  params: Promise<{ region: string; id: string }>;
}

interface LegacyBuildingRecord {
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  status?: string | null;
}

interface SignalCardVisibilityRow {
  visibility?: string | null;
  status?: string | null;
}

const loadGuardedLegacyDeal = cache(async (id: string) => {
  if (!isUuid(id)) return null;

  if (allowDealPublicMemoryFallback() && isBuildingShareLinkRevoked(id)) {
    return null;
  }

  const supabase = createServiceClient();
  const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
  if (guard.blocked) return null;

  if (guard.projection?.snapshot) {
    const visibility = evaluateDealCardPublicVisibility({
      buildingStatus: "public_signal_ready",
      workspaceItemStatus: guard.workspaceItemStatus,
    });
    if (!visibility.isPublic) return null;

    const card4 = extractSnapshotCard4(guard.projection);
    return {
      areaSignal: typeof card4?.region === "string" ? card4.region : null,
      assetType: typeof card4?.use === "string" ? card4.use : null,
      priceBand: typeof card4?.priceBand === "string" ? card4.priceBand : null,
    };
  }

  const readRes = await readBuilding(id);
  const rawRecord =
    readRes && typeof readRes === "object" && "data" in readRes
      ? (readRes as { data?: LegacyBuildingRecord | null }).data ?? null
      : (readRes as LegacyBuildingRecord | null);

  if (!rawRecord) return null;

  const { data: signalCard } = await supabase
    .from("building_signal_cards")
    .select("visibility, status")
    .eq("building_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const signalRow = (signalCard as SignalCardVisibilityRow | null) ?? null;
  const visibility = evaluateDealCardPublicVisibility({
    buildingStatus: rawRecord.status ?? null,
    signalCardVisibility: signalRow?.visibility ?? null,
    signalCardStatus: signalRow?.status ?? null,
    workspaceItemStatus: guard.workspaceItemStatus,
  });

  if (!visibility.isPublic || rawRecord.status !== "public_signal_ready") {
    return null;
  }

  return {
    areaSignal: rawRecord.area_signal ?? null,
    assetType: rawRecord.asset_type ?? null,
    priceBand: rawRecord.price_band ?? null,
  };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { region, id } = await params;
  const deal = await loadGuardedLegacyDeal(id);

  if (!deal) {
    return { title: "매물 안내", robots: { index: false, follow: false } };
  }

  const canonicalPath = `/dc/${encodeURIComponent(id)}`;
  const siteUrl = getCanonicalSiteUrl();
  const label = deal.areaSignal || REGION_MAP[region] || region;
  const asset = deal.assetType || "상업용 부동산";
  const price = deal.priceBand || "";
  const ogTitle = `${label} ${asset} 매각${price ? ` — ${price}` : ""}`;
  const ogDesc = `블라인드 딜카드로 안전한 매물 검토. ${price || "가격 비공개"}`;
  const ogImageUrl = `${siteUrl}/api/og/deal/${encodeURIComponent(id)}/kakao-v2`;

  return {
    title: `${label} ${asset} 매각${price ? ` | ${price}` : ""}`,
    description: `${label} 권역 ${asset} 블라인드 매각 매물. 크리딜의 Gate 시스템으로 안전하게 검토하세요.`,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      url: canonicalPath,
      siteName: "크리딜 (CREDEAL)",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDesc,
      images: [ogImageUrl],
    },
  };
}

export const revalidate = 3600;

export default async function DealDetailPage({ params }: PageProps) {
  const { id } = await params;
  const deal = await loadGuardedLegacyDeal(id);
  if (!deal) return notFound();

  permanentRedirect(`/dc/${encodeURIComponent(id)}`);
}
