import {
  type Card4Data,
  type DealCardGenerationSource,
} from "@/lib/deal-card/card4-schema";
import { normalizeDealCardCopy } from "@/lib/deal-card/copy-limits";
import { classifyDealCardOriginGroup } from "@/lib/deal-card/memo-pairing";
import { isDealCardSent } from "@/lib/im-lite/quick-generate-store";
import { brokerExtrasToForm } from "@/domain/building/mobile-im/broker-extras";
import type { WorkspaceItemRecord } from "@/lib/workspace/workspace-repository";
import {
  cleanBrokerField,
  formatRelativeTime,
  normalizeSummaryPhotoList,
  type BrokerProfileMeta,
  type ImSummaryItem,
} from "./types-and-helpers";

export function mergeWorkspaceDealCard(wsItem: WorkspaceItemRecord, dealcards: Array<Record<string, any>>) {
  const payload = wsItem.draftPayload || {};
  const rawCard4 = payload.card4 as Partial<Card4Data> | undefined;
  if (!rawCard4) return;
  const normalizedC4 = normalizeDealCardCopy(rawCard4 as Card4Data, { fillHeadline: true });
  const c4: Card4Data = {
    ...normalizedC4,
    card4_version: Math.max(wsItem.version || 1, normalizedC4.card4_version || 1),
  };
  const preferredId = wsItem.buildingId || wsItem.id || wsItem.legacyId || "";
  const aliasIds = new Set(
    [wsItem.id, wsItem.buildingId, wsItem.legacyId].filter((v): v is string => Boolean(v))
  );
  const matchedEntries: Array<Record<string, any>> = [];
  let firstMatchIdx = -1;
  for (let i = 0; i < dealcards.length; i++) {
    const dc = dealcards[i];
    if (
      aliasIds.has(dc.id) ||
      (dc.canonicalId && aliasIds.has(dc.canonicalId)) ||
      (dc.buildingId && aliasIds.has(dc.buildingId)) ||
      (dc.legacyId && aliasIds.has(dc.legacyId))
    ) {
      if (firstMatchIdx < 0) firstMatchIdx = i;
      matchedEntries.push(dc);
    }
  }
  for (let i = dealcards.length - 1; i >= 0; i--) {
    const dc = dealcards[i];
    if (
      aliasIds.has(dc.id) ||
      (dc.canonicalId && aliasIds.has(dc.canonicalId)) ||
      (dc.buildingId && aliasIds.has(dc.buildingId)) ||
      (dc.legacyId && aliasIds.has(dc.legacyId))
    ) {
      dealcards.splice(i, 1);
    }
  }
  const fallbackPointCandidates =
    !c4.pointCandidates || c4.pointCandidates.length === 0
      ? matchedEntries.find(
          (m) => Array.isArray(m?.card4?.pointCandidates) && m.card4.pointCandidates.length > 0
        )?.card4?.pointCandidates
      : undefined;
  const mergedCard4: Card4Data = fallbackPointCandidates
    ? { ...c4, pointCandidates: fallbackPointCandidates }
    : c4;
  const fallbackMemoText =
    typeof payload.memoText === "string"
      ? payload.memoText
      : matchedEntries.find((m) => typeof m.memoText === "string")?.memoText;
  const fallbackPairedMemoId =
    payload.pairedMemoId || matchedEntries.find((m) => m.pairedMemoId)?.pairedMemoId;
  const mapped = {
    id: preferredId,
    canonicalId: wsItem.id,
    buildingId: wsItem.buildingId,
    legacyId: wsItem.legacyId,
    title: wsItem.title || `${mergedCard4.region} ${mergedCard4.use}`.trim(),
    region: mergedCard4.region,
    use: mergedCard4.use,
    priceBand: wsItem.priceBand || mergedCard4.priceBand,
    status: wsItem.status === "sent" || wsItem.status === "published" ? ("sent" as const) : ("draft" as const),
    updatedAt: formatRelativeTime(wsItem.updatedAt),
    updatedAtIso: wsItem.updatedAt,
    hasUnpublishedEdits: Boolean(payload.hasUnpublishedEdits),
    card4: mergedCard4,
    ...(typeof fallbackMemoText === "string" ? { memoText: fallbackMemoText } : {}),
    ...(fallbackPairedMemoId ? { pairedMemoId: fallbackPairedMemoId } : {}),
    generationSource: (payload.generationSource || mergedCard4.generationSource || "manual") as DealCardGenerationSource,
  };
  if (firstMatchIdx >= 0) {
    dealcards.splice(Math.min(firstMatchIdx, dealcards.length), 0, mapped);
  } else {
    dealcards.unshift(mapped);
  }
}

