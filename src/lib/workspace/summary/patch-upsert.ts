import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isRealProductionRuntime } from "@/lib/env";
import { assertPublishable } from "@/lib/legal/publish-gate";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { validateBlindPriceBand } from "@/lib/deal-card/price-band";
import { evaluateDealCardPublishContent } from "@/lib/deal-card/publish-content-gate";
import {
  computeCard4Hash,
  normalizeCard4PointCandidates,
  updateDealCard4,
  type Card4Data,
  type DealCardGenerationSource,
} from "@/lib/deal-card/card4-schema";
import { normalizeDealCardCopy } from "@/lib/deal-card/copy-limits";
import {
  isUuid,
  markDealCardRestored,
  updateQuickImCard4,
} from "@/lib/im-lite/quick-generate-store";
import {
  getWorkspaceItemByAnyId,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
} from "@/lib/workspace/workspace-repository";
import {
  getUserMap,
  getWorkspaceMemoMemory,
  isWorkspaceMemoryEnabled,
  syncPairedMemoRow,
} from "./types-and-helpers";
import type { PatchContext } from "./patch-lifecycle";
import { handlePatchWorkspaceImUpsert } from "./patch-upsert-im";

const strictDbMode = () =>
  isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === "1";

function repoErrorResponse(err: unknown) {
  if (err instanceof WorkspaceRepositoryError) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        code: err.code,
        ...(err.status === 409 ? { conflict: true } : {}),
        ...(typeof err.currentVersion === "number" ? { currentVersion: err.currentVersion } : {}),
      },
      { status: err.status }
    );
  }
  return NextResponse.json(
    { ok: false, error: err instanceof Error ? err.message : "요청 처리에 실패했습니다." },
    { status: 500 }
  );
}

