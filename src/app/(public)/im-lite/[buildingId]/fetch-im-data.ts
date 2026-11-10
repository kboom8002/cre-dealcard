/**
 * Server-side data fetcher for /im-lite/[buildingId] page.
 *
 * Directly queries Supabase instead of calling the API route,
 * avoiding self-fetch deadlocks in Vercel serverless.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { getDemoMobileIM } from "@/lib/demo/mobile-im-demo-data";
import { computeDataQualityBadge } from "@/domain/building/mobile-im/data-quality-badge";
import { resolveEnrichment } from "@/domain/building/im-core/resolve-enrichment";
import { stripLegacyNameMask } from "@/domain/building/mobile-im/guardrails";
import { getTierAllowedSections, TIER_CONFIG, type ReleaseTier } from "@/domain/building/im-core/release-tier";
import type { MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";
import { buildKakaoStaticMapUrl } from "@/lib/external/kakao-static-map";
import { normalizeSectionMarkdown } from "@/lib/utils/markdown-normalizer";
import { isOwnerOrAdmin, type Viewer } from "@/domain/public-projection/access";
import { isBuildingStatusPublic, isImDocStatusPublic } from "@/domain/public-projection/visibility";
import {
  getInboxState,
  getQuickImRecord,
  isUuid,
  resolveOrSynthesizeQuickImRecord,
  synthesizeQuickRecordFromImItem,
  type StoredQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import { verifyShareLinkToken, isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";

function isValidPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (!t || t.startsWith("blob:") || t.includes("/test-images/dangsan")) return false;
  return (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("/") ||
    t.startsWith("data:")
  );
}

function formatAxiosHighlights(rawHighlights: unknown): string[] {
  if (!Array.isArray(rawHighlights)) return [];
  return rawHighlights
    .map((h: any) =>
      typeof h === "string"
        ? h.trim()
        : [h?.headline, h?.brief].filter(Boolean).join(" — ").trim()
    )
    .filter((s) => s.length > 0);
}

function isValidKoreanCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33.0 && lat <= 43.0 && lng >= 124.0 && lng <= 132.0;
}

// ─── Geocode: 주소 → 좌표 변환 (Kakao Local API, 한국 주소 정확도 높음) ────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (KAKAO_KEY) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(3000) }
      );
      const data = await res.json();
      if (data.documents?.[0]) {
        const lat = parseFloat(data.documents[0].y);
        const lng = parseFloat(data.documents[0].x);
        if (isValidKoreanCoord(lat, lng)) {
          return { lat, lng };
        }
      }
      // 주소 검색 실패 시 키워드 검색 fallback
      const res2 = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(3000) }
      );
      const data2 = await res2.json();
      if (data2.documents?.[0]) {
        const lat = parseFloat(data2.documents[0].y);
        const lng = parseFloat(data2.documents[0].x);
        if (isValidKoreanCoord(lat, lng)) {
          return { lat, lng };
        }
      }
    } catch (err) { console.warn('[fetch-im-data]', err); }
  }
  // Kakao 실패 시 Nominatim fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`,
      { headers: { 'User-Agent': 'credeal.net/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.[0]?.lat && data?.[0]?.lon) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (isValidKoreanCoord(lat, lng)) {
        return { lat, lng };
      }
    }
  } catch (err) { console.warn('[fetch-im-data]', err); }
  return null;
}

function buildBrokerObject(profile: any) {
  if (!profile) {
    return {
      userId: "system",
      displayName: "담당 중개인",
      company: "",
      phone: "",
      tagline: "",
      photoUrl: "/default-avatar.png",
      slug: "cre-dealcard-default",
      vibeTemplateId: "default",
      specialtyRegions: [] as string[],
      specialtyAssets: [] as string[],
      bio: null as string | null,
      vibeVector: null as Record<string, number> | null,
      vibeVti: null as string | null,
      vibeComplement: null as Record<string, number> | null,
      vibeValence: null as number | null,
      vibeTrust: null as number | null,
      vibeAnalyzedAt: null as string | null,
      logoCompanyUrl: null as string | null,
      logoPartnerUrl: null as string | null,
      latestMagazine: null as { date: string; headline: string; url: string; marketTemp?: string } | null,
    };
  }
  return {
    userId: profile.id || profile.user_id || "system",
    displayName: profile.display_name || profile.name || "담당 중개인",
    company: profile.company || "", // 실제 DB 값만 (가공 상호 폴백 금지 — Rule 34)
    phone: profile.phone || "",
    tagline: profile.tagline || "",
    photoUrl: profile.photo_url || "/default-avatar.png",
    slug: profile.slug || "cre-dealcard-default",
    vibeTemplateId: profile.vibe_template_id || "default",
    specialtyRegions: (profile.specialty_regions as string[]) ?? [],
    specialtyAssets: (profile.specialty_assets as string[]) ?? [],
    bio: (profile.bio as string) ?? null,
    vibeVector: (profile.vibe_vector as Record<string, number>) ?? null,
    vibeVti: (profile.vibe_vti as string) ?? null,
    vibeComplement: (profile.vibe_complement as Record<string, number>) ?? null,
    vibeValence: (profile.vibe_valence as number) ?? null,
    vibeTrust: (profile.vibe_trust as number) ?? null,
    vibeAnalyzedAt: (profile.vibe_analyzed_at as string) ?? null,
    logoCompanyUrl: (profile.logo_company_url as string) ?? null,
    logoPartnerUrl: (profile.logo_partner_url as string) ?? null,
    contactEmail: (profile.contact_email as string) ?? null,
    latestMagazine: null as { date: string; headline: string; url: string; marketTemp?: string } | null,
  };
}

/**
 * owner_id로 프로필을 조회. profiles + broker_profiles를 병합하여 slug/vibe를 확보.
 */