function resolveBrokerExtrasForm(
  rawForm: unknown,
  rawExtras: unknown,
  prevForm?: unknown
) {
  const extrasObj =
    rawExtras && typeof rawExtras === "object" ? (rawExtras as Record<string, any>) : null;
  const reconstructed = extrasObj ? brokerExtrasToForm(extrasObj as any) : undefined;
  const formObj =
    rawForm && typeof rawForm === "object" ? (rawForm as Record<string, any>) : null;
  const prevObj =
    prevForm && typeof prevForm === "object" ? (prevForm as Record<string, any>) : null;
  const baseForm = formObj || prevObj;
  if (!baseForm) return reconstructed;
  const hasCompRows = Array.isArray(baseForm.compRows) && baseForm.compRows.length > 0;
  return {
    ...(reconstructed || {}),
    ...baseForm,
    compRows: hasCompRows ? baseForm.compRows : reconstructed?.compRows || [],
  };
}

export function mergeWorkspaceIm(
  wsItem: WorkspaceItemRecord,
  imList: ImSummaryItem[],
  brokerProfile: BrokerProfileMeta | null
) {
  const payload = (wsItem.draftPayload || {}) as Record<string, any>;
  const imObj = (payload.imItem && typeof payload.imItem === "object" ? payload.imItem : payload) as Record<string, any>;
  const preferredId = String(imObj.id || wsItem.legacyId || wsItem.id);
  const preferredBldId = String(wsItem.buildingId || imObj.buildingId || wsItem.legacyId || wsItem.id);
  const imAliasIds = new Set(
    [wsItem.id, wsItem.buildingId, wsItem.legacyId, imObj.id, imObj.buildingId]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
  );
  let idx = -1;
  let prevItem: ImSummaryItem | undefined;
  for (let i = 0; i < imList.length; i++) {
    const im = imList[i];
    if (
      imAliasIds.has(im.id) ||
      (im.canonicalId && imAliasIds.has(im.canonicalId)) ||
      (im.buildingId && imAliasIds.has(im.buildingId)) ||
      (im.legacyId && imAliasIds.has(im.legacyId))
    ) {
      if (idx < 0) {
        idx = i;
        prevItem = im;
      }
    }
  }
  for (let i = imList.length - 1; i >= 0; i--) {
    const im = imList[i];
    if (
      imAliasIds.has(im.id) ||
      (im.canonicalId && imAliasIds.has(im.canonicalId)) ||
      (im.buildingId && imAliasIds.has(im.buildingId)) ||
      (im.legacyId && imAliasIds.has(im.legacyId))
    ) {
      imList.splice(i, 1);
    }
  }
  const prevPhotos = prevItem?.photos;
  const photos = normalizeSummaryPhotoList(imObj.photos ?? payload.photos) || prevPhotos;
  const resolvedExpectedRentRoll =
    (Array.isArray(imObj.expectedRentRoll) && imObj.expectedRentRoll.length > 0 && imObj.expectedRentRoll) ||
    (Array.isArray(imObj.expected_rent_roll) && imObj.expected_rent_roll.length > 0 && imObj.expected_rent_roll) ||
    (Array.isArray(payload.expectedRentRoll) && payload.expectedRentRoll.length > 0 && payload.expectedRentRoll) ||
    (Array.isArray(payload.expected_rent_roll) && payload.expected_rent_roll.length > 0 && payload.expected_rent_roll) ||
    (prevItem as any)?.expectedRentRoll;
  const resolvedExpectedRentRollMeta =
    imObj.expectedRentRollMeta ??
    imObj.expected_rent_roll_meta ??
    payload.expectedRentRollMeta ??
    payload.expected_rent_roll_meta ??
    (prevItem as any)?.expectedRentRollMeta;
  const resolvedPnus =
    (Array.isArray(imObj.pnus) && imObj.pnus.length > 0 && imObj.pnus) ||
    (Array.isArray(payload.pnus) && payload.pnus.length > 0 && payload.pnus) ||
    (prevItem as any)?.pnus;
  const resolvedBrokerExtras =
    imObj.broker_extras ?? imObj.brokerExtras ?? payload.broker_extras ?? payload.brokerExtras ?? (prevItem as any)?.brokerExtras;
  const resolvedExtrasForm = resolveBrokerExtrasForm(
    imObj.brokerExtrasForm ?? payload.brokerExtrasForm,
    resolvedBrokerExtras,
    (prevItem as any)?.brokerExtrasForm
  );
  const mapped: ImSummaryItem = {
    ...(prevItem || ({} as any)),
    ...imObj,
    ...(photos ? { photos } : {}),
    ...(resolvedExpectedRentRoll ? { expectedRentRoll: resolvedExpectedRentRoll } : {}),
    ...(resolvedExpectedRentRollMeta ? { expectedRentRollMeta: resolvedExpectedRentRollMeta } : {}),
    ...(resolvedPnus ? { pnus: resolvedPnus } : {}),
    ...(resolvedBrokerExtras ? { brokerExtras: resolvedBrokerExtras } : {}),
    ...(resolvedExtrasForm ? { brokerExtrasForm: resolvedExtrasForm } : {}),
    id: preferredId,
    canonicalId: wsItem.id,
    legacyId: wsItem.legacyId,
    buildingId: preferredBldId,
    title: String(imObj.title || wsItem.title || "매물 IM"),
    address: String(imObj.address || wsItem.address || "서울시 핵심 상권"),
    askingPriceManwon: Number(imObj.askingPriceManwon ?? 0),
    grossYieldPct: Number(imObj.grossYieldPct ?? 0),
    status: wsItem.status === "published" || wsItem.status === "sent" ? "published" : "draft",
    versionLabel: wsItem.status === "published" ? `v${wsItem.version} 공개 중 ★` : `v${wsItem.version} 작성 중`,
    updatedAt: formatRelativeTime(wsItem.updatedAt),
    updatedAtIso: wsItem.updatedAt,
    hasUnpublishedEdits: Boolean(payload.hasUnpublishedEdits ?? imObj.hasUnpublishedEdits),
    correctionNotice: wsItem.correctionNotice ?? imObj.correctionNotice ?? null,
    brokerName: cleanBrokerField(imObj.brokerName, brokerProfile?.displayName),
    brokerageName: cleanBrokerField(imObj.brokerageName, brokerProfile?.company),
    brokerPhone: cleanBrokerField(imObj.brokerPhone, brokerProfile?.phone),
  } as ImSummaryItem;
  if (idx >= 0) imList.splice(Math.min(idx, imList.length), 0, mapped);
  else imList.unshift(mapped);
}

