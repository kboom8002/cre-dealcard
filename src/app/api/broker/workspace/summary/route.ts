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
  type DealCardGenerationSource,
  type DealCardPosture,
} from "@/lib/deal-card/card4-schema";
import {
  classifyDealCardOriginGroup,
  type UnconvertedMemoItem,
} from "@/lib/deal-card/memo-pairing";
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
  synthesizeQuickRecordFromImItem,
  deleteQuickImRecord,
  resolveKnownTestAssetUrl,
} from "@/lib/im-lite/quick-generate-store";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  normalizeDealCardCopy,
  repairDealCardLine,
  repairDealCardPoints,
} from "@/lib/deal-card/copy-limits";

interface PrivateMemoPairingRecord {
  memoText: string;
  pairedMemoId?: string;
  generationSource?: DealCardGenerationSource;
  updatedAt: string;
}

interface WorkspaceMemoMemoryState {
  unconvertedByUser: Map<string, Map<string, UnconvertedMemoItem>>;
  deletedMemoIdsByUser: Map<string, Set<string>>;
  convertedMemoToBuildingByUser: Map<string, Map<string, string>>;
  pairingByUserBuilding: Map<string, Map<string, PrivateMemoPairingRecord>>;
}

function getWorkspaceMemoMemory(): WorkspaceMemoMemoryState {
  const g = globalThis as unknown as {
    __creWorkspaceMemoMemory?: WorkspaceMemoMemoryState;
  };
  if (!g.__creWorkspaceMemoMemory) {
    g.__creWorkspaceMemoMemory = {
      unconvertedByUser: new Map(),
      deletedMemoIdsByUser: new Map(),
      convertedMemoToBuildingByUser: new Map(),
      pairingByUserBuilding: new Map(),
    };
  }
  return g.__creWorkspaceMemoMemory;
}

function getUserMap<V>(outer: Map<string, Map<string, V>>, userId: string): Map<string, V> {
  let inner = outer.get(userId);
  if (!inner) {
    inner = new Map();
    outer.set(userId, inner);
  }
  return inner;
}

function getUserSet(outer: Map<string, Set<string>>, userId: string): Set<string> {
  let inner = outer.get(userId);
  if (!inner) {
    inner = new Set();
    outer.set(userId, inner);
  }
  return inner;
}

async function syncPairedMemoRow(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    userId: string;
    buildingId: string;
    memoText?: string;
    pairedMemoId?: string;
  }
): Promise<string | undefined> {
  const { userId, buildingId, memoText, pairedMemoId } = params;
  const trimmedMemo = typeof memoText === "string" ? memoText.trim() : undefined;
  const pairedTag = `paired:${buildingId}`;
  let resolvedMemoId = pairedMemoId || undefined;

  try {
    if (!supabase || typeof supabase.from !== "function") {
      return resolvedMemoId;
    }

    if (resolvedMemoId && isUuid(resolvedMemoId)) {
      const { data: existingMemo } = await supabase
        .from("broker_memos")
        .select("id, user_id, tags")
        .eq("id", resolvedMemoId)
        .maybeSingle();

      if (existingMemo && existingMemo.user_id === userId) {
        const prevTags = Array.isArray((existingMemo as any).tags)
          ? ((existingMemo as any).tags as string[]).filter(
              (t) => typeof t === "string" && !t.startsWith("paired:")
            )
          : [];
        const nextTags = isUuid(buildingId) ? prevTags : [...prevTags, pairedTag];
        const updates: Record<string, unknown> = {
          // status 는 반드시 'saved' 를 유지하여 /broker/memos 에서도 증발하지 않도록 보존한다.
          status: "saved",
          converted_to: isUuid(buildingId) ? buildingId : null,
          tags: nextTags,
        };
        if (memoText !== undefined && trimmedMemo && trimmedMemo.length > 0) {
          updates.memo_text = memoText;
        }
        await supabase.from("broker_memos").update(updates).eq("id", resolvedMemoId);
        return resolvedMemoId;
      }
    }

    if (trimmedMemo && trimmedMemo.length > 0) {
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        memo_text: memoText,
        routing_type: "new_deal",
        status: "saved",
        converted_to: isUuid(buildingId) ? buildingId : null,
        tags: isUuid(buildingId) ? [] : [pairedTag],
      };
      const insQuery: any = supabase.from("broker_memos").insert(insertPayload);
      const { data: inserted } =
        typeof insQuery?.select === "function"
          ? await insQuery.select("id").maybeSingle()
          : { data: null };
      if (inserted?.id) {
        resolvedMemoId = String(inserted.id);
      }
    }
  } catch {
    // Non-blocking if broker_memos table or mock unavailable
  }

  return resolvedMemoId;
}

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

export interface ImSummaryItem {
  id: string;
  buildingId: string;
  title: string;
  address: string;
  askingPriceManwon: number;
  grossYieldPct: number;
  status: "draft" | "published";
  versionLabel: string;
  updatedAt: string;
  rentRoll?: any[];
  photos?: any[];
  investmentPosture?: string;
  gfaSqm?: string;
  landAreaSqm?: string;
  zoning?: string;
  completionDate?: string;
  handoverNote?: string;
  axiosHighlights?: any[];
  brokerName?: string;
  brokerageName?: string;
  brokerPhone?: string;
  pnu?: string;
  lat?: number;
  lng?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  bcrPct?: number;
  farPct?: number;
  parkingTotal?: number;
  elevatorCount?: number;
  officialLandPricePerSqm?: number;
  parcels?: any[];
  mainPurpose?: string;
  closingLine?: string;
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
    .select(
      "id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers, input_type, raw_input"
    )
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
        .select(
          "id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers, input_type, raw_input"
        )
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
            "id, building_id, document_type, title, status, updated_at, created_at, card4:body->card4, dealPoints:body->dealPoints, card4Headline:body->card4Headline, card4Points:body->card4Points, ssot_summary:body->ssot_summary, version_no:body->version_no, rent_roll:body->rent_roll, floor_leases:body->floor_leases, axios_highlights:body->axios_highlights, handover_note:body->handover_note, broker_contact:body->broker_contact, investment_posture:body->investment_posture, photos_v2:body->photos_v2, photos:body->photos, parcels:body->parcels, pnus:body->pnus"
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
    ? await (typeof docQuery.limit === "function" ? docQuery.limit(120) : docQuery)
    : { data: [] as any[] };

  const docs = (docsData || []) as any[];

