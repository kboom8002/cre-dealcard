import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, jsonError } from "@/lib/magazine/authz";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { assertPublishable } from "@/lib/legal/publish-gate";
import { toKstDate, todayKst } from "@/lib/magazine/kst";
import {
  SQM_PER_PYEONG,
  resolveCanonicalAreaLabel,
  resolveCanonicalAssetUse,
  resolveCanonicalDealHeadline,
  toPositiveNumber,
} from "@/lib/deal-card/canonical-summary";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { normalizeContentForPublish, DEFAULT_THEME_COLOR } from "@/lib/magazine/edition-save";
import { maskAddressForPublic, sanitizeBrokerPhone } from "@/lib/magazine/public-page-data";
import { getOrCreateDraftEdition, defaultLabelForEditionType } from "@/lib/magazine/edition-draft";
import { sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import {
  normalizeReadableBriefingText,
} from "@/lib/magazine/simple-format";
import {
  isUuid,
  listAllQuickImRecords,
  resolveOrSynthesizeQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import {
  clusterArticlesIntoFiveIssues,
  normalizeMarketBriefingPlain,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import {
  normalizePreferredChannels,
  normalizePreferredRegions,
} from "@/domain/magazine/broker-preferences";
import {
  buildDefaultMonthlyGraphicPair,
  mapPreferredRegionsToMonthlyKey,
} from "@/domain/magazine/monthly-stats-hydration";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-issues");
const FAKE_TEST_IMAGE_PREFIX = "/test-" + "images/";

function isRealPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && !trimmed.startsWith(FAKE_TEST_IMAGE_PREFIX);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IssueBodySchema = z.object({
  editionId: z.string().max(100).nullable().optional(),
  /** 발행 주기 (일간·주간·월간·호외 지원) */
  editionType: z.enum(["daily", "weekly", "monthly", "special"]).optional(),
  /** 일간·주간 기준 날짜 (KST YYYY-MM-DD, 표시·감사용) */
  issueAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** 명시적 공개 발행일 (KST YYYY-MM-DD) */
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slug: z.string().max(60).optional(),
  issueSlug: z.string().max(60).optional(),
  issueNumber: z.number().int().optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  headline: z.string().trim().max(300).optional(),
  summary: z.string().max(1000).optional(),
  briefingTitle: z.string().max(300).optional(),
  briefingBody: z.string().max(30000).optional(),
  marketTemp: z.string().max(30).nullable().optional(),
  featuredDealIds: z.array(z.string().max(100)).max(50).optional(),
  featuredDeals: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  dealComments: z.record(z.string(), z.string().max(1000)).optional(),
  unitIssues: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
  monthlyRegion: z.string().max(40).optional(),
  monthlyPairId: z.string().max(40).optional(),
  monthlyCharts: z.array(z.record(z.string(), z.unknown())).max(6).optional(),
  preferredRegions: z.array(z.string().max(40)).max(8).optional(),
  preferredChannels: z.array(z.string().max(40)).max(5).optional(),
  sections: z
    .array(
      z.object({
        id: z.string().max(60),
        enabled: z.boolean(),
      })
    )
    .max(30)
    .optional(),
  targetSegment: z.enum(["all", "buyer", "seller"]).optional(),
  saveAsDraft: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
  createDistinctIfPublished: z.boolean().optional(),
  refreshPublishDate: z.boolean().optional(),
});

async function ensureBrokerSlug(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  existingSlug: string | null,
  displayName: string | null
): Promise<string> {
  if (existingSlug && existingSlug.trim()) {
    return existingSlug.trim();
  }
  const fallbackSlug = `broker-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase()}`;
  try {
    const { data: existingProfile } = await supabase
      .from("broker_profiles")
      .select("user_id, slug")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile) {
      const rowSlug = (existingProfile as { slug?: string | null }).slug;
      if (rowSlug && rowSlug.trim()) return rowSlug.trim();
      await supabase
        .from("broker_profiles")
        .update({ slug: fallbackSlug, is_public: true })
        .eq("user_id", userId);
      return fallbackSlug;
    }

    await supabase.from("broker_profiles").insert({
      user_id: userId,
      slug: fallbackSlug,
      name: displayName || "공인중개사",
      is_public: true,
    });
  } catch (err) {
    log.warn("ensureBrokerSlug fallback warning", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return fallbackSlug;
}

export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }

    const parsed = IssueBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "표지 제목 등 필수 입력값을 확인해 주세요.", 400);
    }

    const data = parsed.data;
    const isDraftRequest = data.saveAsDraft === true || data.status === "draft";
    const headlineText = (data.headline ?? "").trim();
    if (!isDraftRequest && !headlineText) {
      return jsonError("INVALID_INPUT", "표지 제목 등 필수 입력값을 확인해 주세요.", 400);
    }
    const effectiveHeadline = headlineText || "작성 중인 뉴스레터 초안";

    const supabase = createServiceClient();

    const brokerSlug = await ensureBrokerSlug(
      supabase,
      ctx.userId,
      ctx.slug,
      ctx.displayName
    );
    const brokerKeys = Array.from(new Set([brokerSlug, ...ctx.brokerKeys]));

    const editionType = data.editionType ?? "monthly";
    const rawLabel =
      data.slug?.trim() ||
      data.issueSlug?.trim() ||
      (editionType === "monthly" && data.year && data.month
        ? `${data.year}-${String(data.month).padStart(2, "0")}`
        : defaultLabelForEditionType(editionType));
    let safeLabel = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.\-]{0,39}$/.test(rawLabel)
      ? rawLabel
      : defaultLabelForEditionType(editionType);

    // 1. 기존 에디션 확인 또는 주기별(일간·주간·월간·호외) 초안 생성
    let targetEdition: Record<string, unknown> | null = null;
    if (data.editionId) {
      targetEdition = await assertOwnsRow<Record<string, unknown>>(
        supabase,
        "magazine_editions",
        data.editionId,
        { ...ctx, slug: brokerSlug, brokerKeys },
        { select: "*" }
      );
      if (!targetEdition) {
        const { data: existingRow } = await supabase
          .from("magazine_editions")
          .select("id")
          .eq("id", data.editionId)
          .maybeSingle();
        if (existingRow) {
          return jsonError("FORBIDDEN", "다른 중개사의 매거진 초안은 수정할 수 없습니다.", 403);
        }
        return jsonError("NOT_FOUND", "요청한 매거진 에디션을 찾을 수 없습니다.", 404);
      }
    }

    if (!targetEdition) {
      const firstLookup = await getOrCreateDraftEdition(
        supabase,
        { slug: brokerSlug, brokerKeys },
        {
          editionType,
          editionLabel: safeLabel,
          format: "simple",
        }
      );
      if (
        firstLookup.edition.status === "published" &&
        (isDraftRequest || data.createDistinctIfPublished === true)
      ) {
        const baseLabel = safeLabel.slice(0, 34);
        for (let suffix = 2; suffix <= 9; suffix++) {
          const candidateLabel = `${baseLabel}-${suffix}`;
          const nextAttempt = await getOrCreateDraftEdition(
            supabase,
            { slug: brokerSlug, brokerKeys },
            {
              editionType,
              editionLabel: candidateLabel,
              format: "simple",
            }
          );
          if (nextAttempt.edition.status !== "published") {
            safeLabel = candidateLabel;
            targetEdition = nextAttempt.edition;
            break;
          }
        }
      }
      if (!targetEdition) {
        targetEdition = firstLookup.edition;
      }
    }

    const editionId = String(targetEdition.id);
    const nowIso = new Date().toISOString();
    const targetAlreadyPublished = targetEdition.status === "published";
    const existingTargetContent =
      targetEdition.content &&
      typeof targetEdition.content === "object" &&
      !Array.isArray(targetEdition.content)
        ? (targetEdition.content as Record<string, unknown>)
        : {};
    const existingTargetIssueDate =
      typeof existingTargetContent.issueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(existingTargetContent.issueDate)
        ? existingTargetContent.issueDate
        : null;
    const todayDate = todayKst();
    const existingPublishedKstDate =
      typeof targetEdition.published_at === "string" && targetEdition.published_at
        ? toKstDate(new Date(targetEdition.published_at))
        : null;
    const shouldRefreshPublishDate =
      !isDraftRequest &&
      data.refreshPublishDate === true &&
      (!existingPublishedKstDate || existingPublishedKstDate !== todayDate);
    const isRollingCadence = editionType === "monthly" || editionType === "weekly";
    // A6-04: 월간/주간 미발행 초안의 최초 발행/저장 시 오래된 초안 issueDate를 무시하고 오늘(KST)로 고정한다.
    // 이미 발행된 호수 수정(correction)만 기존 발행일(issueDate / published_at KST)을 유지하되,
    // 명시적 재발송(refreshPublishDate: true) 시에는 오늘(KST) 발행일로 갱신한다.
    const issueDate = shouldRefreshPublishDate
      ? todayDate
      : targetAlreadyPublished
        ? data.issueDate ||
          existingTargetIssueDate ||
          existingPublishedKstDate ||
          todayDate
        : isRollingCadence
          ? todayDate
          : (editionType === "daily" && data.issueAnchorDate ? data.issueAnchorDate : undefined) ||
            data.issueDate ||
            todayDate;

    // 2. 브로커 공개 프로필 조회
    const resolvedBroker = await resolveBroker(supabase, brokerSlug).catch(() => null);
    let phone = "";
    const { data: prof } = await supabase
      .from("profiles")
      .select("phone, display_name, company")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (prof && typeof (prof as { phone?: unknown }).phone === "string") {
      phone = sanitizeBrokerPhone((prof as { phone: string }).phone);
    }

    const rawBriefingInput =
      data.briefingBody?.trim() || data.summary?.trim() || "";
    const cleanedSummary = "";
    const cleanedBriefingTitle = "";
    const cleanedBriefingBody = normalizeMarketBriefingPlain(
      normalizeReadableBriefingText(rawBriefingInput),
      500,
      5,
    );

    const effectiveBriefing =
      cleanedBriefingBody ||
      `${effectiveHeadline} 핵심 내용을 정리해 전해드립니다.`;

    const primaryBriefingText = effectiveBriefing;

    const fieldNote = {
      question: "",
      buyerReaction: "",
      sellerReaction: "",
      marketJudgment: "",
      comment: "",
    };

    const existingContent =
      targetEdition.content && typeof targetEdition.content === "object"
        ? (targetEdition.content as Record<string, unknown>)
        : {};

    // 2-B. 선택된 매물(featuredDealIds) 스냅샷 하이드레이션 (NL-G04, NL-G06, NL-G07)
    const dealIds = data.featuredDealIds ?? [];
    const commentsMap = data.dealComments ?? {};
    const clientSnapshots = Array.isArray(data.featuredDeals) ? data.featuredDeals : [];
    const hydratedDeals: Array<Record<string, unknown>> = [];

    if (dealIds.length > 0) {
      const quickRecords = listAllQuickImRecords();
      let dbBuildings: Array<Record<string, unknown>> = [];
      const docPhotosByBuildingId = new Map<string, string>();
      const docMetaByBuildingId = new Map<string, Record<string, unknown>>();
      const uuidDealIds = dealIds.filter((id) => isUuid(id));

      if (uuidDealIds.length > 0) {
        try {
          const [bRes, dRes] = await Promise.all([
            supabase
              .from("building_ssot_lite")
              .select("id, owner_id, raw_address, area_signal, asset_type, price_band, fit_summary, layers")
              .in("id", uuidDealIds),
            supabase
              .from("document_objects")
              .select(
                "id, owner_id, building_id, title, status, ssot_summary:body->ssot_summary, photos_v2:body->photos_v2, photos:body->photos, photo_urls:body->photo_urls"
              )
              .in("building_id", uuidDealIds)
              .neq("status", "archived")
              .order("created_at", { ascending: false })
              .limit(30),
          ]);
          if (Array.isArray(bRes?.data)) {
            dbBuildings = bRes.data as Array<Record<string, unknown>>;
          }
          if (Array.isArray(dRes?.data)) {
            for (const dRow of dRes.data as Array<Record<string, unknown>>) {
              const bId = String(dRow.building_id || "");
              if (!bId) continue;
              if (!docMetaByBuildingId.has(bId) || dRow.status === "published") {
                docMetaByBuildingId.set(bId, dRow);
              }
              if (!docPhotosByBuildingId.has(bId)) {
                const cand = Array.isArray(dRow.photos_v2) && dRow.photos_v2.length > 0
                  ? dRow.photos_v2
                  : Array.isArray(dRow.photos) && dRow.photos.length > 0
                  ? dRow.photos
                  : Array.isArray(dRow.photo_urls)
                  ? dRow.photo_urls
                  : [];
                for (const p of cand) {
                  const u = typeof p === "string" ? p : String((p as Record<string, unknown>)?.url || "");
                  if (isRealPhotoUrl(u)) {
                    docPhotosByBuildingId.set(bId, u.trim());
                    break;
                  }
                }
              }
            }
          }
        } catch {
          // ignore if non-UUID IDs or mock DB
        }
      }

      for (const dId of dealIds) {
        const snap = clientSnapshots.find((s) => String(s.id ?? "") === dId) || {};
        const dbRow = dbBuildings.find((b) => String(b.id ?? "") === dId);
        const docMeta = docMetaByBuildingId.get(dId);
        const docSsot =
          (docMeta?.ssot_summary && typeof docMeta.ssot_summary === "object"
            ? (docMeta.ssot_summary as Record<string, unknown>)
            : {}) || {};
        const qRec = (await resolveOrSynthesizeQuickImRecord(dId, supabase)) ?? quickRecords.find((r) => r.buildingId === dId);

        // S1-10: Enforce broker ownership on featuredDealIds
        if (!(ctx as { isAdmin?: boolean }).isAdmin) {
          const rowOwner = dbRow?.owner_id ? String(dbRow.owner_id) : "";
          const docOwner = docMeta?.owner_id ? String(docMeta.owner_id) : "";
          const qOwner = qRec?.ownerId ? String(qRec.ownerId) : "";
          if (
            (rowOwner && !ctx.brokerKeys.includes(rowOwner) && rowOwner !== ctx.userId) ||
            (docOwner && !ctx.brokerKeys.includes(docOwner) && docOwner !== ctx.userId) ||
            (qOwner && !ctx.brokerKeys.includes(qOwner) && qOwner !== ctx.userId)
          ) {
            continue;
          }
        }

        const comment = commentsMap[dId]?.trim() || String(snap.investmentPoint ?? snap.point ?? "").trim();

        const layers = (dbRow?.layers && typeof dbRow.layers === "object" ? (dbRow.layers as Record<string, unknown>) : {}) || {};
        const dealTerms = (layers.deal_terms && typeof layers.deal_terms === "object" ? (layers.deal_terms as Record<string, unknown>) : {}) || {};
        const finance = (layers.finance && typeof layers.finance === "object" ? (layers.finance as Record<string, unknown>) : {}) || {};
        const leaseSummary = (layers.lease_summary && typeof layers.lease_summary === "object" ? (layers.lease_summary as Record<string, unknown>) : {}) || {};
        const locationLayer = (layers.location && typeof layers.location === "object" ? (layers.location as Record<string, unknown>) : {}) || {};
        const physicalLayer = (layers.physical && typeof layers.physical === "object" ? (layers.physical as Record<string, unknown>) : {}) || {};
        const buildingLayer = (layers.building && typeof layers.building === "object" ? (layers.building as Record<string, unknown>) : {}) || {};

        const qSpecs = ((qRec as unknown as { specs?: Record<string, unknown> })?.specs ?? {}) as Record<string, unknown>;
        const qFacts = ((qRec?.basicImDoc?.facts as unknown as {
          valuation?: Record<string, unknown>;
          building?: Record<string, unknown>;
          land?: Record<string, unknown>;
        }) ?? {});
        const qVal = (qFacts.valuation ?? {}) as Record<string, unknown>;
        const qBuildingFacts = (qFacts.building ?? {}) as Record<string, unknown>;
        const qLandFacts = (qFacts.land ?? {}) as Record<string, unknown>;

        const rawAddr =
          String(snap.address ?? "").trim() ||
          qRec?.address ||
          String(docSsot.address ?? locationLayer.road_address ?? locationLayer.address ?? dbRow?.raw_address ?? dbRow?.address ?? dbRow?.area_signal ?? "").trim();
        const safeAddr = maskAddressForPublic(sanitizeDealAddress(rawAddr)) || "수도권 역세권";
        const rawAreaSignal = String(qRec?.card4?.region || dbRow?.area_signal || docSsot.area_signal || safeAddr);
        const safeAreaSignal = maskAddressForPublic(sanitizeDealAddress(rawAreaSignal)) || safeAddr;

        const resolvedAssetType = resolveCanonicalAssetUse({
          mainPurpose: docSsot.main_purpose ?? qBuildingFacts.mainPurpose ?? buildingLayer.main_purpose,
          assetType: qRec?.card4?.use ?? dbRow?.asset_type ?? docSsot.asset_type,
          existingUse: snap.assetType,
          fallbackUse: "수익형 근생빌딩",
        });

        const snapTitle = String(snap.title ?? "").trim();
        const rawTitle = resolveCanonicalDealHeadline({
          brokerHeadline: snapTitle && snapTitle !== "추천 매물" ? snapTitle : undefined,
          card4Headline: qRec?.card4?.headline,
          ogTitle: docSsot.og_title,
          existingHeadline:
            qRec?.buildingName ||
            String(docMeta?.title ?? docSsot.building_name ?? dbRow?.area_signal ?? resolvedAssetType).trim(),
          region: safeAreaSignal,
          assetType: resolvedAssetType,
        });
        const safeTitle = /\d+-\d+|(?:대로|번길|로|길)\s+\d+(?!\s*일대)/.test(rawTitle)
          ? maskAddressForPublic(rawTitle) || "추천 상업용 빌딩"
          : rawTitle;

        const askingManwon =
          Number(qRec?.askingPriceManwon || 0) ||
          Number(docSsot.asking_price_manwon || 0) ||
          Number(dealTerms.asking_price_manwon || 0) ||
          Number(finance.asking_price_manwon || 0) ||
          (Number(finance.asking_price_krw || 0) > 0 ? Math.round(Number(finance.asking_price_krw) / 10_000) : 0) ||
          Number(leaseSummary.asking_price_manwon || 0);

        const formattedAskingEok =
          askingManwon > 0
            ? `${Number.isInteger(askingManwon / 10000) ? (askingManwon / 10000).toFixed(0) : (askingManwon / 10000).toFixed(1)}억`
            : null;

        const snapPriceStr = typeof snap.price === "string" ? snap.price.trim() : "";
        const validSnapPrice =
          snapPriceStr && snapPriceStr !== "-" && snapPriceStr !== "가격 문의" && snapPriceStr !== "가격 협의"
            ? snapPriceStr
            : typeof snap.price === "number" && snap.price > 0
            ? snap.price
            : null;

        const priceVal =
          validSnapPrice ??
          formattedAskingEok ??
          qRec?.card4?.priceBand ??
          (typeof dbRow?.price_band === "string" && dbRow.price_band !== "가격 협의" ? dbRow.price_band : null) ??
          "가격 협의";

        const yieldNum =
          typeof snap.grossYieldNetOfDeposit === "number" && snap.grossYieldNetOfDeposit > 0
            ? snap.grossYieldNetOfDeposit
            : Number(qRec?.basicImDoc?.facts?.valuation?.capRatePct || docSsot.cap_rate_pct || dealTerms.cap_rate_pct || finance.noi_yield_pct || 0) || undefined;

        const qRecRealPhoto = Array.isArray(qRec?.fullDocBody?.photos)
          ? qRec.fullDocBody.photos.find((p: any) => isRealPhotoUrl(p?.url))?.url
          : null;
        const resolvedPhotoUrl = isRealPhotoUrl(snap.photoUrl)
          ? snap.photoUrl.trim()
          : docPhotosByBuildingId.get(dId) || qRecRealPhoto || null;

        const landAreaM2 =
          toPositiveNumber(snap.landAreaM2) ??
          toPositiveNumber(snap.land_area_m2) ??
          toPositiveNumber(snap.land_area_sqm) ??
          toPositiveNumber(qSpecs.landAreaM2) ??
          toPositiveNumber(qSpecs.landAreaSqm) ??
          toPositiveNumber(qBuildingFacts.landAreaSqm) ??
          toPositiveNumber(qLandFacts.landAreaSqm) ??
          toPositiveNumber(docSsot.land_area_m2) ??
          toPositiveNumber(docSsot.land_area_sqm) ??
          toPositiveNumber(physicalLayer.land_area_m2) ??
          toPositiveNumber(physicalLayer.land_area_sqm) ??
          undefined;
        const grossFloorAreaM2 =
          toPositiveNumber(snap.grossFloorAreaM2) ??
          toPositiveNumber(snap.total_gross_area_m2) ??
          toPositiveNumber(snap.total_gross_area_sqm) ??
          toPositiveNumber(snap.total_floor_area_sqm) ??
          toPositiveNumber(snap.gross_floor_area_m2) ??
          toPositiveNumber(qSpecs.grossFloorAreaM2) ??
          toPositiveNumber(qSpecs.gfaSqm) ??
          toPositiveNumber(qBuildingFacts.totalGrossAreaSqm) ??
          toPositiveNumber(qBuildingFacts.grossFloorAreaSqm) ??
          toPositiveNumber(docSsot.gross_floor_area_m2) ??
          toPositiveNumber(docSsot.total_gross_area_sqm) ??
          toPositiveNumber(docSsot.total_gross_area_m2) ??
          toPositiveNumber(physicalLayer.gross_floor_area_m2) ??
          toPositiveNumber(physicalLayer.total_floor_area_sqm) ??
          undefined;
        const landAreaPyeong =
          toPositiveNumber(snap.landAreaPyeong ?? snap.land_area_pyeong) ??
          toPositiveNumber(docSsot.land_area_pyeong) ??
          (landAreaM2
            ? Math.round((landAreaM2 / SQM_PER_PYEONG) * 10) / 10
            : undefined);
        const grossFloorAreaPyeong =
          toPositiveNumber(snap.grossFloorAreaPyeong ?? snap.gross_floor_area_pyeong) ??
          toPositiveNumber(docSsot.gross_floor_area_pyeong) ??
          (grossFloorAreaM2
            ? Math.round((grossFloorAreaM2 / SQM_PER_PYEONG) * 10) / 10
            : undefined);
        const resolvedPosture =
          [
            snap.posture,
            qRec?.card4?.posture,
            (qRec as unknown as { posture?: unknown })?.posture,
            docSsot.investment_posture,
            docSsot.posture,
            buildingLayer.investment_posture,
            layers.posture,
          ].find((p): p is string => typeof p === "string" && p.trim().length > 0)?.trim() ||
          undefined;
        const canonicalAreaLabel =
          resolveCanonicalAreaLabel({
            posture: resolvedPosture,
            explicitAreaLabel: snap.areaLabel,
            gfaSqm: grossFloorAreaM2,
            landSqm: landAreaM2,
            gfaPyeong: grossFloorAreaPyeong,
            landPyeong: landAreaPyeong,
          }) || undefined;
        const zoning =
          String(
            snap.zoning ??
              qSpecs.zoning ??
              docSsot.zoning ??
              physicalLayer.zoning ??
              ""
          ).trim() || undefined;
        const floors =
          String(
            snap.floors ??
              qSpecs.floors ??
              docSsot.floors ??
              physicalLayer.floors ??
              ""
          ).trim() || undefined;
        const totalFloors =
          Number(
            snap.totalFloors ||
              docSsot.total_floors ||
              physicalLayer.total_floors ||
              0
          ) || undefined;

        const depositManwon =
          Number(
            qVal.depositManwon ||
              docSsot.deposit_manwon ||
              dealTerms.deposit_manwon ||
              leaseSummary.deposit_manwon ||
              finance.deposit_manwon ||
              0
          );
        const depositWon =
          typeof snap.deposit === "number" && snap.deposit >= 0
            ? snap.deposit
            : depositManwon > 0
            ? depositManwon * 10_000
            : Number(
                docSsot.deposit_krw ||
                  dealTerms.deposit_krw ||
                  leaseSummary.deposit_krw ||
                  0
              ) || undefined;

        const monthlyRentManwon =
          Number(
            qVal.monthlyRentManwon ||
              docSsot.monthly_rent_manwon ||
              dealTerms.monthly_rent_manwon ||
              leaseSummary.monthly_rent_manwon ||
              finance.monthly_rent_manwon ||
              0
          );
        const monthlyRentWon =
          typeof snap.monthlyRent === "number" && snap.monthlyRent >= 0
            ? snap.monthlyRent
            : monthlyRentManwon > 0
            ? monthlyRentManwon * 10_000
            : Number(
                docSsot.monthly_rent_krw ||
                  dealTerms.monthly_rent_krw ||
                  leaseSummary.monthly_rent_krw ||
                  0
              ) || undefined;

        const hasIm =
          isUuid(dId) &&
          (Boolean(docMeta) || Boolean(qRec?.basicImDoc) || snap.hasIm === true);

        hydratedDeals.push({
          id: dId,
          title: safeTitle,
          assetType: resolvedAssetType,
          areaSignal: safeAreaSignal,
          address: safeAddr,
          price: priceVal,
          ...(resolvedPosture ? { posture: resolvedPosture } : {}),
          ...(canonicalAreaLabel ? { areaLabel: canonicalAreaLabel } : {}),
          ...(askingManwon > 0 ? { priceWon: askingManwon * 10_000 } : {}),
          ...(depositWon !== undefined ? { deposit: depositWon } : {}),
          ...(monthlyRentWon !== undefined ? { monthlyRent: monthlyRentWon } : {}),
          ...(landAreaM2 !== undefined ? { landAreaM2 } : {}),
          ...(grossFloorAreaM2 !== undefined ? { grossFloorAreaM2 } : {}),
          ...(landAreaPyeong !== undefined ? { landAreaPyeong } : {}),
          ...(grossFloorAreaPyeong !== undefined ? { grossFloorAreaPyeong } : {}),
          ...(zoning ? { zoning } : {}),
          ...(floors ? { floors } : {}),
          ...(totalFloors ? { totalFloors } : {}),
          grossYieldNetOfDeposit: yieldNum,
          investmentPoint: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          point: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          photoUrl: resolvedPhotoUrl,
          hasIm,
          ...(hasIm ? { imUrl: `/im-lite/${encodeURIComponent(dId)}` } : {}),
        });
      }
    }

    const newsExplicitlyEnabled =
      Array.isArray(data.sections) && data.sections.some((s) => s.id === "news_curation")
        ? data.sections.some((s) => s.id === "news_curation" && s.enabled === true)
        : true;

    const preferredRegions = normalizePreferredRegions(data.preferredRegions);
    const preferredChannels = normalizePreferredChannels(data.preferredChannels);

    const sanitizedExistingContent: Record<string, unknown> = { ...existingContent };
    let resolvedUnitIssues = resolveUnitIssuesFromData(
      {
        unitIssues: Array.isArray(data.unitIssues) && data.unitIssues.length > 0
          ? data.unitIssues
          : existingContent.unitIssues,
      },
      { fallbackFromTopNews: false },
    );

    if (newsExplicitlyEnabled && resolvedUnitIssues.length === 0) {
      resolvedUnitIssues = clusterArticlesIntoFiveIssues([], {
        cadence: editionType,
        preferredRegions,
        preferredChannels,
        dealKeywords: hydratedDeals.map((d) => `${d.title ?? ""} ${d.address ?? ""}`),
      });
    }

    if (!newsExplicitlyEnabled) {
      delete sanitizedExistingContent.topNews;
      delete sanitizedExistingContent.news_curation;
      delete sanitizedExistingContent.selected_news_ids;
      delete sanitizedExistingContent.unitIssues;
      delete sanitizedExistingContent.unit_issues;
      resolvedUnitIssues = [];
    }

    const clientSectionMap = new Map<string, boolean>();
    if (Array.isArray(data.sections)) {
      for (const s of data.sections) {
        clientSectionMap.set(s.id, s.enabled);
      }
    }

    const marketDataToggleEnabled =
      editionType === "monthly"
        ? clientSectionMap.has("market_data")
          ? clientSectionMap.get("market_data")!
          : true
        : false;

    const resolvedMonthlyRegion =
      typeof data.monthlyRegion === "string" && data.monthlyRegion.trim()
        ? data.monthlyRegion.trim()
        : typeof sanitizedExistingContent.monthlyRegion === "string"
        ? sanitizedExistingContent.monthlyRegion
        : typeof sanitizedExistingContent.monthly_region === "string"
        ? sanitizedExistingContent.monthly_region
        : editionType === "monthly"
        ? mapPreferredRegionsToMonthlyKey(preferredRegions)
        : undefined;

    const resolvedMonthlyPairId =
      typeof data.monthlyPairId === "string" && data.monthlyPairId.trim()
        ? data.monthlyPairId.trim()
        : typeof sanitizedExistingContent.monthlyPairId === "string"
        ? sanitizedExistingContent.monthlyPairId
        : typeof sanitizedExistingContent.monthly_pair_id === "string"
        ? sanitizedExistingContent.monthly_pair_id
        : undefined;

    const incomingCharts = Array.isArray(data.monthlyCharts)
      ? data.monthlyCharts
      : Array.isArray(sanitizedExistingContent.monthlyCharts)
      ? (sanitizedExistingContent.monthlyCharts as Array<Record<string, unknown>>)
      : Array.isArray(sanitizedExistingContent.monthly_charts)
      ? (sanitizedExistingContent.monthly_charts as Array<Record<string, unknown>>)
      : [];

    const filteredIncomingCharts = incomingCharts.filter(
      (c) =>
        c &&
        typeof c === "object" &&
        c.isPlaceholder !== true &&
        Array.isArray(c.series) &&
        c.series.length > 0
    );

    const populatedMonthlyCharts =
      editionType !== "monthly" || !marketDataToggleEnabled
        ? []
        : filteredIncomingCharts.length > 0
        ? filteredIncomingCharts
        : (buildDefaultMonthlyGraphicPair(resolvedMonthlyRegion ?? "gbd") as unknown as Array<
            Record<string, unknown>
          >);

    const rawContentForNormalize: Record<string, unknown> = {
      ...sanitizedExistingContent,
      format: "simple",
      kind: editionType,
      edition_type: editionType,
      headline: effectiveHeadline,
      summary: cleanedSummary,
      briefing_title: cleanedBriefingTitle,
      briefing: primaryBriefingText,
      ai_briefing: primaryBriefingText,
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: "",
      theme_body_md: "",
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: commentsMap,
      ...(resolvedMonthlyRegion
        ? { monthlyRegion: resolvedMonthlyRegion, monthly_region: resolvedMonthlyRegion }
        : {}),
      ...(resolvedMonthlyPairId
        ? { monthlyPairId: resolvedMonthlyPairId, monthly_pair_id: resolvedMonthlyPairId }
        : {}),
      ...(populatedMonthlyCharts.length > 0
        ? { monthlyCharts: populatedMonthlyCharts, monthly_charts: populatedMonthlyCharts }
        : { monthlyCharts: undefined, monthly_charts: undefined }),
      ...(newsExplicitlyEnabled && resolvedUnitIssues.length > 0
        ? { unitIssues: resolvedUnitIssues, unit_issues: resolvedUnitIssues }
        : {}),
      broker_preferences: {
        preferredRegions,
        preferredChannels,
      },
      sections: data.sections,
      target_segment: data.targetSegment ?? "all",
    };

    const normalized = normalizeContentForPublish({
      content: rawContentForNormalize,
      broker: {
        name:
          resolvedBroker?.displayName ??
          (prof as { display_name?: string | null } | null)?.display_name ??
          ctx.displayName ??
          "공인중개사",
        slug: brokerSlug,
        company:
          resolvedBroker?.company ??
          (prof as { company?: string | null } | null)?.company ??
          "",
        phone,
        photoUrl: resolvedBroker?.photoUrl ?? null,
        tagline: resolvedBroker?.tagline ?? "",
        specialtyRegions: resolvedBroker?.specialtyRegions ?? [],
        specialtyAssets: resolvedBroker?.specialtyAssets ?? [],
      },
      kind: editionType,
      issueDate,
      weekLabel: safeLabel,
      nowIso,
      themeColor: DEFAULT_THEME_COLOR,
    });

    if (!normalized.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: normalized.code,
            message: normalized.issues[0] ?? "발행할 수 없는 콘텐츠입니다.",
          },
          issues: normalized.issues,
        },
        { status: 422 }
      );
    }

    // Merge client section toggles into the normalized section array without wiping hidden section flags
    const baseSections = Array.isArray(normalized.content.sections)
      ? (normalized.content.sections as Array<{ id: string; enabled: boolean }>)
      : [];
    const briefingToggleEnabled = clientSectionMap.has("field_note")
      ? clientSectionMap.get("field_note")!
      : clientSectionMap.has("ai_briefing")
      ? clientSectionMap.get("ai_briefing")!
      : editionType === "daily"
      ? Boolean(primaryBriefingText)
      : true;

    const mappedSections = baseSections.map((sec) => {
      if (sec.id === "market_data") {
        return { id: sec.id, enabled: marketDataToggleEnabled };
      }
      if (sec.id === "ai_briefing") {
        return { id: sec.id, enabled: briefingToggleEnabled && Boolean(primaryBriefingText) };
      }
      if (sec.id === "field_note") {
        return { id: sec.id, enabled: briefingToggleEnabled };
      }
      if (sec.id === "theme_of_week") {
        return { id: sec.id, enabled: false };
      }
      if (sec.id === "news_curation") {
        return { id: sec.id, enabled: newsExplicitlyEnabled };
      }
      if (clientSectionMap.has(sec.id)) {
        return { id: sec.id, enabled: clientSectionMap.get(sec.id)! };
      }
      return sec;
    });
    const mergedSections = mappedSections.some((sec) => sec.id === "field_note")
      ? mappedSections
      : [...mappedSections, { id: "field_note", enabled: briefingToggleEnabled }];

    if (isDraftRequest && targetAlreadyPublished) {
      return NextResponse.json(
        {
          ok: false,
          code: "PUBLISHED_LOCKED",
          error: "이미 발행된 뉴스레터는 초안 저장으로 덮어쓸 수 없습니다.",
        },
        { status: 409 }
      );
    }
    const nextStatus: "draft" | "published" = isDraftRequest ? "draft" : "published";

    if (nextStatus !== "draft") {
      const statutoryGate = await assertPublishable({
        supabase,
        userId: ctx.userId,
        kind: "magazine",
        brokerMetaOverride: {
          company:
            resolvedBroker?.company ??
            (prof as { company?: string | null } | null)?.company ??
            undefined,
          phone: phone || undefined,
          display_name:
            resolvedBroker?.displayName ??
            (prof as { display_name?: string | null } | null)?.display_name ??
            ctx.displayName ??
            undefined,
        },
      });
      if (!statutoryGate.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: statutoryGate.code, message: statutoryGate.message },
            missingFields: statutoryGate.missingFields,
            missingLabels: statutoryGate.missingLabels,
          },
          { status: 422 }
        );
      }
    }

    const resolvedPublishedAt =
      nextStatus === "draft"
        ? null
        : shouldRefreshPublishDate
        ? nowIso
        : typeof targetEdition.published_at === "string" && targetEdition.published_at
        ? targetEdition.published_at
        : nowIso;

    const finalContent: Record<string, unknown> = {
      ...normalized.content,
      id: editionId,
      edition_type: editionType,
      edition_label: safeLabel,
      issueDate,
      ...(resolvedPublishedAt ? { published_at: resolvedPublishedAt } : {}),
      headline: nextStatus === "draft" ? headlineText : effectiveHeadline,
      summary: cleanedSummary,
      briefing_title: cleanedBriefingTitle,
      briefing_body_md: cleanedBriefingBody,
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      featuredDeals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: data.dealComments ?? {},
      ...(resolvedMonthlyRegion
        ? { monthlyRegion: resolvedMonthlyRegion, monthly_region: resolvedMonthlyRegion }
        : {}),
      ...(resolvedMonthlyPairId
        ? { monthlyPairId: resolvedMonthlyPairId, monthly_pair_id: resolvedMonthlyPairId }
        : {}),
      ...(populatedMonthlyCharts.length > 0
        ? { monthlyCharts: populatedMonthlyCharts, monthly_charts: populatedMonthlyCharts }
        : { monthlyCharts: undefined, monthly_charts: undefined }),
      ...(newsExplicitlyEnabled && resolvedUnitIssues.length > 0
        ? { unitIssues: resolvedUnitIssues, unit_issues: resolvedUnitIssues }
        : { unitIssues: undefined, unit_issues: undefined }),
      broker_preferences: {
        preferredRegions,
        preferredChannels,
      },
      sections: mergedSections,
      target_segment: data.targetSegment ?? "all",
    };

    const editionUpdate: Record<string, unknown> = {
      title: nextStatus === "draft" ? headlineText : effectiveHeadline,
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: cleanedBriefingTitle || null,
      theme_body_md: cleanedBriefingBody || effectiveBriefing,
      featured_deal_ids: data.featuredDealIds ?? [],
      target_segments: [data.targetSegment ?? "all"],
      status: nextStatus,
      published_at: resolvedPublishedAt,
      content: finalContent,
      updated_at: nowIso,
      ...(isUuid(ctx.userId) ? { broker_user_id: ctx.userId } : {}),
    };

    let { data: updated, error: upErr } = await supabase
      .from("magazine_editions")
      .update(editionUpdate)
      .eq("id", editionId)
      .in("broker_id", brokerKeys)
      .select()
      .maybeSingle();

    if (
      upErr &&
      ((upErr as { code?: string }).code === "42703" || (upErr as { code?: string }).code === "PGRST204") &&
      "broker_user_id" in editionUpdate
    ) {
      const { broker_user_id: _omitted, ...fallbackEditionUpdate } = editionUpdate;
      const retryRes = await supabase
        .from("magazine_editions")
        .update(fallbackEditionUpdate)
        .eq("id", editionId)
        .in("broker_id", brokerKeys)
        .select()
        .maybeSingle();
      updated = retryRes.data;
      upErr = retryRes.error;
    }

    if (upErr || !updated) {
      log.error("[api/magazine/issues] edition update failed", upErr?.message ?? "no row");
      return jsonError("PUBLISH_FAILED", "뉴스레터 발행 저장에 실패했습니다.", 500);
    }

    if (nextStatus === "draft") {
      return NextResponse.json({
        ok: true,
        id: editionId,
        editionId,
        editionLabel: safeLabel,
        status: "draft",
        brokerSlug,
        issueDate,
        publicUrl: null,
        url: null,
        content: finalContent,
      });
    }

    // 3. 공개 뷰어 테이블(magazine_issues) 동기화 (실제 발행본만 반영)
    let { error: issueErr } = await supabase
      .from("magazine_issues")
      .upsert(
        {
          broker_id: brokerSlug,
          issue_date: issueDate,
          content: finalContent,
          updated_at: nowIso,
        },
        { onConflict: "broker_id,issue_date" }
      );

    if (
      issueErr &&
      ((issueErr as { code?: string }).code === "42703" || (issueErr as { code?: string }).code === "PGRST204")
    ) {
      const retryIssue = await supabase
        .from("magazine_issues")
        .upsert(
          {
            broker_id: brokerSlug,
            issue_date: issueDate,
            content: finalContent,
          },
          { onConflict: "broker_id,issue_date" }
        );
      issueErr = retryIssue.error;
    }

    if (issueErr) {
      log.error("[api/magazine/issues] magazine_issues upsert failed", {
        error: issueErr.message,
      });
      if (!targetAlreadyPublished) {
        await supabase
          .from("magazine_editions")
          .update({
            status: typeof targetEdition.status === "string" ? targetEdition.status : "draft",
            published_at:
              typeof targetEdition.published_at === "string" ? targetEdition.published_at : null,
            updated_at: nowIso,
          })
          .eq("id", editionId)
          .in("broker_id", brokerKeys);
      }
      return jsonError("PUBLISH_FAILED", "공개 뉴스레터 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    if (isUuid(ctx.userId)) {
      await supabase
        .from("activity_events")
        .insert({
          actor_id: ctx.userId,
          entity_type: "magazine",
          entity_id: isUuid(editionId) ? editionId : null,
          event_type: "magazine_published",
          metadata: {
            issue_date: issueDate,
            edition_type: editionType,
            edition_label: safeLabel,
            slug: brokerSlug,
            broker_id: ctx.userId,
            correction: targetAlreadyPublished,
          },
        })
        .then(() => undefined, () => undefined);
    }

    const origin = request.nextUrl.origin || "https://credeal.net";
    const targetSuffix =
      data.targetSegment && data.targetSegment !== "all"
        ? `&target=${encodeURIComponent(data.targetSegment)}`
        : "";
    const publicUrl = `${origin}/magazine/${encodeURIComponent(brokerSlug)}/${encodeURIComponent(issueDate)}?edition=${encodeURIComponent(editionId)}${targetSuffix}`;

    return NextResponse.json({
      ok: true,
      id: editionId,
      editionId,
      editionLabel: safeLabel,
      status: "published",
      brokerSlug,
      issueDate,
      publicUrl,
      url: publicUrl,
      content: finalContent,
    });
  } catch (err: unknown) {
    log.error("[api/magazine/issues]", err instanceof Error ? err.message : String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
