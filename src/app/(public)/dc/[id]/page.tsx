import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { LazyQaFeedbackPinWidget } from '@/components/workspace/LazyQaFeedbackPinWidget';
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from '@/domain/building/im-core/read-building';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';
import {
  toPublicDealCard,
  type PublicDealCardBrokerInput,
} from '@/domain/public-projection/deal-card';
import { evaluateDealCardPublicVisibility, PUBLIC_IM_DOC_STATUSES, PUBLIC_WORKSPACE_ITEM_STATUSES } from '@/domain/public-projection/visibility';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import { getServerViewer } from '@/lib/server-viewer';
import { getCanonicalSiteUrl } from '@/lib/site-url';
import { getWorkspaceItemByAnyId } from '@/lib/workspace/workspace-repository';
import type { Card4Data } from '@/lib/deal-card/card4-schema';
import {
  getInboxState,
  getQuickImRecord,
  isDealCardDeleted,
  isUuid,
  resolveOrSynthesizeQuickImRecord,
  updateQuickImCard4,
  type StoredQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import {
  isBuildingShareLinkRevoked,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import {
  allowDealPublicMemoryFallback,
  resolvePublicDealWorkspaceGuard,
} from '@/lib/og/deal-public-guard';

// v3 Goldilocks components
import { CTALadder } from '@/components/teaser/CTALadder';
import { TrustLine } from '@/components/teaser/TrustLine';
import { ReaderFontScaleToggle } from '@/components/ui/ReaderFontScaleToggle';
import { InAppBrowserBanner } from '@/components/public/InAppBrowserBanner';

import { m2ToPyeong } from '@/domain/building/im-core/facts/area';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { DealCardLineText } from '@/components/broker/deal-card/DealCardLineText';

interface PageProps { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

const BROKER_PROFILE_SELECT_FULL =
  "user_id, slug, card_name, photo_url, deal_specialty, license_number, office_reg_number, office_address, representative_name, response_time_hours, total_deal_count_self";
const BROKER_PROFILE_SELECT_CORE =
  "user_id, slug, photo_url, deal_specialty, license_number, office_reg_number, response_time_hours, total_deal_count_self";
const BROKER_PROFILE_SELECT_MIN =
  "user_id, slug, license_number, office_reg_number";

function isSchemaColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /does not exist|schema cache/i.test(String(err.message || ""));
}

type SignalCardView = {
  id?: string;
  title?: string | null;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  deal_points?: unknown;
  body?: unknown;
  status?: string | null;
  visibility?: string | null;
};

type TeaserDocView = {
  status?: string | null;
  body?: Record<string, unknown> | null;
};

interface LegacyDealCardActivityEvent {
  actor_id?: string | null;
  entity_id?: string | null;
  event_type?: string | null;
  metadata?: {
    building_id?: string;
    status?: string;
    card4?: Card4Data;
    broker_profile?: Record<string, unknown>;
  } | null;
  created_at?: string | null;
}

interface ActivityEventQueryLike
  extends PromiseLike<{ data?: LegacyDealCardActivityEvent[] | null }> {
  in?: (col: string, vals: string[]) => ActivityEventQueryLike;
  contains?: (col: string, val: Record<string, unknown>) => ActivityEventQueryLike;
  order?: (col: string, opts: { ascending: boolean }) => ActivityEventQueryLike;
  limit?: (n: number) => ActivityEventQueryLike;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const PUBLIC_IM_WORKSPACE_STATUS_SET = new Set<string>([
  ...PUBLIC_WORKSPACE_ITEM_STATUSES,
  "active",
]);
const PUBLIC_IM_DOC_TYPE_LIST = ["im_lite", "mobile_im", "im_pro"];

function isPublishedImDocRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const docType = String(row.document_type || "");
  if (docType === "im_lite_draft") return false;
  if (docType && !PUBLIC_IM_DOC_TYPE_LIST.includes(docType)) return false;
  const status = String(row.status || "");
  if (!PUBLIC_IM_DOC_STATUSES.includes(status)) return false;
  if (row.visibility === "internal_only") return false;
  const body =
    row.body && typeof row.body === "object" ? (row.body as Record<string, unknown>) : null;
  if (body?.is_revoked === true) return false;
  return true;
}

async function hasPublishedWorkspaceIm(
  supabase: ReturnType<typeof createServiceClient>,
  candidateIds: string[]
): Promise<boolean> {
  const uniqueIds = Array.from(
    new Set(candidateIds.map((c) => String(c || "").trim()).filter(Boolean))
  );
  for (const cid of uniqueIds) {
    try {
      const imItem = await getWorkspaceItemByAnyId(supabase, cid, "im");
      if (
        imItem &&
        !imItem.deletedAt &&
        !imItem.revokedAt &&
        PUBLIC_IM_WORKSPACE_STATUS_SET.has(imItem.status)
      ) {
        return true;
      }
    } catch {
      // Pre-cutover or transient lookup fallback
    }
  }
  return false;
}

async function hasPublishedImExistence(
  supabase: ReturnType<typeof createServiceClient>,
  candidateIds: string[]
): Promise<boolean> {
  if (await hasPublishedWorkspaceIm(supabase, candidateIds)) {
    return true;
  }
  const uuidIds = Array.from(
    new Set(candidateIds.map((c) => String(c || "").trim()).filter((c) => isUuid(c)))
  );
  for (const cid of uuidIds) {
    try {
      const res = await supabase
        .from("document_objects")
        .select("id, status, body, document_type, visibility")
        .eq("building_id", cid)
        .in("document_type", PUBLIC_IM_DOC_TYPE_LIST)
        .in("status", [...PUBLIC_IM_DOC_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isPublishedImDocRow(res?.data as Record<string, unknown> | null)) {
        return true;
      }
    } catch {
      // Ignore lookup fallback
    }
  }
  return false;
}

function normalizeSnapshotBrokerProfile(raw: Record<string, unknown>): PublicDealCardBrokerInput {
  const rawReg =
    raw.office_reg_number ??
    raw.officeRegNumber ??
    raw.registrationNo ??
    raw.registration_no ??
    raw.license_number ??
    null;
  const cleanReg =
    typeof rawReg === "string" && rawReg.trim() && rawReg.trim() !== "-" && !/미입력|미등록/.test(rawReg)
      ? rawReg.trim()
      : null;
  const resolvedSpecialty =
    strOrNull(raw.specialty) ||
    strOrNull(raw.company) ||
    strOrNull(raw.office_name) ||
    (cleanReg ? "검증 공인중개사" : null);
  return {
    display_name:
      strOrNull(raw.display_name) ||
      strOrNull(raw.displayName) ||
      strOrNull(raw.card_name) ||
      strOrNull(raw.representative_name) ||
      strOrNull(raw.representativeName) ||
      "담당 중개사",
    phone: strOrNull(raw.phone),
    slug: strOrNull(raw.slug),
    avatar_url: strOrNull(raw.avatar_url) || strOrNull(raw.photoUrl) || strOrNull(raw.photo_url),
    ...(resolvedSpecialty ? { specialty: resolvedSpecialty } : {}),
    company: strOrNull(raw.company),
    office_name: strOrNull(raw.office_name) || strOrNull(raw.officeName),
    office_address: strOrNull(raw.office_address) || strOrNull(raw.officeAddress),
    office_reg_number:
      strOrNull(raw.office_reg_number) ||
      strOrNull(raw.officeRegNumber) ||
      strOrNull(raw.registrationNo) ||
      strOrNull(raw.registration_no) ||
      cleanReg,
    representative_name: strOrNull(raw.representative_name) || strOrNull(raw.representativeName),
    response_guarantee_hours: numOrNull(raw.response_guarantee_hours),
    closed_deals: numOrNull(raw.closed_deals),
    is_licensed: Boolean(raw.is_licensed === true || raw.license_number || cleanReg),
  };
}

async function fetchPublicBrokerProfile(
  supabase: ReturnType<typeof createServiceClient>,
  ownerId: string
): Promise<PublicDealCardBrokerInput | null> {
  if (!ownerId || !supabase || typeof supabase.from !== "function") return null;

  const queryBrokerProfileRow = async () => {
    const full = await supabase
      .from("broker_profiles")
      .select(BROKER_PROFILE_SELECT_FULL)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!full?.error || !isSchemaColumnError(full.error)) return full;

    const core = await supabase
      .from("broker_profiles")
      .select(BROKER_PROFILE_SELECT_CORE)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!core?.error || !isSchemaColumnError(core.error)) return core;

    return await supabase
      .from("broker_profiles")
      .select(BROKER_PROFILE_SELECT_MIN)
      .eq("user_id", ownerId)
      .maybeSingle();
  };

  const queryBaseProfileRow = async () => {
    const full = await supabase
      .from("profiles")
      .select("display_name, phone, company, tagline, photo_url, role")
      .eq("id", ownerId)
      .maybeSingle();
    if (!full?.error || !isSchemaColumnError(full.error)) return full;
    return await supabase
      .from("profiles")
      .select("display_name, phone, company, role")
      .eq("id", ownerId)
      .maybeSingle();
  };

  const [bProfileRes, baseProfileRes] = await Promise.all([
    queryBrokerProfileRow(),
    queryBaseProfileRow(),
  ]);

  const bProfile = (bProfileRes?.data as Record<string, unknown> | null) ?? null;
  const baseProfile = (baseProfileRes?.data as Record<string, unknown> | null) ?? null;
  if (!bProfile && !baseProfile) return null;

  const avatarUrl = strOrNull(bProfile?.photo_url) || strOrNull(baseProfile?.photo_url);
  const displayName =
    strOrNull(baseProfile?.display_name) ||
    strOrNull(bProfile?.card_name) ||
    strOrNull(bProfile?.representative_name) ||
    "담당 중개사";
  const phone = strOrNull(baseProfile?.phone);
  const company = strOrNull(baseProfile?.company);
  const rawSpec = bProfile?.deal_specialty;
  const specStr = Array.isArray(rawSpec)
    ? rawSpec.map((item) => strOrNull(item)).filter(Boolean).join(", ")
    : typeof rawSpec === "string"
    ? rawSpec
    : undefined;
  const rawReg = bProfile?.office_reg_number ?? bProfile?.license_number ?? null;
  const cleanReg =
    typeof rawReg === "string" && rawReg.trim() && rawReg.trim() !== "-" && !/미입력|미등록/.test(rawReg)
      ? rawReg.trim()
      : null;
  const specialty =
    company ||
    specStr ||
    (baseProfile?.tagline ? String(baseProfile.tagline) : null) ||
    "검증 공인중개사";

  return {
    display_name: displayName,
    phone,
    specialty,
    company,
    office_address: strOrNull(bProfile?.office_address),
    office_reg_number: strOrNull(bProfile?.office_reg_number),
    representative_name:
      strOrNull(bProfile?.representative_name) ??
      strOrNull(baseProfile?.display_name) ??
      strOrNull(bProfile?.card_name) ??
      null,
    avatar_url: avatarUrl,
    is_licensed: Boolean(bProfile?.license_number || cleanReg),
    response_guarantee_hours: numOrNull(bProfile?.response_time_hours),
    closed_deals: numOrNull(bProfile?.total_deal_count_self),
    slug: strOrNull(bProfile?.slug),
  };
}

function extractCorrectionNotice(
  raw: unknown
): { message: string; updatedAt?: string } | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? { message: t } : null;
  }
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const msg = strOrNull(rec.message ?? rec.text);
    if (!msg) return null;
    const updatedAt = strOrNull(rec.updatedAt ?? rec.updated_at);
    return updatedAt ? { message: msg, updatedAt } : { message: msg };
  }
  return null;
}