async function fetchBrokerProfile(supabase: any, ownerId: string) {
  // 두 테이블을 동시에 조회
  const [{ data: profile }, { data: brokerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, company, phone, tagline, photo_url")
      .eq("id", ownerId)
      .single(),
    supabase
      .from("broker_profiles")
      .select("user_id, name, slug, vibe_template_id, avatar_url, photo_url, specialty_regions, specialty_assets, bio, vibe_vector, vibe_vti, vibe_complement, vibe_valence, vibe_trust, vibe_analyzed_at, logo_company_url, logo_partner_url, contact_email")
      .eq("user_id", ownerId)
      .single(),
  ]);

  if (!profile && !brokerProfile) return null;

  // broker_profiles가 없으면 profiles 정보로 자동 생성 (비블로킹)
  let slug = brokerProfile?.slug || null;
  if (!brokerProfile && profile) {
    const baseName = (profile.display_name || ownerId.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    slug = `${slugBase}-${ownerId.substring(0, 6)}`;
    
    // broker_profiles 자동 생성 (비블로킹)
    void supabase
      .from("broker_profiles")
      .upsert({
        user_id: ownerId,
        name: profile.display_name || "중개인",
        slug,
        photo_url: profile.photo_url || null,
      }, { onConflict: "user_id" })
      .then(
        () => {},
        (e: any) => console.error('[fetch-im-data] broker_profiles upsert failed:', e)
      );
  } else if (brokerProfile && !slug) {
    // broker_profiles는 있지만 slug가 없는 경우
    const baseName = (profile?.display_name || brokerProfile?.name || ownerId.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    slug = `${slugBase}-${ownerId.substring(0, 6)}`;
    
    void supabase
      .from("broker_profiles")
      .update({ slug })
      .eq("user_id", ownerId)
      .then(
        () => {},
        (e: any) => console.error('[fetch-im-data] broker_profiles slug update failed:', e)
      );
  }

  // profiles + broker_profiles 병합 (phone, company, tagline은 profiles에서)
  return {
    id: ownerId,
    display_name: profile?.display_name || brokerProfile?.name || "담당 중개인",
    company: profile?.company || "",
    phone: profile?.phone || "",
    tagline: profile?.tagline || "",
    photo_url: profile?.photo_url || brokerProfile?.avatar_url || brokerProfile?.photo_url || "/default-avatar.png",
    slug: slug || "cre-dealcard-default",
    vibe_template_id: brokerProfile?.vibe_template_id || "default",
    // Vibe & professional data
    specialty_regions: brokerProfile?.specialty_regions ?? null,
    specialty_assets: brokerProfile?.specialty_assets ?? null,
    bio: brokerProfile?.bio ?? null,
    vibe_vector: brokerProfile?.vibe_vector ?? null,
    vibe_vti: brokerProfile?.vibe_vti ?? null,
    vibe_complement: brokerProfile?.vibe_complement ?? null,
    vibe_valence: brokerProfile?.vibe_valence ?? null,
    vibe_trust: brokerProfile?.vibe_trust ?? null,
    vibe_analyzed_at: brokerProfile?.vibe_analyzed_at ?? null,
    // Logo URLs
    logo_company_url: brokerProfile?.logo_company_url ?? null,
    logo_partner_url: brokerProfile?.logo_partner_url ?? null,
    // Contact email
    contact_email: await (async () => {
      const emailVal = (brokerProfile as any)?.contact_email;
      if (emailVal) return emailVal;
      if (!ownerId) return null;
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(ownerId);
        return user?.email ?? null;
      } catch (err) {
        console.error("[fetch-im-data] Failed to fetch auth email fallback:", err);
        return null;
      }
    })(),
  };
}

/**
 * 브로커의 최신 매거진을 조회하여 broker 객체에 주입합니다.
 */
async function injectLatestMagazine(supabase: any, brokerObj: ReturnType<typeof buildBrokerObject>) {
  if (brokerObj.slug === "cre-dealcard-default") return;
  try {
    const { data: latestMag } = await supabase
      .from("magazine_issues")
      .select("issue_date, content")
      .eq("broker_id", brokerObj.slug)
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMag) {
      brokerObj.latestMagazine = {
        date: latestMag.issue_date,
        headline: (latestMag.content as any)?.headline || '주간 시장 리포트',
        url: `/magazine/${brokerObj.slug}/${latestMag.issue_date}`,
        marketTemp: (latestMag.content as any)?.market_temp ?? undefined,
      };
    }
  } catch {
    // non-blocking
  }
}

/**
 * 브로커의 딜카드 통계를 조회하여 broker 객체에 주입합니다.
 */
async function injectBrokerStats(supabase: any, brokerObj: ReturnType<typeof buildBrokerObject>) {
  if (brokerObj.slug === "cre-dealcard-default") return;
  try {
    const [{ count: totalCount }, { count: activeCount }] = await Promise.all([
      supabase
        .from("deal_cards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", brokerObj.userId),
      supabase
        .from("deal_cards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", brokerObj.userId)
        .in("status", ["active", "published"]),
    ]);
    (brokerObj as any).dealCount = totalCount ?? 0;
    (brokerObj as any).activeCount = activeCount ?? 0;
  } catch {
    // non-blocking — default to 0
  }
}

function hydrateQuickRecordToMobileIM(
  buildingIdOrRec: string | StoredQuickImRecord,
  recOrGovernance?: StoredQuickImRecord | DbGovernanceOverlay,
  maybeGovernance?: DbGovernanceOverlay
): MobileIMDocument {
  const quickRec =
    typeof buildingIdOrRec === "string"
      ? (recOrGovernance as StoredQuickImRecord)
      : buildingIdOrRec;
  const targetBuildingId =
    typeof buildingIdOrRec === "string" ? buildingIdOrRec : quickRec.buildingId;
  const dbGovernance =
    typeof buildingIdOrRec === "string"
      ? maybeGovernance
      : (recOrGovernance as DbGovernanceOverlay | undefined);

  const bDoc = quickRec.basicImDoc;
  const facts = bDoc.facts;
  const brokerObj = buildBrokerObject(null);
  if (quickRec.ownerId) {
    brokerObj.userId = quickRec.ownerId;
  }
  if (facts.brokerOffice) {
    brokerObj.company = facts.brokerOffice.name || "";
    brokerObj.displayName = facts.brokerOffice.representative || "담당 중개인";
    brokerObj.phone = facts.brokerOffice.phone && facts.brokerOffice.phone !== "-" ? facts.brokerOffice.phone : "";
  }
  if (quickRec.brokerProfile) {
    if (quickRec.brokerProfile.displayName) brokerObj.displayName = quickRec.brokerProfile.displayName;
    if (quickRec.brokerProfile.company) brokerObj.company = quickRec.brokerProfile.company;
    if (quickRec.brokerProfile.phone) brokerObj.phone = quickRec.brokerProfile.phone;
    if (quickRec.brokerProfile.tagline) brokerObj.tagline = quickRec.brokerProfile.tagline;
    if (quickRec.brokerProfile.photoUrl) brokerObj.photoUrl = quickRec.brokerProfile.photoUrl;
    if (quickRec.brokerProfile.slug) brokerObj.slug = quickRec.brokerProfile.slug;
    if (Array.isArray(quickRec.brokerProfile.specialtyRegions)) {
      brokerObj.specialtyRegions = quickRec.brokerProfile.specialtyRegions;
    }
    if (Array.isArray(quickRec.brokerProfile.specialtyAssets)) {
      brokerObj.specialtyAssets = quickRec.brokerProfile.specialtyAssets;
    }
    if (quickRec.brokerProfile.bio) brokerObj.bio = quickRec.brokerProfile.bio;
  }

  const rawPhotosList =
    Array.isArray(quickRec.fullDocBody?.photos_v2) && quickRec.fullDocBody.photos_v2.length > 0
      ? quickRec.fullDocBody.photos_v2
      : Array.isArray(quickRec.fullDocBody?.photos) && quickRec.fullDocBody.photos.length > 0
      ? quickRec.fullDocBody.photos
      : facts.photos || [];
  const filteredPhotos = rawPhotosList
    .filter((p: any) => p && isValidPhotoUrl(p.url))
    .map((p: any, i: number) => ({
      url: p.url,
      type: i === 0 ? ("exterior" as const) : ("interior" as const),
      label: p.caption || p.label || (i === 0 ? "건물 외관" : `건물 사진 ${i + 1}`),
    }));

  const resolvedCoords =
    quickRec.coordinates ||
    quickRec.fullDocBody?.coordinates ||
    quickRec.fullDocBody?.ssot_summary?.coordinates ||
    undefined;

  const doc: MobileIMDocument = {
    buildingId: targetBuildingId,
    blindName: quickRec.buildingName || `${quickRec.card4.region} ${quickRec.card4.use}`,
    fullName: quickRec.buildingName || facts.title,
    areaSignal: quickRec.card4.region,
    assetType: quickRec.card4.use,
    priceBand: quickRec.card4.priceBand,
    sizeSignal: `연면적 ${facts.building.totalGrossAreaSqm.toLocaleString()}㎡ (${facts.building.totalGrossAreaPyeong}평)`,
    completenessScore: 85,
    broker: brokerObj,
    sections: (bDoc.sections || []).map((s) => ({
      id: s.id,
      sectionId: s.id || s.sectionType,
      sectionType: s.sectionType,
      archetype: s.archetype,
      order: s.order,
      title: s.title,
      subtitle: s.subtitle,
      data: s.data,
      icon: "📄",
      content: s.narrative || "",
      dataSource: "SSoT 데이터",
      aiRole: "auto" as const,
      locked: false,
    })) as any,
    generatedAt: quickRec.updatedAt || quickRec.createdAt,
    status: "published",
    disclaimer:
      "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
    fullImUpgradeCta: {
      enabled: true,
      label: "상세 투자설명서(IM) 요청",
      description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
    },
    protectedFieldsRemoved: ["상세 지번", "소유주명"],
    photos: filteredPhotos,
    coordinates: resolvedCoords,
    dataQualityBadge: computeDataQualityBadge({
      hasAddress: Boolean(quickRec.address),
      hasPublicData: true,
      hasMonthlyRent: facts.rent.monthlyRentTotalKrw > 0,
      hasVacancy: true,
      hasPhotos: filteredPhotos.length > 0,
      hasAskingPrice: facts.transaction.askingPriceKrw > 0,
      hasLandArea: facts.land.landAreaSqm > 0,
      hasTotalGrossArea: facts.building.totalGrossAreaSqm > 0,
    }),
    heroCard: {
      assetType: quickRec.card4.use,
      areaSignal: quickRec.card4.region,
      askingPriceDisplay: quickRec.card4.priceBand,
      capRateBase: facts.valuation.capRatePct,
      noiBaseBil: Number((facts.valuation.netAnnualOperatingIncomeKrw / 1_0000_0000).toFixed(2)),
      keyPoints: [...quickRec.card4.points],
      keyInvestmentPoint: quickRec.card4.points[0],
      keyRisk: "계약 전 법률·세무·물리적 실사를 통한 리스크 확인 권장",
      equityRequiredBil: facts.transaction.estimatedEquityKrw
        ? Number((facts.transaction.estimatedEquityKrw / 1_0000_0000).toFixed(2))
        : null,
      leveragedYieldPct: facts.valuation.cashOnCashPct ?? null,
      readinessScore: 85,
      dcf10YearNpvBil: null,
      posture: quickRec.posture as any,
      landAreaM2: facts.land.landAreaSqm,
      totalGrossAreaM2: facts.building.totalGrossAreaSqm,
      zoning: facts.land.zoning,
      landPricePerPyeong: facts.transaction.pricePerPyeongLandWon,
      farHeadroom: null,
      devProfitMarginPct: null,
      gopMarginPct: null,
      adr: null,
      occPct: facts.rent.occupancyRatePct,
      revpar: null,
      ownVsLeaseSavingsBil: null,
      breakevenYears: null,
      pricePerPyeong: facts.transaction.pricePerPyeongGfaWon,
      marketDiscountPct: null,
      targetHprPct: null,
    },
    tier: "basic",
    releaseTier: "fact_om",
  };

  (doc as any).basicImDocument = quickRec.basicImDoc;
  (doc as any).schemaVersion = "3.0";
  (doc as any).card4 = quickRec.card4;
  (doc as any).rentRoll = quickRec.rentRoll;
  (doc as any).floor_leases = quickRec.fullDocBody?.floor_leases || quickRec.rentRoll;
  (doc as any).ssotSummary = quickRec.fullDocBody?.ssot_summary;
  (doc as any).pnu =
    quickRec.pnu ||
    quickRec.fullDocBody?.pnu ||
    quickRec.fullDocBody?.ssot_summary?.pnu ||
    undefined;
  return attachInboxGovernanceOverlay(doc, targetBuildingId, quickRec, dbGovernance);
}