export async function handlePatchWorkspaceUpsert(
  ctx: PatchContext & { buildingId: string; uuidOwnerVerified: boolean }
): Promise<NextResponse> {
  if (ctx.action === "upsert_im" || ctx.action === "publish_im") {
    return handlePatchWorkspaceImUpsert(ctx);
  }
  const { supabase, userId, role, body, brokerProfileMeta, buildingId } = ctx;
  const isAdmin = role === "admin";
  const allowMemStore = isWorkspaceMemoryEnabled();

  // DealCard upsert branch
  const card4 = body?.card4 as Card4Data | undefined;
  if (!card4) {
    return NextResponse.json({ error: "buildingId and card4 are required" }, { status: 400 });
  }

  const incomingPrivateMemo = typeof body?.memoText === "string" ? body.memoText : undefined;
  const incomingPairedMemoId =
    (typeof body?.pairedMemoId === "string" && body.pairedMemoId.trim()) ||
    card4.pairedMemoId ||
    undefined;
  const incomingGenSource: DealCardGenerationSource | undefined =
    body?.generationSource === "ai_memo" || body?.generationSource === "manual"
      ? body.generationSource
      : card4.generationSource;

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

  const isExplicitPublish = body?.status === "sent" || body?.status === "published";
  if ((card4.priceBand && card4.priceBand.trim().length > 0) || isExplicitPublish) {
    const bandCheck = validateBlindPriceBand(card4.priceBand);
    if (!bandCheck.valid) {
      return NextResponse.json(
        {
          ok: false,
          code: "BLIND_PRICE_BAND_INVALID",
          error: bandCheck.reason || "블라인드 가격 구간 형식을 확인해 주세요.",
        },
        { status: 422 }
      );
    }
  }

  const normalizedCard4 = normalizeDealCardCopy(card4, { fillHeadline: true });
  const normalizedPointCandidates =
    card4.pointCandidates !== undefined
      ? normalizeCard4PointCandidates(card4.pointCandidates)
      : undefined;
  const { pointCandidates: _rawCandidates, ...restNormalizedCard4 } = normalizedCard4;
  void _rawCandidates;
  const incomingSigHash = computeCard4Hash(normalizedCard4);
  let outCard4: Card4Data = {
    ...restNormalizedCard4,
    ...(normalizedPointCandidates && normalizedPointCandidates.length > 0
      ? { pointCandidates: normalizedPointCandidates }
      : {}),
    ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
    ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
    ...(incomingPairedMemoId ? { pairedMemoId: incomingPairedMemoId } : {}),
    ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
    card4_version: (card4.card4_version || 1) + 1,
    card4_hash: incomingSigHash,
  };

  if (isExplicitPublish) {
    const contentGate = evaluateDealCardPublishContent(outCard4);
    if (!contentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: contentGate.code,
          error: contentGate.error,
          ...(contentGate.violations ? { violations: contentGate.violations } : {}),
        },
        { status: 422 }
      );
    }
    const gate = await assertPublishable({
      supabase,
      userId,
      kind: "dealcard",
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

  if (allowMemStore) markDealCardRestored(buildingId);

  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, userId);
  const memConvertedMap = getUserMap(memoMem.convertedMemoToBuildingByUser, userId);
  const memPairingByBuilding = getUserMap(memoMem.pairingByUserBuilding, userId);

  let syncedPairedMemoId = incomingPairedMemoId;
  if (incomingPrivateMemo !== undefined || incomingPairedMemoId) {
    const alreadyConvertedBeforeSync = Boolean(
      allowMemStore && incomingPairedMemoId && memConvertedMap.get(incomingPairedMemoId) === buildingId
    );
    syncedPairedMemoId = await syncPairedMemoRow(supabase, {
      userId,
      buildingId,
      memoText: incomingPrivateMemo,
      pairedMemoId: incomingPairedMemoId,
    });
    if (syncedPairedMemoId) {
      const alreadyConvertedSynced =
        alreadyConvertedBeforeSync ||
        (allowMemStore && memConvertedMap.get(syncedPairedMemoId) === buildingId);
      if (allowMemStore) {
        memUnconverted.delete(syncedPairedMemoId);
        memConvertedMap.set(syncedPairedMemoId, buildingId);
      }
      if (!alreadyConvertedSynced) {
        try {
          await supabase.from("activity_events").insert({
            actor_id: userId,
            event_type: "unconverted_memo_converted",
            entity_type: "memo",
            entity_id: isUuid(syncedPairedMemoId) ? syncedPairedMemoId : userId,
            metadata: { memo_id: syncedPairedMemoId, building_id: buildingId },
          });
        } catch {
          // Non-blocking
        }
      }
    }
    if (allowMemStore) {
      const prevPair = memPairingByBuilding.get(buildingId);
      memPairingByBuilding.set(buildingId, {
        memoText: incomingPrivateMemo ?? prevPair?.memoText ?? "",
        pairedMemoId: syncedPairedMemoId || prevPair?.pairedMemoId,
        generationSource: incomingGenSource || prevPair?.generationSource,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const memRecentUpserts = getUserMap(memoMem.recentUpsertByUserBuilding, userId);
  const upsertSignature = JSON.stringify({
    h: incomingSigHash,
    c: normalizedPointCandidates ?? card4.pointCandidates ?? null,
    t: card4.pointTones ?? null,
    b: card4.pointBriefs ?? null,
    m: incomingPrivateMemo ?? "",
    p: syncedPairedMemoId ?? "",
    g: incomingGenSource ?? "",
    s: body?.status ?? "",
  });
  const recentUpsert = allowMemStore ? memRecentUpserts.get(buildingId) : undefined;
  if (
    recentUpsert &&
    recentUpsert.signature === upsertSignature &&
    Date.now() - recentUpsert.atMs < 5000
  ) {
    return NextResponse.json({
      ok: true,
      buildingId,
      persisted: true,
      deduplicated: true,
      card4: recentUpsert.card4,
      pairedMemoId: syncedPairedMemoId ?? recentUpsert.pairedMemoId,
      generationSource: incomingGenSource,
      version: recentUpsert.version,
      hash: recentUpsert.hash ?? incomingSigHash,
    });
  }

  const existingWs = await getWorkspaceItemByAnyId(
    supabase,
    buildingId,
    "dealcard",
    isAdmin ? undefined : userId
  ).catch(() => null);

  const effectiveExpectedVersion =
    body?.strictVersionCheck !== false &&
    typeof body?.expectedVersion === "number" &&
    body.expectedVersion > 0
      ? body.expectedVersion
      : undefined;

  if (
    effectiveExpectedVersion !== undefined &&
    existingWs &&
    effectiveExpectedVersion !== existingWs.version
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "VERSION_CONFLICT",
        error: "다른 화면에서 먼저 수정되었습니다. 새로고침 후 다시 시도해 주세요.",
        conflict: true,
        currentVersion: existingWs.version,
      },
      { status: 409 }
    );
  }

  const existingPointCandidates =
    normalizedPointCandidates === undefined
      ? normalizeCard4PointCandidates(
          (existingWs?.draftPayload?.card4 as Partial<Card4Data> | undefined)?.pointCandidates
        )
      : undefined;
  const resolvedPointCandidates = normalizedPointCandidates ?? existingPointCandidates;
  const nextVersion = Math.max(existingWs?.version ?? 0, card4.card4_version ?? 1) + 1;
  outCard4 = {
    ...restNormalizedCard4,
    ...(resolvedPointCandidates && resolvedPointCandidates.length > 0
      ? { pointCandidates: resolvedPointCandidates }
      : {}),
    ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
    ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
    ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
    ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
    card4_version: nextVersion,
    card4_hash: incomingSigHash,
  };
  let version = nextVersion;
  let hash = incomingSigHash;

  const preservePublishedState = Boolean(
    existingWs &&
      (existingWs.status === "sent" || existingWs.status === "published") &&
      !isExplicitPublish
  );

  // WP-7.6 P1-3: skip mutating legacy document_objects/building_signal_cards/building_ssot_lite
  // on background draft autosaves of an already-published DealCard so live /dc/[id] and OG
  // routes keep serving the published version until explicit publish/resync.
  if (isUuid(buildingId) && !preservePublishedState && ctx.buildingExistsInSsot !== false) {
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
        ...(normalizedPointCandidates !== undefined ? { pointCandidates: normalizedPointCandidates } : {}),
        ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
        ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
        provenance: card4.provenance,
        ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
        ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
      },
      userId,
      ...(typeof body?.expectedVersion === "number" ? { expectedVersion: body.expectedVersion } : {}),
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, conflict: result.conflict, currentVersion: result.currentVersion },
        { status: result.conflict ? 409 : 500 }
      );
    }
    if (incomingPrivateMemo !== undefined || incomingGenSource === "ai_memo") {
      try {
        const bldUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (incomingPrivateMemo !== undefined) bldUpdates.raw_input = incomingPrivateMemo;
        if (incomingGenSource === "ai_memo") bldUpdates.input_type = "broker_memo";
        await supabase.from("building_ssot_lite").update(bldUpdates).eq("id", buildingId);
      } catch {
        // Non-blocking
      }
    }
    if (isExplicitPublish) {
      const pubIso = new Date().toISOString();
      await Promise.allSettled([
        supabase
          .from("document_objects")
          .update({ status: "published", visibility: "public_blind", updated_at: pubIso })
          .eq("building_id", buildingId)
          .eq("document_type", "blind_teaser"),
        supabase
          .from("building_signal_cards")
          .update({ status: "shared_external", visibility: "public_blind", updated_at: pubIso })
          .eq("building_id", buildingId),
      ]);
    }
    version = Math.max(nextVersion, result.version ?? 0);
    hash = result.hash ?? hash;
    if (result.card4) {
      const preservedCandidates = result.card4.pointCandidates ?? resolvedPointCandidates;
      outCard4 = {
        ...result.card4,
        ...(preservedCandidates && preservedCandidates.length > 0
          ? { pointCandidates: preservedCandidates }
          : {}),
        ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
        ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
        ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
        ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
        card4_version: version,
      };
    } else {
      outCard4 = {
        ...outCard4,
        card4_version: version,
      };
    }
  }

  let canonicalId = isUuid(buildingId) ? buildingId : "";
  let wsStatus: "draft" | "sent" | "published" = isExplicitPublish
    ? body?.status === "published"
      ? "published"
      : "sent"
    : "draft";
  try {
    if (preservePublishedState && existingWs) {
      wsStatus = existingWs.status === "published" ? "published" : "sent";
    }
    const existingDraftPayload =
      existingWs?.draftPayload && typeof existingWs.draftPayload === "object"
        ? { ...existingWs.draftPayload }
        : {};
    if (!preservePublishedState && "hasUnpublishedEdits" in existingDraftPayload) {
      delete existingDraftPayload.hasUnpublishedEdits;
    }
    const draftPayload = {
      ...existingDraftPayload,
      card4: outCard4,
      ...(incomingPrivateMemo !== undefined ? { memoText: incomingPrivateMemo } : {}),
      ...(syncedPairedMemoId ? { pairedMemoId: syncedPairedMemoId } : {}),
      ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
      brokerProfile: brokerProfileMeta || existingDraftPayload.brokerProfile || null,
      ...(preservePublishedState ? { hasUnpublishedEdits: true } : {}),
    };
    const verifiedSsotBuildingId =
      isUuid(buildingId) && ctx.buildingExistsInSsot !== false ? buildingId : null;
    const wsRes = await upsertWorkspaceItem(supabase, {
      id: existingWs?.id || (verifiedSsotBuildingId ? buildingId : undefined),
      legacyId: verifiedSsotBuildingId ? null : existingWs?.legacyId || buildingId,
      buildingId: verifiedSsotBuildingId,
      ownerId: userId,
      isAdmin,
      kind: "dealcard",
      status: wsStatus,
      title: `${outCard4.region} ${outCard4.use}`.trim(),
      address: outCard4.region,
      priceBand: outCard4.priceBand,
      draftPayload,
      ...(isExplicitPublish
        ? { publishedSnapshot: { card4: outCard4, brokerProfile: brokerProfileMeta || null } }
        : preservePublishedState && existingWs
        ? { publishedSnapshot: existingWs.publishedSnapshot }
        : {}),
      docHash: hash,
      version,
      ...(effectiveExpectedVersion !== undefined && existingWs
        ? { expectedVersion: effectiveExpectedVersion }
        : {}),
    });
    canonicalId = wsRes.item?.id || canonicalId || buildingId;
  } catch (err) {
    return repoErrorResponse(err);
  }

  if (allowMemStore && !preservePublishedState) {
    updateQuickImCard4(buildingId, outCard4, { ownerId: userId, brokerProfile: brokerProfileMeta });
  }

  const savedPair = memPairingByBuilding.get(buildingId);
  const hasPrivateMemo =
    incomingPrivateMemo !== undefined
      ? Boolean(incomingPrivateMemo)
      : Boolean(savedPair?.memoText);
  try {
    const evRes = await supabase.from("activity_events").insert({
      actor_id: userId,
      event_type: "dealcard_upserted",
      entity_type: "building",
      entity_id: isUuid(buildingId) ? buildingId : userId,
      metadata: {
        building_id: buildingId,
        status: isExplicitPublish ? wsStatus : "draft",
        ...(preservePublishedState ? { has_unpublished_edits: true } : {}),
        card4: outCard4,
        broker_profile: brokerProfileMeta,
        has_private_memo: hasPrivateMemo,
        ...(syncedPairedMemoId ? { paired_memo_id: syncedPairedMemoId } : {}),
        ...(incomingGenSource ? { generation_source: incomingGenSource } : {}),
      },
    });
    if (evRes?.error && strictDbMode()) {
      return NextResponse.json({ ok: false, error: evRes.error.message }, { status: 500 });
    }
  } catch {
    if (strictDbMode()) {
      return NextResponse.json({ ok: false, error: "저장 이력 기록에 실패했습니다." }, { status: 500 });
    }
  }

  if (allowMemStore) {
    memRecentUpserts.set(buildingId, {
      signature: upsertSignature,
      atMs: Date.now(),
      card4: outCard4,
      version,
      hash,
      pairedMemoId: syncedPairedMemoId,
    });
  }
  if (isExplicitPublish) {
    try {
      revalidatePath(`/dc/${buildingId}`);
      if (canonicalId && canonicalId !== buildingId) {
        revalidatePath(`/dc/${canonicalId}`);
      }
    } catch {
      // Ignore
    }
  }

  return NextResponse.json({
    ok: true,
    id: canonicalId,
    legacyId: isUuid(buildingId) ? null : buildingId,
    buildingId,
    persisted: true,
    card4: outCard4,
    pairedMemoId: syncedPairedMemoId,
    generationSource: incomingGenSource,
    version,
    hash,
  });
}