function buildDealCardDataFromQuickRecord(
  quickRec: StoredQuickImRecord,
  extra?: {
    workspaceItemStatus?: string | null;
    blockedReason?: string;
    buildingStatus?: string | null;
    draftOnly?: boolean;
    correctionNotice?: { message: string; updatedAt?: string } | null;
  }
) {
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
    } as Record<string, unknown>,
    signalCard: {
      id: quickRec.buildingId,
      title: `${quickRec.card4.region} ${quickRec.card4.use} ${quickRec.card4.priceBand}`.trim(),
      area_signal: quickRec.card4.region,
      asset_type: quickRec.card4.use,
      price_band: quickRec.card4.priceBand,
      deal_points: quickRec.card4.points,
      body: { shortSummary: quickRec.card4.points.join(" · ") },
      status: extra?.draftOnly ? "draft" : "published",
      visibility: "public",
    } as SignalCardView,
    teaserDoc: {
      status: extra?.draftOnly ? "draft" : "published",
      body: {
        card4: quickRec.card4,
        kakaoOgTitle: quickRec.card4.headline || undefined,
        title: quickRec.card4.headline || `${quickRec.card4.region} ${quickRec.card4.use}`,
        dealPoints: quickRec.card4.points,
        price_band: quickRec.card4.priceBand,
        region_display: quickRec.card4.region,
        key_points: quickRec.card4.points,
      },
    } as TeaserDocView,
    brokerProfile: (quickRec.brokerProfile || quickRec.basicImDoc?.facts?.brokerOffice
      ? (() => {
          const bp = (quickRec.brokerProfile ?? {}) as Record<string, unknown>;
          const bo = (quickRec.basicImDoc?.facts?.brokerOffice ?? {}) as Record<string, unknown>;
          const bpPhone = strOrNull(bp.phone);
          const boPhone = strOrNull(bo.phone);
          return {
            display_name: strOrNull(bp.displayName) || strOrNull(bo.representative) || "담당 중개사",
            phone:
              (bpPhone && bpPhone !== "-" ? bpPhone : null) ||
              (boPhone && boPhone !== "-" ? boPhone : null),
            specialty: strOrNull(bp.company) || strOrNull(bo.name) || "검증 공인중개사",
            company: strOrNull(bp.company) || strOrNull(bp.officeName) || strOrNull(bo.name),
            office_address:
              strOrNull(bp.officeAddress) ||
              strOrNull(bp.office_address) ||
              strOrNull(bo.address) ||
              strOrNull(bo.officeAddress),
            office_reg_number:
              strOrNull(bp.registrationNo) ||
              strOrNull(bp.office_reg_number) ||
              strOrNull(bo.registrationNo),
            representative_name:
              strOrNull(bp.representativeName) ||
              strOrNull(bp.representative_name) ||
              strOrNull(bo.representative) ||
              strOrNull(bp.displayName),
            avatar_url: strOrNull(bp.photoUrl),
            is_licensed: Boolean(bp.registrationNo || bp.office_reg_number || bo.registrationNo),
            response_guarantee_hours: null,
            closed_deals: null,
            slug: strOrNull(bp.slug),
          };
        })()
      : null) as PublicDealCardBrokerInput | null,
    hasImDoc: Boolean(
      quickRec.basicImDoc &&
        typeof quickRec.basicImDoc === "object" &&
        "facts" in quickRec.basicImDoc &&
        quickRec.basicImDoc.facts
    ),
    isPptxApproved: Boolean(
      quickRec.basicImDoc &&
        typeof quickRec.basicImDoc === "object" &&
        "facts" in quickRec.basicImDoc &&
        quickRec.basicImDoc.facts
    ),
    pptxDownloadUrl: `/api/public/im-lite/${quickRec.buildingId}/pptx`,
    ownerId: quickRec.ownerId ?? null,
    buildingStatus: (extra?.buildingStatus ?? "public_signal_ready") as string | null,
    workspaceItemStatus: (extra?.workspaceItemStatus ?? null) as string | null,
    blockedReason: extra?.blockedReason as string | undefined,
    correctionNotice: extra?.correctionNotice ?? null,
  };
}