interface DbGovernanceOverlay {
  revoked?: boolean;
  revokedAt?: string | null;
  revokeDecisionAt?: string | null;
  correctionNotice?: { message: string; updatedAt: string } | null;
  correctionDecisionAt?: string | null;
}

function attachInboxGovernanceOverlay(
  doc: MobileIMDocument,
  buildingId: string,
  sourceMeta?: Record<string, any>,
  dbGovernance?: DbGovernanceOverlay
): MobileIMDocument {
  const inboxState = getInboxState();
  const revokedInfo = inboxState.revokedBuildings[buildingId];
  const localRevoked = Boolean(revokedInfo?.revoked) || isBuildingShareLinkRevoked(buildingId);
  const localRevokeTime = revokedInfo?.revokedAt ? new Date(revokedInfo.revokedAt).getTime() : 0;
  const dbRevokeTime = dbGovernance?.revokeDecisionAt
    ? new Date(dbGovernance.revokeDecisionAt).getTime()
    : 0;

  let isRevoked: boolean;
  if (dbGovernance?.revoked !== undefined && dbRevokeTime >= localRevokeTime) {
    isRevoked = dbGovernance.revoked;
  } else {
    isRevoked =
      localRevoked ||
      Boolean(sourceMeta?.isRevoked) ||
      Boolean(sourceMeta?.is_revoked);
  }

  const localNotice = inboxState.correctionNotices[buildingId];
  const localNoticeTime = localNotice?.updatedAt ? new Date(localNotice.updatedAt).getTime() : 0;
  const dbNoticeTime = dbGovernance?.correctionDecisionAt
    ? new Date(dbGovernance.correctionDecisionAt).getTime()
    : 0;

  let correctionNotice: { message: string; updatedAt: string } | null;
  if (dbGovernance?.correctionNotice !== undefined && dbNoticeTime >= localNoticeTime) {
    correctionNotice = dbGovernance.correctionNotice;
  } else {
    correctionNotice =
      localNotice ||
      sourceMeta?.correctionNotice ||
      sourceMeta?.correction_notice ||
      null;
  }

  (doc as any).isRevoked = isRevoked;
  (doc as any).revokedAt = isRevoked
    ? dbGovernance?.revokedAt || revokedInfo?.revokedAt || sourceMeta?.revoked_at || null
    : null;
  (doc as any).correctionNotice = correctionNotice;
  return doc;
}


/**
 * Fetch IM Lite data for a building. Returns null if not found.
 *
 * P0-SEC: `viewer` identifies the requester. Non-owners (anonymous or other users):
 *  - get `null` for soft-deleted (archived) buildings;
 *  - may open `?doc=<docId>` only when that document's status is public
 *    (published | broker_reviewed | shared_external). Otherwise the docId is ignored and the
 *    regular public default (latest published/broker_reviewed IM, then SSoT fallback) is used,
 *    so previously shared links degrade gracefully instead of exposing drafts.
 * Owners (building_ssot_lite.owner_id or document.owner_id) and admins keep full preview.
 */
