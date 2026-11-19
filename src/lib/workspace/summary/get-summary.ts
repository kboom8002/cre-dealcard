import { m2ToPyeong } from "@/domain/building/im-core/facts/area";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { isRealProductionRuntime } from "@/lib/env";
import {
  computeCard4Hash,
  generateAiOgHeadline,
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardGenerationSource,
  type DealCardPosture,
} from "@/lib/deal-card/card4-schema";
import { normalizeDealCardCopy, repairDealCardLine, repairDealCardPoints } from "@/lib/deal-card/copy-limits";
import { classifyDealCardOriginGroup, type UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import {
  getQuickImRecord,
  isDealCardDeleted,
  isDealCardSent,
  isUuid,
  listAllQuickImRecords,
  updateQuickImCard4,
} from "@/lib/im-lite/quick-generate-store";
import {
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from "@/lib/workspace/workspace-repository";
import {
  cleanBrokerField,
  formatBlindPriceBandFromManwon,
  formatRelativeTime,
  getUserMap,
  getUserSet,
  getWorkspaceMemoMemory,
  isWorkspaceMemoryEnabled,
  normalizeSummaryPhotoList,
  synthesizeBlindSafeImPoints,
  type BrokerProfileMeta,
  type ImSummaryItem,
} from "./types-and-helpers";
import {
  mapDocumentRowToImSummary,
  mergeQuickRecordIntoLists,
  mergeWorkspaceDealCard,
  mergeWorkspaceIm,
} from "./get-summary-mergers";

export interface GetSummaryContext {
  supabase: any;
  userId: string;
  role: string;
  targetId: string | null;
  brokerProfile: BrokerProfileMeta | null;
}

const SUMMARY_ACTIVITY_TYPES = [
  "dealcard_upserted",
  "dealcard_deleted",
  "dealcard_restored",
  "dealcard_sent",
  "dealcard_memo_paired",
  "unconverted_memo_saved",
  "unconverted_memo_deleted",
  "unconverted_memo_restored",
  "unconverted_memo_converted",
  "memo_saved",
  "im_upserted",
  "im_deleted",
  "im_restored",
];

function safeRunQuery<T>(q: any, fallback: T): Promise<T> {
  if (!q || typeof q.then !== "function") return Promise.resolve(fallback);
  return Promise.resolve(q).catch(() => fallback);
}

export async function handleGetWorkspaceSummary(ctx: GetSummaryContext) {
  const { supabase, userId, role, targetId, brokerProfile } = ctx;
  const isAdmin = role === "admin";
  const allowMemStore = isWorkspaceMemoryEnabled();

  // Parallel phase 1: workspace_items + buildings + owner-scoped activity_events + broker_memos
  let bldQuery: any =
    supabase && typeof supabase.from === "function"
      ? supabase
          .from("building_ssot_lite")
          .select(
            "id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers, input_type, raw_input"
          )
      : null;
  if (bldQuery && typeof bldQuery.neq === "function") bldQuery = bldQuery.neq("status", "archived");
  if (bldQuery && typeof bldQuery.order === "function") bldQuery = bldQuery.order("updated_at", { ascending: false });
  if (bldQuery && typeof bldQuery.limit === "function") bldQuery = bldQuery.limit(20);
  if (bldQuery && !isAdmin && typeof bldQuery.eq === "function") bldQuery = bldQuery.eq("owner_id", userId);

  let actQuery: any =
    supabase && typeof supabase.from === "function"
      ? supabase
          .from("activity_events")
          .select("id, event_type, entity_id, metadata, created_at")
          .eq("actor_id", userId)
      : null;
  if (actQuery && typeof actQuery.in === "function") actQuery = actQuery.in("event_type", SUMMARY_ACTIVITY_TYPES);
  if (actQuery && typeof actQuery.order === "function") actQuery = actQuery.order("created_at", { ascending: false });
  if (actQuery && typeof actQuery.limit === "function") actQuery = actQuery.limit(120);

  let memoQuery: any =
    supabase && typeof supabase.from === "function"
      ? supabase
          .from("broker_memos")
          .select(
            "id, memo_text, routing_type, routing_summary, status, converted_to, tags, is_pinned, created_at, updated_at"
          )
          .eq("user_id", userId)
      : null;
  if (memoQuery && typeof memoQuery.neq === "function") memoQuery = memoQuery.neq("status", "archived");
  if (memoQuery && typeof memoQuery.order === "function") memoQuery = memoQuery.order("created_at", { ascending: false });
  if (memoQuery && typeof memoQuery.limit === "function") memoQuery = memoQuery.limit(60);

  const [wsRes, bldRes, actRes, memoRes] = await Promise.all([
    listWorkspaceItemsForOwner(supabase, { ownerId: userId, isAdmin, limit: 200 }).catch(() => ({
      items: [] as WorkspaceItemRecord[],
      tableAvailable: false,
    })),
    safeRunQuery<{ data: any[] | null }>(bldQuery, { data: [] }),
    safeRunQuery<{ data: any[] | null }>(actQuery, { data: [] }),
    safeRunQuery<{ data: any[] | null }>(memoQuery, { data: [] }),
  ]);

  const buildings = [...(bldRes?.data || [])];
  if (targetId && isUuid(targetId) && !buildings.some((b) => b.id === targetId)) {
    const check = await assertBuildingOwner(supabase, targetId, userId, {
      allowAdmin: true,
      role,
    });
    if (check.ok) {
      const { data: singleBld } = await safeRunQuery<{ data: any }>(
        supabase
          .from("building_ssot_lite")
          .select(
            "id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers, input_type, raw_input"
          )
          .eq("id", targetId)
          .maybeSingle(),
        { data: null }
      );
      if (singleBld) buildings.unshift(singleBld);
    }
  }

  const buildingIds = buildings.map((b) => b.id);
  let docQuery: any =
    buildingIds.length > 0 && supabase && typeof supabase.from === "function"
      ? supabase
          .from("document_objects")
          .select(
            "id, building_id, document_type, title, status, updated_at, created_at, card4:body->card4, dealPoints:body->dealPoints, card4Headline:body->card4Headline, card4Points:body->card4Points, ssot_summary:body->ssot_summary, version_no:body->version_no, rent_roll:body->rent_roll, floor_leases:body->floor_leases, axios_highlights:body->axios_highlights, handover_note:body->handover_note, broker_contact:body->broker_contact, investment_posture:body->investment_posture, photos_v2:body->photos_v2, photos:body->photos, parcels:body->parcels, pnus:body->pnus"
          )
          .in("building_id", buildingIds)
      : null;
  if (docQuery && typeof docQuery.in === "function") {
    docQuery = docQuery.in("document_type", ["blind_teaser", "mobile_im", "im_lite", "im_lite_draft"]);
  }
  if (docQuery && typeof docQuery.neq === "function") docQuery = docQuery.neq("status", "archived");
  if (docQuery && typeof docQuery.order === "function") docQuery = docQuery.order("created_at", { ascending: false });
  if (docQuery && typeof docQuery.limit === "function") docQuery = docQuery.limit(120);

  const docsDataRes = await safeRunQuery<{ data: any[] | null }>(docQuery, { data: [] });
  const docs = (docsDataRes?.data || []) as any[];

  // Map legacy buildings -> dealcards
  const dealcards: Array<Record<string, any>> = buildings.map((b) => {
    const teaserDoc = docs.find((d) => d.building_id === b.id && d.document_type === "blind_teaser");
    const imDocForBld = docs.find(
      (d) =>
        d.building_id === b.id &&
        (d.document_type === "mobile_im" ||
          d.document_type === "im_lite" ||
          d.document_type === "im_lite_draft")
    );
    const layersObj = (b.layers as Record<string, any>) || {};
    const gfaSqmRaw = Number(layersObj.building_register?.gross_floor_area_sqm || 0);
    const landSqmRaw = Number(layersObj.building_register?.land_area_sqm || 0);
    const rawImPosture = String(
      imDocForBld?.investment_posture ||
        imDocForBld?.ssot_summary?.investment_posture ||
        imDocForBld?.body?.investment_posture ||
        layersObj.deal_terms?.investment_posture ||
        ""
    ).trim();
    const mappedImPosture: DealCardPosture | undefined =
      rawImPosture === "owner_occupied" || rawImPosture === "owner_occupier"
        ? "owner_occupied"
        : ["value_add", "development", "redevelopment", "reconstruction"].includes(rawImPosture)
        ? "value_add"
        : rawImPosture
        ? "income"
        : undefined;

    const bodyCard4 = (teaserDoc?.card4 ?? teaserDoc?.body?.card4) as Partial<Card4Data> | undefined;
    const posture: DealCardPosture = bodyCard4?.posture || mappedImPosture || "income";
    const region = bodyCard4?.region || b.area_signal || "서울시 핵심 권역";
    const use = bodyCard4?.use || b.asset_type || "근린생활시설";
    const imAskingManwon = Number(
      imDocForBld?.ssot_summary?.asking_price_manwon ??
        imDocForBld?.body?.ssot_summary?.asking_price_manwon ??
        layersObj.deal_terms?.asking_price_manwon ??
        0
    );
    const priceBand =
      bodyCard4?.priceBand ||
      b.price_band ||
      formatBlindPriceBandFromManwon(imAskingManwon) ||
      "가격 협의";
    const teaserCard4Points = teaserDoc?.card4Points ?? teaserDoc?.body?.card4Points;
    const teaserDealPoints = teaserDoc?.dealPoints ?? teaserDoc?.body?.dealPoints;
    const rawPoints: string[] = Array.isArray(bodyCard4?.points)
      ? bodyCard4!.points
      : Array.isArray(teaserCard4Points) && teaserCard4Points.length > 0
      ? teaserCard4Points
      : Array.isArray(teaserDealPoints)
      ? teaserDealPoints
      : synthesizeBlindSafeImPoints({ imDoc: imDocForBld, layersObj, fitSummary: b.fit_summary, region, use, posture });
    const repairedPoints = repairDealCardPoints(rawPoints);
    const points: [string, string, string] = [
      repairedPoints[0] || repairDealCardLine(`${region} 핵심 입지`),
      repairedPoints[1] || repairDealCardLine(`${use} 추천 매물`),
      repairedPoints[2] || "안정적 임대수익 기대",
    ];
    const hash = bodyCard4?.card4_hash || computeCard4Hash({ region, use, priceBand, points });
    const gfaPyung = bodyCard4?.gfaPyung || (gfaSqmRaw > 0 ? Math.round(m2ToPyeong(gfaSqmRaw)) : undefined);
    const landAreaPyung = bodyCard4?.landAreaPyung || (landSqmRaw > 0 ? Math.round(m2ToPyeong(landSqmRaw)) : undefined);
    const area = resolveCard4AreaLabel({ ...bodyCard4, posture, gfaPyung, landAreaPyung }, { gfaPyung, landAreaPyung });
    const headline =
      repairDealCardLine(bodyCard4?.headline) ||
      repairDealCardLine(typeof (teaserDoc?.card4Headline ?? teaserDoc?.body?.card4Headline) === "string"
        ? (teaserDoc?.card4Headline ?? teaserDoc?.body?.card4Headline)
        : "") ||
      generateAiOgHeadline({ posture, points });

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
      ...(bodyCard4?.pointTones ? { pointTones: bodyCard4.pointTones } : {}),
      ...(bodyCard4?.pointBriefs ? { pointBriefs: bodyCard4.pointBriefs } : {}),
      provenance: bodyCard4?.provenance || { points: ["public", "broker", "ai"] },
      ...(bodyCard4?.pairedMemoId ? { pairedMemoId: bodyCard4.pairedMemoId } : {}),
      ...(bodyCard4?.generationSource ? { generationSource: bodyCard4.generationSource } : {}),
      card4_version: bodyCard4?.card4_version || 1,
      card4_hash: hash,
    };

    const rawInputMemo =
      typeof (b as any).raw_input === "string" && (b as any).raw_input.trim().length > 0
        ? String((b as any).raw_input)
        : undefined;
    const inputTypeStr = typeof (b as any).input_type === "string" ? String((b as any).input_type) : undefined;
    const inferredOrigin = classifyDealCardOriginGroup({
      card4,
      generationSource: bodyCard4?.generationSource,
      inputType: inputTypeStr,
      pairedMemoId: bodyCard4?.pairedMemoId,
    });

    return {
      id: b.id,
      title: `${region} ${use}`.trim(),
      region,
      use,
      priceBand,
      status: b.status === "published" || teaserDoc?.status === "published" ? "sent" : "draft",
      updatedAt: formatRelativeTime(b.updated_at),
      updatedAtIso: typeof b.updated_at === "string" ? b.updated_at : undefined,
      hasUnpublishedEdits: false,
      card4: { ...card4, generationSource: card4.generationSource || inferredOrigin },
      ...(rawInputMemo ? { memoText: rawInputMemo } : {}),
      ...(bodyCard4?.pairedMemoId ? { pairedMemoId: bodyCard4.pairedMemoId } : {}),
      generationSource: (card4.generationSource || inferredOrigin) as DealCardGenerationSource,
    };
  });

  // Collect real photos per building & map legacy IM documents
  const realPhotosByBuildingId = new Map<string, any[]>();
  for (const d of docs) {
    if (!d.building_id || realPhotosByBuildingId.has(d.building_id)) continue;
    const norm = normalizeSummaryPhotoList(d.photos_v2 ?? d.photos ?? d.body?.photos_v2 ?? d.body?.photos);
    if (norm) realPhotosByBuildingId.set(d.building_id, norm);
  }

  const sortedImCandidateDocs = [...docs]
    .filter((d) => ["mobile_im", "im_lite", "im_lite_draft"].includes(d.document_type))
    .sort((a, b) => {
      const aPub = a.status === "published" || a.status === "broker_reviewed" ? 1 : 0;
      const bPub = b.status === "published" || b.status === "broker_reviewed" ? 1 : 0;
      if (aPub !== bPub) return bPub - aPub;
      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    });

  const seenImBuildingIds = new Set<string>();
  const imList: ImSummaryItem[] = sortedImCandidateDocs
    .filter((d) => {
      if (!d.building_id) return true;
      if (seenImBuildingIds.has(d.building_id)) return false;
      seenImBuildingIds.add(d.building_id);
      return true;
    })
    .map((d) => mapDocumentRowToImSummary(d, buildings, realPhotosByBuildingId));

  // Parse activity events (user-scoped)
  const deletedBuildingIds = new Set<string>();
  const restoredOrActiveBuildingIds = new Set<string>();
  const sentBuildingIds = new Set<string>();
  const customUpsertedByBuilding = new Map<string, any>();
  const privateMemoPairingByBuilding = new Map<string, any>();
  const actUnconvertedMemos = new Map<string, UnconvertedMemoItem>();
  const actDeletedMemoIds = new Set<string>();
  const actRestoredMemoIds = new Set<string>();
  const actConvertedMemoToBuilding = new Map<string, string>();
  const deletedImIds = new Set<string>();
  const restoredOrActiveImIds = new Set<string>();
  const customImUpsertedByKey = new Map<string, { item: Record<string, any>; updatedAt: string }>();

  for (const act of actRes?.data || []) {
    const meta = (act.metadata as Record<string, any>) || {};
    const bId = String(meta.building_id || act.entity_id || "").trim();
    const imKey = String(meta.im_id || meta.building_id || act.entity_id || "").trim();
    const memoIdKey = String(meta.memo_id || act.id || "").trim();

    if (act.event_type === "unconverted_memo_deleted" && memoIdKey) {
      if (!actRestoredMemoIds.has(memoIdKey)) actDeletedMemoIds.add(memoIdKey);
      continue;
    }
    if (act.event_type === "unconverted_memo_converted" && memoIdKey) {
      if (bId && !actConvertedMemoToBuilding.has(memoIdKey)) actConvertedMemoToBuilding.set(memoIdKey, bId);
      continue;
    }
    if (
      (act.event_type === "unconverted_memo_saved" ||
        act.event_type === "unconverted_memo_restored" ||
        act.event_type === "memo_saved") &&
      memoIdKey
    ) {
      const rawTxt = String(meta.memo_text || meta.memoText || "").trim();
      if (rawTxt && !actDeletedMemoIds.has(memoIdKey)) {
        actRestoredMemoIds.add(memoIdKey);
        if (!actUnconvertedMemos.has(memoIdKey)) {
          actUnconvertedMemos.set(memoIdKey, {
            id: memoIdKey,
            memoText: rawTxt,
            routingType: String(meta.routing_type || meta.routingType || "new_deal"),
            routingSummary: meta.routing_summary || meta.routingSummary || null,
            createdAt: act.created_at,
            updatedAt: act.created_at,
          });
        }
      }
      continue;
    }
    if (act.event_type === "dealcard_memo_paired" && bId && bId !== userId) {
      if (!privateMemoPairingByBuilding.has(bId)) {
        privateMemoPairingByBuilding.set(bId, {
          memoText: typeof meta.private_memo_text === "string" ? meta.private_memo_text : undefined,
          pairedMemoId: typeof meta.paired_memo_id === "string" ? meta.paired_memo_id : undefined,
          generationSource:
            meta.generation_source === "ai_memo" || meta.generation_source === "manual"
              ? meta.generation_source
              : undefined,
        });
      }
      if (typeof meta.paired_memo_id === "string" && meta.paired_memo_id) {
        actConvertedMemoToBuilding.set(meta.paired_memo_id, bId);
      }
      continue;
    }
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
            item: {
              ...(meta.im_item as Record<string, any>),
              hasUnpublishedEdits: Boolean(
                meta.hasUnpublishedEdits ?? (meta.im_item as Record<string, any>).hasUnpublishedEdits
              ),
            },
            updatedAt: act.created_at,
          });
        }
      }
      continue;
    }
    if (!bId || bId === userId) continue;

    if (act.event_type === "dealcard_deleted") {
      if (!restoredOrActiveBuildingIds.has(bId)) deletedBuildingIds.add(bId);
    } else if (act.event_type === "dealcard_restored" || act.event_type === "dealcard_upserted") {
      if (!deletedBuildingIds.has(bId)) {
        restoredOrActiveBuildingIds.add(bId);
        if (typeof meta.paired_memo_id === "string" && meta.paired_memo_id) {
          actConvertedMemoToBuilding.set(meta.paired_memo_id, bId);
        }
        if (meta.card4 && !customUpsertedByBuilding.has(bId)) {
          customUpsertedByBuilding.set(bId, {
            card4: meta.card4 as Card4Data,
            updatedAt: act.created_at,
            status: meta.status === "sent" ? "sent" : undefined,
            hasUnpublishedEdits: Boolean(meta.has_unpublished_edits ?? meta.hasUnpublishedEdits),
            memoText: typeof meta.private_memo_text === "string" ? meta.private_memo_text : undefined,
            pairedMemoId: typeof meta.paired_memo_id === "string" ? meta.paired_memo_id : undefined,
            generationSource:
              meta.generation_source === "ai_memo" || meta.generation_source === "manual"
                ? meta.generation_source
                : undefined,
          });
          if (allowMemStore && !isUuid(bId)) {
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

  // Merge broker_memos + Vitest memory state
  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, userId);
  const memDeletedMemos = getUserSet(memoMem.deletedMemoIdsByUser, userId);
  const memConvertedMap = getUserMap(memoMem.convertedMemoToBuildingByUser, userId);
  const memPairingByBuilding = getUserMap(memoMem.pairingByUserBuilding, userId);

  const pairedMemoRowByBuilding = new Map<string, { id: string; memoText: string; routingType?: string }>();
  const unconvertedMemoMap = new Map<string, UnconvertedMemoItem>();

  for (const m of (memoRes?.data || []) as any[]) {
    if (!m?.id || typeof m.memo_text !== "string") continue;
    const mId = String(m.id);
    if (actDeletedMemoIds.has(mId) || memDeletedMemos.has(mId)) continue;
    const pairedTag = Array.isArray(m.tags)
      ? m.tags.find((t: unknown) => typeof t === "string" && t.startsWith("paired:"))
      : undefined;
    const linkedBuildingId =
      (typeof m.converted_to === "string" && m.converted_to.trim()) ||
      (typeof pairedTag === "string" ? pairedTag.slice("paired:".length).trim() : "") ||
      actConvertedMemoToBuilding.get(mId) ||
      memConvertedMap.get(mId) ||
      "";
    if (linkedBuildingId) {
      if (!pairedMemoRowByBuilding.has(linkedBuildingId)) {
        pairedMemoRowByBuilding.set(linkedBuildingId, {
          id: mId,
          memoText: m.memo_text,
          routingType: m.routing_type || "new_deal",
        });
      }
    } else if (m.status !== "converted") {
      unconvertedMemoMap.set(mId, {
        id: mId,
        memoText: m.memo_text,
        routingType: String(m.routing_type || "new_deal"),
        routingSummary: m.routing_summary || null,
        createdAt: m.created_at || new Date().toISOString(),
        updatedAt: m.updated_at || null,
        isPinned: Boolean(m.is_pinned),
      });
    }
  }

  for (const [mId, item] of actUnconvertedMemos.entries()) {
    if (actDeletedMemoIds.has(mId) || memDeletedMemos.has(mId)) continue;
    if (actConvertedMemoToBuilding.has(mId) || memConvertedMap.has(mId)) continue;
    if (!unconvertedMemoMap.has(mId)) unconvertedMemoMap.set(mId, item);
  }
  for (const [mId, item] of memUnconverted.entries()) {
    if (actDeletedMemoIds.has(mId) || memDeletedMemos.has(mId)) continue;
    if (actConvertedMemoToBuilding.has(mId) || memConvertedMap.has(mId)) continue;
    unconvertedMemoMap.set(mId, item);
  }
  const unconvertedMemos = Array.from(unconvertedMemoMap.values()).sort((a, b) => {
    const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  // Merge Vitest QuickImStore ONLY when allowed and STRICTLY owned by userId (zero cross-user leakage)
  if (allowMemStore) {
    const ownedQuick = listAllQuickImRecords()
      .filter((rec) => rec.ownerId === userId || (isAdmin && rec.ownerId))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    const quickTarget = targetId ? getQuickImRecord(targetId) : null;
    if (
      quickTarget &&
      (quickTarget.ownerId === userId || isAdmin) &&
      !ownedQuick.some((r) => r.buildingId === quickTarget.buildingId)
    ) {
      ownedQuick.unshift(quickTarget);
    }
    for (const qRec of [...ownedQuick].reverse()) {
      mergeQuickRecordIntoLists(qRec, userId, dealcards, imList, sentBuildingIds, brokerProfile);
    }
  }

  // Merge activity custom DealCards
  for (const [bId, customEntry] of customUpsertedByBuilding.entries()) {
    const idx = dealcards.findIndex((dc) => dc.id === bId || dc.canonicalId === bId);
    const prevDc = idx >= 0 ? dealcards[idx] : undefined;
    const isSent = sentBuildingIds.has(bId) || (allowMemStore && isDealCardSent(bId)) || customEntry.status === "sent";
    const c4 = normalizeDealCardCopy(customEntry.card4, { fillHeadline: true });
    const resolvedGenSrc = classifyDealCardOriginGroup({
      card4: c4,
      generationSource: customEntry.generationSource || prevDc?.generationSource,
      pairedMemoId: customEntry.pairedMemoId || prevDc?.pairedMemoId,
    });
    const itemObj: Record<string, any> = {
      id: bId,
      title: `${c4.region || "새"} ${c4.use || "딜카드"}`.trim(),
      region: c4.region,
      use: c4.use,
      priceBand: c4.priceBand,
      status: isSent ? "sent" : "draft",
      updatedAt: formatRelativeTime(customEntry.updatedAt),
      updatedAtIso:
        typeof customEntry.updatedAt === "string" ? customEntry.updatedAt : prevDc?.updatedAtIso,
      hasUnpublishedEdits: Boolean(customEntry.hasUnpublishedEdits),
      card4: { ...c4, generationSource: c4.generationSource || resolvedGenSrc },
      ...(customEntry.memoText !== undefined ? { memoText: customEntry.memoText } : prevDc?.memoText ? { memoText: prevDc.memoText } : {}),
      ...(customEntry.pairedMemoId || prevDc?.pairedMemoId ? { pairedMemoId: customEntry.pairedMemoId || prevDc?.pairedMemoId } : {}),
      generationSource: resolvedGenSrc,
    };
    if (idx >= 0) dealcards[idx] = itemObj;
    else dealcards.unshift(itemObj);
  }

  // Authoritative canonical workspace_items overlay for DealCards
  for (const wsItem of [...wsRes.items].reverse()) {
    if (wsItem.status === "archived" || wsItem.deletedAt) continue;
    if (wsItem.kind === "dealcard") {
      mergeWorkspaceDealCard(wsItem, dealcards);
    }
  }

  const finalDealcards = dealcards
    .filter((dc) => {
      if (deletedBuildingIds.has(dc.id) || (dc.canonicalId && deletedBuildingIds.has(dc.canonicalId))) return false;
      if (allowMemStore && isDealCardDeleted(dc.id) && !restoredOrActiveBuildingIds.has(dc.id)) return false;
      return true;
    })
    .map((dc) => {
      const memPair = memPairingByBuilding.get(dc.id);
      const actPair = privateMemoPairingByBuilding.get(dc.id);
      const rowPair = pairedMemoRowByBuilding.get(dc.id);
      const resolvedMemoText = memPair?.memoText ?? actPair?.memoText ?? dc.memoText ?? rowPair?.memoText;
      const resolvedPairedMemoId =
        memPair?.pairedMemoId || actPair?.pairedMemoId || dc.pairedMemoId || dc.card4?.pairedMemoId || rowPair?.id;
      const resolvedGen = classifyDealCardOriginGroup({
        card4: dc.card4,
        generationSource: memPair?.generationSource || actPair?.generationSource || dc.generationSource,
        pairedMemoId: resolvedPairedMemoId,
      });
      return {
        ...dc,
        status:
          dc.status === "sent" || sentBuildingIds.has(dc.id) || (allowMemStore && isDealCardSent(dc.id))
            ? ("sent" as const)
            : ("draft" as const),
        card4: {
          ...dc.card4,
          ...(resolvedPairedMemoId ? { pairedMemoId: resolvedPairedMemoId } : {}),
          generationSource: resolvedGen,
        },
        ...(resolvedMemoText !== undefined ? { memoText: resolvedMemoText } : {}),
        ...(resolvedPairedMemoId ? { pairedMemoId: resolvedPairedMemoId } : {}),
        generationSource: resolvedGen,
      };
    });

  // Merge custom IM activity overrides
  for (const [, customImEntry] of [...customImUpsertedByKey.entries()].reverse()) {
    const it = customImEntry.item;
    if (!it || (!it.id && !it.buildingId)) continue;
    const idx = imList.findIndex((im) => (it.id && im.id === it.id) || (it.buildingId && im.buildingId === it.buildingId));
    const prevPhotos = idx >= 0 ? imList[idx].photos : undefined;
    const itPhotos = normalizeSummaryPhotoList(it.photos) || prevPhotos;
    const mergedIm: ImSummaryItem = {
      ...(idx >= 0 ? imList[idx] : ({} as any)),
      ...it,
      ...(itPhotos ? { photos: itPhotos } : {}),
      id: String(it.id || (idx >= 0 ? imList[idx].id : it.buildingId)),
      buildingId: String(it.buildingId || (idx >= 0 ? imList[idx].buildingId : it.id)),
      brokerName: cleanBrokerField(it.brokerName, brokerProfile?.displayName),
      brokerageName: cleanBrokerField(it.brokerageName, brokerProfile?.company),
      brokerPhone: cleanBrokerField(it.brokerPhone, brokerProfile?.phone),
      updatedAt: formatRelativeTime(customImEntry.updatedAt),
      updatedAtIso:
        typeof customImEntry.updatedAt === "string"
          ? customImEntry.updatedAt
          : idx >= 0
          ? imList[idx].updatedAtIso
          : undefined,
      hasUnpublishedEdits: Boolean(
        it.hasUnpublishedEdits ?? (idx >= 0 ? imList[idx].hasUnpublishedEdits : false)
      ),
    };
    if (idx >= 0) imList.splice(idx, 1);
    imList.unshift(mergedIm);
  }

  // Authoritative canonical workspace_items overlay for IMs (overrides older activity_events snapshots)
  for (const wsItem of [...wsRes.items].reverse()) {
    if (wsItem.status === "archived" || wsItem.deletedAt) continue;
    if (wsItem.kind === "im") {
      mergeWorkspaceIm(wsItem, imList, brokerProfile);
    }
  }

  const seenImIds = new Set<string>();
  const seenImBldIds = new Set<string>();
  const finalImList = imList.filter((im) => {
    if (deletedImIds.has(im.id) || (im.buildingId && deletedImIds.has(im.buildingId))) return false;
    if (im.id) {
      if (seenImIds.has(im.id)) return false;
      seenImIds.add(im.id);
    }
    if (im.buildingId && isUuid(im.buildingId)) {
      if (seenImBldIds.has(im.buildingId)) return false;
      seenImBldIds.add(im.buildingId);
    }
    return true;
  });

  // Never allow demo seeds in real production
  const cleanDealcards = isRealProductionRuntime()
    ? finalDealcards.filter((dc: Record<string, any>) => !/^bld-0[1-3]$/.test(String(dc.id)))
    : finalDealcards;

  return {
    ok: true,
    dealcards: cleanDealcards,
    unconvertedMemos,
    imList: finalImList,
    ims: finalImList,
    brokerProfile,
  };
}