function synthesizeReadOnlyQuickRecord(
  rawId: string,
  matched: LegacyDealCardActivityEvent
): StoredQuickImRecord {
  const card4 = matched.metadata!.card4!;
  return {
    buildingId: rawId,
    documentId: rawId,
    ownerId: matched.actor_id ?? undefined,
    buildingName: String(card4.headline || ""),
    address: String(card4.region || ""),
    askingPriceManwon: 0,
    posture: String(card4.posture || "income"),
    card4,
    brokerProfile: matched.metadata?.broker_profile as StoredQuickImRecord["brokerProfile"],
    rentRoll: [],
    fullDocBody: { ssot_summary: card4 },
    basicImDoc: {} as unknown as StoredQuickImRecord["basicImDoc"],
    createdAt: String(matched.created_at || new Date().toISOString()),
    updatedAt: String(matched.created_at || new Date().toISOString()),
  };
}

// ── 데이터 조회 ──
/**
 * WP-7.3C P1-1: legacy activity_events fallback must never present an unpublished
 * draft as published. A legacy card is public only when the latest lifecycle
 * transition is an explicit `dealcard_sent` (written by the gated publish paths);
 * `dealcard_upserted` (draft save) / `dealcard_restored` (restore → draft) alone
 * yield an owner-only draft preview.
 */