export function mergeQuickRecordIntoLists(
  qRec: any,
  userId: string,
  dealcards: Array<Record<string, any>>,
  imList: ImSummaryItem[],
  sentBuildingIds: Set<string>,
  brokerProfile: BrokerProfileMeta | null
) {
  const existingDcIdx = dealcards.findIndex((dc) => dc.id === qRec.buildingId);
  const existingDc = existingDcIdx >= 0 ? dealcards[existingDcIdx] : undefined;
  const isSent = sentBuildingIds.has(qRec.buildingId) || isDealCardSent(qRec.buildingId);
  const normalizedQuickCard4 = normalizeDealCardCopy(qRec.card4, { fillHeadline: true });
  const fallbackQuickCandidates =
    (!normalizedQuickCard4.pointCandidates || normalizedQuickCard4.pointCandidates.length === 0) &&
    Array.isArray(existingDc?.card4?.pointCandidates) &&
    existingDc.card4.pointCandidates.length > 0
      ? existingDc.card4.pointCandidates
      : undefined;
  const quickGenSource = classifyDealCardOriginGroup({ card4: normalizedQuickCard4 });
  const mappedDc = {
    id: qRec.buildingId,
    title: `${qRec.card4.region} ${qRec.card4.use}`.trim(),
    region: qRec.card4.region,
    use: qRec.card4.use,
    priceBand: qRec.card4.priceBand,
    status: (isSent ? "sent" : "draft") as "draft" | "sent",
    updatedAt: formatRelativeTime(qRec.updatedAt),
    updatedAtIso: typeof qRec.updatedAt === "string" ? qRec.updatedAt : undefined,
    hasUnpublishedEdits: false,
    card4: {
      ...normalizedQuickCard4,
      ...(fallbackQuickCandidates ? { pointCandidates: fallbackQuickCandidates } : {}),
      generationSource: quickGenSource as DealCardGenerationSource,
    },
    ...(normalizedQuickCard4.pairedMemoId ? { pairedMemoId: normalizedQuickCard4.pairedMemoId } : {}),
    generationSource: quickGenSource as DealCardGenerationSource,
  };
  if (existingDcIdx >= 0) {
    dealcards[existingDcIdx] = mappedDc;
  } else {
    dealcards.unshift(mappedDc);
  }

  const existingImIdx = imList.findIndex(
    (im) => im.id === qRec.documentId || im.buildingId === qRec.buildingId
  );
  const qDocBody = ((qRec as any).docBody || qRec.fullDocBody || {}) as Record<string, any>;
  const qSsot = (qDocBody.ssot_summary || {}) as Record<string, any>;
  const qPhotos = normalizeSummaryPhotoList(
    (Array.isArray(qDocBody.photos_v2) && qDocBody.photos_v2.length > 0 && qDocBody.photos_v2) ||
      (Array.isArray(qDocBody.photos) && qDocBody.photos.length > 0 && qDocBody.photos) ||
      qRec.basicImDoc?.facts?.photos
  );
  const resolvedQuickExpectedRentRoll =
    (Array.isArray(qRec.expectedRentRoll) && qRec.expectedRentRoll.length > 0 && qRec.expectedRentRoll) ||
    (Array.isArray(qRec.expected_rent_roll) && qRec.expected_rent_roll.length > 0 && qRec.expected_rent_roll) ||
    (Array.isArray(qDocBody.expected_rent_roll) && qDocBody.expected_rent_roll.length > 0 && qDocBody.expected_rent_roll) ||
    (Array.isArray(qDocBody.expectedRentRoll) && qDocBody.expectedRentRoll.length > 0 && qDocBody.expectedRentRoll) ||
    undefined;
  const resolvedQuickExpectedRentRollMeta =
    qRec.expectedRentRollMeta ??
    qRec.expected_rent_roll_meta ??
    qDocBody.expected_rent_roll_meta ??
    qDocBody.expectedRentRollMeta ??
    undefined;
  const resolvedQuickPnus =
    (Array.isArray(qRec.pnus) && qRec.pnus.length > 0 && qRec.pnus) ||
    (Array.isArray(qRec.specs?.pnus) && qRec.specs.pnus.length > 0 && qRec.specs.pnus) ||
    (Array.isArray(qSsot.pnus) && qSsot.pnus.length > 0 && qSsot.pnus) ||
    (Array.isArray(qDocBody.pnus) && qDocBody.pnus.length > 0 && qDocBody.pnus) ||
    undefined;
  const resolvedQuickBrokerExtras =
    qRec.broker_extras ?? qRec.brokerExtras ?? qDocBody.broker_extras ?? qDocBody.brokerExtras ?? undefined;
  const resolvedQuickBrokerExtrasForm = resolveBrokerExtrasForm(
    qRec.brokerExtrasForm,
    resolvedQuickBrokerExtras
  );
  const mappedIm: ImSummaryItem = {
    id: qRec.documentId,
    buildingId: qRec.buildingId,
    title: qRec.buildingName || `${qRec.card4.region} ${qRec.card4.use}`.trim(),
    address: qRec.address,
    askingPriceManwon: qRec.askingPriceManwon,
    grossYieldPct: Number(qRec.basicImDoc?.facts?.valuation?.grossYieldPct || 0),
    status: qRec.ownerId === userId ? "published" : "draft",
    versionLabel: qRec.ownerId === userId ? "v1 생성 완료" : "v1 작성 중",
    updatedAt: formatRelativeTime(qRec.updatedAt),
    updatedAtIso: typeof qRec.updatedAt === "string" ? qRec.updatedAt : undefined,
    hasUnpublishedEdits: false,
    rentRoll: qRec.rentRoll,
    ...(resolvedQuickExpectedRentRoll ? { expectedRentRoll: resolvedQuickExpectedRentRoll } : {}),
    ...(resolvedQuickExpectedRentRollMeta ? { expectedRentRollMeta: resolvedQuickExpectedRentRollMeta } : {}),
    ...(resolvedQuickPnus ? { pnus: resolvedQuickPnus } : {}),
    ...(resolvedQuickBrokerExtras ? { brokerExtras: resolvedQuickBrokerExtras } : {}),
    ...(resolvedQuickBrokerExtrasForm ? { brokerExtrasForm: resolvedQuickBrokerExtrasForm } : {}),
    ...(qPhotos ? { photos: qPhotos } : {}),
    investmentPosture: qRec.posture || "core_income",
    gfaSqm: qRec.specs?.gfaSqm ? String(qRec.specs.gfaSqm) : undefined,
    landAreaSqm: qRec.specs?.landAreaSqm ? String(qRec.specs.landAreaSqm) : undefined,
    zoning: qRec.specs?.zoning || undefined,
    completionDate: qRec.specs?.completionDate || undefined,
    handoverNote: qRec.specs?.handoverNote || undefined,
    axiosHighlights: Array.isArray((qRec.docBody as any)?.axios_highlights)
      ? (qRec.docBody as any).axios_highlights
      : Array.isArray(qDocBody.axios_highlights)
      ? qDocBody.axios_highlights
      : undefined,
    brokerName: cleanBrokerField(qRec.brokerProfile?.displayName || qRec.basicImDoc?.facts?.brokerOffice?.representative, brokerProfile?.displayName),
    brokerageName: cleanBrokerField(qRec.brokerProfile?.company || qRec.basicImDoc?.facts?.brokerOffice?.name, brokerProfile?.company),
    brokerPhone: cleanBrokerField(qRec.brokerProfile?.phone || qRec.basicImDoc?.facts?.brokerOffice?.phone, brokerProfile?.phone),
    pnu: qRec.pnu || qSsot.pnu || qDocBody.pnu || undefined,
    lat: qRec.coordinates?.lat ?? qRec.lat ?? qSsot.coordinates?.lat ?? qSsot.lat ?? qDocBody.coordinates?.lat ?? undefined,
    lng: qRec.coordinates?.lng ?? qRec.lng ?? qSsot.coordinates?.lng ?? qSsot.lng ?? qDocBody.coordinates?.lng ?? undefined,
    floorsAbove: qRec.floorsAbove ?? qRec.specs?.floorsAbove ?? qSsot.floors_above ?? undefined,
    floorsBelow: qRec.floorsBelow ?? qRec.specs?.floorsBelow ?? qSsot.floors_below ?? undefined,
    bcrPct: qRec.specs?.bcrPct ?? qSsot.bcr_pct ?? undefined,
    farPct: qRec.specs?.farPct ?? qSsot.far_pct ?? undefined,
    parkingTotal: qRec.specs?.parkingSpaces ?? qSsot.parking_total ?? qSsot.parking_count ?? undefined,
    elevatorCount: qRec.specs?.elevators ?? qSsot.elevator_count ?? undefined,
    officialLandPricePerSqm: qRec.officialLandPricePerSqm ?? qRec.specs?.officialLandPricePerSqm ?? qSsot.official_land_price_per_sqm ?? undefined,
    parcels: qRec.parcels ?? qRec.specs?.parcels ?? qSsot.parcels ?? qDocBody.parcels ?? undefined,
    mainPurpose: qRec.specs?.mainPurpose || qSsot.main_usage || qRec.card4.use || undefined,
    closingLine: qRec.closingLine || qRec.specs?.closingLine || qSsot.closing_line || qDocBody.closingLine || undefined,
  } as ImSummaryItem;
  if (existingImIdx >= 0) imList[existingImIdx] = mappedIm;
  else imList.unshift(mappedIm);
}

