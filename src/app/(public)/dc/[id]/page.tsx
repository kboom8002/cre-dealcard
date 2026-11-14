import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { QaFeedbackPinWidget } from '@/components/workspace/QaFeedbackPinWidget';
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from '@/domain/building/im-core/read-building';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import { evaluateDealCardPublicVisibility } from '@/domain/public-projection/visibility';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import { getServerViewer } from '@/lib/server-viewer';
import {
  getInboxState,
  getQuickImRecord,
  isDealCardDeleted,
  isUuid,
  resolveOrSynthesizeQuickImRecord,
  updateQuickImCard4,
  type StoredQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import { isBuildingShareLinkRevoked } from '@/lib/security/share-link-tokens';

// v3 Goldilocks components
import { TeaserHeroHeader } from '@/components/teaser/TeaserHeroHeader';
import { PostureWidget } from '@/components/teaser/PostureWidget';
import { PublicPolicyBlock } from '@/components/teaser/PublicPolicyBlock';
import { CTALadder } from '@/components/teaser/CTALadder';
import { TrustLine } from '@/components/teaser/TrustLine';
import { PoweredByBadge } from '@/components/ui/PoweredByBadge';

import { m2ToPyeong } from '@/domain/building/im-core/facts/area';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { DealCardLineText } from '@/components/broker/deal-card/DealCardLineText';

interface PageProps { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

function buildDealCardDataFromQuickRecord(quickRec: StoredQuickImRecord) {
  return {
    building: {
      id: quickRec.buildingId,
      address: quickRec.address,
      building_name: quickRec.buildingName,
      area_signal: quickRec.card4.region,
      asset_type: quickRec.card4.use,
      main_usage: quickRec.card4.use,
      price_band: quickRec.card4.priceBand,
      asking_price_krw: (quickRec.askingPriceManwon || 0) * 10_000,
      gross_floor_area_sqm: quickRec.specs?.gfaSqm,
      land_area_sqm: quickRec.specs?.landAreaSqm,
      total_floor_area_pyung: quickRec.specs?.gfaSqm ? Math.round(m2ToPyeong(quickRec.specs.gfaSqm)) : undefined,
      land_area_pyung: quickRec.specs?.landAreaSqm ? Math.round(m2ToPyeong(quickRec.specs.landAreaSqm)) : undefined,
      zoning: quickRec.specs?.zoning,
    } as Record<string, any>,
    signalCard: {
      id: quickRec.buildingId,
      title: `${quickRec.card4.region} ${quickRec.card4.use} ${quickRec.card4.priceBand}`.trim(),
      area_signal: quickRec.card4.region,
      asset_type: quickRec.card4.use,
      price_band: quickRec.card4.priceBand,
      deal_points: quickRec.card4.points,
      body: { shortSummary: quickRec.card4.points.join(" · ") },
      status: "published",
      visibility: "public",
    },
    teaserDoc: {
      body: {
        card4: quickRec.card4,
        kakaoOgTitle: quickRec.card4.headline || undefined,
        title: quickRec.card4.headline || `${quickRec.card4.region} ${quickRec.card4.use}`,
        dealPoints: quickRec.card4.points,
        price_band: quickRec.card4.priceBand,
        region_display: quickRec.card4.region,
        key_points: quickRec.card4.points,
      },
    },
    brokerProfile: (quickRec.brokerProfile || quickRec.basicImDoc?.facts?.brokerOffice
      ? {
          display_name:
            quickRec.brokerProfile?.displayName ||
            quickRec.basicImDoc?.facts?.brokerOffice?.representative ||
            "담당 중개사",
          phone:
            quickRec.brokerProfile?.phone ||
            (quickRec.basicImDoc?.facts?.brokerOffice?.phone !== "-"
              ? quickRec.basicImDoc?.facts?.brokerOffice?.phone
              : null),
          specialty:
            quickRec.brokerProfile?.company ||
            quickRec.basicImDoc?.facts?.brokerOffice?.name ||
            "검증 공인중개사",
          avatar_url: quickRec.brokerProfile?.photoUrl || null,
          is_licensed: Boolean(quickRec.brokerProfile?.registrationNo),
          response_guarantee_hours: null,
          closed_deals: null,
          slug: quickRec.brokerProfile?.slug || null,
        }
      : null) as Record<string, any> | null,
    hasImDoc: true,
    isPptxApproved: true,
    pptxDownloadUrl: `/api/public/im-lite/${quickRec.buildingId}/pptx`,
    ownerId: quickRec.ownerId ?? null,
    buildingStatus: "public_signal_ready" as string | null,
  };
}

// ── 데이터 조회 ──
// P0-SEC: React cache() — generateMetadata 와 page 가 같은 요청에서 한 번만 조회한다
// (readWithMigration 의 lazy-write 부수효과 중복 방지).
const getDealCardData = cache(async (id: string) => {
  const emptyData = {
    building: {} as Record<string, any>,
    signalCard: null as any,
    teaserDoc: null as any,
    brokerProfile: null as Record<string, any> | null,
    hasImDoc: false,
    isPptxApproved: false,
    pptxDownloadUrl: `/api/public/im-lite/${id}/pptx`,
    ownerId: null as string | null,
    buildingStatus: "archived" as string | null,
  };

  if (
    isDealCardDeleted(id) ||
    Boolean(getInboxState().revokedBuildings[id]?.revoked) ||
    isBuildingShareLinkRevoked(id)
  ) {
    return { ...emptyData, buildingStatus: "archived" };
  }

  const quickRec = getQuickImRecord(id);
  if (quickRec?.isRevoked) {
    return { ...emptyData, buildingStatus: "archived" };
  }
  if (quickRec && quickRec.ownerId) {
    return buildDealCardDataFromQuickRecord(quickRec);
  }

  const supabase = createServiceClient();

  if (!isUuid(id)) {
    try {
      let actQuery: any = supabase
        .from("activity_events")
        .select("actor_id, entity_id, event_type, metadata, created_at");
      if (typeof actQuery.in === "function") {
        actQuery = actQuery.in("event_type", [
          "dealcard_upserted",
          "dealcard_sent",
          "dealcard_restored",
          "dealcard_deleted",
          "link_revoked",
          "link_restored",
        ]);
      }
      if (typeof actQuery.contains === "function") {
        actQuery = actQuery.contains("metadata", { building_id: id });
      }
      if (typeof actQuery.order === "function") {
        actQuery = actQuery.order("created_at", { ascending: false });
      }
      if (typeof actQuery.limit === "function") {
        actQuery = actQuery.limit(50);
      }
      const { data: acts } = await actQuery;
      const matchingActs = (acts || []).filter(
        (a: any) => String(a?.metadata?.building_id || a?.entity_id || "").trim() === id
      );
      const latestLifecycle = matchingActs.find((a: any) =>
        ["dealcard_upserted", "dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(a?.event_type)
      );
      const latestRevoke = matchingActs.find((a: any) =>
        ["link_revoked", "link_restored"].includes(a?.event_type)
      );
      if (
        latestLifecycle?.event_type === "dealcard_deleted" ||
        latestRevoke?.event_type === "link_revoked"
      ) {
        return { ...emptyData, buildingStatus: "archived" };
      }

      const matched = matchingActs.find(
        (a: any) =>
          (a?.event_type === "dealcard_upserted" ||
            a?.event_type === "dealcard_sent" ||
            a?.event_type === "dealcard_restored") &&
          a?.metadata?.card4
      );
      if (matched) {
        const hydrated = updateQuickImCard4(id, matched.metadata.card4, {
          ownerId: matched.actor_id,
          brokerProfile: matched.metadata.broker_profile,
        });
        if (hydrated) {
          return buildDealCardDataFromQuickRecord(hydrated);
        }
      }

      const synthesizedNonUuid = await resolveOrSynthesizeQuickImRecord(id, supabase);
      if (synthesizedNonUuid) {
        if (matched?.metadata?.card4) {
          const updated = updateQuickImCard4(id, matched.metadata.card4, {
            ownerId: matched.actor_id,
            brokerProfile: matched.metadata.broker_profile,
          });
          if (updated) {
            return buildDealCardDataFromQuickRecord(updated);
          }
        }
        return buildDealCardDataFromQuickRecord(synthesizedNonUuid);
      }
    } catch {
      // ignore if activity_events unavailable
    }

    if (quickRec) {
      return buildDealCardDataFromQuickRecord(quickRec);
    }

    return { ...emptyData, buildingStatus: "archived" };
  }

  let targetBuildingId = id;
  let [buildingRes, ssotMetaRes, signalCardRes, teaserDocRes, imDocRes] = await Promise.all([
    readBuilding(targetBuildingId, { client: supabase }),
    // P0-SEC: owner_id / status 는 SSoT 원천(building_ssot_lite)에서 직접 조회 (assets 에는 없음)
    supabase
      .from("building_ssot_lite")
      .select("owner_id, status")
      .eq("id", targetBuildingId)
      .maybeSingle(),
    supabase
      .from("building_signal_cards")
      .select("id, title, area_signal, asset_type, price_band, deal_points, body, status, visibility")
      .eq("building_id", targetBuildingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("document_objects")
      .select("body")
      .eq("building_id", targetBuildingId)
      .eq("document_type", "blind_teaser")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // IM 문서 존재 여부 및 공식 승인 상태 확인 (im_lite, im_lite_draft, mobile_im)
    supabase
      .from("document_objects")
      .select("id, status, approval_stage, pptx_file_hash, pptx_download_url")
      .eq("building_id", targetBuildingId)
      .in("document_type", ["im_lite", "im_lite_draft", "mobile_im"])
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // If id is a document_objects.id rather than a building_ssot_lite.id, resolve its building_id
  if (!ssotMetaRes.data && !buildingRes) {
    const { data: docLookup } = await supabase
      .from("document_objects")
      .select("building_id")
      .eq("id", id)
      .maybeSingle();

    if (docLookup?.building_id && isUuid(docLookup.building_id)) {
      targetBuildingId = docLookup.building_id;
      [buildingRes, ssotMetaRes, signalCardRes, teaserDocRes, imDocRes] = await Promise.all([
        readBuilding(targetBuildingId, { client: supabase }),
        supabase
          .from("building_ssot_lite")
          .select("owner_id, status")
          .eq("id", targetBuildingId)
          .maybeSingle(),
        supabase
          .from("building_signal_cards")
          .select("id, title, area_signal, asset_type, price_band, deal_points, body, status, visibility")
          .eq("building_id", targetBuildingId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("document_objects")
          .select("body")
          .eq("building_id", targetBuildingId)
          .eq("document_type", "blind_teaser")
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("document_objects")
          .select("id, status, approval_stage, pptx_file_hash, pptx_download_url")
          .eq("building_id", targetBuildingId)
          .in("document_type", ["im_lite", "im_lite_draft", "mobile_im"])
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    } else if (quickRec) {
      return buildDealCardDataFromQuickRecord(quickRec);
    } else {
      const synthesized = await resolveOrSynthesizeQuickImRecord(id, supabase);
      if (synthesized) {
        return buildDealCardDataFromQuickRecord(synthesized);
      }
      try {
        let actQuery: any = supabase
          .from("activity_events")
          .select("actor_id, entity_id, event_type, metadata, created_at");
        if (typeof actQuery.in === "function") {
          actQuery = actQuery.in("event_type", [
            "dealcard_upserted",
            "dealcard_sent",
            "dealcard_restored",
            "dealcard_deleted",
            "link_revoked",
            "link_restored",
          ]);
        }
        if (typeof actQuery.contains === "function") {
          actQuery = actQuery.contains("metadata", { building_id: id });
        }
        if (typeof actQuery.order === "function") {
          actQuery = actQuery.order("created_at", { ascending: false });
        }
        if (typeof actQuery.limit === "function") {
          actQuery = actQuery.limit(50);
        }
        const { data: acts } = await actQuery;
        const matchingActs = (acts || []).filter(
          (a: any) => String(a?.metadata?.building_id || a?.entity_id || "").trim() === id
        );
        const latestLifecycle = matchingActs.find((a: any) =>
          ["dealcard_upserted", "dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(a?.event_type)
        );
        const latestRevoke = matchingActs.find((a: any) =>
          ["link_revoked", "link_restored"].includes(a?.event_type)
        );
        if (
          latestLifecycle?.event_type === "dealcard_deleted" ||
          latestRevoke?.event_type === "link_revoked"
        ) {
          return { ...emptyData, buildingStatus: "archived" };
        }
        const matched = matchingActs.find(
          (a: any) =>
            (a?.event_type === "dealcard_upserted" ||
              a?.event_type === "dealcard_sent" ||
              a?.event_type === "dealcard_restored") &&
            a?.metadata?.card4
        );
        if (matched) {
          const hydrated = updateQuickImCard4(id, matched.metadata.card4, {
            ownerId: matched.actor_id,
            brokerProfile: matched.metadata.broker_profile,
          });
          if (hydrated) {
            return buildDealCardDataFromQuickRecord(hydrated);
          }
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }
  }

  const ownerId: string | null = ssotMetaRes.data?.owner_id ?? null;
  const isTeaserRevoked = Boolean(
    (teaserDocRes.data?.body as Record<string, any> | undefined)?.is_revoked === true
  );
  const buildingStatus: string | null = isTeaserRevoked
    ? "archived"
    : (ssotMetaRes.data?.status ?? null);

  let brokerProfile: Record<string, any> | null = null;
  if (ownerId) {
    const [{ data: bProfile }, { data: baseProfile }] = await Promise.all([
      supabase
        .from("broker_profiles")
        .select("*")
        .eq("user_id", ownerId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name, phone, company, tagline, photo_url, role")
        .eq("id", ownerId)
        .maybeSingle(),
    ]);

    const avatarUrl =
      (bProfile as any)?.avatar_url ||
      baseProfile?.photo_url ||
      (baseProfile as any)?.avatar_url ||
      null;
    const displayName =
      baseProfile?.display_name || (bProfile as any)?.name || (bProfile as any)?.display_name || "담당 중개사";
    const phone = baseProfile?.phone || (bProfile as any)?.phone || null;
    const specialty =
      baseProfile?.company ||
      (bProfile as any)?.specialty ||
      ((baseProfile as any)?.tagline ? (baseProfile as any).tagline : "검증 공인중개사");

    brokerProfile = {
      display_name: displayName,
      phone,
      specialty,
      avatar_url: avatarUrl,
      is_licensed: Boolean((bProfile as any)?.license_number || (bProfile as any)?.office_reg_number),
      response_guarantee_hours:
        (bProfile as any)?.response_time_hours ?? (bProfile as any)?.response_guarantee_hours ?? null,
      closed_deals:
        (bProfile as any)?.total_deal_count_self ?? (bProfile as any)?.closed_deals ?? null,
      slug: (bProfile as any)?.slug ?? null,
    };
  }

  const isPptxApproved =
    imDocRes.data?.approval_stage === 'S70_FILE_APPROVAL' ||
    (imDocRes.data?.status === 'published' && !!imDocRes.data?.pptx_file_hash);
  const pptxDownloadUrl = imDocRes.data?.pptx_download_url || `/api/public/im-lite/${id}/pptx`;

  return {
    building: (buildingRes?.data ?? buildingRes ?? {}) as Record<string, any>,
    signalCard: signalCardRes.data,
    teaserDoc: teaserDocRes.data,
    brokerProfile,
    hasImDoc: !!imDocRes.data,
    isPptxApproved,
    pptxDownloadUrl,
    ownerId,
    buildingStatus,
  };
});

type DealCardData = Awaited<ReturnType<typeof getDealCardData>>;

function PostureMeta(_props: { input: DealCardData extends never ? never : unknown }) {
  return null;
}

/** Server-only → public DTO. Only this crosses into JSX / client components. */
function projectPublic(id: string, data: DealCardData) {
  return toPublicDealCard({
    id,
    building: data.building,
    signalCard: data.signalCard,
    teaserDoc: data.teaserDoc,
    brokerProfile: data.brokerProfile,
    hasImDoc: data.hasImDoc,
    isPptxApproved: data.isPptxApproved,
    pptxDownloadUrl: data.pptxDownloadUrl,
  });
}

function isPublicDealCard(data: DealCardData): boolean {
  return evaluateDealCardPublicVisibility({
    buildingStatus: data.buildingStatus,
    signalCardVisibility: data.signalCard?.visibility,
    signalCardStatus: data.signalCard?.status,
  }).isPublic;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getDealCardData(id);

  // P0-SEC: 비공개(archived / internal_only) 딜카드는 크롤러에 어떤 내용도 노출하지 않는다.
  if (!isPublicDealCard(data)) {
    return { title: "크리딜 DealCard", robots: { index: false, follow: false } };
  }

  const { og } = projectPublic(id, data);
  const ogTitle = og.title;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net';
  const card4Hash = (data.teaserDoc?.body as Record<string, any> | undefined)?.card4?.card4_hash;
  const absoluteOgImage = `${siteUrl}/api/og/deal/${id}/kakao-v2${card4Hash ? `?v=${encodeURIComponent(card4Hash)}` : ''}`;

  return {
    title: `${ogTitle} | 크리딜 DealCard`,
    openGraph: {
      title: ogTitle,
      type: "article",
      images: [
        {
          url: absoluteOgImage,
          width: 800,
          height: 400,
          alt: ogTitle,
        }
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      images: [absoluteOgImage],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : {};
  const isPreviewMode = sParams.preview === "1" || sParams.preview === "true";
  const data = await getDealCardData(id);

  // P0-SEC: 비공개 상태(building archived / signal card internal_only·archived)는 공개 404.
  // 소유 중개사(또는 admin)는 인증 쿠키로 확인되어 계속 볼 수 있다
  // (LiveDealCardPreviewCard 의 same-origin iframe `/dc/{id}?preview=1` 포함).
  if (!isPublicDealCard(data)) {
    const viewer = await getServerViewer();
    if (!isOwnerOrAdmin(viewer, data.ownerId)) notFound();
  }

  const card = projectPublic(id, data);
  const { hero, broker, cta, og } = card;
  const useDisplay = card.postureWidget.assetType || "상업용 매물";
  const areaDisplay = hero.bandedArea || "—";

  // 데이터 최소성 검사
  if (!card.hasMinimalData && !isPreviewMode) {
    return (
      <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] flex items-center justify-center p-4">
        <div className="max-w-[392px] w-full bg-[#141A21] border border-[#252E39] rounded-2xl p-6 text-center space-y-4">
          <h1 className="text-lg font-bold text-white">매물 안내 준비 중</h1>
          <p className="text-base text-slate-300 break-keep">
            담당 중개사가 매물 정보를 정리하고 있습니다. 잠시 후 다시 확인해 주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] pb-12">
      <TeaserEventTracker teaserConfigId={card.teaserConfigId} />
      <PostureMeta input={card.postureWidget} />

      <div className="max-w-[420px] mx-auto px-4 pt-5 space-y-4">
        {/* 상단 4항목 요약 (지역 · 용도 · 면적 · 가격) + 한 줄 제목 */}
        <section
          data-testid="public-dealcard-4fact-header"
          className="rounded-2xl bg-[#141A21] border border-slate-800 p-4 space-y-3 shadow-md"
        >
          <div className="grid grid-cols-2 gap-2 text-center text-base font-extrabold">
            <div className="py-2.5 px-3 rounded-xl bg-slate-800/90 text-white break-keep">
              {hero.regionLabel || "—"}
            </div>
            <div className="py-2.5 px-3 rounded-xl bg-slate-800/90 text-sky-400 break-keep">
              {useDisplay}
            </div>
            <div className="py-2.5 px-3 rounded-xl bg-slate-800/90 text-slate-200 break-keep">
              {areaDisplay}
            </div>
            <div className="py-2.5 px-3 rounded-xl bg-slate-800/90 text-amber-400 break-keep">
              {hero.bandedPrice || "—"}
            </div>
          </div>
          {/* 한 줄 제목: 중개사 편집기 card4.headline 이 1순위 (toPublicDealCard og.title) — 18자 교정 · 줄바꿈 안전 */}
          <DealCardLineText
            as="h1"
            testId="public-dealcard-title"
            text={og.title || hero.title}
            className="text-lg font-extrabold text-white text-center pt-1"
          />
        </section>

        {/* ① 장점 3줄 (18자 이내 제목 3줄만 깔끔하게 표시) */}
        {(() => {
          const dp = card.dealPoints.slice(0, 3);
          const postItStyles = [
            {
              bg: "#FEF9C3",
              border: "#FDE047",
              badgeBg: "#FEF08A",
              badgeText: "#854D0E",
              label: "01",
            },
            {
              bg: "#E0F2FE",
              border: "#7DD3FC",
              badgeBg: "#BAE6FD",
              badgeText: "#075985",
              label: "02",
            },
            {
              bg: "#DCFCE7",
              border: "#86EFAC",
              badgeBg: "#BBF7D0",
              badgeText: "#166534",
              label: "03",
            },
          ];
          return dp.length > 0 ? (
            <div
              data-testid="public-dealcard-points"
              className="rounded-2xl bg-slate-900/90 border border-slate-700/70 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-extrabold text-amber-400 tracking-wide">
                  장점 3줄
                </p>
              </div>
              <ul className="space-y-2.5">
                {dp.map((pt: string, i: number) => {
                  const tone = postItStyles[i % postItStyles.length];
                  // 하드 절단(slice) 금지: 어절 경계 18자 교정 (copy-limits SSOT)
                  const cleanTitle = repairDealCardLine(pt) || "—";
                  return (
                    <li
                      key={i}
                      data-testid={`public-dealcard-postit-${i}`}
                      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
                      className="rounded-xl border border-l-4 px-4 py-3.5 shadow-sm text-slate-900 flex items-center gap-3"
                    >
                      <span
                        style={{ backgroundColor: tone.badgeBg, color: tone.badgeText }}
                        className="text-sm font-extrabold px-2.5 py-0.5 rounded-md tracking-tight shrink-0"
                      >
                        {tone.label}
                      </span>
                      <DealCardLineText
                        testId={`public-dealcard-postit-text-${i}`}
                        text={cleanTitle}
                        preRepaired
                        className="flex-1 text-base font-extrabold text-slate-950"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null;
        })()}

        {/* ② 담당 중개사 프로필 & 전화하기 단추 (TrustLine) */}
        <TrustLine
          brokerName={broker.displayName}
          brokerPhone={broker.phone ?? undefined}
          brokerSlug={broker.slug ?? undefined}
          brokerAvatarUrl={broker.avatarUrl ?? undefined}
          specialty={broker.specialty ?? undefined}
          responseGuaranteeHours={broker.responseGuaranteeHours ?? undefined}
          closedDeals={broker.closedDeals ?? undefined}
          isLicensed={broker.isLicensed}
        />

        {/* ③ 전화하기 & IM 요청하기 단추 (CTALadder) */}
        <CTALadder
          buildingId={id}
          teaserConfigId={card.teaserConfigId}
          brokerPhone={broker.phone ?? undefined}
          requireNda={cta.requireNda}
          hasImDoc={cta.hasImDoc}
          isPptxApproved={cta.isPptxApproved}
          pptxDownloadUrl={cta.pptxDownloadUrl}
        />
      </div>
      {sParams.qa === "1" && !isPreviewMode && (
        <Suspense fallback={null}>
          <QaFeedbackPinWidget workspace="public-dealcard" requireExplicitQueryParam />
        </Suspense>
      )}
    </main>
  );
}


