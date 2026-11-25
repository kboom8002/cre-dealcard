import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { m2ToPyeong, pyeongToM2 } from "@/domain/building/im-core/facts/area";
import {
  brokerExtrasFormToInput,
  parseBrokerExtras,
} from "@/domain/building/mobile-im/broker-extras";
import { isRealProductionRuntime } from "@/lib/env";
import { assertPublishable } from "@/lib/legal/publish-gate";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import {
  isRealUploadedPhotoUrl,
  isUuid,
  resolveKnownTestAssetUrl,
  synthesizeQuickRecordFromImItem,
} from "@/lib/im-lite/quick-generate-store";
import {
  getWorkspaceItemByAnyId,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
} from "@/lib/workspace/workspace-repository";
import { cleanBrokerField, isWorkspaceMemoryEnabled } from "./types-and-helpers";
import type { PatchContext } from "./patch-lifecycle";

const IM_PRIVATE_INTERNAL_KEYS = new Set([
  "privateMemo",
  "memoText",
  "memo_text",
  "rawMemo",
  "pairedMemoId",
  "internalNotes",
  "ownerPhone",
  "sellerPhone",
  "ownerEmail",
  "sellerEmail",
]);

function stripPrivateImFields(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripPrivateImFields(item, depth + 1));
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (IM_PRIVATE_INTERNAL_KEYS.has(k)) continue;
    out[k] = stripPrivateImFields(v, depth + 1);
  }
  return out;
}

/** 공개 IM 스냅샷에서 중개인 내부 메모·매도인 비공개 연락처(PII)만 제거하고 물건 제원·렌트롤·수익률은 보존 */
export function buildSanitizedImPublicSnapshot<T extends Record<string, unknown>>(
  payload: T
): Record<string, unknown> {
  return stripPrivateImFields(payload, 0) as Record<string, unknown>;
}

/** NOI 기반 자본환원율(Cap Rate %, 표준 OPEX 10% 차감 / 매매가) */
export function computeNoiCapRatePct(
  monthlyRentManwon: number,
  askingPriceManwon: number,
  opexRate = 0.1
): number {
  if (!(askingPriceManwon > 0) || !(monthlyRentManwon > 0)) return 0;
  const annualNoiManwon = monthlyRentManwon * 12 * Math.max(0, 1 - opexRate);
  return Number(((annualNoiManwon / askingPriceManwon) * 100).toFixed(2));
}

/** V04 임대수익률(%): 연간 임대료 ÷ (매매가 − 보증금) — extractValuationFacts 실투자금 분모와 동일 */
export function computeGrossYieldPct(
  monthlyRentManwon: number,
  askingPriceManwon: number,
  depositTotalManwon = 0
): number {
  if (!(askingPriceManwon > 0) || !(monthlyRentManwon > 0)) return 0;
  const effectiveInvestmentManwon =
    depositTotalManwon > 0 && askingPriceManwon > depositTotalManwon
      ? askingPriceManwon - depositTotalManwon
      : askingPriceManwon;
  if (!(effectiveInvestmentManwon > 0)) return 0;
  return Number((((monthlyRentManwon * 12) / effectiveInvestmentManwon) * 100).toFixed(2));
}

const strictDbMode = () =>
  isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === "1";

function repoErrorResponse(err: unknown) {
  if (err instanceof WorkspaceRepositoryError) {
    return NextResponse.json(
      { ok: false, error: err.message, code: err.code },
      { status: err.status }
    );
  }
  return NextResponse.json(
    { ok: false, error: err instanceof Error ? err.message : "요청 처리에 실패했습니다." },
    { status: 500 }
  );
}

