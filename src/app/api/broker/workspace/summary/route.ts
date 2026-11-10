import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import {
  computeCard4Hash,
  generateAiOgHeadline,
  resolveCard4AreaLabel,
  updateDealCard4,
  type Card4Data,
  type DealCardPosture,
} from "@/lib/deal-card/card4-schema";
import {
  isUuid,
  getQuickImRecord,
  listAllQuickImRecords,
  updateQuickImCard4,
  markDealCardDeleted,
  markDealCardRestored,
  isDealCardDeleted,
  markDealCardSent,
  isDealCardSent,
} from "@/lib/im-lite/quick-generate-store";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";

function cleanBrokerField(val: unknown, fallback?: string): string | undefined {
  if (typeof val !== "string") return fallback;
  const t = val.trim();
  if (
    !t ||
    t === "-" ||
    t === "담당 공인중개사" ||
    t.includes("확인 중") ||
    t === "크리딜 파트너 중개법인" ||
    t === "전담 부동산중개법인"
  ) {
    return fallback;
  }
  return t;
}

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "방금";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "방금";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;
  const userId = auth.user.id;
  const isAdmin = auth.role === "admin";

  const supabase = createServiceClient();
  const targetId = request.nextUrl.searchParams.get("buildingId") || request.nextUrl.searchParams.get("id");

  // 1. Fetch broker's buildings from building_ssot_lite
  let bldQuery = supabase
    .from("building_ssot_lite")
    .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!isAdmin) {
    bldQuery = bldQuery.eq("owner_id", userId);
  }

  const { data: buildingsData } = await bldQuery;
  const buildings = [...(buildingsData || [])];

  // If a specific targetId was requested and not in top 30, fetch it if owned (only when targetId is a valid UUID)
  const quickTargetRec = targetId && !isUuid(targetId) ? getQuickImRecord(targetId) : null;
  if (targetId && isUuid(targetId) && !buildings.some((b) => b.id === targetId)) {
    const check = await assertBuildingOwner(supabase, targetId, userId, {
      allowAdmin: true,
      role: auth.role,
    });
    if (check.ok) {
      const { data: singleBld } = await supabase
        .from("building_ssot_lite")
        .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
        .eq("id", targetId)
        .maybeSingle();
      if (singleBld) buildings.unshift(singleBld);
    }
  }

  const buildingIds = buildings.map((b) => b.id);

  // 2. Fetch latest blind_teaser and IM document_objects for these buildings
  // Projection excludes multi-MB base64 images inside full `body` JSONB (e.g. cadastralMapImage)
  let docQuery: any =
    buildingIds.length > 0
      ? supabase
          .from("document_objects")
          .select(
            "id, building_id, document_type, title, status, updated_at, created_at, card4:body->card4, dealPoints:body->dealPoints, ssot_summary:body->ssot_summary, version_no:body->version_no, rent_roll:body->rent_roll, floor_leases:body->floor_leases, axios_highlights:body->axios_highlights, handover_note:body->handover_note, broker_contact:body->broker_contact, investment_posture:body->investment_posture, photos_v2:body->photos_v2, photos:body->photos"
          )
          .in("building_id", buildingIds)
      : null;
  if (docQuery && typeof docQuery.in === "function") {
    docQuery = docQuery.in("document_type", ["blind_teaser", "mobile_im", "im_lite", "im_lite_draft"]);
  }
  if (docQuery && typeof docQuery.neq === "function") {
    docQuery = docQuery.neq("status", "archived");
  }
  if (docQuery && typeof docQuery.order === "function") {
    docQuery = docQuery.order("created_at", { ascending: false });
  }
  const { data: docsData } = docQuery
    ? await (typeof docQuery.limit === "function" ? docQuery.limit(25) : docQuery)
    : { data: [] as any[] };

  const docs = (docsData || []) as any[];

  const dealcards = buildings.map((b) => {
    const teaserDoc = docs.find(
      (d) => d.building_id === b.id && d.document_type === "blind_teaser"
    );
    const bodyCard4 = (teaserDoc?.card4 ?? teaserDoc?.body?.card4) as Partial<Card4Data> | undefined;
    const teaserDealPoints = teaserDoc?.dealPoints ?? teaserDoc?.body?.dealPoints;
    const region = bodyCard4?.region || b.area_signal || "서울시 핵심 권역";
    const use = bodyCard4?.use || b.asset_type || "근린생활시설";
    const priceBand = bodyCard4?.priceBand || b.price_band || "가격 협의";
    const rawPoints: string[] = Array.isArray(bodyCard4?.points)
      ? bodyCard4!.points
      : Array.isArray(teaserDealPoints)
      ? teaserDealPoints
      : [
          b.fit_summary ? String(b.fit_summary).slice(0, 18) : `${region} 핵심 입지`,
          `${use} 추천 매물`,
          "상세 수익률 및 임대현황 확인 가능",
        ];
    const points: [string, string, string] = [
      rawPoints[0] || `${region} 핵심 입지`,
      rawPoints[1] || `${use} 추천 매물`,
      rawPoints[2] || "안정적 임대수익 기대",
    ];
    const hash = bodyCard4?.card4_hash || computeCard4Hash({ region, use, priceBand, points });
    const layersObj = (b.layers as Record<string, any>) || {};
    const gfaSqmRaw = Number(layersObj.building_register?.gross_floor_area_sqm || 0);
    const landSqmRaw = Number(layersObj.building_register?.land_area_sqm || 0);
    const gfaPyung = bodyCard4?.gfaPyung || (gfaSqmRaw > 0 ? Math.round(gfaSqmRaw / 3.3058) : undefined);
    const landAreaPyung = bodyCard4?.landAreaPyung || (landSqmRaw > 0 ? Math.round(landSqmRaw / 3.3058) : undefined);
    const posture: DealCardPosture = bodyCard4?.posture || "income";
    const area = resolveCard4AreaLabel(
      { ...bodyCard4, posture, gfaPyung, landAreaPyung },
      { gfaPyung, landAreaPyung }
    );
    const headline = bodyCard4?.headline?.slice(0, 18) || "";

    const card4: Card4Data = {
      headline,
      posture,
      region,
      use,
      area,
      gfaPyung,
      landAreaPyung,
      priceBand,
      points,
      provenance: bodyCard4?.provenance || {
        points: ["public", "broker", "ai"],
      },
      card4_version: bodyCard4?.card4_version || 1,
      card4_hash: hash,
    };

    return {
      id: b.id,
      title: `${region} ${use}`.trim(),
      region,
      use,
      priceBand,
      status: b.status === "published" || teaserDoc?.status === "published" ? "sent" : "draft",
      updatedAt: formatRelativeTime(b.updated_at),
      card4,
    };
  });

  const seenImBuildingIds = new Set<string>();
  const imDocs = docs.filter((d) => {
    if (!["mobile_im", "im_lite", "im_lite_draft"].includes(d.document_type)) return false;
    if (d.building_id) {
      if (seenImBuildingIds.has(d.building_id)) return false;
      seenImBuildingIds.add(d.building_id);
    }
    return true;
  });

  const imList = imDocs.map((d) => {
    const ssotSummary = d.ssot_summary || d.body?.ssot_summary || {};
    const bld = buildings.find((b) => b.id === d.building_id);
    const layers = (bld?.layers as Record<string, any>) || {};
    const address =
      ssotSummary.address ||
      layers.asset_identity?.address ||
      bld?.area_signal ||
      "서울시 핵심 상권";
    const askingPriceManwon =
      Number(ssotSummary.asking_price_manwon || layers.deal_terms?.asking_price_manwon) || 950000;
    const versionNo = Number(d.version_no ?? d.body?.version_no ?? 1);
    const isPublished = d.status === "published" || d.status === "broker_reviewed";
    const rawFloorLeases = d.floor_leases ?? d.body?.floor_leases;
    const rawDocRentRoll = d.rent_roll ?? d.body?.rent_roll ?? rawFloorLeases;
    const normalizedDocRentRoll = Array.isArray(rawDocRentRoll)
      ? rawDocRentRoll.map((r: any, rIdx: number) => {
          const flMatch = Array.isArray(rawFloorLeases) ? rawFloorLeases[rIdx] : undefined;
          const isVac = Boolean(
            r?.status === "vacant" ||
              r?.is_vacant === true ||
              r?.lease_state === "공실" ||
              r?.tenant_name === "공실" ||
              r?.use === "공실"
          );
          const isOwn = Boolean(
            !isVac &&
              (r?.status === "owner" ||
                r?.lease_state === "자가사용" ||
                r?.tenant_type === "자가" ||
                r?.tenant_name === "자가" ||
                r?.use === "자가사용")
          );
          const rawUseParts = [
            ...(r?.use ? String(r.use).split(/\s*\/\s*/) : []),
            r?.tenant_name || r?.tenantName || flMatch?.tenant_name,
            r?.tenant_type || r?.business_type || flMatch?.tenant_type,
          ]
            .map((s) => String(s || "").trim())
            .filter(Boolean);
          const dedupUse = Array.from(new Set(rawUseParts)).join(" / ");
          const useLabel =
            dedupUse || (isVac ? "공실" : isOwn ? "자가사용" : "근린생활시설");
          const rawFl = String(r?.floor || flMatch?.floor || `${rIdx + 1}F`).trim();
          const rawUn = String(r?.unit || r?.unit_label || flMatch?.unit_label || "").trim();
          const isFlRoomNum = /^(?:B|지하\s*)?\d{3,4}\s*호$/i.test(rawFl);
          const resolvedUnit = isFlRoomNum ? rawFl : rawUn || `${rIdx + 1}01호`;
          const rawAreaSqm = Number(
            r?.areaSqm ??
              r?.area_sqm ??
              r?.area_m2 ??
              r?.exclusive_area_sqm ??
              flMatch?.area_sqm ??
              flMatch?.area_m2 ??
              flMatch?.exclusive_area_sqm ??
              0
          );
          const validAreaSqm =
            rawAreaSqm > 0 && Math.abs(rawAreaSqm - 2.45) > 0.05 ? rawAreaSqm : undefined;
          const rawExclSqm = Number(
            r?.exclusiveAreaSqm ?? r?.exclusive_area_sqm ?? flMatch?.exclusive_area_sqm ?? 0
          );
          return {
            id: r?.id || `r-db-${d.id}-${rIdx}`,
            floor: rawFl,
            unit: resolvedUnit,
            use: String(useLabel),
            ...(validAreaSqm ? { areaSqm: validAreaSqm } : {}),
            ...(rawExclSqm > 0 ? { exclusiveAreaSqm: rawExclSqm } : {}),
            depositManwon: Number(
              r?.depositManwon ?? r?.deposit_manwon ?? flMatch?.deposit_manwon ?? 0
            ),
            monthlyRentManwon: Number(
              r?.monthlyRentManwon ?? r?.rent_manwon ?? flMatch?.rent_manwon ?? 0
            ),
            maintenanceManwon: Number(
              r?.maintenanceManwon ?? r?.mgmt_fee_manwon ?? flMatch?.mgmt_fee_manwon ?? 0
            ),
            leaseExpiry: String(
              r?.leaseExpiry || r?.lease_end || r?.expiryDate || flMatch?.lease_end || "-"
            ),
            status: isVac ? ("vacant" as const) : isOwn ? ("owner" as const) : ("occupied" as const),
          };
        })
      : undefined;

    const rawPosture =
      ssotSummary.investment_posture ||
      d.investment_posture ||
      d.body?.investment_posture ||
      (String(bld?.asset_type || d.title || "").includes("나대지") ? "development" : "core_income");

    let grossYieldPct = 0;
    if (rawPosture !== "owner_occupied" && rawPosture !== "development") {
      const explicitYield = Number(ssotSummary.cap_rate_pct || ssotSummary.gross_yield_pct || 0);
      if (explicitYield > 0) {
        grossYieldPct = Math.round(explicitYield * 10) / 10;
      } else if (normalizedDocRentRoll && normalizedDocRentRoll.length > 0 && askingPriceManwon > 0) {
        let totalDeposit = 0;
        let totalMonthly = 0;
        for (const r of normalizedDocRentRoll) {
          if (r.status === "occupied") {
            totalDeposit += Number(r.depositManwon || 0);
            totalMonthly += Number(r.monthlyRentManwon || 0);
          }
        }
        if (totalMonthly > 0) {
          const netPrice = Math.max(askingPriceManwon - totalDeposit, 1);
          grossYieldPct = Math.round(((totalMonthly * 12) / netPrice) * 1000) / 10;
        }
      }
    }

    const rawAxiosHighlights = d.axios_highlights ?? d.body?.axios_highlights;
    const brokerContact = d.broker_contact ?? d.body?.broker_contact;
    const rawDocPhotos = d.photos_v2 ?? d.photos ?? d.body?.photos_v2 ?? d.body?.photos;
    const normalizedDocPhotos = Array.isArray(rawDocPhotos)
      ? rawDocPhotos
          .filter(
            (p: any) =>
              p &&
              typeof p.url === "string" &&
              p.url.trim().length > 0 &&
              !p.url.startsWith("/test-images/")
          )
          .map((p: any, idx: number) => ({
            url: String(p.url),
            caption: String(p.caption || p.label || `현장 사진 ${idx + 1}`),
            category: String(p.category || p.type || (idx === 0 ? "exterior" : "interior")),
            role: p.role || (idx === 0 ? "cover" : undefined),
            isHero: Boolean(p.isHero ?? idx === 0),
          }))
      : undefined;

    return {
      id: d.id,
      buildingId: d.building_id,
      title: d.title || `${bld?.area_signal || "매물"} ${bld?.asset_type || "IM"}`.trim(),
      address,
      askingPriceManwon,
      grossYieldPct,
      status: isPublished ? "published" : "draft",
      versionLabel: isPublished ? `v${versionNo} 공개 중 ★` : `v${versionNo} 작성 중`,
      updatedAt: formatRelativeTime(d.updated_at || d.created_at),
      rentRoll: (normalizedDocRentRoll && normalizedDocRentRoll.length > 0 ? normalizedDocRentRoll : undefined) as any[] | undefined,
      ...(normalizedDocPhotos && normalizedDocPhotos.length > 0 ? { photos: normalizedDocPhotos } : {}),
      investmentPosture: rawPosture,
      gfaSqm: ssotSummary.total_gross_area_sqm ? String(ssotSummary.total_gross_area_sqm) : undefined,
      landAreaSqm: ssotSummary.land_area_sqm ? String(ssotSummary.land_area_sqm) : undefined,
      zoning: ssotSummary.zoning || undefined,
      completionDate: ssotSummary.completion_date || undefined,
      handoverNote: d.handover_note || d.body?.handover_note || ssotSummary.handover_note || undefined,
      axiosHighlights: Array.isArray(rawAxiosHighlights) && rawAxiosHighlights.length > 0 ? rawAxiosHighlights : undefined,
      brokerName: cleanBrokerField(brokerContact?.brokerName || brokerContact?.name),
      brokerageName: cleanBrokerField(brokerContact?.brokerageName || brokerContact?.company),
      brokerPhone: cleanBrokerField(brokerContact?.brokerPhone || brokerContact?.phone),
    };
  });

  // Fetch broker profile & DealCard activity events (deleted / restored / sent / custom upserted)
  let brokerProfile: {
    displayName?: string;
    company?: string;
    phone?: string;
    registrationNo?: string;
    slug?: string;
    photoUrl?: string;
  } | null = null;

  try {
    if (supabase && typeof supabase.from === "function") {
      const [{ data: pRow }, { data: bpRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, company, phone, photo_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("broker_profiles")
          .select("office_reg_number, slug, avatar_url, name, display_name, phone, specialty")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (pRow || bpRow) {
        brokerProfile = {
          displayName:
            pRow?.display_name || (bpRow as any)?.display_name || (bpRow as any)?.name || undefined,
          company: pRow?.company || (bpRow as any)?.specialty || undefined,
          phone: pRow?.phone || (bpRow as any)?.phone || undefined,
          registrationNo: bpRow?.office_reg_number || undefined,
          slug: bpRow?.slug || undefined,
          photoUrl: bpRow?.avatar_url || pRow?.photo_url || undefined,
        };
      }
    }
  } catch {
    // Non-blocking
  }

  const deletedBuildingIds = new Set<string>();
  const restoredOrActiveBuildingIds = new Set<string>();
  const sentBuildingIds = new Set<string>();
  const customUpsertedByBuilding = new Map<
    string,
    { card4: Card4Data; updatedAt: string; status?: "draft" | "sent" }
  >();
  const deletedImIds = new Set<string>();
  const restoredOrActiveImIds = new Set<string>();
  const customImUpsertedByKey = new Map<string, { item: Record<string, any>; updatedAt: string }>();

  try {
    if (supabase && typeof supabase.from === "function") {
      let actQuery: any = supabase
        .from("activity_events")
        .select("id, event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId);
      if (typeof actQuery.in === "function") {
        actQuery = actQuery.in("event_type", [
          "dealcard_upserted",
          "dealcard_deleted",
          "dealcard_restored",
          "dealcard_sent",
          "im_upserted",
          "im_deleted",
          "im_restored",
        ]);
      }
      if (typeof actQuery.order === "function") {
        actQuery = actQuery.order("created_at", { ascending: false });
      }
      if (typeof actQuery.limit === "function") {
        actQuery = actQuery.limit(100);
      }
      const { data: dcActs } = await actQuery;
      for (const act of dcActs || []) {
        const meta = (act.metadata as Record<string, any>) || {};
        const bId = String(meta.building_id || act.entity_id || "").trim();
        const imKey = String(meta.im_id || meta.building_id || act.entity_id || "").trim();

        if (act.event_type === "im_deleted" && imKey) {
          if (!restoredOrActiveImIds.has(imKey)) {
            deletedImIds.add(imKey);
            if (bId && bId !== userId) deletedImIds.add(bId);
          }
          continue;
        }
        if ((act.event_type === "im_restored" || act.event_type === "im_upserted") && imKey) {
          if (!deletedImIds.has(imKey)) {
            restoredOrActiveImIds.add(imKey);
            if (bId && bId !== userId) restoredOrActiveImIds.add(bId);
            if (meta.im_item && typeof meta.im_item === "object" && !customImUpsertedByKey.has(imKey)) {
              customImUpsertedByKey.set(imKey, {
                item: meta.im_item as Record<string, any>,
                updatedAt: act.created_at,
              });
            }
          }
          continue;
        }

        if (!bId || bId === userId) continue;

        if (act.event_type === "dealcard_deleted") {
          if (!restoredOrActiveBuildingIds.has(bId)) {
            deletedBuildingIds.add(bId);
          }
        } else if (act.event_type === "dealcard_restored" || act.event_type === "dealcard_upserted") {
          if (!deletedBuildingIds.has(bId)) {
            restoredOrActiveBuildingIds.add(bId);
            if (meta.card4 && !customUpsertedByBuilding.has(bId)) {
              customUpsertedByBuilding.set(bId, {
                card4: meta.card4 as Card4Data,
                updatedAt: act.created_at,
                status: meta.status === "sent" ? "sent" : undefined,
              });
              if (!isUuid(bId)) {
                updateQuickImCard4(bId, meta.card4 as Card4Data, {
                  ownerId: userId,
                  brokerProfile: brokerProfile || undefined,
                });
              }
            }
          }
        } else if (act.event_type === "dealcard_sent") {
          sentBuildingIds.add(bId);
        }
      }
    }
  } catch {
    // Non-blocking if activity_events unavailable
  }

  // Merge QuickImStore records owned by this user (and requested quickTargetRec / default seeds)
  const allQuickRecords = listAllQuickImRecords()
    .filter((rec) => rec.ownerId === userId || !rec.ownerId || (targetId && (rec.buildingId === targetId || rec.documentId === targetId)))
    .sort((a, b) => {
      // User-owned records always come before unowned default seeds
      const aOwned = a.ownerId === userId ? 1 : 0;
      const bOwned = b.ownerId === userId ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

  if (quickTargetRec && !allQuickRecords.some((r) => r.buildingId === quickTargetRec.buildingId)) {
    allQuickRecords.unshift(quickTargetRec);
  }

  for (const qRec of [...allQuickRecords].reverse()) {
    const existingDcIdx = dealcards.findIndex((dc) => dc.id === qRec.buildingId);
    const isSent = sentBuildingIds.has(qRec.buildingId) || isDealCardSent(qRec.buildingId);
    const mappedDc = {
      id: qRec.buildingId,
      title: `${qRec.card4.region} ${qRec.card4.use}`.trim(),
      region: qRec.card4.region,
      use: qRec.card4.use,
      priceBand: qRec.card4.priceBand,
      status: (isSent ? "sent" : "draft") as "draft" | "sent",
      updatedAt: formatRelativeTime(qRec.updatedAt),
      card4: qRec.card4,
    };
    if (existingDcIdx >= 0) {
      if (qRec.ownerId === userId) {
        dealcards[existingDcIdx] = mappedDc;
      }
    } else if (qRec.ownerId === userId || dealcards.length < 3 || (targetId && qRec.buildingId === targetId)) {
      if (qRec.ownerId === userId || (targetId && qRec.buildingId === targetId)) {
        dealcards.unshift(mappedDc);
      } else {
        dealcards.push(mappedDc);
      }
    }

    const existingImIdx = imList.findIndex(
      (im) => im.id === qRec.documentId || im.buildingId === qRec.buildingId
    );
    const mappedIm = {
      id: qRec.documentId,
      buildingId: qRec.buildingId,
      title: qRec.buildingName || `${qRec.card4.region} ${qRec.card4.use}`.trim(),
      address: qRec.address,
      askingPriceManwon: qRec.askingPriceManwon,
      grossYieldPct: Number(qRec.basicImDoc?.facts?.valuation?.grossYieldPct || 0),
      status: (qRec.ownerId === userId ? "published" : "draft") as "draft" | "published",
      versionLabel: qRec.ownerId === userId ? "v1 생성 완료" : "v1 작성 중",
      updatedAt: formatRelativeTime(qRec.updatedAt),
      rentRoll: qRec.rentRoll,
      investmentPosture: qRec.posture || "core_income",
      gfaSqm: qRec.specs?.gfaSqm ? String(qRec.specs.gfaSqm) : undefined,
      landAreaSqm: qRec.specs?.landAreaSqm ? String(qRec.specs.landAreaSqm) : undefined,
      zoning: qRec.specs?.zoning || undefined,
      completionDate: qRec.specs?.completionDate || undefined,
      handoverNote: qRec.specs?.handoverNote || undefined,
      axiosHighlights: undefined as any[] | undefined,
      brokerName: cleanBrokerField(
        qRec.brokerProfile?.displayName || qRec.basicImDoc?.facts?.brokerOffice?.representative,
        brokerProfile?.displayName
      ),
      brokerageName: cleanBrokerField(
        qRec.brokerProfile?.company || qRec.basicImDoc?.facts?.brokerOffice?.name,
        brokerProfile?.company
      ),
      brokerPhone: cleanBrokerField(
        qRec.brokerProfile?.phone || qRec.basicImDoc?.facts?.brokerOffice?.phone,
        brokerProfile?.phone
      ),
    };
    if (existingImIdx >= 0) {
      if (qRec.ownerId === userId) {
        imList[existingImIdx] = mappedIm;
      }
    } else if (qRec.ownerId || imList.length < 3 || (targetId && (qRec.buildingId === targetId || qRec.documentId === targetId))) {
      if (qRec.ownerId === userId || (targetId && (qRec.buildingId === targetId || qRec.documentId === targetId))) {
        imList.unshift(mappedIm);
      } else {
        imList.push(mappedIm);
      }
    }
  }

  // Apply customUpsertedByBuilding overrides and sentBuildingIds / deletedBuildingIds filtering
  for (const [bId, customEntry] of customUpsertedByBuilding.entries()) {
    const idx = dealcards.findIndex((dc) => dc.id === bId);
    const isSent = sentBuildingIds.has(bId) || isDealCardSent(bId) || customEntry.status === "sent";
    const c4 = customEntry.card4;
    const itemObj = {
      id: bId,
      title: `${c4.region || "새"} ${c4.use || "딜카드"}`.trim(),
      region: c4.region,
      use: c4.use,
      priceBand: c4.priceBand,
      status: (isSent ? "sent" : "draft") as "draft" | "sent",
      updatedAt: formatRelativeTime(customEntry.updatedAt),
      card4: c4,
    };
    if (idx >= 0) {
      dealcards[idx] = itemObj;
    } else {
      dealcards.unshift(itemObj);
    }
  }

  const finalDealcards = dealcards
    .filter((dc) => {
      if (deletedBuildingIds.has(dc.id)) return false;
      if (isDealCardDeleted(dc.id) && !restoredOrActiveBuildingIds.has(dc.id)) return false;
      return true;
    })
    .map((dc) => ({
      ...dc,
      status:
        dc.status === "sent" || sentBuildingIds.has(dc.id) || isDealCardSent(dc.id)
          ? ("sent" as const)
          : ("draft" as const),
    }));

  // Apply customImUpsertedByKey overrides & deletedImIds filtering
  for (const [, customImEntry] of customImUpsertedByKey.entries()) {
    const it = customImEntry.item;
    if (!it || (!it.id && !it.buildingId)) continue;
    const idx = imList.findIndex(
      (im) =>
        (it.id && im.id === it.id) ||
        (it.buildingId && im.buildingId === it.buildingId)
    );
    const mergedIm = {
      ...(idx >= 0 ? imList[idx] : {}),
      ...it,
      id: String(it.id || (idx >= 0 ? imList[idx].id : it.buildingId)),
      buildingId: String(it.buildingId || (idx >= 0 ? imList[idx].buildingId : it.id)),
      brokerName: cleanBrokerField(it.brokerName, brokerProfile?.displayName),
      brokerageName: cleanBrokerField(it.brokerageName, brokerProfile?.company),
      brokerPhone: cleanBrokerField(it.brokerPhone, brokerProfile?.phone),
      updatedAt: formatRelativeTime(customImEntry.updatedAt),
    };
    if (idx >= 0) {
      imList[idx] = mergedIm as any;
    } else {
      imList.unshift(mergedIm as any);
    }
  }

  const finalImList = imList.filter((im) => {
    if (deletedImIds.has(im.id) || (im.buildingId && deletedImIds.has(im.buildingId))) {
      return false;
    }
    return true;
  });

  return NextResponse.json({
    ok: true,
    dealcards: finalDealcards,
    imList: finalImList,
    ims: finalImList,
    brokerProfile,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;

  const body = await request.json().catch(() => null);
  const action = (body?.action as string | undefined) || "upsert";
  const buildingId = body?.buildingId as string | undefined;
  const card4 = body?.card4 as Card4Data | undefined;

  if (!buildingId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch broker profile for attaching to QuickImStore record
  let brokerProfileMeta: {
    displayName?: string;
    company?: string;
    phone?: string;
    registrationNo?: string;
    slug?: string;
    photoUrl?: string;
  } | undefined;
  try {
    if (supabase && typeof supabase.from === "function") {
      const [{ data: pRow }, { data: bpRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, company, phone, photo_url")
          .eq("id", auth.user.id)
          .maybeSingle(),
        supabase
          .from("broker_profiles")
          .select("office_reg_number, slug, avatar_url, name, display_name, phone, specialty")
          .eq("user_id", auth.user.id)
          .maybeSingle(),
      ]);
      if (pRow || bpRow) {
        brokerProfileMeta = {
          displayName:
            pRow?.display_name || (bpRow as any)?.display_name || (bpRow as any)?.name || undefined,
          company: pRow?.company || (bpRow as any)?.specialty || undefined,
          phone: pRow?.phone || (bpRow as any)?.phone || undefined,
          registrationNo: bpRow?.office_reg_number || undefined,
          slug: bpRow?.slug || undefined,
          photoUrl: bpRow?.avatar_url || pRow?.photo_url || undefined,
        };
      }
    }
  } catch {
    // Non-blocking
  }

  // Handle delete action
  if (action === "delete") {
    markDealCardDeleted(buildingId);
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_deleted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore outside request context
    }
    return NextResponse.json({ ok: true, action: "delete", buildingId, persisted: true });
  }

  // Handle restore action (Undo delete)
  if (action === "restore") {
    markDealCardRestored(buildingId);
    if (card4 && !isUuid(buildingId)) {
      updateQuickImCard4(buildingId, card4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_restored",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          ...(card4 ? { card4 } : {}),
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({ ok: true, action: "restore", buildingId, persisted: true });
  }

  // Handle mark_sent action (after Kakao send or Copy Link)
  if (action === "mark_sent") {
    markDealCardSent(buildingId);
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_sent",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
        },
      });
      if (isUuid(buildingId)) {
        await supabase
          .from("document_objects")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .eq("building_id", buildingId)
          .eq("document_type", "blind_teaser");
      }
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({
      ok: true,
      action: "mark_sent",
      buildingId,
      status: "sent",
      persisted: true,
    });
  }

  // Handle IM delete action (P0-META-IM-DELETE-04)
  if (action === "delete_im") {
    const imId = String(body?.imId || buildingId);
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "im_deleted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          im_id: imId,
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/im-lite/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({ ok: true, action: "delete_im", buildingId, imId, persisted: true });
  }

  // Handle IM restore action (15s Undo delete)
  if (action === "restore_im") {
    const imId = String(body?.imId || buildingId);
    const imItem = body?.imItem && typeof body.imItem === "object" ? body.imItem : undefined;
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "im_restored",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          im_id: imId,
          ...(imItem ? { im_item: imItem } : {}),
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/im-lite/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({ ok: true, action: "restore_im", buildingId, imId, persisted: true });
  }

  // Handle IM autosave / upsert action (P0-META-IM-PERSIST-03)
  if (action === "upsert_im") {
    const imItem = body?.imItem && typeof body.imItem === "object" ? (body.imItem as Record<string, any>) : null;
    if (!imItem) {
      return NextResponse.json({ error: "imItem is required for upsert_im" }, { status: 400 });
    }
    const imId = String(imItem.id || buildingId);
    try {
      if (isUuid(buildingId)) {
        const { data: latestDoc } = await supabase
          .from("document_objects")
          .select("id, body")
          .eq("building_id", buildingId)
          .in("document_type", ["mobile_im", "im_lite", "im_lite_draft"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDoc?.id) {
          const prevBody = (latestDoc.body && typeof latestDoc.body === "object" ? latestDoc.body : {}) as Record<string, any>;
          const prevSsot = (prevBody.ssot_summary && typeof prevBody.ssot_summary === "object" ? prevBody.ssot_summary : {}) as Record<string, any>;
          const prevHero = (prevBody.heroCard && typeof prevBody.heroCard === "object" ? prevBody.heroCard : {}) as Record<string, any>;
          const prevFloorLeases = Array.isArray(prevBody.floor_leases) ? prevBody.floor_leases : [];
          const cleanHighlights = Array.isArray(imItem.axiosHighlights)
            ? imItem.axiosHighlights
                .map((h: any, idx: number) => {
                  if (typeof h === "string" && h.trim().length > 0) {
                    return {
                      headline: h.trim(),
                      brief: "",
                      tone: idx === 1 ? "sky" : idx === 2 ? "mint" : "amber",
                    };
                  }
                  if (h && typeof h === "object" && typeof h.headline === "string" && h.headline.trim().length > 0) {
                    return {
                      headline: h.headline.trim(),
                      brief: typeof h.brief === "string" ? h.brief.trim() : "",
                      tone: h.tone === "sky" || h.tone === "mint" ? h.tone : idx === 1 ? "sky" : idx === 2 ? "mint" : "amber",
                    };
                  }
                  return null;
                })
                .filter(Boolean)
            : undefined;
          const cleanKeyPoints = cleanHighlights
            ? cleanHighlights.map((h: any) => h.headline).filter(Boolean)
            : undefined;
          const normalizedFloorLeases = Array.isArray(imItem.rentRoll)
            ? imItem.rentRoll.map((r: any, idx: number) => {
                const prevFl = prevFloorLeases[idx] || {};
                const isVac =
                  r?.status === "vacant" ||
                  r?.is_vacant === true ||
                  r?.lease_state === "공실" ||
                  r?.use === "공실";
                const isOwn =
                  !isVac &&
                  (r?.status === "owner" ||
                    r?.lease_state === "자가사용" ||
                    r?.use === "자가사용" ||
                    r?.use === "자가");
                const depMan = Number(r?.depositManwon ?? r?.deposit_manwon ?? prevFl.deposit_manwon ?? 0);
                const rentMan = Number(r?.monthlyRentManwon ?? r?.rent_manwon ?? prevFl.rent_manwon ?? 0);
                const mgmtMan = Number(r?.maintenanceManwon ?? r?.mgmt_fee_manwon ?? prevFl.mgmt_fee_manwon ?? 0);
                const rawAreaM2 = Number(
                  r?.areaSqm ?? r?.area_sqm ?? r?.area_m2 ?? prevFl.area_sqm ?? prevFl.area_m2 ?? 0
                );
                const areaM2 = rawAreaM2 > 0 && Math.abs(rawAreaM2 - 2.45) > 0.05 ? rawAreaM2 : 0;
                const exclM2 = Number(
                  r?.exclusiveAreaSqm ?? r?.exclusive_area_sqm ?? prevFl.exclusive_area_sqm ?? 0
                );
                const rawUseParts = String(r?.use || prevFl.tenant_type || prevFl.tenant_name || "")
                  .split(/\s*\/\s*/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                const dedupLabel =
                  Array.from(new Set(rawUseParts)).join(" / ") ||
                  (isVac ? "공실" : isOwn ? "자가사용" : "근린생활시설");
                const rawFlStr = String(r?.floor || prevFl.floor || `${idx + 1}F`).trim();
                const roomNumMatch = rawFlStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호$/i);
                const normFloor = roomNumMatch
                  ? roomNumMatch[1]
                    ? `B${parseInt(roomNumMatch[2], 10)}`
                    : `${parseInt(roomNumMatch[2], 10)}F`
                  : rawFlStr;
                const normUnit = roomNumMatch
                  ? `${roomNumMatch[1] ? "B" : ""}${roomNumMatch[2]}${roomNumMatch[3]}호`
                  : String(r?.unit || r?.unit_label || prevFl.unit_label || `${idx + 1}01호`);
                return {
                  ...prevFl,
                  floor: normFloor,
                  unit_label: normUnit,
                  tenant_name: isVac ? "공실" : isOwn ? "자가사용" : "",
                  tenant_type: isVac ? "공실" : dedupLabel,
                  use: isVac ? "공실" : dedupLabel,
                  ...(areaM2 > 0
                    ? {
                        area_sqm: areaM2,
                        area_m2: areaM2,
                        area_pyeong: Math.round((areaM2 / 3.305785) * 10) / 10,
                      }
                    : {}),
                  ...(exclM2 > 0 ? { exclusive_area_sqm: exclM2 } : {}),
                  deposit_manwon: isVac ? 0 : depMan,
                  deposit_krw: isVac ? 0 : depMan * 10000,
                  rent_manwon: isVac ? 0 : rentMan,
                  rent_krw: isVac ? 0 : rentMan * 10000,
                  mgmt_fee_manwon: isVac ? 0 : mgmtMan,
                  lease_state: isVac ? "공실" : isOwn ? "자가사용" : "임대중",
                  is_vacant: isVac,
                  lease_end: String(r?.leaseExpiry || r?.lease_end || prevFl.lease_end || "2027.12"),
                  source: prevFl.source || "broker",
                };
              })
            : prevBody.floor_leases;
          const nextBody = {
            ...prevBody,
            heroTitle: imItem.title || prevBody.heroTitle,
            investment_posture: imItem.investmentPosture || prevBody.investment_posture,
            handover_note: imItem.handoverNote ?? prevBody.handover_note,
            axios_highlights: cleanHighlights && cleanHighlights.length > 0 ? cleanHighlights : prevBody.axios_highlights,
            rent_roll: Array.isArray(imItem.rentRoll) ? imItem.rentRoll : prevBody.rent_roll,
            floor_leases: normalizedFloorLeases,
            heroCard: {
              ...prevHero,
              posture: imItem.investmentPosture || prevHero.posture,
              keyPoints: cleanKeyPoints && cleanKeyPoints.length > 0 ? cleanKeyPoints : prevHero.keyPoints,
            },
            ssot_summary: {
              ...prevSsot,
              address: imItem.address || prevSsot.address,
              investment_posture: imItem.investmentPosture || prevSsot.investment_posture,
              asking_price_manwon: Number(imItem.askingPriceManwon) || prevSsot.asking_price_manwon,
              total_gross_area_sqm: imItem.gfaSqm ? Number(imItem.gfaSqm) : prevSsot.total_gross_area_sqm,
              land_area_sqm: imItem.landAreaSqm ? Number(imItem.landAreaSqm) : prevSsot.land_area_sqm,
              zoning: imItem.zoning || prevSsot.zoning,
              completion_date: imItem.completionDate || prevSsot.completion_date,
              handover_note: imItem.handoverNote ?? prevSsot.handover_note,
            },
          };
          await supabase
            .from("document_objects")
            .update({
              title: imItem.title || undefined,
              body: nextBody,
              updated_at: new Date().toISOString(),
            })
            .eq("id", latestDoc.id);
        }
      }

      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "im_upserted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          im_id: imId,
          im_item: {
            ...imItem,
            isDirty: false,
          },
          broker_profile: brokerProfileMeta,
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/im-lite/${buildingId}`);
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({
      ok: true,
      action: "upsert_im",
      buildingId,
      imId,
      persisted: true,
    });
  }

  if (!card4) {
    return NextResponse.json({ error: "buildingId and card4 are required" }, { status: 400 });
  }

  markDealCardRestored(buildingId);

  // Server-side blind-guard check
  const blindCheck = validateBlindPoints(
    [
      ...(Array.isArray(card4.points) ? card4.points : []),
      card4.region || "",
      card4.use || "",
      card4.headline || "",
    ],
    { region: card4.region, assetType: card4.use }
  );
  if (!blindCheck.isValid) {
    return NextResponse.json(
      {
        ok: false,
        error:
          blindCheck.violations[0]?.reason ||
          "건물 위치가 드러날 수 있는 표현이 포함되어 있습니다.",
        violations: blindCheck.violations,
      },
      { status: 422 }
    );
  }

  // Only enforce DB ownership if buildingId is a real UUID in building_ssot_lite
  if (isUuid(buildingId)) {
    const ownerCheck = await assertBuildingOwner(supabase, buildingId, auth.user.id, {
      allowAdmin: true,
      role: auth.role,
    });
    if (!ownerCheck.ok) {
      return ownerCheck.response;
    }
    const result = await updateDealCard4(supabase, buildingId, {
      card4: {
        headline: card4.headline,
        posture: card4.posture,
        region: card4.region,
        use: card4.use,
        area: card4.area,
        gfaPyung: card4.gfaPyung,
        landAreaPyung: card4.landAreaPyung,
        priceBand: card4.priceBand,
        points: card4.points,
        provenance: card4.provenance,
      },
      userId: auth.user.id,
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, conflict: result.conflict, currentVersion: result.currentVersion },
        { status: result.conflict ? 409 : 500 }
      );
    }
    if (result.card4) {
      updateQuickImCard4(buildingId, result.card4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_upserted",
        entity_type: "building",
        entity_id: buildingId,
        metadata: {
          building_id: buildingId,
          card4: result.card4,
          broker_profile: brokerProfileMeta,
        },
      });
    } catch {
      // Non-blocking
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({
      ok: true,
      buildingId,
      persisted: true,
      card4: result.card4,
      version: result.version,
      hash: result.hash,
    });
  }

  // Non-UUID local draft ID: compute deterministic hash & increment version, update QuickImStore + activity_events
  const nextVersion = (card4.card4_version || 1) + 1;
  const hash = computeCard4Hash(card4);
  const nextCard4: Card4Data = {
    ...card4,
    card4_version: nextVersion,
    card4_hash: hash,
  };
  updateQuickImCard4(buildingId, nextCard4, {
    ownerId: auth.user.id,
    brokerProfile: brokerProfileMeta,
  });
  try {
    await supabase.from("activity_events").insert({
      actor_id: auth.user.id,
      event_type: "dealcard_upserted",
      entity_type: "building",
      entity_id: auth.user.id,
      metadata: {
        building_id: buildingId,
        card4: nextCard4,
        broker_profile: brokerProfileMeta,
      },
    });
  } catch {
    // Non-blocking
  }
  try {
    revalidatePath(`/dc/${buildingId}`);
  } catch {
    // Ignore
  }
  return NextResponse.json({
    ok: true,
    buildingId,
    persisted: true,
    card4: nextCard4,
    version: nextVersion,
    hash,
  });
}