export async function fetchIMData(
  buildingId: string,
  docId?: string,
  viewer?: Viewer | null,
  tokenOrOptions?: string | { token?: string | null }
): Promise<MobileIMDocument | null> {
  // P0-SEC (IB-05): Verify share link token when ?token= is passed
  const explicitToken =
    typeof tokenOrOptions === "string"
      ? tokenOrOptions
      : tokenOrOptions?.token ||
        (viewer as any)?.token ||
        (viewer as any)?.shareToken ||
        (docId && (docId.startsWith("slk.") || docId.startsWith("tok-")) ? docId : undefined);

  if (explicitToken) {
    const tokenVerification = await verifyShareLinkToken({
      token: explicitToken,
      buildingId,
    });
    if (!tokenVerification.valid) {
      return null;
    }
    if (docId === explicitToken) {
      docId = undefined;
    }
  }
  let supabase: any = null;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  // P0-META-IM-PERSIST-03 & Axis B-2: Check activity_events for latest IM upsert/delete AND serverless governance (link_revoked, correction_notice)
  let latestImUpsert: { imItem: Record<string, any>; brokerProfile?: Record<string, any> } | null = null;
  const dbGovernance: DbGovernanceOverlay = {};
  if (supabase) {
    try {
      // 1) Low-frequency governance events (never evicted by high-frequency im_upserted autosaves — S1-1/S1-2)
      const { data: govEvents } = await supabase
        .from("activity_events")
        .select("event_type, entity_id, metadata, created_at")
        .in("event_type", [
          "link_revoked",
          "link_restored",
          "correction_notice_published",
          "correction_notice_cleared",
        ])
        .order("created_at", { ascending: false })
        .limit(200);

      if (Array.isArray(govEvents)) {
        let decidedRevoke = false;
        let decidedCorrection = false;
        for (const ev of govEvents) {
          const meta = (ev.metadata && typeof ev.metadata === "object" ? ev.metadata : {}) as Record<string, any>;
          const evBId = String(meta.building_id || ev.entity_id || "");
          if (evBId !== buildingId) continue;

          if (!decidedRevoke && (ev.event_type === "link_revoked" || ev.event_type === "link_restored")) {
            decidedRevoke = true;
            dbGovernance.revoked = ev.event_type === "link_revoked";
            dbGovernance.revokedAt = ev.event_type === "link_revoked" ? ev.created_at || null : null;
            dbGovernance.revokeDecisionAt = ev.created_at || new Date().toISOString();
          }

          if (
            !decidedCorrection &&
            (ev.event_type === "correction_notice_published" || ev.event_type === "correction_notice_cleared")
          ) {
            decidedCorrection = true;
            dbGovernance.correctionDecisionAt = ev.created_at || new Date().toISOString();
            dbGovernance.correctionNotice =
              ev.event_type === "correction_notice_published" && meta.message
                ? {
                    message: String(meta.message),
                    updatedAt: String(ev.created_at || new Date().toISOString()),
                  }
                : null;
          }
          if (decidedRevoke && decidedCorrection) break;
        }
      }

      // 2) IM lifecycle events
      const { data: imEvents } = await supabase
        .from("activity_events")
        .select("event_type, entity_id, metadata, created_at")
        .in("event_type", [
          "im_upserted",
          "im_deleted",
          "im_restored",
        ])
        .order("created_at", { ascending: false })
        .limit(200);

      if (Array.isArray(imEvents)) {
        let decidedDeleted = false;
        let decidedRestored = false;
        let decidedIm = false;

        for (const ev of imEvents) {
          const meta = (ev.metadata && typeof ev.metadata === "object" ? ev.metadata : {}) as Record<string, any>;
          const evBId = String(meta.building_id || ev.entity_id || "");
          const evImId = String(meta.im_id || meta.im_item?.id || "");
          const evItemBid = String(meta.im_item?.buildingId || "");
          if (evBId !== buildingId && evImId !== buildingId && evItemBid !== buildingId) continue;

          if (!decidedIm) {
            if (ev.event_type === "im_deleted") {
              if (!decidedRestored && !latestImUpsert) {
                decidedDeleted = true;
              }
              decidedIm = true;
            } else if (ev.event_type === "im_restored") {
              decidedRestored = true;
            } else if (ev.event_type === "im_upserted" && meta.im_item) {
              latestImUpsert = {
                imItem: meta.im_item as Record<string, any>,
                brokerProfile: meta.broker_profile as Record<string, any> | undefined,
              };
              decidedIm = true;
            }
          }
        }
        if (decidedDeleted) {
          return null;
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // 0. Quick-Generate Store lookup (short-circuit before document_objects only when !isUuid(buildingId))
  const memQuickRec = (docId ? getQuickImRecord(docId) : undefined) || getQuickImRecord(buildingId);
  const earlyQuickRec =
    latestImUpsert?.imItem && (memQuickRec || !isUuid(buildingId))
      ? synthesizeQuickRecordFromImItem(
          buildingId,
          latestImUpsert.imItem,
          latestImUpsert.brokerProfile
        )
      : memQuickRec ||
        (!isUuid(buildingId)
          ? await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId)
          : null);
  if (!isUuid(buildingId) && earlyQuickRec) {
    return hydrateQuickRecordToMobileIM(buildingId, earlyQuickRec, dbGovernance);
  }

  // 1. Demo data
  const demo = getDemoMobileIM(buildingId);
  if (demo) return attachInboxGovernanceOverlay(demo, buildingId, undefined, dbGovernance);

  if (!supabase) {
    if (earlyQuickRec) {
      return hydrateQuickRecordToMobileIM(buildingId, earlyQuickRec, dbGovernance);
    }
    return null;
  }

  // Non-UUID custom IM IDs: synthesize via QuickImRecord so full sections are hydrated
  if (!isUuid(buildingId)) {
    const quickRec = latestImUpsert?.imItem
      ? synthesizeQuickRecordFromImItem(
          buildingId,
          latestImUpsert.imItem,
          latestImUpsert.brokerProfile
        )
      : await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId);
    if (quickRec) {
      return hydrateQuickRecordToMobileIM(buildingId, quickRec, dbGovernance);
    }
  }

  // P0-SEC: building visibility + owner (read directly from the SSoT source table).
  const { data: buildingAccess } = await supabase
    .from("building_ssot_lite")
    .select("owner_id, status")
    .eq("id", buildingId)
    .maybeSingle();
  const buildingOwnerId: string | null = buildingAccess?.owner_id ?? null;
  if (buildingAccess && !isBuildingStatusPublic(buildingAccess.status) && !isOwnerOrAdmin(viewer, buildingOwnerId)) {
    return null;
  }

  // 2. Document from document_objects (generated IM)
  let document: any = null;
  let docError: any = null;

  if (docId) {
    const res = await supabase
      .from("document_objects")
      .select("body, owner_id, created_at, status, updated_at")
      .eq("id", docId)
      .eq("building_id", buildingId)
      .single();
    document = res.data;
    docError = res.error;

    // P0-SEC: non-public states (draft / generating / generated / pending_approval /
    // revision_needed / archived / ...) are owner/admin-only previews.
    if (document && !isImDocStatusPublic(document.status) && !isOwnerOrAdmin(viewer, buildingOwnerId, document.owner_id)) {
      document = null;
      docError = null;
      docId = undefined; // fall through to the public default lookup below
    }
  }

  if (!docId) {
    // If no docId is specified, fetch the latest published/reviewed IM document for this building
    // Allow draft status for building owner or admin
    const allowedStatuses = isOwnerOrAdmin(viewer, buildingOwnerId)
      ? ["published", "broker_reviewed", "draft"]
      : ["published", "broker_reviewed"];
    const res = await supabase
      .from("document_objects")
      .select("body, owner_id, created_at, status, updated_at")
      .eq("building_id", buildingId)
      .in("document_type", ["mobile_im", "im_lite", "im_lite_draft", "blind_teaser"])
      .in("status", allowedStatuses)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    document = res.data;
  }

  const rawDocSections = document?.body?.sections || document?.body?.basicImDocument?.sections;

  if (Array.isArray(rawDocSections) && rawDocSections.length > 0) {
    const brokerProfile = await fetchBrokerProfile(supabase, document.owner_id);

    const ssotSummary = document.body.ssot_summary || {};
    const brokerObj = buildBrokerObject(brokerProfile);
    await injectLatestMagazine(supabase, brokerObj);
    await injectBrokerStats(supabase, brokerObj);
    const defaultBlindName = `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`;
    
    const enriched = resolveEnrichment(document.body);

    // Poison coordinate / PNU guard (Dangsan 11-47 leak)
    const rawAddrForGuard = String(
      enriched.meta.address ||
      ssotSummary.address ||
      document.body.ssot_summary?.address ||
      document.body.resolved_address ||
      document.body.address ||
      ssotSummary.raw_address ||
      ""
    ).trim();
    const coordLatGuard = Number(document.body.coordinates?.lat ?? ssotSummary.coordinates?.lat ?? 0) || null;
    const coordLngGuard = Number(document.body.coordinates?.lng ?? ssotSummary.coordinates?.lng ?? 0) || null;
    const resolvedPnuGuard = String(ssotSummary.pnu || document.body.pnu || "").trim() || null;
    const isDangsanAddr = /당산|양평/.test(rawAddrForGuard);
    const isDangsanCoord =
      coordLatGuard != null &&
      coordLngGuard != null &&
      Math.abs(coordLatGuard - 37.5342) < 0.0005 &&
      Math.abs(coordLngGuard - 126.9022) < 0.0005;
    const isDangsanPnu = resolvedPnuGuard === "1156011500100110047";
    if (rawAddrForGuard && !isDangsanAddr && (isDangsanCoord || isDangsanPnu)) {
      if (document.body.coordinates) delete document.body.coordinates;
      if (document.body.ssot_summary?.coordinates) delete document.body.ssot_summary.coordinates;
      if (ssotSummary.coordinates) delete ssotSummary.coordinates;
      if (document.body.pnu === "1156011500100110047") delete document.body.pnu;
      if (document.body.ssot_summary?.pnu === "1156011500100110047") delete document.body.ssot_summary.pnu;
      if (ssotSummary.pnu === "1156011500100110047") delete ssotSummary.pnu;
      if (document.body.enrichment?.cadastralMapImage) delete document.body.enrichment.cadastralMapImage;
      if ((enriched as any)?.cadastralMapImage) delete (enriched as any).cadastralMapImage;
    }

    // Resolve coordinates & Kakao Map URL
    const finalCoordinates = document.body.coordinates || await (async () => {
      const addr = enriched.meta.address
        || ssotSummary.address
        || document.body.ssot_summary?.address
        || ssotSummary.raw_address;
      if (addr) return geocodeAddress(String(addr));
      return undefined;
    })();

    const rawPhotos = (
      (Array.isArray(document.body.photos_v2) && document.body.photos_v2.length > 0
        ? document.body.photos_v2
        : document.body.photos)
      ?? (document.body.photo_urls || []).map((url: string, i: number) => ({
        url,
        type: i === 0 ? 'exterior' as const : 'interior' as const,
        label: i === 0 ? '건물 외관' : `건물 사진 ${i + 1}`,
        caption: undefined as string | undefined,
      }))
    ).filter((p: any) => p?.url && p.excluded !== true // 중개인 'IM 제외' 지정 자산 제거 (PPTX resolvePhotos와 동일)
        && isValidPhotoUrl(p.url));

    if (finalCoordinates) {
      const kakaoMapUrl = buildKakaoStaticMapUrl({
        lat: finalCoordinates.lat,
        lng: finalCoordinates.lng,
        width: 768,
        height: 432,
        level: 3,
        marker: true
      });
      
      const locationMapImage = document.body.enrichment?.locationMapImage;
      const cadastralMapImage = document.body.enrichment?.cadastralMapImage;
      
      rawPhotos.unshift({
        url: locationMapImage || kakaoMapUrl,
        type: 'map',
        label: locationMapImage ? '위치 지도 (상권/역세권)' : '위치 지도',
        order: -1,
        kakaoMapUrl: locationMapImage ? kakaoMapUrl : undefined,
      });

      // 지적도는 사진 갤러리 후순위(또는 토지현황 섹션용)로 추가
      if (cadastralMapImage) {
        rawPhotos.push({
          url: cadastralMapImage,
          type: 'cadastral',
          label: '지적도',
          order: 999
        });
      }
    }

    const mappedResult: MobileIMDocument = {
      buildingId,
      blindName: document.body.heroTitle || defaultBlindName,
      fullName: defaultBlindName,
      areaSignal: ssotSummary.area_signal || "",
      assetType: ssotSummary.asset_type || "",
      priceBand: ssotSummary.price_band || "",
      sizeSignal: ssotSummary.size_signal || "",
      completenessScore: document.body.readiness_score ?? 0,
      broker: brokerObj,
      ogTitle: document.body.ogTitle || null,
      ogDescription: document.body.ogDescription || null,
      heroSubtitle: document.body.heroSubtitle || null,
      enrichment: document.body.enrichment || enriched || null,
      sections: rawDocSections.map((s: any) => {
          if ("content" in s) {
            if (s.locked) {
              return { ...s, content: "", boundaryNote: undefined, provenance: [] };
            }
            return { ...s, content: stripLegacyNameMask(s.content) };
          }
          let icon = "📄";
          if (s.section_type === "overview" || s.section_type === "property_overview") icon = "🏢";
          if (s.section_type === "location" || s.section_type === "location_access") icon = "📍";
          if (s.section_type === "tenant" || s.section_type === "lease_status") icon = "📋";
          if (s.section_type === "financial" || s.section_type === "income_analysis") icon = "💰";
          if (s.section_type === "risk" || s.section_type === "risk_check") icon = "⚠️";
          if (s.section_type === "buyer_fit" || s.section_type === "investment_thesis") icon = "🎯";
          if (s.section_type === "next_steps") icon = "🚀";
          // 비소득형 포스처 전용 섹션
          if (s.section_type === "occupancy_fit") icon = "🏠";
          if (s.section_type === "cost_comparison") icon = "📊";
          if (s.section_type === "site_analysis") icon = "🗺️";
          if (s.section_type === "development_feasibility") icon = "🏗️";
          if (s.section_type === "operation_overview") icon = "⚙️";
          if (s.section_type === "gop_analysis") icon = "📈";
          if (s.section_type === "market_position") icon = "🏷️";
          if (s.section_type === "comparable_analysis") icon = "📐";

          const isSectionLocked = (() => {
            if (s.locked != null) return Boolean(s.locked);
            const tier = (document.body.releaseTier || document.body.release_tier || document.tier) as ReleaseTier | undefined;
            if (tier) {
              const allowed = TIER_CONFIG[tier as ReleaseTier] ?? TIER_CONFIG.pro;
              if (s.section_type === 'income_analysis' && !allowed.allowFinancials) return true;
              if (s.section_type === 'stabilized_scenario' && !allowed.allowScenario) return true;
              if (s.section_type === 'value_add_plan' && !allowed.allowValueAdd) return true;
              if (s.section_type === 'market_rent_gap' && !allowed.allowRentGap) return true;
            }
            if (s.min_tier === 'premium' && document.body.tier === 'basic') return true;
            if (s.min_tier === 'grade_a' && (document.body.dataGrade === 'B' || document.body.dataGrade === 'C')) return true;
            return false;
          })();

          const lockedReason = isSectionLocked
            ? (s.lockedReason || (s.min_tier === 'grade_a' ? 'A등급 데이터 필요' : '상세 열람 권한 필요 (Full IM 요청)'))
            : undefined;

          return {
            ...(s.id ? { id: s.id } : {}),
            ...(s.sectionType ? { sectionType: s.sectionType } : {}),
            ...(s.data ? { data: s.data } : {}),
            sectionId: s.section_type || s.id || s.sectionType || `section_${s.section_order ?? s.order}`,
            title: s.title || "섹션",
            icon,
            content: isSectionLocked ? "" : stripLegacyNameMask(s.markdown || s.narrative || ""),
            dataSource: s.confidence === "inferred" ? "AI 분석" : "SSoT 데이터",
            aiRole: s.confidence === "inferred" ? "ai_generated" : "auto",
            confidence: s.confidence,
            locked: isSectionLocked,
            lockedReason,
            boundaryNote: isSectionLocked ? undefined : s.boundary_note,
            provenance: isSectionLocked ? [] : (s.provenance || []),
          };
        }),
        generatedAt: document.body.generated_at || document.created_at || new Date().toISOString(),
        status: document.status || "draft",
        approvedAt: document.status === 'broker_reviewed' ? (document.updated_at || document.created_at) : undefined,
        disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
        fullImUpgradeCta: {
          enabled: true,
          label: "상세 투자설명서(IM) 요청",
          description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
        },
        protectedFieldsRemoved: ["상세 지번", "소유주명"],
        photos: rawPhotos,
        hiddenSections: Array.isArray(document.body.hidden_sections) ? document.body.hidden_sections : [],
        coordinates: finalCoordinates,
        dataQualityBadge: computeDataQualityBadge({
          hasAddress: !!(enriched.meta.address || ssotSummary.address || ssotSummary.raw_address),
          hasPublicData: !!(enriched.meta.hasPublicData || enriched.meta.enrichedAt),
          hasMonthlyRent: !!ssotSummary.monthly_rent_total_krw || !!ssotSummary.monthly_rent_total,
          hasVacancy: !!ssotSummary.vacancy_signal || !!ssotSummary.vacancy_pct,
          hasPhotos: ((Array.isArray(document.body.photos_v2) && document.body.photos_v2.length > 0 ? document.body.photos_v2 : document.body.photos) ?? (document.body.photo_urls || [])).length > 0,
          hasAskingPrice: !!(document.body.heroCard?.askingPriceBil || ssotSummary.asking_price_manwon),
          hasLoanAmount: !!(document.body.financials?.loanAmountBil || ssotSummary.loan_amount_manwon),
          hasFloorLeases: !!(document.body.heroCard?.waleTotalYears),
          hasLandArea: !!(ssotSummary.land_area_m2 || enriched.landUsePlan),
          hasTotalGrossArea: !!(ssotSummary.total_gross_area_m2 || enriched.buildingRegister),
        }, (ssotSummary.investment_posture || document.body.identity?.investmentPosture || 'income') as any),
        // [C1] Hero Card — 기존 IM의 heroCard 보강 또는 SSoT에서 동적 합성
        heroCard: (() => {
          const s = ssotSummary;
          const existing = document.body.heroCard;
          const askDisplay = existing?.askingPriceDisplay || s.price_band || (s.asking_price_manwon ? `${(s.asking_price_manwon / 10000).toFixed(1)}억 원` : '');
          if (existing) {
            // D39: existing.keyPoints에 마크다운 표(|)나 거대 블록이 유출되었는지 필터링
            let cleanedExistingPoints = existing.keyPoints;
            if (Array.isArray(cleanedExistingPoints) && cleanedExistingPoints.length > 0) {
              cleanedExistingPoints = cleanedExistingPoints
                .filter((p: string) => typeof p === 'string' && !p.startsWith('|') && !p.startsWith('>') && !p.includes('종합 가치 제안'))
                .map((p: string) => p.replace(/\*\*/g, '').trim())
                .filter((p: string) => p.length > 8);
              if (cleanedExistingPoints.length === 0) cleanedExistingPoints = undefined;
            }
            return {
              ...existing,
              askingPriceDisplay: askDisplay,
              ...(cleanedExistingPoints ? { keyPoints: cleanedExistingPoints } : {}),
            };
          }
          const sections = rawDocSections;
          const investSection = sections.find((sec: any) => sec.section_type === 'investment_thesis' || sec.section_type === 'buyer_fit');
          const riskSection = sections.find((sec: any) => sec.section_type === 'risk_check');
          const finSection = sections.find((sec: any) => sec.section_type === 'income_analysis');

          // Extract clean bullet points for heroCard
          const extractPoints = (md: string | undefined): string[] => {
            if (!md) return [];
            const normalized = normalizeSectionMarkdown(md);
            const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
            const bullets = lines
              .filter(l => !l.startsWith('|') && !l.startsWith('>') && !l.startsWith('#') && !/^\*\*[^*]+\*\*[:：]?$/.test(l) && (
                l.startsWith('-') || l.startsWith('*') || l.startsWith('•') || l.startsWith('·') ||
                l.match(/^\d[.)]\s/) || l.startsWith('**') ||
                l.match(/^[\u{1F300}-\u{1FAFF}]/u)
              ))
              .map(p => p.replace(/^[-*•·0-9.):\s]+/, '').replace(/\*\*/g, '').replace(/^[\u{1F300}-\u{1FAFF}]\s*/u, '').trim())
              .filter(p => p.length > 8 && !p.startsWith('|') && !p.startsWith('>') && !p.includes('종합 가치 제안'));
            return bullets.slice(0, 3);
          };

          const keyPoints = extractPoints(investSection?.markdown);
          const firstMeaningful = (md: string | undefined) => {
            if (!md) return '';
            const normalized = normalizeSectionMarkdown(md);
            const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 10 && !l.startsWith('#') && !l.startsWith('|'));
            const first = lines[0]?.replace(/^[#*\-\s>•·\d.]+/, '').trim() || '';
            if (first.length > 180) {
              const sentenceEnd = first.search(/[.?!](?:\s|$)/);
              if (sentenceEnd > 20 && sentenceEnd < 200) {
                return first.slice(0, sentenceEnd + 1);
              }
              return first.slice(0, 160) + '...';
            }
            return first;
          };

          return {
            assetType: s.asset_type || '상업용 자산',
            areaSignal: s.area_signal || '',
            askingPriceDisplay: s.price_band || (s.asking_price_manwon ? `${(s.asking_price_manwon / 10000).toFixed(1)}억 원` : ''),
            capRateBase: null,
            noiBaseBil: null,
            keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
            keyInvestmentPoint: keyPoints[0] || firstMeaningful(investSection?.markdown) || s.fit_summary || '해당 권역 핵심 입지 및 우량 자산 가치 보유 물건',
            keyRisk: firstMeaningful(riskSection?.markdown) || s.caution_summary || '계약 전 법률·세무·물리적 실사를 통한 리스크 확인 권장',
            equityRequiredBil: null,
            leveragedYieldPct: null,
            readinessScore: document.body.readiness_score ?? 0,
            dcf10YearNpvBil: null,
            posture: s.investment_posture || document.body.identity?.investmentPosture || 'income',
            landArea: s.land_area_m2 ?? enriched.landUsePlan?.landArea ?? null,
            totalArea: s.total_gross_area_m2 ?? enriched.buildingRegister?.totalArea ?? null,
            zoningDistrict: s.zoning ?? enriched.landUsePlan?.zoningDistrict ?? null,
            landPricePerPyeong: s.land_price_per_pyeong ?? null,
            farHeadroom: s.far_headroom ?? null,
            devProfitMarginPct: s.dev_profit_margin_pct ?? null,
            gopMarginPct: s.gop_margin_pct ?? null,
            adr: s.adr ?? null,
            occPct: s.occ_pct ?? null,
            revpar: s.revpar ?? null,
            ownVsLeaseSavingsBil: s.own_vs_lease_savings_bil ?? null,
            breakevenYears: s.breakeven_years ?? null,
            pricePerPyeong: s.price_per_pyeong ?? null,
            marketDiscountPct: s.market_discount_pct ?? null,
            targetHprPct: s.target_hpr_pct ?? null,
          };
        })(),
        // [C2] DCF 10년 민감도
        dcf10Year: (() => {
          const docTier = (document.body.releaseTier || document.body.release_tier || document.tier) as ReleaseTier | undefined;
          const allowed = docTier ? (TIER_CONFIG[docTier] ?? TIER_CONFIG.pro) : TIER_CONFIG.pro;
          return allowed.allowFinancials ? (document.body.dcf10Year ?? undefined) : undefined;
        })(),
        // [C4] 레버리지 자금 구조
        financials: (() => {
          const docTier = (document.body.releaseTier || document.body.release_tier || document.tier) as ReleaseTier | undefined;
          const allowed = docTier ? (TIER_CONFIG[docTier] ?? TIER_CONFIG.pro) : TIER_CONFIG.pro;
          if (!allowed.allowFinancials || !document.body.financials) return undefined;
          return {
            equityRequiredBil: document.body.financials.equityRequired ?? null,
            totalDepositBil: document.body.financials.totalDepositBil ?? null,
            loanAmountBil: document.body.financials.loanAmountBil ?? null,
            leveragedYieldPct: document.body.financials.leveragedYield ?? null,
            waccPct: document.body.financials.wacc ? parseFloat((document.body.financials.wacc * 100).toFixed(1)) : null,
          };
        })(),
        tier: document.body.tier || 'basic',
        releaseTier: document.body.releaseTier ?? 'fact_om',
      };

    if (document.body?.basicImDocument || document.body?.schemaVersion === '3.0') {
      (mappedResult as any).basicImDocument = document.body.basicImDocument || document.body;
      (mappedResult as any).schemaVersion = '3.0';
    }
    if (document.body?.card4) {
      (mappedResult as any).card4 = document.body.card4;
    }
    const resolvedRentRoll =
      document.body?.rent_roll ||
      document.body?.rentRoll ||
      document.body?.floor_leases;
    if (resolvedRentRoll) {
      (mappedResult as any).rentRoll = resolvedRentRoll;
      (mappedResult as any).floor_leases = document.body?.floor_leases || resolvedRentRoll;
    }
    if (document.body?.broker_contact) {
      const bc = document.body.broker_contact;
      const prevBroker = (mappedResult.broker || {}) as any;
      mappedResult.broker = {
        ...prevBroker,
        displayName: bc.brokerName || prevBroker.displayName || prevBroker.name || '담당 공인중개사',
        company: bc.brokerageName || prevBroker.company || prevBroker.office || '전담 중개법인',
        name: bc.brokerName || prevBroker.name || prevBroker.displayName || '담당 공인중개사',
        office: bc.brokerageName || prevBroker.office || prevBroker.company || '전담 중개법인',
        phone: bc.brokerPhone || prevBroker.phone || '-',
      } as any;
    }
    (mappedResult as any).ssotSummary = ssotSummary;
    (mappedResult as any).enrichment = document.body.enrichment || enriched || null;

    if (latestImUpsert?.imItem) {
      const it = latestImUpsert.imItem;
      if (it.title) {
        mappedResult.blindName = String(it.title);
        mappedResult.fullName = String(it.title);
      }
      if (Array.isArray(it.rentRoll) && it.rentRoll.length > 0) {
        (mappedResult as any).rentRoll = it.rentRoll;
        (mappedResult as any).floor_leases = it.rentRoll;
      }
      const resolvedLat = Number(it.coordinates?.lat ?? it.lat) || undefined;
      const resolvedLng = Number(it.coordinates?.lng ?? it.lng) || undefined;
      const resolvedOfficialLandPrice =
        Number(it.officialLandPricePerSqm ?? it.officialLandPriceWonSqm) || undefined;

      const nextSsot = {
        ...((mappedResult as any).ssotSummary || {}),
        ...(it.address ? { address: it.address } : {}),
        ...(it.pnu ? { pnu: it.pnu } : {}),
        ...(resolvedLat && resolvedLng
          ? { coordinates: { lat: resolvedLat, lng: resolvedLng } }
          : {}),
        ...(it.investmentPosture || it.posture
          ? { investment_posture: it.investmentPosture || it.posture }
          : {}),
        ...(Number(it.askingPriceManwon) ? { asking_price_manwon: Number(it.askingPriceManwon) } : {}),
        ...(Number(it.gfaSqm)
          ? { total_gross_area_sqm: Number(it.gfaSqm), total_gross_area_m2: Number(it.gfaSqm) }
          : {}),
        ...(Number(it.landAreaSqm)
          ? { land_area_sqm: Number(it.landAreaSqm), land_area_m2: Number(it.landAreaSqm) }
          : {}),
        ...(it.zoning ? { zoning: it.zoning } : {}),
        ...(it.completionDate ? { completion_date: it.completionDate } : {}),
        ...(Number(it.floorsAbove) ? { floors_above: Number(it.floorsAbove) } : {}),
        ...(it.floorsBelow !== undefined && Number.isFinite(Number(it.floorsBelow))
          ? { floors_below: Number(it.floorsBelow) }
          : {}),
        ...(Number(it.bcrPct) ? { bcr_pct: Number(it.bcrPct) } : {}),
        ...(Number(it.farPct) ? { far_pct: Number(it.farPct) } : {}),
        ...(Number(it.parkingTotal) ? { parking_count: Number(it.parkingTotal) } : {}),
        ...(it.elevatorCount !== undefined && Number.isFinite(Number(it.elevatorCount))
          ? { elevator_count: Number(it.elevatorCount) }
          : {}),
        ...(resolvedOfficialLandPrice
          ? { official_land_price_per_sqm: resolvedOfficialLandPrice }
          : {}),
        ...(Array.isArray(it.parcels) && it.parcels.length > 0 ? { parcels: it.parcels } : {}),
        ...(it.handoverNote !== undefined ? { handover_note: it.handoverNote } : {}),
      };
      (mappedResult as any).ssotSummary = nextSsot;

      if (it.pnu) {
        (mappedResult as any).pnu = it.pnu;
      }
      if (resolvedLat && resolvedLng) {
        mappedResult.coordinates = { lat: resolvedLat, lng: resolvedLng };
      }
      if (Array.isArray(it.parcels) && it.parcels.length > 0) {
        (mappedResult as any).parcels = it.parcels;
      }
      const itPhotos =
        Array.isArray(it.photos_v2) && it.photos_v2.length > 0
          ? it.photos_v2
          : Array.isArray(it.photos) && it.photos.length > 0
          ? it.photos
          : null;
      if (itPhotos) {
        const validItPhotos = itPhotos
          .map((p: any, i: number) => {
            const url = typeof p === "string" ? p : p?.dataUrl || p?.url || p?.previewUrl;
            if (!isValidPhotoUrl(url)) return null;
            return {
              url,
              type: p?.type || p?.category || (i === 0 ? ("exterior" as const) : ("interior" as const)),
              label: p?.caption || p?.label || p?.name || (i === 0 ? "건물 외관" : `건물 사진 ${i + 1}`),
              caption: p?.caption,
            };
          })
          .filter(Boolean);
        if (validItPhotos.length > 0) {
          mappedResult.photos = validItPhotos as any;
          (mappedResult as any).photos_v2 = validItPhotos;
        }
      }

      const bp = latestImUpsert.brokerProfile || {};
      const brokerName = it.brokerName || bp.displayName || bp.display_name || bp.name;
      const brokerageName = it.brokerageName || bp.company || bp.office;
      const brokerPhone = it.brokerPhone || bp.phone;
      const closingLine = it.closingLine || bp.tagline;
      if (brokerName || brokerageName || brokerPhone || closingLine) {
        const prevBroker = (mappedResult.broker || {}) as any;
        mappedResult.broker = {
          ...prevBroker,
          ...(brokerName ? { displayName: brokerName, name: brokerName } : {}),
          ...(brokerageName ? { company: brokerageName, office: brokerageName } : {}),
          ...(brokerPhone ? { phone: brokerPhone } : {}),
          ...(closingLine ? { tagline: closingLine } : {}),
        };
      }

      if (mappedResult.heroCard) {
        if (it.investmentPosture || it.posture) {
          (mappedResult.heroCard as any).posture = it.investmentPosture || it.posture;
        }
        if (Array.isArray(it.axiosHighlights)) {
          const cleanPts = formatAxiosHighlights(it.axiosHighlights);
          if (cleanPts.length > 0) {
            mappedResult.heroCard.keyPoints = cleanPts;
            mappedResult.heroCard.keyInvestmentPoint = cleanPts[0];
          }
        }
      }

      const mergedItForSynth = {
        address: nextSsot.address,
        title: mappedResult.blindName,
        askingPriceManwon: nextSsot.asking_price_manwon,
        gfaSqm: nextSsot.total_gross_area_sqm ?? nextSsot.total_gross_area_m2,
        landAreaSqm: nextSsot.land_area_sqm ?? nextSsot.land_area_m2,
        zoning: nextSsot.zoning,
        completionDate: nextSsot.completion_date,
        floorsAbove: nextSsot.floors_above,
        floorsBelow: nextSsot.floors_below,
        bcrPct: nextSsot.bcr_pct,
        farPct: nextSsot.far_pct,
        parkingTotal: nextSsot.parking_count,
        elevatorCount: nextSsot.elevator_count,
        officialLandPriceWonSqm: nextSsot.official_land_price_per_sqm,
        pnu: (mappedResult as any).pnu,
        coordinates: mappedResult.coordinates,
        rentRoll: (mappedResult as any).rentRoll,
        photos: mappedResult.photos,
        ...it,
      };
      (mappedResult as any).basicImDocument = synthesizeQuickRecordFromImItem(
        buildingId,
        mergedItForSynth,
        latestImUpsert.brokerProfile
      ).basicImDoc;
    }

    return attachInboxGovernanceOverlay(mappedResult, buildingId, document.body, dbGovernance);
  }

  // 3. Fallback: If broker saved/published via IM Workspace (activity_events im_upserted) or in-memory quick store, synthesize directly before bare SSoT stub
  if (latestImUpsert?.imItem) {
    const synthRec = synthesizeQuickRecordFromImItem(
      buildingId,
      latestImUpsert.imItem,
      latestImUpsert.brokerProfile
    );
    return hydrateQuickRecordToMobileIM(buildingId, synthRec, dbGovernance);
  }
  if (earlyQuickRec) {
    return hydrateQuickRecordToMobileIM(buildingId, earlyQuickRec, dbGovernance);
  }

  const result = await readBuilding(buildingId);
  const ssot = (result?.data ?? result ?? {}) as Record<string, any>;

  if (!ssot || Object.keys(ssot).length === 0 || (ssot.completeness_score ?? 0) < 30) {
    const quickRec = await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId);
    if (quickRec) {
      return hydrateQuickRecordToMobileIM(buildingId, quickRec, dbGovernance);
    }
    return null;
  }

  const score = ssot.completeness_score ?? 0;

  const brokerProfile = await fetchBrokerProfile(supabase, ssot.owner_id);

  const sections = [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏢",
      content: `| 항목 | 내용 |\n|---|---|\n| 매물명 | ${ssot.area_signal} ${ssot.asset_type} |\n| 매매희망가 | **${ssot.price_band}** |\n| 규모 | ${ssot.size_signal} |`,
      dataSource: "SSoT - asset_identity",
      aiRole: "auto" as const,
      locked: false,
    },
    {
      sectionId: "02_location",
      title: "입지·상권 분석",
      icon: "📍",
      content: "AI 입지 분석이 완료되지 않았습니다.",
      dataSource: "AI Location Agent",
      aiRole: "ai_generated" as const,
      locked: true,
      lockedReason: "공공데이터 연동 대기 중",
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "👥",
      content: ssot.lease_summary || ssot.vacancy_signal
        ? `| 항목 | 내용 |\n|---|---|\n| 공실 | ${ssot.vacancy_signal || "확인 필요"} |\n\n${ssot.lease_summary || "세부 임대차 정보는 중개인에게 문의하세요."}`
        : "임대 현황 데이터가 부족합니다.",
      dataSource: "SSoT - rent_roll",
      aiRole: "auto" as const,
      locked: !ssot.lease_summary && !ssot.vacancy_signal,
      lockedReason: "렌트롤 데이터 필요",
    },
    {
      sectionId: "04_finance",
      title: "수익 분석",
      icon: "💰",
      content: "금융/수익 분석 모델링 중입니다.",
      dataSource: "AI Financial Engine",
      aiRole: "ai_generated" as const,
      locked: true,
      lockedReason: "Cash Flow 데이터 필요",
    },
    {
      sectionId: "05_risk",
      title: "확인 필요 사항",
      icon: "⚠️",
      content: ssot.caution_summary || "리스크 엔진 데이터 수집 중입니다.",
      dataSource: "AI Risk Engine",
      aiRole: "ai_generated" as const,
      locked: !ssot.caution_summary,
      lockedReason: "리스크 스캔 대기 중",
    },
    {
      sectionId: "06_thesis",
      title: "투자 포인트",
      icon: "🎯",
      content: ssot.fit_summary || "매수자 적합성 분석 중입니다.",
      dataSource: "AI Matching Engine",
      aiRole: "ai_generated" as const,
      locked: false,
    },
    {
      sectionId: "07_next",
      title: "다음 단계",
      icon: "🚀",
      content: "관심 있으신 경우 아래 '중개인에게 문의하기' 버튼을 눌러 상세 자료(IM) 및 미팅을 요청해 주세요.",
      dataSource: "Static",
      aiRole: "static" as const,
      locked: false,
    },
  ];

  const layers = (ssot.layers as Record<string, any>) || {};

  const brokerObj2 = buildBrokerObject(brokerProfile);
  await injectLatestMagazine(supabase, brokerObj2);
  await injectBrokerStats(supabase, brokerObj2);

  return attachInboxGovernanceOverlay({
    buildingId: ssot.id,
    blindName: `${ssot.area_signal} ${ssot.asset_type}`,
    fullName: `${ssot.area_signal} ${ssot.asset_type}`,
    areaSignal: ssot.area_signal,
    assetType: ssot.asset_type,
    priceBand: ssot.price_band,
    sizeSignal: ssot.size_signal,
    completenessScore: score,
    broker: brokerObj2,
    sections,
    generatedAt: new Date().toISOString(),
    status: ssot.status || "draft",
    disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
    fullImUpgradeCta: {
      enabled: true,
      label: "상세 투자설명서(IM) 요청",
      description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
    },
    protectedFieldsRemoved: ssot.disclosure?.guard_checked ? ["상세 지번", "소유주명"] : [],
    photos: (Array.isArray(layers.photos) && layers.photos.length > 0
      ? layers.photos
          .filter((p: any) => p && typeof p.url === "string")
          .map((p: any) => ({ url: p.url, type: p.type || "exterior", label: p.label || "건물 사진" }))
      : Array.isArray(ssot.photo_urls) && ssot.photo_urls.length > 0
      ? (ssot.photo_urls ?? []).map((url: string, i: number) => ({
          url,
          type: i === 0 ? "exterior" : "interior",
          label: i === 0 ? "건물 외관" : `건물 사진 ${i + 1}`,
        }))
      : []).filter((p: any) => p?.url && isValidPhotoUrl(p.url)),
    coordinates: layers.coordinates || undefined,
    dataQualityBadge: computeDataQualityBadge({
      hasAddress: !!(ssot.layers as any)?.asset_identity?.address || !!(ssot.layers as any)?.asset_identity?.raw_address,
      hasPublicData: !!(ssot.layers as any)?.public_data,
      hasMonthlyRent: !!(ssot.layers as any)?.rent_roll?.monthly_rent_total_krw || !!(ssot.layers as any)?.rent_roll?.monthly_rent_total,
      hasVacancy: !!ssot.vacancy_signal,
      hasPhotos: (Array.isArray(layers.photos) && layers.photos.length > 0) || (Array.isArray(ssot.photo_urls) && ssot.photo_urls.length > 0),
    }),
  }, buildingId, undefined, dbGovernance);
}