export async function handlePatchWorkspaceImUpsert(
  ctx: PatchContext & { buildingId: string; uuidOwnerVerified: boolean }
): Promise<NextResponse> {
  const { supabase, userId, role, body, action, brokerProfileMeta, buildingId, uuidOwnerVerified } = ctx;
  const isAdmin = role === "admin";
  const allowMemStore = isWorkspaceMemoryEnabled();

  const incomingImObj =
    body?.imItem && typeof body.imItem === "object"
      ? (body.imItem as Record<string, any>)
      : body?.item && typeof body.item === "object"
      ? (body.item as Record<string, any>)
      : null;
  if (!incomingImObj) {
    return NextResponse.json({ error: "imItem is required for upsert_im" }, { status: 400 });
  }
  const imItem = incomingImObj;
  const imId = String(imItem.id || buildingId);
  const incomingRealPhotos = Array.isArray(imItem.photos)
    ? imItem.photos
        .map((p: any) => {
          const rawU =
            typeof p === "string" ? p : String(p?.url || p?.dataUrl || p?.previewUrl || "");
          const resolvedU = isRealUploadedPhotoUrl(rawU)
            ? rawU
            : resolveKnownTestAssetUrl(p?.name || rawU) || rawU;
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
  const photosTouched = Array.isArray(imItem.photos);
  const photosExplicitlyCleared =
    body?.photosExplicitlyCleared === true ||
    imItem.photosExplicitlyCleared === true ||
    (photosTouched && incomingRealPhotos.length === 0);

  const rawRentRoll = Array.isArray(imItem.rentRoll) ? imItem.rentRoll : [];
  let monthlyRentTotalManwon = 0;
  let totalDepositManwon = 0;
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
    }
  }
  totalDepositManwon = Math.round(totalDepositManwon * 10) / 10;
  monthlyRentTotalManwon = Math.round(monthlyRentTotalManwon * 10) / 10;
  const vacancyPct =
    rawRentRoll.length > 0
      ? Number(((vacantCount / rawRentRoll.length) * 100).toFixed(1))
      : 0;
  const askingPriceManwonNum = Number(imItem.askingPriceManwon) || 0;
  const grossYieldPct = computeGrossYieldPct(
    monthlyRentTotalManwon,
    askingPriceManwonNum,
    totalDepositManwon
  );
  const capRatePct = computeNoiCapRatePct(monthlyRentTotalManwon, askingPriceManwonNum);

  let existingWsItem = null;
  try {
    const primaryKey = isUuid(imId) ? imId : buildingId;
    const ownerScope = isAdmin ? undefined : userId;
    existingWsItem = await getWorkspaceItemByAnyId(supabase, primaryKey, "im", ownerScope);
    if (!existingWsItem && isUuid(buildingId) && buildingId !== primaryKey) {
      existingWsItem = await getWorkspaceItemByAnyId(supabase, buildingId, "im", ownerScope);
    }
  } catch {
    existingWsItem = null;
  }

  const isDraftEdit =
    action !== "publish_im" &&
    (Boolean(imItem.hasUnpublishedEdits) || imItem.status === "draft");
  const shouldPublishSnapshot =
    action === "publish_im" ||
    (!isDraftEdit && (imItem.status === "published" || imItem.status === "completed"));
  const nextWsStatus =
    action === "publish_im"
      ? "published"
      : isDraftEdit
      ? existingWsItem?.status === "published"
        ? "published"
        : "draft"
      : imItem.status === "published" || imItem.status === "completed"
      ? "published"
      : existingWsItem?.status === "published"
      ? "published"
      : "draft";

  if (shouldPublishSnapshot) {
    const gate = await assertPublishable({
      supabase,
      userId,
      kind: "im",
      itemPayload: {
        ...imItem,
        askingPriceManwon: askingPriceManwonNum || imItem.askingPriceManwon,
      },
      brokerMetaOverride: brokerProfileMeta,
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: gate.code,
          error: gate.message,
          missingFields: gate.missingFields,
          missingLabels: gate.missingLabels,
        },
        { status: 422 }
      );
    }
  }

  if (isUuid(buildingId) && uuidOwnerVerified) {
    try {
      await updateLegacyImDocumentAndBuilding({
        supabase,
        buildingId,
        imId,
        imItem,
        incomingRealPhotos,
        photosExplicitlyCleared,
        brokerProfileMeta,
        askingPriceManwonNum,
        monthlyRentTotalManwon,
        totalDepositManwon,
        vacancyPct,
        isPublishAction: shouldPublishSnapshot,
        rawRequestBody: body,
      });
    } catch (err) {
      if (strictDbMode()) {
        return NextResponse.json(
          { ok: false, error: err instanceof Error ? err.message : "DB 업데이트 실패" },
          { status: 500 }
        );
      }
    }
  }

  const nextItem: Record<string, any> = {
    ...imItem,
    id: imId,
    buildingId,
    ...(incomingRealPhotos.length > 0
      ? { photos: incomingRealPhotos }
      : photosExplicitlyCleared
      ? { photos: [], photoNames: [] }
      : {}),
    status: shouldPublishSnapshot ? "published" : isDraftEdit ? "draft" : imItem.status || nextWsStatus,
    hasUnpublishedEdits: shouldPublishSnapshot ? false : Boolean(imItem.hasUnpublishedEdits),
    monthlyRentTotalManwon,
    totalDepositManwon,
    vacancyPct,
    capRatePct,
    grossYieldPct,
    isDirty: false,
  };

  let canonicalId = isUuid(imId) ? imId : buildingId;
  try {
    const draftPayloadData = { ...nextItem, imId, brokerProfile: brokerProfileMeta || null };
    const verifiedSsotBuildingId =
      isUuid(buildingId) && ctx.buildingExistsInSsot !== false ? buildingId : null;
    const wsRes = await upsertWorkspaceItem(supabase, {
      id: existingWsItem?.id || (isUuid(imId) ? imId : undefined),
      legacyId: isUuid(imId)
        ? null
        : imId !== buildingId
        ? imId
        : isUuid(buildingId)
        ? verifiedSsotBuildingId
          ? null
          : buildingId
        : buildingId,
      buildingId: verifiedSsotBuildingId,
      ownerId: userId,
      isAdmin,
      kind: "im",
      status: nextWsStatus,
      title: String(imItem.title || "매물 IM"),
      address: String(imItem.address || ""),
      priceBand: askingPriceManwonNum > 0 ? formatPriceRange(askingPriceManwonNum * 10_000) : null,
      draftPayload: draftPayloadData,
      publishedSnapshot: shouldPublishSnapshot
        ? buildSanitizedImPublicSnapshot(draftPayloadData)
        : existingWsItem?.publishedSnapshot ?? null,
    });
    if (wsRes.item?.id) canonicalId = wsRes.item.id;
  } catch (err) {
    return repoErrorResponse(err);
  }

  if (allowMemStore && (shouldPublishSnapshot || existingWsItem?.status !== "published")) {
    synthesizeQuickRecordFromImItem(buildingId, nextItem, brokerProfileMeta, undefined, userId);
  }

  try {
    const evRes = await supabase.from("activity_events").insert({
      actor_id: userId,
      event_type: "im_upserted",
      entity_type: "building",
      entity_id: isUuid(buildingId) ? buildingId : userId,
      metadata: {
        building_id: buildingId,
        im_id: imId,
        status: shouldPublishSnapshot ? "published" : "draft",
        hasUnpublishedEdits: !shouldPublishSnapshot && Boolean(isDraftEdit),
        im_item: nextItem,
        broker_profile: brokerProfileMeta,
      },
    });
    if (evRes?.error && strictDbMode()) {
      return NextResponse.json({ ok: false, error: evRes.error.message }, { status: 500 });
    }
  } catch {
    if (strictDbMode()) {
      return NextResponse.json({ ok: false, error: "IM 이력 저장 실패" }, { status: 500 });
    }
  }

  try {
    revalidatePath(`/im-lite/${buildingId}`);
    revalidatePath(`/dc/${buildingId}`);
  } catch {
    // Ignore
  }
  return NextResponse.json({
    ok: true,
    id: canonicalId,
    legacyId: isUuid(imId) ? null : imId,
    action,
    buildingId,
    imId,
    persisted: true,
  });
}