const DEALCARD_LIFECYCLE_EVENT_TYPES = new Set([
  "dealcard_upserted",
  "dealcard_sent",
  "dealcard_restored",
  "dealcard_deleted",
]);

function isVerifiedLifecycleActivityEvent(
  ev: LegacyDealCardActivityEvent | null | undefined
): boolean {
  if (!ev) return false;
  const evType = String(ev.event_type || "");
  if (DEALCARD_LIFECYCLE_EVENT_TYPES.has(evType)) {
    return Boolean(ev.actor_id);
  }
  return true;
}

function resolveLegacyEventPublication(matchingActs: LegacyDealCardActivityEvent[]): {
  matched: LegacyDealCardActivityEvent | null;
  isExplicitlySent: boolean;
} {
  const verifiedActs = matchingActs.filter(isVerifiedLifecycleActivityEvent);
  const matched =
    verifiedActs.find(
      (a) =>
        (a?.event_type === "dealcard_upserted" ||
          a?.event_type === "dealcard_sent" ||
          a?.event_type === "dealcard_restored") &&
        Boolean(a?.metadata?.card4)
    ) ?? null;
  const latestTransition = verifiedActs.find((a) =>
    ["dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(String(a?.event_type || ""))
  );
  const isExplicitlySent =
    latestTransition?.event_type === "dealcard_sent" ||
    (latestTransition?.event_type !== "dealcard_deleted" &&
      latestTransition?.event_type !== "dealcard_restored" &&
      ["sent", "published"].includes(String(matched?.metadata?.status || "")));
  return { matched, isExplicitlySent };
}

function legacyEventExtra(
  isExplicitlySent: boolean,
  guard: { workspaceItemStatus: string | null; reason?: string }
): { workspaceItemStatus?: string | null; blockedReason?: string; buildingStatus?: string | null; draftOnly?: boolean } {
  if (isExplicitlySent) {
    return { workspaceItemStatus: guard.workspaceItemStatus, blockedReason: guard.reason };
  }
  return {
    workspaceItemStatus: "draft",
    blockedReason: guard.reason ?? "not_published",
    buildingStatus: "draft",
    draftOnly: true,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildRedirectQueryString(
  sParams: { [key: string]: string | string[] | undefined }
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sParams)) {
    if (typeof v === "string") {
      qs.append(k, v);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") qs.append(k, item);
      }
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

// P0-SEC: React cache() — generateMetadata 와 page 가 같은 요청에서 한 번만 조회한다
// (readWithMigration 의 lazy-write 부수효과 중복 방지).
const getDealCardData = cache(async (id: string) => {
  const emptyData = {
    building: {} as Record<string, unknown>,
    signalCard: null as SignalCardView | null,
    teaserDoc: null as TeaserDocView | null,
    brokerProfile: null as PublicDealCardBrokerInput | null,
    hasImDoc: false,
    isPptxApproved: false,
    pptxDownloadUrl: `/api/public/im-lite/${id}/pptx`,
    ownerId: null as string | null,
    buildingStatus: "archived" as string | null,
    workspaceItemStatus: null as string | null,
    blockedReason: undefined as string | undefined,
    correctionNotice: null as { message: string; updatedAt?: string } | null,
    canonicalBuildingId: null as string | null,
  };

  const memoryFallbackAllowed = allowDealPublicMemoryFallback();
  if (
    memoryFallbackAllowed &&
    (isDealCardDeleted(id) ||
      Boolean(getInboxState().revokedBuildings[id]?.revoked) ||
      isBuildingShareLinkRevoked(id))
  ) {
    return { ...emptyData, buildingStatus: "archived", workspaceItemStatus: "revoked", blockedReason: "revoked" };
  }

  const supabase = createServiceClient();
  const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
  let canonicalBuildingId: string | null =
    guard.item?.buildingId && UUID_RE.test(guard.item.buildingId)
      ? guard.item.buildingId
      : null;
  if (!canonicalBuildingId && id.startsWith("bld-") && !guard.blocked && !guard.item) {
    try {
      const wsAny = await getWorkspaceItemByAnyId(supabase, id);
      if (
        wsAny &&
        !wsAny.deletedAt &&
        wsAny.status !== "archived" &&
        wsAny.buildingId &&
        UUID_RE.test(wsAny.buildingId)
      ) {
        canonicalBuildingId = wsAny.buildingId;
      }
    } catch {
      // Non-blocking fallback
    }
  }
  if (
    guard.blocked &&
    (guard.reason === "demo_disabled_prod" || guard.reason === "deleted" || guard.reason === "lookup_failed")
  ) {
    // WP-7.3C P1-1: lookup_failed = unexpected workspace_items DB error → fail closed (404).
    return {
      ...emptyData,
      buildingStatus: "archived",
      workspaceItemStatus: "archived",
      blockedReason: guard.reason,
    };
  }
  if (guard.blocked && guard.reason === "revoked") {
    return {
      ...emptyData,
      ownerId: guard.ownerId,
      buildingStatus: "archived",
      workspaceItemStatus: "revoked",
      blockedReason: "revoked",
      canonicalBuildingId,
    };
  }

  // Prefer canonical workspace_items projection when available (published_snapshot for public;
  // draftPayloadForOwnerOnly strictly hidden behind !isPublicDealCard for owner preview only).
  const activeSnapshot = guard.projection?.snapshot || (guard.reason === "not_published" ? guard.draftPayloadForOwnerOnly : null);
  if (guard.item && activeSnapshot) {
    const snap = activeSnapshot as Record<string, unknown>;
    const rawSnapCard4 =
      snap.card4 && typeof snap.card4 === "object"
        ? (snap.card4 as Record<string, unknown>)
        : null;
    const snapHeadline =
      strOrNull(rawSnapCard4?.headline) || strOrNull(snap.headline) || guard.item.title;
    const snapRegion =
      strOrNull(rawSnapCard4?.region) ||
      strOrNull(snap.region) ||
      strOrNull(snap.area_signal) ||
      guard.item.address ||
      "";
    const snapUse =
      strOrNull(rawSnapCard4?.use) || strOrNull(snap.use) || strOrNull(snap.asset_type) || "";
    const snapPriceBand =
      strOrNull(rawSnapCard4?.priceBand) ||
      strOrNull(snap.priceBand) ||
      strOrNull(snap.price_band) ||
      guard.item.priceBand ||
      "";
    const snapArea =
      strOrNull(rawSnapCard4?.area) || strOrNull(snap.area) || strOrNull(snap.size_signal) || "";
    const snapPoints = Array.isArray(rawSnapCard4?.points)
      ? rawSnapCard4.points
      : Array.isArray(snap.points)
      ? snap.points
      : [];
    const snapPosture = strOrNull(rawSnapCard4?.posture) || strOrNull(snap.posture) || "income";
    const snapCard4 = rawSnapCard4
      ? {
          ...rawSnapCard4,
          headline: snapHeadline,
          region: snapRegion,
          use: snapUse,
          priceBand: snapPriceBand,
          area: snapArea,
          points: snapPoints,
          posture: snapPosture,
        }
      : {
          headline: snapHeadline,
          region: snapRegion,
          use: snapUse,
          priceBand: snapPriceBand,
          area: snapArea,
          points: snapPoints,
          posture: snapPosture,
        };
    const isPublishedProjection = Boolean(guard.projection?.snapshot);
    const rawSnapshotProfile = snap.brokerProfile || snap.broker_profile || null;
    let resolvedBrokerProfile: PublicDealCardBrokerInput | null =
      rawSnapshotProfile && typeof rawSnapshotProfile === "object"
        ? normalizeSnapshotBrokerProfile(rawSnapshotProfile as Record<string, unknown>)
        : null;
    if (!resolvedBrokerProfile && guard.ownerId) {
      resolvedBrokerProfile = await fetchPublicBrokerProfile(supabase, guard.ownerId);
    } else if (
      resolvedBrokerProfile &&
      guard.ownerId &&
      (!resolvedBrokerProfile.office_reg_number && !resolvedBrokerProfile.officeRegNumber)
    ) {
      const dbProfile = await fetchPublicBrokerProfile(supabase, guard.ownerId);
      if (dbProfile) {
        resolvedBrokerProfile = {
          ...dbProfile,
          ...resolvedBrokerProfile,
          avatar_url: resolvedBrokerProfile.avatar_url || dbProfile.avatar_url || null,
          is_licensed: Boolean(resolvedBrokerProfile.is_licensed || dbProfile.is_licensed),
        };
      }
    }
    return {
      building: {
        id: guard.item.buildingId || guard.item.id,
        area_signal: snapRegion,
        asset_type: snapUse,
        price_band: snapPriceBand,
        size_signal: snapArea,
        investment_posture: snapPosture,
        is_verified: Boolean(snap.is_verified),
      } as Record<string, unknown>,
      signalCard: {
        id: guard.item.id,
        title: snapHeadline,
        area_signal: snapRegion,
        asset_type: snapUse,
        price_band: snapPriceBand,
        deal_points: snapPoints,
        status: isPublishedProjection ? "published" : "draft",
        visibility: "public_blind",
      } as SignalCardView,
      teaserDoc: {
        status: isPublishedProjection ? "published" : "draft",
        body: {
          card4: snapCard4,
          ogTitle: snapHeadline,
        },
      } as TeaserDocView,
      brokerProfile: resolvedBrokerProfile,
      hasImDoc: await hasPublishedImExistence(supabase, [
        guard.item.buildingId || "",
        guard.item.legacyId || "",
        id,
      ]),
      isPptxApproved: Boolean(snap.isPptxApproved),
      pptxDownloadUrl: `/api/public/im-lite/${guard.item.buildingId || guard.item.legacyId || id}/pptx`,
      ownerId: guard.ownerId,
      buildingStatus: isPublishedProjection ? "public_signal_ready" : "draft",
      workspaceItemStatus: guard.workspaceItemStatus,
      blockedReason: guard.reason,
      correctionNotice: extractCorrectionNotice(guard.item.correctionNotice),
      canonicalBuildingId,
    };
  }

  const quickRec = memoryFallbackAllowed ? getQuickImRecord(id) : undefined;
  if (quickRec?.isRevoked) {
    return { ...emptyData, buildingStatus: "archived", workspaceItemStatus: "revoked", blockedReason: "revoked" };
  }
  if (quickRec && quickRec.ownerId) {
    return buildDealCardDataFromQuickRecord(quickRec, {
      workspaceItemStatus: guard.workspaceItemStatus,
      blockedReason: guard.reason,
    });
  }

  if (!isUuid(id)) {
    try {
      let actQuery = supabase
        .from("activity_events")
        .select("actor_id, entity_id, event_type, metadata, created_at") as unknown as ActivityEventQueryLike;
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
        (a) =>
          String(a?.metadata?.building_id || a?.entity_id || "").trim() === id &&
          isVerifiedLifecycleActivityEvent(a)
      );
      const latestLifecycle = matchingActs.find((a) =>
        ["dealcard_upserted", "dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(
          String(a?.event_type || "")
        )
      );
      const latestRevoke = matchingActs.find((a) =>
        ["link_revoked", "link_restored"].includes(String(a?.event_type || ""))
      );
      if (
        latestLifecycle?.event_type === "dealcard_deleted" ||
        latestRevoke?.event_type === "link_revoked"
      ) {
        return { ...emptyData, buildingStatus: "archived" };
      }

      const { matched, isExplicitlySent } = resolveLegacyEventPublication(matchingActs);
      if (matched && matched.metadata?.card4) {
        const legacyExtra = legacyEventExtra(isExplicitlySent, guard);
        // Only hydrate the memory store with explicitly sent cards (a hydrated draft
        // would otherwise be re-served as published by the quickRec branch above).
        if (memoryFallbackAllowed && isExplicitlySent) {
          const hydrated = updateQuickImCard4(id, matched.metadata.card4, {
            ownerId: matched.actor_id ?? undefined,
            brokerProfile: matched.metadata.broker_profile as StoredQuickImRecord["brokerProfile"],
          });
          if (hydrated) {
            return buildDealCardDataFromQuickRecord(hydrated, legacyExtra);
          }
        }
        return buildDealCardDataFromQuickRecord(
          synthesizeReadOnlyQuickRecord(String(id), matched),
          legacyExtra
        );
      }

      if (memoryFallbackAllowed) {
        const synthesizedNonUuid = await resolveOrSynthesizeQuickImRecord(id, supabase);
        if (synthesizedNonUuid) {
          return buildDealCardDataFromQuickRecord(synthesizedNonUuid, {
            workspaceItemStatus: guard.workspaceItemStatus,
            blockedReason: guard.reason,
          });
        }
      }
    } catch {
      // ignore if activity_events unavailable
    }

    if (quickRec) {
      return buildDealCardDataFromQuickRecord(quickRec);
    }

    const rawIdStr = String(id);
    if (rawIdStr.startsWith("bld-") || rawIdStr.startsWith("quick-")) {
      return { ...emptyData, buildingStatus: "archived" };
    }
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
      .select("body, status")
      .eq("building_id", targetBuildingId)
      .eq("document_type", "blind_teaser")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // IM 문서 존재 여부 및 공식 승인 상태 확인 (published IM만 허용 — im_lite_draft/미발행 초안 제외)
    supabase
      .from("document_objects")
      .select("id, status, body, document_type, visibility")
      .eq("building_id", targetBuildingId)
      .in("document_type", PUBLIC_IM_DOC_TYPE_LIST)
      .in("status", [...PUBLIC_IM_DOC_STATUSES])
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
          .select("body, status")
          .eq("building_id", targetBuildingId)
          .eq("document_type", "blind_teaser")
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("document_objects")
          .select("id, status, body, document_type, visibility")
          .eq("building_id", targetBuildingId)
          .in("document_type", PUBLIC_IM_DOC_TYPE_LIST)
          .in("status", [...PUBLIC_IM_DOC_STATUSES])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    } else if (quickRec) {
      return buildDealCardDataFromQuickRecord(quickRec, {
        workspaceItemStatus: guard.workspaceItemStatus,
        blockedReason: guard.reason,
      });
    } else {
      const synthesized = memoryFallbackAllowed
        ? await resolveOrSynthesizeQuickImRecord(id, supabase)
        : null;
      if (synthesized) {
        return buildDealCardDataFromQuickRecord(synthesized, {
          workspaceItemStatus: guard.workspaceItemStatus,
          blockedReason: guard.reason,
        });
      }
      try {
        let actQuery = supabase
          .from("activity_events")
          .select("actor_id, entity_id, event_type, metadata, created_at") as unknown as ActivityEventQueryLike;
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
          (a) =>
            String(a?.metadata?.building_id || a?.entity_id || "").trim() === id &&
            isVerifiedLifecycleActivityEvent(a)
        );
        const latestLifecycle = matchingActs.find((a) =>
          ["dealcard_upserted", "dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(
            String(a?.event_type || "")
          )
        );
        const latestRevoke = matchingActs.find((a) =>
          ["link_revoked", "link_restored"].includes(String(a?.event_type || ""))
        );
        if (
          latestLifecycle?.event_type === "dealcard_deleted" ||
          latestRevoke?.event_type === "link_revoked"
        ) {
          return { ...emptyData, buildingStatus: "archived", workspaceItemStatus: "revoked", blockedReason: "revoked" };
        }
        const { matched, isExplicitlySent } = resolveLegacyEventPublication(matchingActs);
        if (matched && matched.metadata?.card4) {
          const legacyExtra = legacyEventExtra(isExplicitlySent, guard);
          if (memoryFallbackAllowed && isExplicitlySent) {
            const hydrated = updateQuickImCard4(id, matched.metadata.card4, {
              ownerId: matched.actor_id ?? undefined,
              brokerProfile: matched.metadata.broker_profile as StoredQuickImRecord["brokerProfile"],
            });
            if (hydrated) {
              return buildDealCardDataFromQuickRecord(hydrated, legacyExtra);
            }
          }
          return buildDealCardDataFromQuickRecord(
            synthesizeReadOnlyQuickRecord(String(id), matched),
            legacyExtra
          );
        }
      } catch {
        // ignore if activity_events unavailable
      }
    }
  }

  const ownerId: string | null = ssotMetaRes.data?.owner_id ?? null;
  const isTeaserRevoked = Boolean(
    (teaserDocRes.data?.body as Record<string, unknown> | undefined)?.is_revoked === true
  );
  const buildingStatus: string | null = isTeaserRevoked
    ? "archived"
    : (ssotMetaRes.data?.status ?? null);

  let brokerProfile: PublicDealCardBrokerInput | null = null;
  if (ownerId) {
    brokerProfile = await fetchPublicBrokerProfile(supabase, ownerId);
  }

  const imDocRow = imDocRes.data as Record<string, unknown> | null;
  const imDocBody = (imDocRow?.body as Record<string, unknown> | undefined) ?? {};
  const imApprovalStage =
    imDocRow?.approval_stage ?? imDocBody.approval_stage;
  const imPptxHash =
    imDocRow?.pptx_file_hash ?? imDocBody.pptx_file_hash;
  const imPptxDownloadUrl =
    (typeof imDocRow?.pptx_download_url === "string" ? imDocRow.pptx_download_url : undefined) ??
    (typeof imDocBody.pptx_download_url === "string" ? imDocBody.pptx_download_url : undefined);
  const hasPublishedImDoc = isPublishedImDocRow(imDocRow);
  const hasImDoc =
    hasPublishedImDoc || (await hasPublishedWorkspaceIm(supabase, [targetBuildingId, id]));
  const isPptxApproved =
    hasPublishedImDoc &&
    (imApprovalStage === 'S70_FILE_APPROVAL' ||
      (imDocRes.data?.status === 'published' && !!imPptxHash));
  const pptxDownloadUrl = imPptxDownloadUrl || `/api/public/im-lite/${id}/pptx`;

  return {
    building: ((buildingRes as { data?: unknown } | null)?.data ?? buildingRes ?? {}) as Record<string, unknown>,
    signalCard: (signalCardRes.data as SignalCardView | null) ?? null,
    teaserDoc: (teaserDocRes.data as TeaserDocView | null) ?? null,
    brokerProfile,
    hasImDoc,
    isPptxApproved,
    pptxDownloadUrl,
    ownerId,
    buildingStatus,
    workspaceItemStatus: guard.workspaceItemStatus,
    blockedReason: guard.reason,
    correctionNotice: extractCorrectionNotice(guard.item?.correctionNotice),
    canonicalBuildingId,
  };
});