  const dealcards = buildings.map((b) => {
    const teaserDoc = docs.find(
      (d) => d.building_id === b.id && d.document_type === "blind_teaser"
    );
    const bodyCard4 = (teaserDoc?.card4 ?? teaserDoc?.body?.card4) as Partial<Card4Data> | undefined;
    const teaserDealPoints = teaserDoc?.dealPoints ?? teaserDoc?.body?.dealPoints;
    // from-memo 파이프라인이 생성한 18자 딜카드 전용 문구 (BlindTeaser card4Headline/card4Points)
    const teaserCard4Points = teaserDoc?.card4Points ?? teaserDoc?.body?.card4Points;
    const teaserCard4Headline = teaserDoc?.card4Headline ?? teaserDoc?.body?.card4Headline;
    const region = bodyCard4?.region || b.area_signal || "서울시 핵심 권역";
    const use = bodyCard4?.use || b.asset_type || "근린생활시설";
    const priceBand = bodyCard4?.priceBand || b.price_band || "가격 협의";
    const rawPoints: string[] = Array.isArray(bodyCard4?.points)
      ? bodyCard4!.points
      : Array.isArray(teaserCard4Points) && teaserCard4Points.length > 0
      ? teaserCard4Points
      : Array.isArray(teaserDealPoints)
      ? teaserDealPoints
      : [
          b.fit_summary ? String(b.fit_summary) : `${region} 핵심 입지`,
          `${use} 추천 매물`,
          "상세 수익률 및 임대현황 확인 가능",
        ];
    // 18자 SSOT: 하드 절단 대신 어절 경계 교정 (copy-limits)
    const repairedPoints = repairDealCardPoints(rawPoints);
    const points: [string, string, string] = [
      repairedPoints[0] || repairDealCardLine(`${region} 핵심 입지`),
      repairedPoints[1] || repairDealCardLine(`${use} 추천 매물`),
      repairedPoints[2] || "안정적 임대수익 기대",
    ];
    const hash = bodyCard4?.card4_hash || computeCard4Hash({ region, use, priceBand, points });
    const layersObj = (b.layers as Record<string, any>) || {};
    const gfaSqmRaw = Number(layersObj.building_register?.gross_floor_area_sqm || 0);
    const landSqmRaw = Number(layersObj.building_register?.land_area_sqm || 0);
    const gfaPyung = bodyCard4?.gfaPyung || (gfaSqmRaw > 0 ? Math.round(gfaSqmRaw / 3.3058) : undefined);
    const landAreaPyung = bodyCard4?.landAreaPyung || (landSqmRaw > 0 ? Math.round(landSqmRaw / 3.3058) : undefined);
    const imDocForBld = docs.find(
      (d) =>
        d.building_id === b.id &&
        (d.document_type === "mobile_im" ||
          d.document_type === "im_lite" ||
          d.document_type === "im_lite_draft")
    );
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
        : rawImPosture === "value_add" ||
          rawImPosture === "development" ||
          rawImPosture === "redevelopment" ||
          rawImPosture === "reconstruction"
        ? "value_add"
        : rawImPosture
        ? "income"
        : undefined;
    const posture: DealCardPosture = bodyCard4?.posture || mappedImPosture || "income";
    const area = resolveCard4AreaLabel(
      { ...bodyCard4, posture, gfaPyung, landAreaPyung },
      { gfaPyung, landAreaPyung }
    );
    // 한 줄 제목 SSOT: 저장된 card4.headline → AI 딜카드 제목 → 장점 기반 파생 제목.
    // 편집기 "한 줄 제목" 입력과 OG/고객 화면이 같은 필드를 보도록 card4.headline 에 채워 내려준다.
    const headline =
      repairDealCardLine(bodyCard4?.headline) ||
      repairDealCardLine(typeof teaserCard4Headline === "string" ? teaserCard4Headline : "") ||
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
      provenance: bodyCard4?.provenance || {
        points: ["public", "broker", "ai"],
      },
      ...(bodyCard4?.pairedMemoId ? { pairedMemoId: bodyCard4.pairedMemoId } : {}),
      ...(bodyCard4?.generationSource ? { generationSource: bodyCard4.generationSource } : {}),
      card4_version: bodyCard4?.card4_version || 1,
      card4_hash: hash,
    };

    const rawInputMemo =
      typeof (b as any).raw_input === "string" && (b as any).raw_input.trim().length > 0
        ? String((b as any).raw_input)
        : undefined;
    const inputTypeStr =
      typeof (b as any).input_type === "string" ? String((b as any).input_type) : undefined;
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
      card4: {
        ...card4,
        generationSource: card4.generationSource || inferredOrigin,
      },
      ...(rawInputMemo ? { memoText: rawInputMemo } : {}),
      ...(bodyCard4?.pairedMemoId ? { pairedMemoId: bodyCard4.pairedMemoId } : {}),
      generationSource: (card4.generationSource || inferredOrigin) as DealCardGenerationSource,
    };
  });

  const realPhotosByBuildingId = new Map<string, any[]>();
  for (const d of docs) {
    if (!d.building_id || realPhotosByBuildingId.has(d.building_id)) continue;
    const cand = d.photos_v2 ?? d.photos ?? d.body?.photos_v2 ?? d.body?.photos;
    if (Array.isArray(cand)) {
      const valid = cand.filter(
        (p: any) =>
          p &&
          typeof p.url === "string" &&
          p.url.trim().length > 0 &&
          !p.url.startsWith("/test-images/") &&
          !p.url.startsWith("blob:")
      );
      if (valid.length > 0) {
        realPhotosByBuildingId.set(d.building_id, valid);
      }
    }
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
  const imDocs = sortedImCandidateDocs.filter((d) => {
    if (d.building_id) {
      if (seenImBuildingIds.has(d.building_id)) return false;
      seenImBuildingIds.add(d.building_id);
    }
    return true;
  });

  const imList: ImSummaryItem[] = imDocs.map((d) => {
    const ssotSummary = d.ssot_summary || d.body?.ssot_summary || {};
    const bld = buildings.find((b) => b.id === d.building_id);
    const layers = (bld?.layers as Record<string, any>) || {};
    const address =
      ssotSummary.address ||
      layers.asset_identity?.address ||
      bld?.area_signal ||
      "서울시 핵심 상권";
    const askingPriceManwon =
      Number(ssotSummary.asking_price_manwon || layers.deal_terms?.asking_price_manwon) || 0;
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
    const rawDocPhotos =
      d.photos_v2 ??
      d.photos ??
      d.body?.photos_v2 ??
      d.body?.photos ??
      (d.building_id ? realPhotosByBuildingId.get(d.building_id) : undefined);
    const filteredDocPhotos = Array.isArray(rawDocPhotos)
      ? rawDocPhotos.filter(
          (p: any) =>
            p &&
            typeof p.url === "string" &&
            p.url.trim().length > 0 &&
            !p.url.startsWith("/test-images/") &&
            !p.url.startsWith("blob:")
        )
      : [];
    const effectiveRawPhotos =
      filteredDocPhotos.length > 0
        ? filteredDocPhotos
        : d.building_id && realPhotosByBuildingId.has(d.building_id)
        ? realPhotosByBuildingId.get(d.building_id)!
        : [];
    const normalizedDocPhotos =
      effectiveRawPhotos.length > 0
        ? effectiveRawPhotos.map((p: any, idx: number) => ({
            ...(p.name ? { name: String(p.name) } : {}),
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
      pnu: ssotSummary.pnu || d.body?.pnu || layers.asset_identity?.pnu || undefined,
      lat:
        ssotSummary.coordinates?.lat ??
        ssotSummary.lat ??
        d.body?.coordinates?.lat ??
        d.body?.lat ??
        layers.asset_identity?.coordinates?.lat ??
        undefined,
      lng:
        ssotSummary.coordinates?.lng ??
        ssotSummary.lng ??
        d.body?.coordinates?.lng ??
        d.body?.lng ??
        layers.asset_identity?.coordinates?.lng ??
        undefined,
      floorsAbove:
        ssotSummary.floors_above !== undefined
          ? Number(ssotSummary.floors_above)
          : layers.building_register?.floors_above !== undefined
          ? Number(layers.building_register.floors_above)
          : undefined,
      floorsBelow:
        ssotSummary.floors_below !== undefined
          ? Number(ssotSummary.floors_below)
          : layers.building_register?.floors_below !== undefined
          ? Number(layers.building_register.floors_below)
          : undefined,
      bcrPct:
        ssotSummary.bcr_pct !== undefined
          ? Number(ssotSummary.bcr_pct)
          : layers.building_register?.bcr_pct !== undefined
          ? Number(layers.building_register.bcr_pct)
          : undefined,
      farPct:
        ssotSummary.far_pct !== undefined
          ? Number(ssotSummary.far_pct)
          : layers.building_register?.far_pct !== undefined
          ? Number(layers.building_register.far_pct)
          : undefined,
      parkingTotal:
        ssotSummary.parking_total !== undefined
          ? Number(ssotSummary.parking_total)
          : ssotSummary.parking_count !== undefined
          ? Number(ssotSummary.parking_count)
          : undefined,
      elevatorCount:
        ssotSummary.elevator_count !== undefined ? Number(ssotSummary.elevator_count) : undefined,
      officialLandPricePerSqm:
        ssotSummary.official_land_price_per_sqm !== undefined
          ? Number(ssotSummary.official_land_price_per_sqm)
          : ssotSummary.official_land_price_krw !== undefined
          ? Number(ssotSummary.official_land_price_krw)
          : undefined,
      parcels: Array.isArray(ssotSummary.parcels)
        ? ssotSummary.parcels
        : Array.isArray((d as any).parcels)
        ? (d as any).parcels
        : Array.isArray(d.body?.parcels)
        ? d.body.parcels
        : undefined,
      mainPurpose:
        ssotSummary.main_usage || ssotSummary.asset_type || bld?.asset_type || undefined,
      closingLine:
        ssotSummary.closing_line ||
        brokerContact?.closingLine ||
        brokerContact?.closing_line ||
        d.body?.closingLine ||
        d.body?.closing_line ||
        undefined,
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
    {
      card4: Card4Data;
      updatedAt: string;
      status?: "draft" | "sent";
      memoText?: string;
      pairedMemoId?: string;
      generationSource?: DealCardGenerationSource;
    }
  >();
  const privateMemoPairingByBuilding = new Map<
    string,
    {
      memoText?: string;
      pairedMemoId?: string;
      generationSource?: DealCardGenerationSource;
    }
  >();
  const actUnconvertedMemos = new Map<string, UnconvertedMemoItem>();
  const actDeletedMemoIds = new Set<string>();
  const actRestoredMemoIds = new Set<string>();
  const actConvertedMemoToBuilding = new Map<string, string>();
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
          "dealcard_memo_paired",
          "unconverted_memo_saved",
          "unconverted_memo_deleted",
          "unconverted_memo_restored",
          "unconverted_memo_converted",
          "memo_saved",
          "im_upserted",
          "im_deleted",
          "im_restored",
        ]);
      }
      if (typeof actQuery.order === "function") {
        actQuery = actQuery.order("created_at", { ascending: false });
      }
      if (typeof actQuery.limit === "function") {
        actQuery = actQuery.limit(120);
      }
      const { data: dcActs } = await actQuery;
      for (const act of dcActs || []) {
        const meta = (act.metadata as Record<string, any>) || {};
        const bId = String(meta.building_id || act.entity_id || "").trim();
        const imKey = String(meta.im_id || meta.building_id || act.entity_id || "").trim();
        const memoIdKey = String(meta.memo_id || act.id || "").trim();

        if (act.event_type === "unconverted_memo_deleted" && memoIdKey) {
          if (!actRestoredMemoIds.has(memoIdKey)) {
            actDeletedMemoIds.add(memoIdKey);
          }
          continue;
        }
        if (act.event_type === "unconverted_memo_converted" && memoIdKey) {
          if (bId && !actConvertedMemoToBuilding.has(memoIdKey)) {
            actConvertedMemoToBuilding.set(memoIdKey, bId);
          }
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
              memoText:
                typeof meta.private_memo_text === "string" ? meta.private_memo_text : undefined,
              pairedMemoId:
                typeof meta.paired_memo_id === "string" ? meta.paired_memo_id : undefined,
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
            if (!privateMemoPairingByBuilding.has(bId) && (meta.private_memo_text !== undefined || meta.paired_memo_id || meta.generation_source)) {
              privateMemoPairingByBuilding.set(bId, {
                memoText:
                  typeof meta.private_memo_text === "string" ? meta.private_memo_text : undefined,
                pairedMemoId:
                  typeof meta.paired_memo_id === "string" ? meta.paired_memo_id : undefined,
                generationSource:
                  meta.generation_source === "ai_memo" || meta.generation_source === "manual"
                    ? meta.generation_source
                    : undefined,
              });
            }
            if (typeof meta.paired_memo_id === "string" && meta.paired_memo_id) {
              actConvertedMemoToBuilding.set(meta.paired_memo_id, bId);
            }
            if (meta.card4 && !customUpsertedByBuilding.has(bId)) {
              customUpsertedByBuilding.set(bId, {
                card4: meta.card4 as Card4Data,
                updatedAt: act.created_at,
                status: meta.status === "sent" ? "sent" : undefined,
                memoText:
                  typeof meta.private_memo_text === "string" ? meta.private_memo_text : undefined,
                pairedMemoId:
                  typeof meta.paired_memo_id === "string" ? meta.paired_memo_id : undefined,
                generationSource:
                  meta.generation_source === "ai_memo" || meta.generation_source === "manual"
                    ? meta.generation_source
                    : undefined,
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

  // Query broker_memos for unconverted memos AND 1:1 paired memo resolution
  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, userId);
  const memDeletedMemos = getUserSet(memoMem.deletedMemoIdsByUser, userId);
  const memConvertedMap = getUserMap(memoMem.convertedMemoToBuildingByUser, userId);
  const memPairingByBuilding = getUserMap(memoMem.pairingByUserBuilding, userId);

  const pairedMemoRowByBuilding = new Map<
    string,
    { id: string; memoText: string; routingType?: string }
  >();
  const unconvertedMemoMap = new Map<string, UnconvertedMemoItem>();

  try {
    if (supabase && typeof supabase.from === "function") {
      let memoQuery: any = supabase
        .from("broker_memos")
        .select(
          "id, memo_text, routing_type, routing_summary, status, converted_to, tags, is_pinned, created_at, updated_at"
        )
        .eq("user_id", userId);
      if (typeof memoQuery.neq === "function") {
        memoQuery = memoQuery.neq("status", "archived");
      }
      if (typeof memoQuery.order === "function") {
        memoQuery = memoQuery.order("created_at", { ascending: false });
      }
      if (typeof memoQuery.limit === "function") {
        memoQuery = memoQuery.limit(60);
      }
      const { data: mRows } = await memoQuery;
      for (const m of (mRows || []) as any[]) {
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
    }
  } catch {
    // Non-blocking if broker_memos table or mock unavailable
  }

  for (const [mId, item] of actUnconvertedMemos.entries()) {
    if (actDeletedMemoIds.has(mId) || memDeletedMemos.has(mId)) continue;
    if (actConvertedMemoToBuilding.has(mId) || memConvertedMap.has(mId)) continue;
    if (!unconvertedMemoMap.has(mId)) {
      unconvertedMemoMap.set(mId, item);
    }
  }
  for (const [mId, item] of memUnconverted.entries()) {
    if (actDeletedMemoIds.has(mId) || memDeletedMemos.has(mId)) continue;
    if (actConvertedMemoToBuilding.has(mId) || memConvertedMap.has(mId)) continue;
    unconvertedMemoMap.set(mId, item);
  }

  const unconvertedMemos: UnconvertedMemoItem[] = Array.from(unconvertedMemoMap.values()).sort(
    (a, b) => {
      const aPin = a.isPinned ? 1 : 0;
      const bPin = b.isPinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
  );

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

  const hasOwnedDealcards =
    dealcards.length > 0 ||
    allQuickRecords.some((r) => r.ownerId === userId) ||
    customUpsertedByBuilding.size > 0;

  for (const qRec of [...allQuickRecords].reverse()) {
    const existingDcIdx = dealcards.findIndex((dc) => dc.id === qRec.buildingId);
    const isSent = sentBuildingIds.has(qRec.buildingId) || isDealCardSent(qRec.buildingId);
    const normalizedQuickCard4 = normalizeDealCardCopy(qRec.card4, { fillHeadline: true });
    const quickGenSource = classifyDealCardOriginGroup({ card4: normalizedQuickCard4 });
    const mappedDc = {
      id: qRec.buildingId,
      title: `${qRec.card4.region} ${qRec.card4.use}`.trim(),
      region: qRec.card4.region,
      use: qRec.card4.use,
      priceBand: qRec.card4.priceBand,
      status: (isSent ? "sent" : "draft") as "draft" | "sent",
      updatedAt: formatRelativeTime(qRec.updatedAt),
      card4: {
        ...normalizedQuickCard4,
        generationSource: quickGenSource as DealCardGenerationSource,
      },
      ...(normalizedQuickCard4.pairedMemoId
        ? { pairedMemoId: normalizedQuickCard4.pairedMemoId }
        : {}),
      generationSource: quickGenSource as DealCardGenerationSource,
    };
    if (existingDcIdx >= 0) {
      if (qRec.ownerId === userId) {
        dealcards[existingDcIdx] = mappedDc;
      }
    } else if (
      qRec.ownerId === userId ||
      (!qRec.ownerId && !hasOwnedDealcards && dealcards.length === 0) ||
      (targetId && qRec.buildingId === targetId)
    ) {
      if (qRec.ownerId === userId || (targetId && qRec.buildingId === targetId)) {
        dealcards.unshift(mappedDc);
      } else {
        dealcards.push(mappedDc);
      }
    }

    const existingImIdx = imList.findIndex(
      (im) => im.id === qRec.documentId || im.buildingId === qRec.buildingId
    );
    const qDocBody = ((qRec as any).docBody || qRec.fullDocBody || {}) as Record<string, any>;
    const qSsot = (qDocBody.ssot_summary || {}) as Record<string, any>;
    const qRawPhotos = Array.isArray(qDocBody.photos_v2) && qDocBody.photos_v2.length > 0
      ? qDocBody.photos_v2
      : Array.isArray(qDocBody.photos) && qDocBody.photos.length > 0
      ? qDocBody.photos
      : Array.isArray(qRec.basicImDoc?.facts?.photos)
      ? qRec.basicImDoc.facts.photos
      : [];
    const qNormalizedPhotos = qRawPhotos
      .filter(
        (p: any) =>
          p &&
          typeof p.url === "string" &&
          p.url.trim().length > 0 &&
          !p.url.startsWith("/test-images/") &&
          !p.url.startsWith("blob:")
      )
      .map((p: any, idx: number) => ({
        ...(p.name ? { name: String(p.name) } : {}),
        url: String(p.url),
        caption: String(p.caption || p.label || `현장 사진 ${idx + 1}`),
        category: String(p.category || p.type || (idx === 0 ? "exterior" : "interior")),
        isHero: Boolean(p.isHero ?? idx === 0),
      }));
    const mappedIm: ImSummaryItem = {
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
      ...(qNormalizedPhotos.length > 0 ? { photos: qNormalizedPhotos } : {}),
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
      pnu: qRec.pnu || qSsot.pnu || qDocBody.pnu || undefined,
      lat:
        qRec.coordinates?.lat ??
        qRec.lat ??
        qSsot.coordinates?.lat ??
        qSsot.lat ??
        qDocBody.coordinates?.lat ??
        undefined,
      lng:
        qRec.coordinates?.lng ??
        qRec.lng ??
        qSsot.coordinates?.lng ??
        qSsot.lng ??
        qDocBody.coordinates?.lng ??
        undefined,
      floorsAbove: qRec.floorsAbove ?? qRec.specs?.floorsAbove ?? qSsot.floors_above ?? undefined,
      floorsBelow: qRec.floorsBelow ?? qRec.specs?.floorsBelow ?? qSsot.floors_below ?? undefined,
      bcrPct: qRec.specs?.bcrPct ?? qSsot.bcr_pct ?? undefined,
      farPct: qRec.specs?.farPct ?? qSsot.far_pct ?? undefined,
      parkingTotal:
        qRec.specs?.parkingSpaces ?? qSsot.parking_total ?? qSsot.parking_count ?? undefined,
      elevatorCount: qRec.specs?.elevators ?? qSsot.elevator_count ?? undefined,
      officialLandPricePerSqm:
        qRec.officialLandPricePerSqm ??
        qRec.officialLandPriceWonSqm ??
        qRec.specs?.officialLandPricePerSqm ??
        qRec.specs?.officialLandPriceWonSqm ??
        qSsot.official_land_price_per_sqm ??
        undefined,
      parcels:
        qRec.parcels ?? qRec.specs?.parcels ?? qSsot.parcels ?? qDocBody.parcels ?? undefined,
      mainPurpose:
        qRec.specs?.mainPurpose || qSsot.main_usage || qRec.card4.use || undefined,
      closingLine:
        qRec.closingLine ||
        qRec.specs?.closingLine ||
        qSsot.closing_line ||
        qDocBody.closingLine ||
        qDocBody.broker_contact?.closingLine ||
        undefined,
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
    const prevDc = idx >= 0 ? (dealcards[idx] as any) : undefined;
    const isSent = sentBuildingIds.has(bId) || isDealCardSent(bId) || customEntry.status === "sent";
    const c4 = normalizeDealCardCopy(customEntry.card4, { fillHeadline: true });
    const resolvedGenSrc = classifyDealCardOriginGroup({
      card4: c4,
      generationSource: customEntry.generationSource || prevDc?.generationSource,
      pairedMemoId: customEntry.pairedMemoId || prevDc?.pairedMemoId,
    });
    const itemObj: any = {
      id: bId,
      title: `${c4.region || "새"} ${c4.use || "딜카드"}`.trim(),
      region: c4.region,
      use: c4.use,
      priceBand: c4.priceBand,
      status: (isSent ? "sent" : "draft") as "draft" | "sent",
      updatedAt: formatRelativeTime(customEntry.updatedAt),
      card4: {
        ...c4,
        generationSource: c4.generationSource || resolvedGenSrc,
      },
      ...(customEntry.memoText !== undefined
        ? { memoText: customEntry.memoText }
        : prevDc?.memoText
        ? { memoText: prevDc.memoText }
        : {}),
      ...(customEntry.pairedMemoId || prevDc?.pairedMemoId
        ? { pairedMemoId: customEntry.pairedMemoId || prevDc?.pairedMemoId }
        : {}),
      generationSource: resolvedGenSrc,
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
    .map((dc: any) => {
      const memPair = memPairingByBuilding.get(dc.id);
      const actPair = privateMemoPairingByBuilding.get(dc.id);
      const rowPair = pairedMemoRowByBuilding.get(dc.id);
      const resolvedMemoText =
        memPair?.memoText !== undefined
          ? memPair.memoText
          : actPair?.memoText !== undefined
          ? actPair.memoText
          : dc.memoText !== undefined
          ? dc.memoText
          : rowPair?.memoText;
      const resolvedPairedMemoId =
        memPair?.pairedMemoId ||
        actPair?.pairedMemoId ||
        dc.pairedMemoId ||
        dc.card4?.pairedMemoId ||
        rowPair?.id;
      const resolvedGenerationSource = classifyDealCardOriginGroup({
        card4: dc.card4,
        generationSource:
          memPair?.generationSource || actPair?.generationSource || dc.generationSource,
        pairedMemoId: resolvedPairedMemoId,
      });

      return {
        ...dc,
        status:
          dc.status === "sent" || sentBuildingIds.has(dc.id) || isDealCardSent(dc.id)
            ? ("sent" as const)
            : ("draft" as const),
        card4: {
          ...dc.card4,
          ...(resolvedPairedMemoId ? { pairedMemoId: resolvedPairedMemoId } : {}),
          generationSource: resolvedGenerationSource,
        },
        ...(resolvedMemoText !== undefined ? { memoText: resolvedMemoText } : {}),
        ...(resolvedPairedMemoId ? { pairedMemoId: resolvedPairedMemoId } : {}),
        generationSource: resolvedGenerationSource,
      };
    });

  // Apply customImUpsertedByKey overrides & deletedImIds filtering
  const normImAddr = (s: unknown) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  for (const [, customImEntry] of customImUpsertedByKey.entries()) {
    const it = customImEntry.item;
    if (!it || (!it.id && !it.buildingId)) continue;
    const idx = imList.findIndex(
      (im) =>
        (it.id && im.id === it.id) ||
        (it.buildingId && im.buildingId === it.buildingId)
    );
    if (idx < 0 && !isUuid(String(it.buildingId || ""))) {
      const candAddr = normImAddr(it.address);
      if (
        candAddr &&
        imList.some(
          (im) =>
            isUuid(String(im.buildingId || "")) &&
            im.status === "published" &&
            normImAddr(im.address) === candAddr
        )
      ) {
        // Retire unprovisioned pre-publish temporary draft superseded by a published UUID IM
        continue;
      }
    }
    const prevPhotos = idx >= 0 ? (imList[idx] as any).photos : undefined;
    const itPhotos = Array.isArray(it.photos) && it.photos.length > 0 ? it.photos : prevPhotos;
    const mergedIm = {
      ...(idx >= 0 ? imList[idx] : {}),
      ...it,
      ...(itPhotos && itPhotos.length > 0 ? { photos: itPhotos } : {}),
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

  const seenSummaryImIds = new Set<string>();
  const seenSummaryImBldIds = new Set<string>();
  const finalImList = imList.filter((im) => {
    if (deletedImIds.has(im.id) || (im.buildingId && deletedImIds.has(im.buildingId))) {
      return false;
    }
    if (im.id) {
      if (seenSummaryImIds.has(im.id)) return false;
      seenSummaryImIds.add(im.id);
    }
    if (im.buildingId && isUuid(im.buildingId)) {
      if (seenSummaryImBldIds.has(im.buildingId)) return false;
      seenSummaryImBldIds.add(im.buildingId);
    }
    return true;
  });

  return NextResponse.json({
    ok: true,
    dealcards: finalDealcards,
    unconvertedMemos,
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
  const supabase = createServiceClient();
  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, auth.user.id);
  const memDeletedMemos = getUserSet(memoMem.deletedMemoIdsByUser, auth.user.id);
  const memConvertedMap = getUserMap(memoMem.convertedMemoToBuildingByUser, auth.user.id);
  const memPairingByBuilding = getUserMap(memoMem.pairingByUserBuilding, auth.user.id);

  // ── Memo-Only Actions (do not require buildingId) ──
  if (action === "save_memo_only") {
    const rawMemoText = typeof body?.memoText === "string" ? body.memoText : "";
    if (!rawMemoText.trim()) {
      return NextResponse.json({ ok: false, error: "메모 내용을 입력해 주세요." }, { status: 400 });
    }
    const routingType =
      typeof body?.routingType === "string" && body.routingType.trim()
        ? body.routingType.trim()
        : "new_deal";
    const routingSummary =
      typeof body?.routingSummary === "string" ? body.routingSummary.trim() : "";
    const nowIso = new Date().toISOString();
    let memoId =
      typeof body?.memoId === "string" && body.memoId.trim()
        ? body.memoId.trim()
        : `memo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      if (supabase && typeof supabase.from === "function") {
        if (body?.memoId && isUuid(String(body.memoId))) {
          const { data: existingRow } = await supabase
            .from("broker_memos")
            .select("id, user_id")
            .eq("id", String(body.memoId))
            .maybeSingle();
          if (existingRow && existingRow.user_id === auth.user.id) {
            await supabase
              .from("broker_memos")
              .update({
                memo_text: rawMemoText,
                routing_type: routingType,
                routing_summary: routingSummary,
                status: "saved",
              })
              .eq("id", String(body.memoId));
            memoId = String(body.memoId);
          }
        } else {
          const insQ: any = supabase.from("broker_memos").insert({
            user_id: auth.user.id,
            memo_text: rawMemoText,
            routing_type: routingType,
            routing_summary: routingSummary,
            status: "saved",
          });
          const { data: insRow } =
            typeof insQ?.select === "function"
              ? await insQ.select("id, created_at").maybeSingle()
              : { data: null };
          if (insRow?.id) {
            memoId = String(insRow.id);
          }
        }
      }
    } catch {
      // Fallback to activity_events + memory store
    }

    const savedMemo: UnconvertedMemoItem = {
      id: memoId,
      memoText: rawMemoText,
      routingType,
      routingSummary: routingSummary || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    memDeletedMemos.delete(memoId);
    memUnconverted.set(memoId, savedMemo);

    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "unconverted_memo_saved",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : auth.user.id,
        metadata: {
          memo_id: memoId,
          memo_text: rawMemoText,
          routing_type: routingType,
          routing_summary: routingSummary,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      ok: true,
      action: "save_memo_only",
      memo: savedMemo,
      persisted: true,
    });
  }

  if (action === "delete_memo") {
    const memoId = typeof body?.memoId === "string" ? body.memoId.trim() : "";
    if (!memoId) {
      return NextResponse.json({ ok: false, error: "memoId is required" }, { status: 400 });
    }
    memUnconverted.delete(memoId);
    memDeletedMemos.add(memoId);
    try {
      if (isUuid(memoId) && supabase && typeof supabase.from === "function") {
        await supabase
          .from("broker_memos")
          .update({ status: "archived" })
          .eq("id", memoId)
          .eq("user_id", auth.user.id);
      }
    } catch {
      // Non-blocking
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "unconverted_memo_deleted",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : auth.user.id,
        metadata: { memo_id: memoId },
      });
    } catch {
      // Non-blocking
    }
    return NextResponse.json({ ok: true, action: "delete_memo", memoId, persisted: true });
  }

  if (action === "restore_memo") {
    const memoId = typeof body?.memoId === "string" ? body.memoId.trim() : "";
    const rawMemoText = typeof body?.memoText === "string" ? body.memoText : "";
    const routingType =
      typeof body?.routingType === "string" && body.routingType.trim()
        ? body.routingType.trim()
        : "new_deal";
    if (!memoId) {
      return NextResponse.json({ ok: false, error: "memoId is required" }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    memDeletedMemos.delete(memoId);
    if (rawMemoText) {
      memUnconverted.set(memoId, {
        id: memoId,
        memoText: rawMemoText,
        routingType,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    try {
      if (isUuid(memoId) && supabase && typeof supabase.from === "function") {
        await supabase
          .from("broker_memos")
          .update({ status: "saved" })
          .eq("id", memoId)
          .eq("user_id", auth.user.id);
      }
    } catch {
      // Non-blocking
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "unconverted_memo_restored",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : auth.user.id,
        metadata: {
          memo_id: memoId,
          memo_text: rawMemoText,
          routing_type: routingType,
        },
      });
    } catch {
      // Non-blocking
    }
    return NextResponse.json({ ok: true, action: "restore_memo", memoId, persisted: true });
  }

  const incomingImObj =
    body?.imItem && typeof body.imItem === "object"
      ? (body.imItem as Record<string, any>)
      : body?.item && typeof body.item === "object"
      ? (body.item as Record<string, any>)
      : null;
  const buildingId = (body?.buildingId ||
    incomingImObj?.buildingId ||
    incomingImObj?.id ||
    body?.id) as string | undefined;
  const card4 = body?.card4 as Card4Data | undefined;

  if (!buildingId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  const existingQuick =
    getQuickImRecord(buildingId) ||
    (incomingImObj?.id ? getQuickImRecord(String(incomingImObj.id)) : null);

  let uuidOwnerVerified = false;
  if (isUuid(buildingId)) {
    const ownerCheck = await assertBuildingOwner(supabase, buildingId, auth.user.id, {
      allowAdmin: true,
      role: auth.role,
    });
    if (!ownerCheck.ok) {
      if (ownerCheck.status === 403 || action === "upsert") {
        return ownerCheck.response;
      }
      if (existingQuick?.ownerId && existingQuick.ownerId !== auth.user.id && auth.role !== "admin") {
        return NextResponse.json(
          { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    } else {
      uuidOwnerVerified = true;
    }
  } else if (
    existingQuick?.ownerId &&
    existingQuick.ownerId !== auth.user.id &&
    auth.role !== "admin"
  ) {
    return NextResponse.json(
      { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

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

  // Handle broker-private paired memo update WITHOUT modifying public Card4 or running blindCheck on raw memo
  if (action === "update_memo_only") {
    const incomingMemoText = typeof body?.memoText === "string" ? body.memoText : "";
    const incomingPairedMemoId =
      typeof body?.pairedMemoId === "string" && body.pairedMemoId.trim()
        ? body.pairedMemoId.trim()
        : undefined;
    const incomingGenSource: DealCardGenerationSource | undefined =
      body?.generationSource === "ai_memo" || body?.generationSource === "manual"
        ? body.generationSource
        : undefined;

    const resolvedPairedMemoId = await syncPairedMemoRow(supabase, {
      userId: auth.user.id,
      buildingId,
      memoText: incomingMemoText,
      pairedMemoId: incomingPairedMemoId,
    });

    if (resolvedPairedMemoId) {
      memUnconverted.delete(resolvedPairedMemoId);
      memConvertedMap.set(resolvedPairedMemoId, buildingId);
    }

    const prevPair = memPairingByBuilding.get(buildingId);
    memPairingByBuilding.set(buildingId, {
      memoText: incomingMemoText,
      pairedMemoId: resolvedPairedMemoId || prevPair?.pairedMemoId,
      generationSource: incomingGenSource || prevPair?.generationSource,
      updatedAt: new Date().toISOString(),
    });

    if (isUuid(buildingId) && uuidOwnerVerified) {
      try {
        await supabase
          .from("building_ssot_lite")
          .update({
            raw_input: incomingMemoText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", buildingId);
      } catch {
        // Non-blocking
      }
    }

    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_memo_paired",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          private_memo_text: incomingMemoText,
          ...(resolvedPairedMemoId ? { paired_memo_id: resolvedPairedMemoId } : {}),
          ...(incomingGenSource ? { generation_source: incomingGenSource } : {}),
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      ok: true,
      action: "update_memo_only",
      buildingId,
      pairedMemoId: resolvedPairedMemoId,
      persisted: true,
    });
  }

  // Handle delete action
  if (action === "delete") {
    markDealCardDeleted(buildingId);
    if (isUuid(buildingId) && uuidOwnerVerified) {
      const nowIso = new Date().toISOString();
      try {
        await Promise.allSettled([
          supabase
            .from("building_ssot_lite")
            .update({ status: "archived", updated_at: nowIso })
            .eq("id", buildingId),
          supabase
            .from("building_signal_cards")
            .update({ status: "archived", updated_at: nowIso })
            .eq("building_id", buildingId),
          supabase
            .from("document_objects")
            .update({ status: "archived", updated_at: nowIso })
            .eq("building_id", buildingId)
            .eq("document_type", "blind_teaser"),
        ]);
      } catch {
        // Non-blocking
      }
    }
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
    if (card4 && (!isUuid(buildingId) || uuidOwnerVerified)) {
      updateQuickImCard4(buildingId, card4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    if (isUuid(buildingId) && uuidOwnerVerified) {
      const nowIso = new Date().toISOString();
      try {
        await Promise.allSettled([
          supabase
            .from("building_ssot_lite")
            .update({ status: "draft", updated_at: nowIso })
            .eq("id", buildingId),
          supabase
            .from("building_signal_cards")
            .update({ status: "draft", updated_at: nowIso })
            .eq("building_id", buildingId),
        ]);
      } catch {
        // Non-blocking
      }
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
    let persistedSentCard4: Card4Data | undefined;
    if (card4) {
      const normalizedSentCard4 = normalizeDealCardCopy(card4, { fillHeadline: true });
      persistedSentCard4 = {
        ...normalizedSentCard4,
        ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
        ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
      };
      if (isUuid(buildingId) && uuidOwnerVerified) {
        try {
          const updRes = await updateDealCard4(supabase, buildingId, {
            card4: {
              headline: persistedSentCard4.headline,
              posture: persistedSentCard4.posture,
              region: persistedSentCard4.region,
              use: persistedSentCard4.use,
              area: persistedSentCard4.area,
              gfaPyung: persistedSentCard4.gfaPyung,
              landAreaPyung: persistedSentCard4.landAreaPyung,
              priceBand: persistedSentCard4.priceBand,
              points: persistedSentCard4.points,
              provenance: persistedSentCard4.provenance,
            },
            userId: auth.user.id,
          });
          if (updRes.card4) {
            persistedSentCard4 = {
              ...updRes.card4,
              ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
              ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
            };
          }
        } catch {
          // Non-blocking
        }
      }
      updateQuickImCard4(buildingId, persistedSentCard4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_sent",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          status: "sent",
          ...(persistedSentCard4 ? { card4: persistedSentCard4 } : {}),
          ...(brokerProfileMeta ? { broker_profile: brokerProfileMeta } : {}),
        },
      });
      if (isUuid(buildingId) && uuidOwnerVerified) {
        await Promise.allSettled([
          supabase
            .from("document_objects")
            .update({ status: "published", updated_at: new Date().toISOString() })
            .eq("building_id", buildingId)
            .eq("document_type", "blind_teaser"),
          supabase
            .from("building_signal_cards")
            .update({ visibility: "public_blind", status: "active" })
            .eq("building_id", buildingId),
        ]);
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
      ...(persistedSentCard4 ? { card4: persistedSentCard4 } : {}),
    });
  }

  // Handle IM delete action (P0-META-IM-DELETE-04)
  if (action === "delete_im") {
    const imId = String(body?.imId || buildingId);
    deleteQuickImRecord(buildingId);
    if (imId && imId !== buildingId) {
      deleteQuickImRecord(imId);
    }
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
    if (imItem) {
      synthesizeQuickRecordFromImItem(buildingId, imItem as Record<string, any>, brokerProfileMeta, auth.user.id);
    }
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
    const imItem = incomingImObj;
    if (!imItem) {
      return NextResponse.json({ error: "imItem is required for upsert_im" }, { status: 400 });
    }
    const imId = String(imItem.id || buildingId);
    const incomingRealPhotos = Array.isArray(imItem.photos)
      ? imItem.photos
          .map((p: any) => {
            const rawU =
              typeof p === "string" ? p : String(p?.url || p?.dataUrl || p?.previewUrl || "");
            const resolvedU = resolveKnownTestAssetUrl(p?.name || rawU) || rawU;
            if (
              !resolvedU ||
              resolvedU.trim().length === 0 ||
              resolvedU.startsWith("blob:") ||
              resolvedU.startsWith("/test-images/")
            ) {
              return null;
            }
            return typeof p === "string" ? { url: resolvedU } : { ...p, url: resolvedU };
          })
          .filter(Boolean)
      : [];

    const rawRentRoll = Array.isArray(imItem.rentRoll) ? imItem.rentRoll : [];
    let monthlyRentTotalManwon = 0;
    let totalDepositManwon = 0;
    let totalMaintManwon = 0;
    let vacantCount = 0;
    for (const r of rawRentRoll) {
      if (!r) continue;
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
      if (isVac) {
        vacantCount++;
      } else if (!isOwn) {
        totalDepositManwon += Number(r?.depositManwon ?? r?.deposit_manwon ?? 0);
        monthlyRentTotalManwon += Number(r?.monthlyRentManwon ?? r?.rent_manwon ?? 0);
        totalMaintManwon += Number(r?.maintenanceManwon ?? r?.mgmt_fee_manwon ?? 0);
      }
    }
    totalDepositManwon = Math.round(totalDepositManwon * 10) / 10;
    monthlyRentTotalManwon = Math.round(monthlyRentTotalManwon * 10) / 10;
    totalMaintManwon = Math.round(totalMaintManwon * 10) / 10;
    const vacancyPct =
      rawRentRoll.length > 0
        ? Number(((vacantCount / rawRentRoll.length) * 100).toFixed(1))
        : 0;
    const askingPriceManwonNum = Number(imItem.askingPriceManwon) || 0;
    const grossYieldPct =
      askingPriceManwonNum > 0 && monthlyRentTotalManwon > 0
        ? Number((((monthlyRentTotalManwon * 12) / askingPriceManwonNum) * 100).toFixed(2))
        : 0;
    const capRatePct =
      askingPriceManwonNum > 0 && monthlyRentTotalManwon > 0
        ? Number(
            (
              ((monthlyRentTotalManwon * 12) /
                Math.max(1, askingPriceManwonNum - totalDepositManwon)) *
              100
            ).toFixed(2)
          )
        : 0;

    try {
      if (isUuid(buildingId) && uuidOwnerVerified) {
        const docQuery = supabase
          .from("document_objects")
          .select("id, status, body")
          .eq("building_id", buildingId)
          .in("document_type", ["mobile_im", "im_lite", "im_lite_draft"])
          .order("created_at", { ascending: false })
          .limit(5);
        const rawDocRes = await (typeof (docQuery as any).then === "function"
          ? docQuery
          : (docQuery as any).maybeSingle?.());
        const candidateDocs: any[] = Array.isArray(rawDocRes?.data)
          ? rawDocRes.data
          : rawDocRes?.data
          ? [rawDocRes.data]
          : [];
        const latestDoc =
          candidateDocs.find((d) => String(d?.id) === imId) ||
          candidateDocs.find((d) => d?.status === "published" || d?.status === "broker_reviewed") ||
          candidateDocs[0] ||
          null;

        let siblingRealPhotos: any[] | undefined;
        for (const cd of candidateDocs) {
          const cb = (cd?.body && typeof cd.body === "object" ? cd.body : {}) as Record<string, any>;
          const cp = Array.isArray(cb.photos_v2) && cb.photos_v2.length > 0 ? cb.photos_v2 : cb.photos;
          if (Array.isArray(cp)) {
            const valid = cp.filter(
              (p: any) =>
                p &&
                typeof p.url === "string" &&
                p.url.trim().length > 0 &&
                !p.url.startsWith("/test-images/") &&
                !p.url.startsWith("blob:")
            );
            if (valid.length > 0) {
              siblingRealPhotos = valid;
              break;
            }
          }
        }

        const nextDocStatus =
          imItem.status === "completed" || imItem.status === "published"
            ? "published"
            : undefined;

        if (latestDoc?.id) {
          const prevBody = (latestDoc.body && typeof latestDoc.body === "object" ? latestDoc.body : {}) as Record<string, any>;
          const prevSsot = (prevBody.ssot_summary && typeof prevBody.ssot_summary === "object" ? prevBody.ssot_summary : {}) as Record<string, any>;
          const prevHero = (prevBody.heroCard && typeof prevBody.heroCard === "object" ? prevBody.heroCard : {}) as Record<string, any>;
          const prevFloorLeases = Array.isArray(prevBody.floor_leases) ? prevBody.floor_leases : [];
          const prevRealPhotos = Array.isArray(prevBody.photos)
            ? prevBody.photos.filter(
                (p: any) =>
                  p &&
                  typeof p.url === "string" &&
                  p.url.trim().length > 0 &&
                  !p.url.startsWith("/test-images/") &&
                  !p.url.startsWith("blob:")
              )
            : [];
          const preservedPhotos =
            incomingRealPhotos.length > 0
              ? incomingRealPhotos.map((p: any, idx: number) => ({
                  url: typeof p === "string" ? p : String(p.url || p.dataUrl || p.previewUrl),
                  caption: p?.caption || p?.name || `${imItem.title || "매물"} 현장 사진 ${idx + 1}`,
                  category: p?.category || (idx === 0 ? "exterior" : "interior"),
                  type: p?.category || p?.type || (idx === 0 ? "exterior" : "interior"),
                  role: idx === 0 ? "cover" : "interior",
                  isHero: idx === 0,
                }))
              : prevRealPhotos.length > 0
              ? prevRealPhotos
              : siblingRealPhotos || [];
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
                const rawAreaPy = Number(r?.areaPyeong ?? r?.area_pyeong ?? 0);
                const areaM2 =
                  rawAreaM2 > 0 && Math.abs(rawAreaM2 - 2.45) > 0.05
                    ? rawAreaM2
                    : rawAreaPy > 0
                    ? Math.round(rawAreaPy * 3.305785 * 100) / 100
                    : 0;
                const exclM2 = Number(
                  r?.exclusiveAreaSqm ?? r?.exclusive_area_sqm ?? prevFl.exclusive_area_sqm ?? 0
                );
                const rawUseStr = String(
                  r?.use || prevFl.use || prevFl.tenant_type || prevFl.tenant_name || ""
                ).trim();
                const slashParts = rawUseStr
                  .split(/\s*\/\s*/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                const splitTenantName = slashParts.length >= 2 ? slashParts[0] : undefined;
                const splitTenantType =
                  slashParts.length >= 2
                    ? slashParts[0] === slashParts[1]
                      ? slashParts[0]
                      : slashParts.slice(1).join(" / ")
                    : rawUseStr || (isVac ? "공실" : isOwn ? "자가사용" : "근린생활시설");
                const explicitTenantName = String(r?.tenantName || r?.tenant_name || "").trim();
                const resolvedTenantName = isVac
                  ? "공실"
                  : isOwn
                  ? explicitTenantName || splitTenantName || "자가사용"
                  : explicitTenantName || splitTenantName || prevFl.tenant_name || splitTenantType;
                const resolvedTenantType = isVac ? "공실" : splitTenantType;
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
                const rowNote =
                  r?.note !== undefined && String(r.note).trim().length > 0
                    ? String(r.note).trim()
                    : prevFl.note;
                return {
                  ...prevFl,
                  floor: normFloor,
                  unit_label: normUnit,
                  tenant_name: resolvedTenantName,
                  tenant_type: resolvedTenantType,
                  use: resolvedTenantType,
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
                  lease_end: String(r?.leaseExpiry || r?.lease_end || prevFl.lease_end || "-"),
                  ...(rowNote ? { note: rowNote, remark: rowNote } : {}),
                  source: prevFl.source || "broker",
                };
              })
            : prevBody.floor_leases;

          const prevBrokerContact = (
            prevBody.broker_contact && typeof prevBody.broker_contact === "object"
              ? prevBody.broker_contact
              : {}
          ) as Record<string, any>;
          const nextBrokerName =
            cleanBrokerField(
              imItem.brokerName,
              cleanBrokerField(
                prevBrokerContact.brokerName || prevBrokerContact.name,
                brokerProfileMeta?.displayName
              )
            ) || "";
          const nextBrokerageName =
            cleanBrokerField(
              imItem.brokerageName,
              cleanBrokerField(
                prevBrokerContact.brokerageName || prevBrokerContact.company,
                brokerProfileMeta?.company
              )
            ) || "";
          const nextBrokerPhone =
            cleanBrokerField(
              imItem.brokerPhone,
              cleanBrokerField(
                prevBrokerContact.brokerPhone || prevBrokerContact.phone,
                brokerProfileMeta?.phone
              )
            ) || "";

          const resolvedPnu = imItem.pnu || prevSsot.pnu || prevBody.pnu;
          const resolvedCoordinates =
            imItem.coordinates ||
            (Number.isFinite(Number(imItem.lat)) &&
            Number.isFinite(Number(imItem.lng)) &&
            Number(imItem.lat) !== 0 &&
            Number(imItem.lng) !== 0
              ? { lat: Number(imItem.lat), lng: Number(imItem.lng) }
              : undefined) ||
            prevSsot.coordinates ||
            prevBody.coordinates;
          const resolvedClosingLine =
            imItem.closingLine ??
            imItem.brokerExtras?.closingLine ??
            imItem.brokerExtrasForm?.closingLine ??
            prevSsot.closing_line ??
            prevBody.closingLine ??
            prevBrokerContact.closingLine;

          const effectiveAskManwon =
            askingPriceManwonNum || Number(prevSsot.asking_price_manwon) || 0;
          const hasRentRollUpdate = Array.isArray(imItem.rentRoll);
          const nextMonthlyRentManwon = hasRentRollUpdate
            ? monthlyRentTotalManwon
            : Number(prevSsot.monthly_rent_total_manwon ?? 0);
          const nextTotalDepositManwon = hasRentRollUpdate
            ? totalDepositManwon
            : Number(prevSsot.total_deposit_manwon ?? 0);
          const nextVacancyPct = hasRentRollUpdate
            ? vacancyPct
            : Number(prevSsot.vacancy_pct ?? prevSsot.vacancy_rate_pct ?? 0);
          const nextGrossYieldPct =
            effectiveAskManwon > 0 && nextMonthlyRentManwon > 0
              ? Number((((nextMonthlyRentManwon * 12) / effectiveAskManwon) * 100).toFixed(2))
              : 0;
          const nextCapRatePct =
            effectiveAskManwon > 0 && nextMonthlyRentManwon > 0
              ? Number(
                  (
                    ((nextMonthlyRentManwon * 12) /
                      Math.max(1, effectiveAskManwon - nextTotalDepositManwon)) *
                    100
                  ).toFixed(2)
                )
              : 0;

          const nextBody = {
            ...prevBody,
            heroTitle: imItem.title || prevBody.heroTitle,
            ...(resolvedPnu ? { pnu: resolvedPnu } : {}),
            ...(resolvedCoordinates
              ? {
                  coordinates: resolvedCoordinates,
                  lat: resolvedCoordinates.lat,
                  lng: resolvedCoordinates.lng,
                }
              : {}),
            ...(imItem.parcels !== undefined ? { parcels: imItem.parcels } : {}),
            ...(resolvedClosingLine !== undefined
              ? { closingLine: resolvedClosingLine, closing_line: resolvedClosingLine }
              : {}),
            ...(imItem.officialLandPricePerSqm !== undefined
              ? {
                  official_land_price_per_sqm: Number(imItem.officialLandPricePerSqm),
                  official_land_price_krw: Number(imItem.officialLandPricePerSqm),
                }
              : {}),
            investment_posture: imItem.investmentPosture || prevBody.investment_posture,
            handover_note: imItem.handoverNote ?? prevBody.handover_note,
            axios_highlights: cleanHighlights && cleanHighlights.length > 0 ? cleanHighlights : prevBody.axios_highlights,
            rent_roll: Array.isArray(imItem.rentRoll) ? imItem.rentRoll : prevBody.rent_roll,
            floor_leases: normalizedFloorLeases,
            photos: preservedPhotos,
            photos_v2: preservedPhotos,
            photo_urls: preservedPhotos.map((p: any) => p?.url).filter(Boolean),
            broker_contact: {
              ...prevBrokerContact,
              name: nextBrokerName,
              company: nextBrokerageName,
              phone: nextBrokerPhone,
              brokerName: nextBrokerName,
              brokerageName: nextBrokerageName,
              brokerPhone: nextBrokerPhone,
              ...(resolvedClosingLine !== undefined
                ? { closingLine: resolvedClosingLine, closing_line: resolvedClosingLine }
                : {}),
            },
            heroCard: {
              ...prevHero,
              posture: imItem.investmentPosture || prevHero.posture,
              capRateBase: nextCapRatePct || prevHero.capRateBase,
              keyPoints: cleanKeyPoints && cleanKeyPoints.length > 0 ? cleanKeyPoints : prevHero.keyPoints,
              ...(imItem.parkingTotal !== undefined
                ? { parkingCount: Number(imItem.parkingTotal) }
                : {}),
              ...(imItem.elevatorCount !== undefined
                ? { elevatorCount: Number(imItem.elevatorCount) }
                : {}),
            },
            ssot_summary: {
              ...prevSsot,
              address: imItem.address || prevSsot.address,
              ...(resolvedPnu ? { pnu: resolvedPnu } : {}),
              ...(resolvedCoordinates
                ? {
                    coordinates: resolvedCoordinates,
                    lat: resolvedCoordinates.lat,
                    lng: resolvedCoordinates.lng,
                  }
                : {}),
              investment_posture: imItem.investmentPosture || prevSsot.investment_posture,
              asking_price_manwon: effectiveAskManwon || prevSsot.asking_price_manwon,
              monthly_rent_total_manwon: nextMonthlyRentManwon,
              monthly_rent_total_krw: nextMonthlyRentManwon * 10000,
              total_deposit_manwon: nextTotalDepositManwon,
              total_deposit_krw: nextTotalDepositManwon * 10000,
              vacancy_pct: nextVacancyPct,
              vacancy_rate_pct: nextVacancyPct,
              vacancy_signal: nextVacancyPct === 0 ? "만실" : `공실률 ${nextVacancyPct}%`,
              cap_rate_pct: nextCapRatePct,
              gross_yield_pct: nextGrossYieldPct,
              total_gross_area_sqm: imItem.gfaSqm
                ? Number(String(imItem.gfaSqm).replace(/,/g, ""))
                : prevSsot.total_gross_area_sqm,
              land_area_sqm: imItem.landAreaSqm
                ? Number(String(imItem.landAreaSqm).replace(/,/g, ""))
                : prevSsot.land_area_sqm,
              zoning: imItem.zoning || prevSsot.zoning,
              completion_date: imItem.completionDate || prevSsot.completion_date,
              handover_note: imItem.handoverNote ?? prevSsot.handover_note,
              ...(imItem.floorsAbove !== undefined
                ? { floors_above: Number(imItem.floorsAbove) }
                : {}),
              ...(imItem.floorsBelow !== undefined
                ? { floors_below: Number(imItem.floorsBelow) }
                : {}),
              ...(imItem.bcrPct !== undefined ? { bcr_pct: Number(imItem.bcrPct) } : {}),
              ...(imItem.farPct !== undefined ? { far_pct: Number(imItem.farPct) } : {}),
              ...(imItem.parkingTotal !== undefined
                ? {
                    parking_total: Number(imItem.parkingTotal),
                    parking_count: Number(imItem.parkingTotal),
                  }
                : {}),
              ...(imItem.elevatorCount !== undefined
                ? { elevator_count: Number(imItem.elevatorCount) }
                : {}),
              ...(imItem.officialLandPricePerSqm !== undefined
                ? {
                    official_land_price_per_sqm: Number(imItem.officialLandPricePerSqm),
                    official_land_price_krw: Number(imItem.officialLandPricePerSqm),
                  }
                : {}),
              ...(imItem.parcels !== undefined ? { parcels: imItem.parcels } : {}),
              ...(imItem.mainPurpose !== undefined ? { main_usage: imItem.mainPurpose } : {}),
              ...(resolvedClosingLine !== undefined
                ? { closing_line: resolvedClosingLine }
                : {}),
            },
          };
          await supabase
            .from("document_objects")
            .update({
              title: imItem.title || undefined,
              ...(nextDocStatus ? { status: nextDocStatus } : {}),
              body: nextBody,
              updated_at: new Date().toISOString(),
            })
            .eq("id", latestDoc.id);
        }

        const nextAskingManwon = Number(imItem.askingPriceManwon || 0);
        if (nextAskingManwon > 0) {
          try {
            const eokVal = Math.round((nextAskingManwon / 10000) * 10) / 10;
            const nextPriceBand = `${Number.isInteger(eokVal) ? eokVal : eokVal.toFixed(1)}억`;
            const { data: bldRow } = await supabase
              .from("building_ssot_lite")
              .select("id, layers")
              .eq("id", buildingId)
              .maybeSingle();
            if (bldRow) {
              const curLayers = (bldRow.layers && typeof bldRow.layers === "object" ? bldRow.layers : {}) as Record<string, any>;
              await supabase
                .from("building_ssot_lite")
                .update({
                  price_band: nextPriceBand,
                  layers: {
                    ...curLayers,
                    deal_terms: {
                      ...(curLayers.deal_terms || {}),
                      asking_price_manwon: nextAskingManwon,
                    },
                    finance: {
                      ...(curLayers.finance || {}),
                      asking_price_manwon: nextAskingManwon,
                      asking_price_krw: nextAskingManwon * 10000,
                    },
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", buildingId);
            }
          } catch {
            // Non-blocking
          }
        }
      }

      const nextItem: Record<string, any> = {
        ...imItem,
        id: imId,
        buildingId,
        ...(incomingRealPhotos.length > 0 ? { photos: incomingRealPhotos } : {}),
        monthlyRentTotalManwon,
        totalDepositManwon,
        vacancyPct,
        capRatePct,
        grossYieldPct,
        isDirty: false,
      };

      synthesizeQuickRecordFromImItem(buildingId, nextItem, brokerProfileMeta, auth.user.id);

      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "im_upserted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : auth.user.id,
        metadata: {
          building_id: buildingId,
          im_id: imId,
          im_item: nextItem,
          broker_profile: brokerProfileMeta,
        },
      });
    } catch {
      // Non-blocking
      const fallbackNextItem: Record<string, any> = {
        ...imItem,
        id: imId,
        buildingId,
        ...(incomingRealPhotos.length > 0 ? { photos: incomingRealPhotos } : {}),
        monthlyRentTotalManwon,
        totalDepositManwon,
        vacancyPct,
        capRatePct,
        grossYieldPct,
        isDirty: false,
      };
      synthesizeQuickRecordFromImItem(buildingId, fallbackNextItem, brokerProfileMeta, auth.user.id);
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

  const incomingPrivateMemo =
    typeof body?.memoText === "string" ? body.memoText : undefined;
  const incomingPairedMemoId =
    (typeof body?.pairedMemoId === "string" && body.pairedMemoId.trim()) ||
    card4.pairedMemoId ||
    undefined;
  const incomingGenSource: DealCardGenerationSource | undefined =
    body?.generationSource === "ai_memo" || body?.generationSource === "manual"
      ? body.generationSource
      : card4.generationSource;

  // Server-side blind-guard check (PUBLIC Card4 fields ONLY — never broker-private memoText!)
  const blindCheck = validateBlindPoints(
    [
      ...(Array.isArray(card4.points) ? card4.points : []),
      card4.region || "",
      card4.use || "",
      card4.headline || "",
      card4.area || "",
      card4.priceBand || "",
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

  let syncedPairedMemoId = incomingPairedMemoId;
  if (incomingPrivateMemo !== undefined || incomingPairedMemoId) {
    syncedPairedMemoId = await syncPairedMemoRow(supabase, {
      userId: auth.user.id,
      buildingId,
      memoText: incomingPrivateMemo,
      pairedMemoId: incomingPairedMemoId,
    });
    if (syncedPairedMemoId) {
      memUnconverted.delete(syncedPairedMemoId);
      memConvertedMap.set(syncedPairedMemoId, buildingId);
      try {
        await supabase.from("activity_events").insert({
          actor_id: auth.user.id,
          event_type: "unconverted_memo_converted",
          entity_type: "memo",
          entity_id: isUuid(syncedPairedMemoId) ? syncedPairedMemoId : auth.user.id,
          metadata: {
            memo_id: syncedPairedMemoId,
            building_id: buildingId,
          },
        });
      } catch {
        // Non-blocking
      }
    }
    const prevPair = memPairingByBuilding.get(buildingId);
    memPairingByBuilding.set(buildingId, {
      memoText: incomingPrivateMemo ?? prevPair?.memoText ?? "",
      pairedMemoId: syncedPairedMemoId || prevPair?.pairedMemoId,
      generationSource: incomingGenSource || prevPair?.generationSource,
      updatedAt: new Date().toISOString(),
    });
  }

  // Only enforce DB ownership if buildingId is a real UUID in building_ssot_lite
  if (isUuid(buildingId)) {
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
        ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
        ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
      },
      userId: auth.user.id,
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, conflict: result.conflict, currentVersion: result.currentVersion },
        { status: result.conflict ? 409 : 500 }
      );
    }
    if (incomingPrivateMemo !== undefined || incomingGenSource === "ai_memo") {
      try {
        const bldUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (incomingPrivateMemo !== undefined) {
          bldUpdates.raw_input = incomingPrivateMemo;
        }
        if (incomingGenSource === "ai_memo") {
          bldUpdates.input_type = "broker_memo";
        }
        await supabase.from("building_ssot_lite").update(bldUpdates).eq("id", buildingId);
      } catch {
        // Non-blocking
      }
    }
    const mergedUuidCard4: Card4Data | undefined = result.card4
      ? {
          ...result.card4,
          ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
          ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
          ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
          ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
        }
      : undefined;
    if (mergedUuidCard4) {
      updateQuickImCard4(buildingId, mergedUuidCard4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    const savedPair = memPairingByBuilding.get(buildingId);
    try {
      await supabase.from("activity_events").insert({
        actor_id: auth.user.id,
        event_type: "dealcard_upserted",
        entity_type: "building",
        entity_id: buildingId,
        metadata: {
          building_id: buildingId,
          card4: mergedUuidCard4,
          broker_profile: brokerProfileMeta,
          ...(incomingPrivateMemo !== undefined
            ? { private_memo_text: incomingPrivateMemo }
            : savedPair?.memoText !== undefined
            ? { private_memo_text: savedPair.memoText }
            : {}),
          ...(syncedPairedMemoId ? { paired_memo_id: syncedPairedMemoId } : {}),
          ...(incomingGenSource ? { generation_source: incomingGenSource } : {}),
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
      card4: mergedUuidCard4,
      pairedMemoId: syncedPairedMemoId,
      generationSource: incomingGenSource,
      version: result.version,
      hash: result.hash,
    });
  }

  // Non-UUID local draft ID: compute deterministic hash & increment version, update QuickImStore + activity_events
  // 18자 SSOT 교정 + 빈 한 줄 제목은 파생 제목으로 같은 필드(card4.headline)에 채워 저장한다.
  const normalizedCard4 = normalizeDealCardCopy(card4, { fillHeadline: true });
  const nextVersion = (card4.card4_version || 1) + 1;
  const hash = computeCard4Hash(normalizedCard4);
  const nextCard4: Card4Data = {
    ...normalizedCard4,
    ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
    ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
    ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
    ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
    card4_version: nextVersion,
    card4_hash: hash,
  };
  updateQuickImCard4(buildingId, nextCard4, {
    ownerId: auth.user.id,
    brokerProfile: brokerProfileMeta,
  });
  const savedPair = memPairingByBuilding.get(buildingId);
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
        ...(incomingPrivateMemo !== undefined
          ? { private_memo_text: incomingPrivateMemo }
          : savedPair?.memoText !== undefined
          ? { private_memo_text: savedPair.memoText }
          : {}),
        ...(syncedPairedMemoId ? { paired_memo_id: syncedPairedMemoId } : {}),
        ...(incomingGenSource ? { generation_source: incomingGenSource } : {}),
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
    pairedMemoId: syncedPairedMemoId,
    generationSource: incomingGenSource,
    version: nextVersion,
    hash,
  });
}