async function updateLegacyImDocumentAndBuilding(params: {
  supabase: any;
  buildingId: string;
  imId: string;
  imItem: Record<string, any>;
  incomingRealPhotos: any[];
  photosExplicitlyCleared?: boolean;
  brokerProfileMeta: any;
  askingPriceManwonNum: number;
  monthlyRentTotalManwon: number;
  totalDepositManwon: number;
  vacancyPct: number;
  isPublishAction: boolean;
  rawRequestBody?: Record<string, any>;
}) {
  const {
    supabase,
    buildingId,
    imId,
    imItem,
    incomingRealPhotos,
    photosExplicitlyCleared = false,
    brokerProfileMeta,
    askingPriceManwonNum,
    monthlyRentTotalManwon,
    totalDepositManwon,
    vacancyPct,
    isPublishAction,
  } = params;

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

  const isDraftUpdateToPublishedDoc =
    !isPublishAction &&
    (imItem.hasUnpublishedEdits === true || imItem.status === "draft") &&
    latestDoc?.status === "published";
  if (isDraftUpdateToPublishedDoc) {
    return;
  }

  const nextDocStatus = isPublishAction ? "published" : undefined;

  if (latestDoc?.id) {
    const prevBody = (latestDoc.body && typeof latestDoc.body === "object" ? latestDoc.body : {}) as Record<string, any>;
    const prevSsot = (prevBody.ssot_summary && typeof prevBody.ssot_summary === "object" ? prevBody.ssot_summary : {}) as Record<string, any>;
    const prevHero = (prevBody.heroCard && typeof prevBody.heroCard === "object" ? prevBody.heroCard : {}) as Record<string, any>;
    const prevFloorLeases = Array.isArray(prevBody.floor_leases) ? prevBody.floor_leases : [];
    const prevRealPhotos = Array.isArray(prevBody.photos)
      ? prevBody.photos.filter(
          (p: any) =>
            p && typeof p.url === "string" && p.url.trim().length > 0 && !p.url.startsWith("/test-images/") && !p.url.startsWith("blob:")
        )
      : [];
    const preservedPhotos =
      incomingRealPhotos.length > 0
        ? incomingRealPhotos.map((p: any, idx: number) => ({
            url: typeof p === "string" ? p : String(p.url || p.dataUrl || p.previewUrl),
            ...(p?.caption || p?.name ? { caption: String(p.caption || p.name) } : {}),
            category: p?.category || p?.type || (idx === 0 && p?.isHero ? "exterior" : "general"),
            role: p?.role || (idx === 0 && p?.isHero ? "cover" : undefined),
            isHero: Boolean(p?.isHero ?? idx === 0),
          }))
        : photosExplicitlyCleared
        ? []
        : prevRealPhotos;

    const cleanHighlights = Array.isArray(imItem.axiosHighlights)
      ? imItem.axiosHighlights
          .map((h: any, idx: number) => {
            if (typeof h === "string" && h.trim().length > 0) {
              return { headline: h.trim(), brief: "", tone: idx === 1 ? "sky" : idx === 2 ? "mint" : "amber" };
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

    const normalizedFloorLeases = Array.isArray(imItem.rentRoll)
      ? imItem.rentRoll.map((r: any, idx: number) => {
          const prevFl = prevFloorLeases[idx] || {};
          const isVac = r?.status === "vacant" || r?.is_vacant === true || r?.lease_state === "공실" || r?.use === "공실";
          const isOwn = !isVac && (r?.status === "owner" || r?.lease_state === "자가사용" || r?.use === "자가사용" || r?.use === "자가");
          const depMan = Number(r?.depositManwon ?? r?.deposit_manwon ?? prevFl.deposit_manwon ?? 0);
          const rentMan = Number(r?.monthlyRentManwon ?? r?.rent_manwon ?? prevFl.rent_manwon ?? 0);
          const mgmtMan = Number(r?.maintenanceManwon ?? r?.mgmt_fee_manwon ?? prevFl.mgmt_fee_manwon ?? 0);
          const rawAreaM2 = Number(r?.areaSqm ?? r?.area_sqm ?? r?.area_m2 ?? prevFl.area_sqm ?? 0);
          const rawAreaPy = Number(r?.areaPyeong ?? r?.area_pyeong ?? 0);
          const areaM2 = rawAreaM2 > 0 && Math.abs(rawAreaM2 - 2.45) > 0.05 ? rawAreaM2 : rawAreaPy > 0 ? Math.round(pyeongToM2(rawAreaPy) * 100) / 100 : 0;
          const exclM2 = Number(r?.exclusiveAreaSqm ?? r?.exclusive_area_sqm ?? prevFl.exclusive_area_sqm ?? 0);
          const rawUseStr = String(r?.use || prevFl.use || prevFl.tenant_type || prevFl.tenant_name || "").trim();
          const slashParts = rawUseStr.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
          const splitTenantType =
            slashParts.length >= 2 ? slashParts[0] : rawUseStr || (isVac ? "공실" : isOwn ? "자가사용" : "임차인 미상");
          const splitTenantName =
            slashParts.length >= 2
              ? slashParts[0] === slashParts[1]
                ? slashParts[0]
                : slashParts.slice(1).join(" / ")
              : undefined;
          const explicitTenantName = String(r?.tenantName || r?.tenant_name || "").trim();
          const resolvedTenantName = isVac ? "공실" : isOwn ? explicitTenantName || splitTenantName || "자가사용" : explicitTenantName || splitTenantName || prevFl.tenant_name || splitTenantType;
          const resolvedTenantType = isVac ? "공실" : splitTenantType;
          const rawFlStr = String(r?.floor || prevFl.floor || `${idx + 1}F`).trim();
          const roomNumMatch = rawFlStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호$/i);
          const normFloor = roomNumMatch ? (roomNumMatch[1] ? `B${parseInt(roomNumMatch[2], 10)}` : `${parseInt(roomNumMatch[2], 10)}F`) : rawFlStr;
          const normUnit = roomNumMatch ? `${roomNumMatch[1] ? "B" : ""}${roomNumMatch[2]}${roomNumMatch[3]}호` : String(r?.unit || r?.unit_label || prevFl.unit_label || "");
          const rowNote = r?.note !== undefined && String(r.note).trim().length > 0 ? String(r.note).trim() : prevFl.note;
          const contractGroupVal = String(r?.contract_group ?? r?.contractGroup ?? prevFl.contract_group ?? "").trim() || undefined;
          const isProxyVal = Boolean(r?.area_sqm_is_proxy ?? r?.areaSqmIsProxy ?? prevFl.area_sqm_is_proxy);
          const legalBasisVal = r?.legal_basis ?? r?.legalBasis ?? prevFl.legal_basis;
          const firstContractVal = String(r?.first_contract_date ?? r?.firstContractDate ?? prevFl.first_contract_date ?? "").trim() || undefined;
          return {
            ...prevFl,
            floor: normFloor,
            unit_label: normUnit,
            tenant_name: resolvedTenantName,
            tenant_type: resolvedTenantType,
            use: resolvedTenantType,
            ...(areaM2 > 0 ? { area_sqm: areaM2, area_m2: areaM2, area_pyeong: Math.round(m2ToPyeong(areaM2) * 10) / 10 } : {}),
            ...(exclM2 > 0 ? { exclusive_area_sqm: exclM2 } : {}),
            ...(isProxyVal ? { area_sqm_is_proxy: true } : {}),
            ...(contractGroupVal ? { contract_group: contractGroupVal } : {}),
            ...(legalBasisVal ? { legal_basis: legalBasisVal } : {}),
            ...(firstContractVal ? { first_contract_date: firstContractVal } : {}),
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

    const prevBrokerContact = (prevBody.broker_contact && typeof prevBody.broker_contact === "object" ? prevBody.broker_contact : {}) as Record<string, any>;
    const nextBrokerName = cleanBrokerField(imItem.brokerName, cleanBrokerField(prevBrokerContact.brokerName || prevBrokerContact.name, brokerProfileMeta?.displayName)) || "";
    const nextBrokerageName = cleanBrokerField(imItem.brokerageName, cleanBrokerField(prevBrokerContact.brokerageName || prevBrokerContact.company, brokerProfileMeta?.company)) || "";
    const nextBrokerPhone = cleanBrokerField(imItem.brokerPhone, cleanBrokerField(prevBrokerContact.brokerPhone || prevBrokerContact.phone, brokerProfileMeta?.phone)) || "";
    const effectiveAskManwon = askingPriceManwonNum || Number(prevSsot.asking_price_manwon) || 0;
    const hasRentRollUpdate = Array.isArray(imItem.rentRoll);
    const nextMonthlyRentManwon = hasRentRollUpdate ? monthlyRentTotalManwon : Number(prevSsot.monthly_rent_total_manwon ?? 0);
    const nextTotalDepositManwon = hasRentRollUpdate ? totalDepositManwon : Number(prevSsot.total_deposit_manwon ?? 0);
    const nextVacancyPct = hasRentRollUpdate ? vacancyPct : Number(prevSsot.vacancy_pct ?? prevSsot.vacancy_rate_pct ?? 0);
    const nextGrossYieldPct = computeGrossYieldPct(
      nextMonthlyRentManwon,
      effectiveAskManwon,
      nextTotalDepositManwon
    );
    const nextCapRatePct = computeNoiCapRatePct(nextMonthlyRentManwon, effectiveAskManwon);
    const cleanKeyPoints = cleanHighlights ? cleanHighlights.map((h: any) => h.headline).filter(Boolean) : undefined;
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

    const incomingExpectedRentRoll = Array.isArray(imItem.expectedRentRoll)
      ? imItem.expectedRentRoll
      : Array.isArray(imItem.expected_rent_roll)
      ? imItem.expected_rent_roll
      : undefined;
    const incomingPnus =
      Array.isArray(imItem.pnus) && imItem.pnus.length > 0
        ? imItem.pnus
        : Array.isArray(imItem.parcels) && imItem.parcels.length > 0
        ? imItem.parcels
            .map((p: any) => p?.pnu)
            .filter((v: unknown): v is string => typeof v === "string" && /^\d{19}$/.test(v))
        : undefined;
    const resolvedBrokerExtras = (() => {
      if (imItem.broker_extras && typeof imItem.broker_extras === "object") {
        return imItem.broker_extras;
      }
      if (imItem.brokerExtras && typeof imItem.brokerExtras === "object") {
        const parsed = parseBrokerExtras(imItem.brokerExtras);
        return parsed.ok ? parsed.value : imItem.brokerExtras;
      }
      if (imItem.brokerExtrasForm && typeof imItem.brokerExtrasForm === "object") {
        const parsed = parseBrokerExtras(brokerExtrasFormToInput(imItem.brokerExtrasForm));
        return parsed.ok ? parsed.value : undefined;
      }
      return prevBody.broker_extras;
    })();

    const nextBody = {
      ...prevBody,
      heroTitle: imItem.title || prevBody.heroTitle,
      ...(resolvedPnu ? { pnu: resolvedPnu } : {}),
      ...(incomingPnus && incomingPnus.length > 0
        ? { pnus: incomingPnus }
        : prevBody.pnus !== undefined
        ? { pnus: prevBody.pnus }
        : {}),
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
      ...(incomingExpectedRentRoll !== undefined
        ? { expected_rent_roll: incomingExpectedRentRoll }
        : prevBody.expected_rent_roll !== undefined
        ? { expected_rent_roll: prevBody.expected_rent_roll }
        : {}),
      ...(imItem.rentRollMeta ?? imItem.rent_roll_meta ?? prevBody.rent_roll_meta
        ? { rent_roll_meta: imItem.rentRollMeta ?? imItem.rent_roll_meta ?? prevBody.rent_roll_meta }
        : {}),
      ...(imItem.expectedRentRollMeta ?? imItem.expected_rent_roll_meta ?? prevBody.expected_rent_roll_meta
        ? {
            expected_rent_roll_meta:
              imItem.expectedRentRollMeta ??
              imItem.expected_rent_roll_meta ??
              prevBody.expected_rent_roll_meta,
          }
        : {}),
      ...(resolvedBrokerExtras !== undefined ? { broker_extras: resolvedBrokerExtras } : {}),
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
        ...(imItem.parkingTotal !== undefined ? { parkingCount: Number(imItem.parkingTotal) } : {}),
        ...(imItem.elevatorCount !== undefined ? { elevatorCount: Number(imItem.elevatorCount) } : {}),
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
        total_gross_area_sqm: imItem.gfaSqm ? Number(String(imItem.gfaSqm).replace(/,/g, "")) : prevSsot.total_gross_area_sqm,
        land_area_sqm: imItem.landAreaSqm ? Number(String(imItem.landAreaSqm).replace(/,/g, "")) : prevSsot.land_area_sqm,
        zoning: imItem.zoning || prevSsot.zoning,
        completion_date: imItem.completionDate || prevSsot.completion_date,
        handover_note: imItem.handoverNote ?? prevSsot.handover_note,
        ...(imItem.floorsAbove !== undefined ? { floors_above: Number(imItem.floorsAbove) } : {}),
        ...(imItem.floorsBelow !== undefined ? { floors_below: Number(imItem.floorsBelow) } : {}),
        ...(imItem.bcrPct !== undefined ? { bcr_pct: Number(imItem.bcrPct) } : {}),
        ...(imItem.farPct !== undefined ? { far_pct: Number(imItem.farPct) } : {}),
        ...(imItem.parkingTotal !== undefined
          ? { parking_total: Number(imItem.parkingTotal), parking_count: Number(imItem.parkingTotal) }
          : {}),
        ...(imItem.elevatorCount !== undefined ? { elevator_count: Number(imItem.elevatorCount) } : {}),
        ...(imItem.officialLandPricePerSqm !== undefined
          ? {
              official_land_price_per_sqm: Number(imItem.officialLandPricePerSqm),
              official_land_price_krw: Number(imItem.officialLandPricePerSqm),
            }
          : {}),
        ...(imItem.parcels !== undefined ? { parcels: imItem.parcels } : {}),
        ...(incomingPnus && incomingPnus.length > 0 ? { pnus: incomingPnus } : {}),
        ...(imItem.mainPurpose !== undefined ? { main_usage: imItem.mainPurpose } : {}),
        ...(resolvedClosingLine !== undefined ? { closing_line: resolvedClosingLine } : {}),
      },
    };
    const { error: docErr } = await supabase
      .from("document_objects")
      .update({
        title: imItem.title || undefined,
        ...(nextDocStatus ? { status: nextDocStatus } : {}),
        body: nextBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", latestDoc.id);
    if (docErr) throw new Error(docErr.message || "IM 문서 저장에 실패했습니다.");
  }

  if (askingPriceManwonNum > 0) {
    const nextPriceBand = formatPriceRange(askingPriceManwonNum * 10_000);
    const { data: bldRow } = await supabase
      .from("building_ssot_lite")
      .select("id, layers")
      .eq("id", buildingId)
      .maybeSingle();
    if (bldRow) {
      const curLayers = (bldRow.layers && typeof bldRow.layers === "object" ? bldRow.layers : {}) as Record<string, any>;
      const { error: bldErr } = await supabase
        .from("building_ssot_lite")
        .update({
          price_band: nextPriceBand,
          layers: {
            ...curLayers,
            deal_terms: { ...(curLayers.deal_terms || {}), asking_price_manwon: askingPriceManwonNum },
            finance: { ...(curLayers.finance || {}), asking_price_manwon: askingPriceManwonNum, asking_price_krw: askingPriceManwonNum * 10000 },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", buildingId);
      if (bldErr) throw new Error(bldErr.message || "건물 가격 업데이트 실패");
    }
  }
}