type DealCardData = Awaited<ReturnType<typeof getDealCardData>>;

function PostureMeta(props: { input: DealCardData extends never ? never : unknown }) {
  void props.input;
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
  if (data.blockedReason === "demo_disabled_prod" || data.blockedReason === "deleted" || data.blockedReason === "revoked") {
    return false;
  }
  return evaluateDealCardPublicVisibility({
    buildingStatus: data.buildingStatus,
    signalCardVisibility: data.signalCard?.visibility,
    signalCardStatus: data.signalCard?.status,
    teaserDocStatus: data.teaserDoc?.status,
    workspaceItemStatus: data.workspaceItemStatus,
  }).isPublic;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getDealCardData(id);

  // P0-SEC: 비공개(archived / internal_only) 딜카드는 크롤러에 어떤 내용도 노출하지 않는다.
  if (!isPublicDealCard(data)) {
    return {
      title: { absolute: "비공개 매물 안내 | 크리딜" },
      description: "담당 중개사가 비공개로 전환한 매물 안내입니다.",
      robots: { index: false, follow: false },
    };
  }

  const { og } = projectPublic(id, data);
  const ogTitle = og.title;
  const ogDescription = og.description || "상업용 부동산 비공개 매각 티저 — 담당 중개사 직통 문의";

  const siteUrl = getCanonicalSiteUrl();
  const teaserCard4 = (data.teaserDoc?.body as Record<string, unknown> | undefined)?.card4 as
    | Record<string, unknown>
    | undefined;
  const card4Hash = typeof teaserCard4?.card4_hash === "string" ? teaserCard4.card4_hash : undefined;
  const absoluteOgImage = `${siteUrl}/api/og/deal/${id}/kakao-v2${card4Hash ? `?v=${encodeURIComponent(card4Hash)}` : ''}`;

  return {
    title: { absolute: `${ogTitle} | 크리딜 DealCard` },
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "article",
      images: [
        {
          url: absoluteOgImage,
          width: 1200,
          height: 630,
          alt: ogTitle,
        }
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [absoluteOgImage],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : {};
  const isPreviewMode = sParams.preview === "1" || sParams.preview === "true";
  const shareToken = typeof sParams.token === "string" ? sParams.token.trim() : "";
  const data = await getDealCardData(id);

  // Deleted / archived / prod-disabled demo seeds are blocked for everyone.
  if (
    data.blockedReason === "demo_disabled_prod" ||
    data.blockedReason === "deleted" ||
    data.workspaceItemStatus === "archived"
  ) {
    notFound();
  }

  const canonicalBuildingId =
    "canonicalBuildingId" in data && typeof data.canonicalBuildingId === "string"
      ? data.canonicalBuildingId
      : null;
  if (
    id.startsWith("bld-") &&
    canonicalBuildingId &&
    UUID_RE.test(canonicalBuildingId) &&
    canonicalBuildingId !== id
  ) {
    redirect(`/dc/${canonicalBuildingId}${buildRedirectQueryString(sParams)}`);
  }

  // Verify optional ?token= when provided.
  if (shareToken) {
    const tokenCheck = await verifyShareLinkToken({ token: shareToken, buildingId: id });
    if (!tokenCheck.valid) {
      const viewer = await getServerViewer();
      if (!isOwnerOrAdmin(viewer, data.ownerId)) notFound();
    }
  }

  // P0-SEC: 비공개 상태(building archived / signal card internal_only·archived / revoked / draft)는 공개 404.
  // 소유 중개사(또는 admin)는 인증 쿠키로 확인되어 계속 볼 수 있다 (revoked/draft preview).
  if (
    data.workspaceItemStatus === "revoked" ||
    data.blockedReason === "revoked" ||
    !isPublicDealCard(data)
  ) {
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
      <main className="min-h-screen bg-[#F3F2EE] text-slate-900 flex items-center justify-center p-4">
        <div className="max-w-[392px] w-full bg-white border border-slate-300 rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <h1 className="text-lg font-bold text-slate-950">매물 안내 준비 중</h1>
          <p className="text-base text-slate-700 break-keep">
            담당 중개사가 매물 정보를 정리하고 있습니다. 잠시 후 다시 확인해 주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F3F2EE] text-slate-900 pb-12">
      <TeaserEventTracker teaserConfigId={card.teaserConfigId} />
      <PostureMeta input={card.postureWidget} />

      <div className="max-w-[420px] mx-auto px-4 pt-4 space-y-4">
        <InAppBrowserBanner />

        {data.correctionNotice?.message ? (
          <section
            role="status"
            data-testid="public-dealcard-correction-notice"
            className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3.5 shadow-sm space-y-1"
          >
            <p className="text-sm font-extrabold text-amber-900">
              📢 담당 개업공인중개사 정정 안내
            </p>
            <p className="text-base font-medium text-slate-900 break-keep leading-relaxed">
              {data.correctionNotice.message}
            </p>
          </section>
        ) : null}

        {/* 상단 글자 크기 조절 바 (60~70대 매수인 배려) */}
        <div
          data-testid="public-dealcard-top-bar"
          className="flex items-center justify-between gap-2"
        >
          <span className="text-sm font-bold text-slate-800 tracking-tight">
            매물 핵심 요약
          </span>
          <ReaderFontScaleToggle variant="light" />
        </div>

        {/* 상단 4항목 요약 (지역 · 용도 · 면적 · 가격) + 한 줄 제목 */}
        <section
          data-testid="public-dealcard-4fact-header"
          className="rounded-xl bg-white border border-slate-300 p-4 space-y-3 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2 text-center text-base font-extrabold">
            <div className="py-2.5 px-3 rounded-lg bg-slate-100 text-slate-950 border border-slate-200 break-keep">
              {hero.regionLabel || "—"}
            </div>
            <div className="py-2.5 px-3 rounded-lg bg-sky-50 text-sky-900 border border-sky-200 break-keep">
              {useDisplay}
            </div>
            <div className="py-2.5 px-3 rounded-lg bg-slate-100 text-slate-900 border border-slate-200 break-keep">
              {areaDisplay}
            </div>
            <div className="py-2.5 px-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 break-keep">
              {hero.bandedPrice || "—"}
            </div>
          </div>
          {/* 한 줄 제목: 중개사 편집기 card4.headline 이 1순위 (toPublicDealCard og.title) — 18자 교정 · 줄바꿈 안전 */}
          <DealCardLineText
            as="h1"
            testId="public-dealcard-title"
            text={og.title || hero.title}
            className="text-lg font-extrabold text-slate-950 text-center pt-1"
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
              className="rounded-xl bg-white border border-slate-300 p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-extrabold text-amber-800 tracking-wide">
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
                      className="rounded-lg border border-l-4 px-4 py-3.5 shadow-sm text-slate-900 flex items-center gap-3"
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
          officeName={broker.officeName ?? undefined}
          officeAddress={broker.officeAddress ?? undefined}
          officeRegNumber={broker.officeRegNumber ?? undefined}
          representativeName={broker.representativeName ?? undefined}
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
          <LazyQaFeedbackPinWidget workspace="public-dealcard" requireExplicitQueryParam />
        </Suspense>
      )}
    </main>
  );
}