export function mapDocumentRowToImSummary(
  d: any,
  buildings: any[],
  realPhotosByBuildingId: Map<string, any[]>
): ImSummaryItem {
  const ssotSummary = d.ssot_summary || d.body?.ssot_summary || {};
  const bld = buildings.find((b) => b.id === d.building_id);
  const layers = (bld?.layers as Record<string, any>) || {};
  const askingPriceManwon = Number(ssotSummary.asking_price_manwon || layers.deal_terms?.asking_price_manwon) || 0;
  const versionNo = Number(d.version_no ?? d.body?.version_no ?? 1);
  const isPublished = d.status === "published" || d.status === "broker_reviewed";
  const rawFloorLeases = d.floor_leases ?? d.body?.floor_leases;
  const rawDocRentRoll = d.rent_roll ?? d.body?.rent_roll ?? rawFloorLeases;
  const normalizedDocRentRoll = Array.isArray(rawDocRentRoll)
    ? rawDocRentRoll.map((r: any, rIdx: number) => {
        const flMatch = Array.isArray(rawFloorLeases) ? rawFloorLeases[rIdx] : undefined;
        const isVac = Boolean(
          r?.status === "vacant" || r?.is_vacant === true || r?.lease_state === "공실" || r?.tenant_name === "공실" || r?.use === "공실"
        );
        const isOwn = Boolean(
          !isVac && (r?.status === "owner" || r?.lease_state === "자가사용" || r?.tenant_type === "자가" || r?.tenant_name === "자가" || r?.use === "자가사용")
        );
        const rawUseParts = [
          ...(r?.use ? String(r.use).split(/\s*\/\s*/) : []),
          r?.tenant_name || r?.tenantName || flMatch?.tenant_name,
          r?.tenant_type || r?.business_type || flMatch?.tenant_type,
        ]
          .map((s) => String(s || "").trim())
          .filter(Boolean);
        const useLabel = Array.from(new Set(rawUseParts)).join(" / ") || (isVac ? "공실" : isOwn ? "자가사용" : "근린생활시설");
        const rawFl = String(r?.floor || flMatch?.floor || `${rIdx + 1}F`).trim();
        const rawUn = String(r?.unit || r?.unit_label || flMatch?.unit_label || "").trim();
        const resolvedUnit = /^(?:B|지하\s*)?\d{3,4}\s*호$/i.test(rawFl) ? rawFl : rawUn;
        const rawAreaSqm = Number(r?.areaSqm ?? r?.area_sqm ?? r?.area_m2 ?? r?.exclusive_area_sqm ?? flMatch?.area_sqm ?? 0);
        const validAreaSqm = rawAreaSqm > 0 && Math.abs(rawAreaSqm - 2.45) > 0.05 ? rawAreaSqm : undefined;
        const rawExclSqm = Number(r?.exclusiveAreaSqm ?? r?.exclusive_area_sqm ?? flMatch?.exclusive_area_sqm ?? 0);
        return {
          id: r?.id || `r-db-${d.id}-${rIdx}`,
          floor: rawFl,
          unit: resolvedUnit,
          use: String(useLabel),
          ...(validAreaSqm ? { areaSqm: validAreaSqm } : {}),
          ...(rawExclSqm > 0 ? { exclusiveAreaSqm: rawExclSqm } : {}),
          depositManwon: Number(r?.depositManwon ?? r?.deposit_manwon ?? flMatch?.deposit_manwon ?? 0),
          monthlyRentManwon: Number(r?.monthlyRentManwon ?? r?.rent_manwon ?? flMatch?.rent_manwon ?? 0),
          maintenanceManwon: Number(r?.maintenanceManwon ?? r?.mgmt_fee_manwon ?? flMatch?.mgmt_fee_manwon ?? 0),
          leaseExpiry: String(r?.leaseExpiry || r?.lease_end || r?.expiryDate || flMatch?.lease_end || "-"),
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
    const explicitGross = Number(ssotSummary.gross_yield_pct);
    const explicitCap = Number(ssotSummary.cap_rate_pct);
    const explicitYield =
      Number.isFinite(explicitGross) && explicitGross > 0
        ? explicitGross
        : Number.isFinite(explicitCap) && explicitCap > 0
        ? explicitCap
        : 0;
    if (explicitYield > 0) {
      grossYieldPct = Math.round(explicitYield * 100) / 100;
    } else if (normalizedDocRentRoll && normalizedDocRentRoll.length > 0 && askingPriceManwon > 0) {
      const totals = normalizedDocRentRoll.reduce(
        (acc, r) => (r.status === "occupied" ? { dep: acc.dep + r.depositManwon, mon: acc.mon + r.monthlyRentManwon } : acc),
        { dep: 0, mon: 0 }
      );
      if (totals.mon > 0) {
        const netInvestment =
          totals.dep > 0 && askingPriceManwon > totals.dep
            ? askingPriceManwon - totals.dep
            : askingPriceManwon;
        grossYieldPct = Math.round((((totals.mon * 12) / Math.max(netInvestment, 1)) * 100) * 100) / 100;
      }
    }
  }

  const brokerContact = d.broker_contact ?? d.body?.broker_contact;
  const photos =
    normalizeSummaryPhotoList(d.photos_v2 ?? d.photos ?? d.body?.photos_v2 ?? d.body?.photos) ||
    (d.building_id ? realPhotosByBuildingId.get(d.building_id) : undefined);
  const rawDocExpectedRentRoll =
    d.expected_rent_roll ??
    d.body?.expected_rent_roll ??
    d.expectedRentRoll ??
    d.body?.expectedRentRoll ??
    ssotSummary.expected_rent_roll;
  const resolvedDocExpectedRentRoll =
    Array.isArray(rawDocExpectedRentRoll) && rawDocExpectedRentRoll.length > 0
      ? rawDocExpectedRentRoll
      : undefined;
  const resolvedDocExpectedRentRollMeta =
    d.expected_rent_roll_meta ??
    d.body?.expected_rent_roll_meta ??
    d.expectedRentRollMeta ??
    d.body?.expectedRentRollMeta ??
    undefined;
  const resolvedDocPnus =
    (Array.isArray(d.pnus) && d.pnus.length > 0 && d.pnus) ||
    (Array.isArray(d.body?.pnus) && d.body.pnus.length > 0 && d.body.pnus) ||
    (Array.isArray(ssotSummary.pnus) && ssotSummary.pnus.length > 0 && ssotSummary.pnus) ||
    undefined;
  const resolvedDocBrokerExtras =
    d.broker_extras ??
    d.body?.broker_extras ??
    d.brokerExtras ??
    d.body?.brokerExtras ??
    undefined;
  const resolvedDocBrokerExtrasForm = resolveBrokerExtrasForm(
    d.brokerExtrasForm ?? d.body?.brokerExtrasForm,
    resolvedDocBrokerExtras
  );

  return {
    id: d.id,
    documentId: d.id,
    buildingId: d.building_id,
    title: d.title || `${bld?.area_signal || "매물"} ${bld?.asset_type || "IM"}`.trim(),
    address: ssotSummary.address || layers.asset_identity?.address || bld?.area_signal || "서울시 핵심 상권",
    askingPriceManwon,
    grossYieldPct,
    status: isPublished ? "published" : "draft",
    versionLabel: isPublished ? `v${versionNo} 공개 중 ★` : `v${versionNo} 작성 중`,
    updatedAt: formatRelativeTime(d.updated_at || d.created_at),
    updatedAtIso:
      typeof (d.updated_at || d.created_at) === "string"
        ? String(d.updated_at || d.created_at)
        : undefined,
    hasUnpublishedEdits: Boolean(d.body?.hasUnpublishedEdits ?? d.hasUnpublishedEdits),
    rentRoll: normalizedDocRentRoll && normalizedDocRentRoll.length > 0 ? normalizedDocRentRoll : undefined,
    ...(resolvedDocExpectedRentRoll ? { expectedRentRoll: resolvedDocExpectedRentRoll } : {}),
    ...(resolvedDocExpectedRentRollMeta ? { expectedRentRollMeta: resolvedDocExpectedRentRollMeta } : {}),
    ...(resolvedDocPnus ? { pnus: resolvedDocPnus } : {}),
    ...(resolvedDocBrokerExtras ? { brokerExtras: resolvedDocBrokerExtras } : {}),
    ...(resolvedDocBrokerExtrasForm ? { brokerExtrasForm: resolvedDocBrokerExtrasForm } : {}),
    ...(photos && photos.length > 0 ? { photos } : {}),
    investmentPosture: rawPosture,
    gfaSqm: ssotSummary.total_gross_area_sqm ? String(ssotSummary.total_gross_area_sqm) : undefined,
    landAreaSqm: ssotSummary.land_area_sqm ? String(ssotSummary.land_area_sqm) : undefined,
    zoning: ssotSummary.zoning || undefined,
    completionDate: ssotSummary.completion_date || undefined,
    handoverNote: d.handover_note || d.body?.handover_note || ssotSummary.handover_note || undefined,
    axiosHighlights: Array.isArray(d.axios_highlights ?? d.body?.axios_highlights) ? (d.axios_highlights ?? d.body?.axios_highlights) : undefined,
    brokerName: cleanBrokerField(brokerContact?.brokerName || brokerContact?.name),
    brokerageName: cleanBrokerField(brokerContact?.brokerageName || brokerContact?.company),
    brokerPhone: cleanBrokerField(brokerContact?.brokerPhone || brokerContact?.phone),
    pnu: ssotSummary.pnu || d.body?.pnu || layers.asset_identity?.pnu || undefined,
    lat: ssotSummary.coordinates?.lat ?? ssotSummary.lat ?? d.body?.coordinates?.lat ?? layers.asset_identity?.coordinates?.lat ?? undefined,
    lng: ssotSummary.coordinates?.lng ?? ssotSummary.lng ?? d.body?.coordinates?.lng ?? layers.asset_identity?.coordinates?.lng ?? undefined,
    floorsAbove: ssotSummary.floors_above !== undefined ? Number(ssotSummary.floors_above) : layers.building_register?.floors_above,
    floorsBelow: ssotSummary.floors_below !== undefined ? Number(ssotSummary.floors_below) : layers.building_register?.floors_below,
    bcrPct: ssotSummary.bcr_pct !== undefined ? Number(ssotSummary.bcr_pct) : layers.building_register?.bcr_pct,
    farPct: ssotSummary.far_pct !== undefined ? Number(ssotSummary.far_pct) : layers.building_register?.far_pct,
    parkingTotal: ssotSummary.parking_total ?? ssotSummary.parking_count ?? undefined,
    elevatorCount: ssotSummary.elevator_count ?? undefined,
    officialLandPricePerSqm: ssotSummary.official_land_price_per_sqm ?? ssotSummary.official_land_price_krw ?? undefined,
    parcels: ssotSummary.parcels ?? d.parcels ?? d.body?.parcels ?? undefined,
    mainPurpose: ssotSummary.main_usage || ssotSummary.asset_type || bld?.asset_type || undefined,
    closingLine: ssotSummary.closing_line || brokerContact?.closingLine || d.body?.closingLine || undefined,
  } as ImSummaryItem;
}
