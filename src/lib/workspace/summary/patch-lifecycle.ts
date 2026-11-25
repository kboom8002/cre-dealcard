import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isRealProductionRuntime } from "@/lib/env";
import type { createServiceClient } from "@/lib/supabase/service";
import { assertPublishable } from "@/lib/legal/publish-gate";
import { evaluateDealCardPublishContent } from "@/lib/deal-card/publish-content-gate";
import { syncLegacyBuildingPublishedStatus } from "@/lib/deal-card/publish-sync";
import {
  normalizeCard4PointCandidates,
  updateDealCard4,
  type Card4Data,
  type DealCardGenerationSource,
} from "@/lib/deal-card/card4-schema";
import { normalizeDealCardCopy } from "@/lib/deal-card/copy-limits";
import { type UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import {
  deleteQuickImRecord,
  isUuid,
  markDealCardDeleted,
  markDealCardRestored,
  markDealCardSent,
  synthesizeQuickRecordFromImItem,
  updateQuickImCard4,
} from "@/lib/im-lite/quick-generate-store";
import {
  restoreShareLinkToken,
  revokeShareLinkToken,
} from "@/lib/security/share-link-tokens";
import {
  getWorkspaceItemByAnyId,
  restoreWorkspaceItem,
  softDeleteWorkspaceItem,
  updateWorkspaceItemState,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
} from "@/lib/workspace/workspace-repository";
import {
  getUserMap,
  getUserSet,
  getWorkspaceMemoMemory,
  isWorkspaceMemoryEnabled,
  syncPairedMemoRow,
  type BrokerProfileMeta,
} from "./types-and-helpers";

export interface PatchContext {
  supabase: ReturnType<typeof createServiceClient>;
  userId: string;
  role: string;
  body: Record<string, unknown>;
  action: string;
  brokerProfileMeta: BrokerProfileMeta | undefined;
  buildingExistsInSsot?: boolean;
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

export async function handleMemoOnlyActions(
  ctx: PatchContext
): Promise<NextResponse | null> {
  const { supabase, userId, body, action } = ctx;
  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, userId);
  const memDeletedMemos = getUserSet(memoMem.deletedMemoIdsByUser, userId);

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
          if (existingRow && existingRow.user_id === userId) {
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
          const insQ = supabase.from("broker_memos").insert({
            user_id: userId,
            memo_text: rawMemoText,
            routing_type: routingType,
            routing_summary: routingSummary,
            status: "saved",
          }) as unknown as {
            select?: (cols: string) => {
              maybeSingle: () => Promise<{ data?: { id?: string } | null }>;
            };
          };
          const { data: insRow } =
            typeof insQ?.select === "function"
              ? await insQ.select("id, created_at").maybeSingle()
              : { data: null };
          if (insRow?.id) memoId = String(insRow.id);
        }
      }
    } catch {
      // Fallback to activity_events
    }

    const savedMemo: UnconvertedMemoItem = {
      id: memoId,
      memoText: rawMemoText,
      routingType,
      routingSummary: routingSummary || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    if (isWorkspaceMemoryEnabled()) {
      memDeletedMemos.delete(memoId);
      memUnconverted.set(memoId, savedMemo);
    }

    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "unconverted_memo_saved",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : userId,
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
    if (isWorkspaceMemoryEnabled()) {
      memUnconverted.delete(memoId);
      memDeletedMemos.add(memoId);
    }
    try {
      if (isUuid(memoId) && supabase && typeof supabase.from === "function") {
        await supabase
          .from("broker_memos")
          .update({ status: "archived" })
          .eq("id", memoId)
          .eq("user_id", userId);
      }
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "unconverted_memo_deleted",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : userId,
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
    if (isWorkspaceMemoryEnabled()) {
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
    }
    try {
      if (isUuid(memoId) && supabase && typeof supabase.from === "function") {
        await supabase
          .from("broker_memos")
          .update({ status: "saved" })
          .eq("id", memoId)
          .eq("user_id", userId);
      }
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "unconverted_memo_restored",
        entity_type: "memo",
        entity_id: isUuid(memoId) ? memoId : userId,
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

  return null;
}

export async function handlePatchWorkspaceLifecycle(
  ctx: PatchContext & { buildingId: string; uuidOwnerVerified: boolean }
): Promise<NextResponse | null> {
  const { supabase, userId, role, body, action, brokerProfileMeta, buildingId, uuidOwnerVerified } = ctx;
  const isAdmin = role === "admin";
  const allowMemStore = isWorkspaceMemoryEnabled();
  const memoMem = getWorkspaceMemoMemory();
  const memUnconverted = getUserMap(memoMem.unconvertedByUser, userId);
  const memConvertedMap = getUserMap(memoMem.convertedMemoToBuildingByUser, userId);
  const memPairingByBuilding = getUserMap(memoMem.pairingByUserBuilding, userId);
  const card4 = body?.card4 as Card4Data | undefined;

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
      userId,
      buildingId,
      memoText: incomingMemoText,
      pairedMemoId: incomingPairedMemoId,
    });

    if (allowMemStore) {
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
    }

    if (isUuid(buildingId) && uuidOwnerVerified) {
      try {
        await supabase
          .from("building_ssot_lite")
          .update({ raw_input: incomingMemoText, updated_at: new Date().toISOString() })
          .eq("id", buildingId);
      } catch {
        // Non-blocking
      }
    }

    try {
      const existingWs = await getWorkspaceItemByAnyId(
        supabase,
        buildingId,
        "dealcard",
        isAdmin ? undefined : userId
      );
      if (existingWs && (isAdmin || existingWs.ownerId === userId)) {
        const effectivePairedMemoId =
          resolvedPairedMemoId ||
          incomingPairedMemoId ||
          (typeof existingWs.draftPayload?.pairedMemoId === "string"
            ? existingWs.draftPayload.pairedMemoId
            : undefined);
        const nextDraftPayload: Record<string, unknown> = {
          ...(existingWs.draftPayload || {}),
          memoText: incomingMemoText,
          ...(effectivePairedMemoId ? { pairedMemoId: effectivePairedMemoId } : {}),
          ...(incomingGenSource ? { generationSource: incomingGenSource } : {}),
        };
        const baseTable = supabase.from("workspace_items") as unknown as {
          update?: (values: Record<string, unknown>) => {
            eq?: (
              col: string,
              val: string
            ) => PromiseLike<unknown> & {
              maybeSingle?: () => Promise<unknown>;
              single?: () => Promise<unknown>;
            };
          };
        };
        if (typeof baseTable?.update === "function") {
          const updQ = baseTable
            .update({
              draft_payload: nextDraftPayload,
              updated_at: new Date().toISOString(),
            })
            ?.eq?.("id", existingWs.id);
          if (updQ && typeof updQ.then === "function") {
            await updQ;
          } else if (typeof updQ?.maybeSingle === "function") {
            await updQ.maybeSingle();
          } else if (typeof updQ?.single === "function") {
            await updQ.single();
          }
        }
      }
    } catch {
      // Non-blocking on pre-cutover environments without workspace_items
    }

    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "dealcard_memo_paired",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
        metadata: {
          building_id: buildingId,
          has_private_memo: Boolean(incomingMemoText),
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

  if (action === "delete" || action === "delete_dealcard") {
    try {
      await softDeleteWorkspaceItem(supabase, { id: buildingId, userId, isAdmin, kind: "dealcard" });
    } catch (err) {
      return repoErrorResponse(err);
    }
    if (allowMemStore) markDealCardDeleted(buildingId);

    if (isUuid(buildingId) && uuidOwnerVerified) {
      const nowIso = new Date().toISOString();
      await Promise.allSettled([
        supabase.from("building_ssot_lite").update({ status: "archived", updated_at: nowIso }).eq("id", buildingId),
        supabase.from("building_signal_cards").update({ status: "archived", updated_at: nowIso }).eq("building_id", buildingId),
        supabase
          .from("document_objects")
          .update({ status: "archived", updated_at: nowIso })
          .eq("building_id", buildingId)
          .eq("document_type", "blind_teaser"),
      ]);
    }
    try {
      const evRes = await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "dealcard_deleted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
        metadata: { building_id: buildingId },
      });
      if (evRes?.error && strictDbMode()) {
        return NextResponse.json({ ok: false, error: evRes.error.message }, { status: 500 });
      }
    } catch {
      if (strictDbMode()) {
        return NextResponse.json({ ok: false, error: "삭제 이력 저장에 실패했습니다." }, { status: 500 });
      }
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
    } catch {
      // Ignore outside request context
    }
    return NextResponse.json({ ok: true, action: "delete", buildingId, persisted: true });
  }

  if (action === "restore" || action === "restore_dealcard") {
    try {
      await restoreWorkspaceItem(supabase, { id: buildingId, userId, isAdmin, kind: "dealcard" });
    } catch (err) {
      return repoErrorResponse(err);
    }
    if (allowMemStore) {
      markDealCardRestored(buildingId);
      if (card4 && (!isUuid(buildingId) || uuidOwnerVerified)) {
        updateQuickImCard4(buildingId, card4, { ownerId: userId, brokerProfile: brokerProfileMeta });
      }
    }
    if (isUuid(buildingId) && uuidOwnerVerified) {
      const nowIso = new Date().toISOString();
      await Promise.allSettled([
        supabase.from("building_ssot_lite").update({ status: "draft", updated_at: nowIso }).eq("id", buildingId),
        supabase.from("building_signal_cards").update({ status: "draft", updated_at: nowIso }).eq("building_id", buildingId),
      ]);
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "dealcard_restored",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
        metadata: { building_id: buildingId, ...(card4 ? { card4 } : {}) },
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

  if (action === "mark_sent" || action === "publish_dealcard") {
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
    let persistedSentCard4: Card4Data | undefined;
    // WP-7.3C P1-5: shared content gate (blind points + pointBriefs + headline,
    // price band, placeholder copy). Without a body card4, gate whatever card4
    // the repository would publish (existing snapshot, else the draft payload).
    let gateCard4: Partial<Card4Data> | undefined = card4 || undefined;
    if (!gateCard4) {
      try {
        const existingForGate = await getWorkspaceItemByAnyId(
          supabase,
          buildingId,
          "dealcard",
          isAdmin ? undefined : userId
        );
        if (!existingForGate) {
          return NextResponse.json(
            {
              ok: false,
              code: "DEALCARD_NOT_FOUND",
              error: "발행할 딜카드를 찾을 수 없습니다.",
              buildingId,
              persisted: false,
            },
            { status: 404 }
          );
        }
        const existingCard4 =
          (existingForGate?.publishedSnapshot as Record<string, unknown> | null)?.card4 ??
          (existingForGate?.draftPayload as Record<string, unknown> | null)?.card4;
        if (existingCard4 && typeof existingCard4 === "object") {
          gateCard4 = existingCard4 as Partial<Card4Data>;
        }
      } catch (err) {
        return repoErrorResponse(err);
      }
    }
    const contentGate = evaluateDealCardPublishContent(gateCard4);
    if (!contentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: contentGate.code,
          error: contentGate.error,
          ...(contentGate.violations ? { violations: contentGate.violations } : {}),
        },
        { status: contentGate.status }
      );
    }
    if (card4) {
      const normalizedSent = normalizeDealCardCopy(card4, { fillHeadline: true });
      const normalizedSentCandidates = normalizeCard4PointCandidates(card4.pointCandidates);
      const { pointCandidates: _rawSentCandidates, ...restNormalizedSent } = normalizedSent;
      void _rawSentCandidates;
      persistedSentCard4 = {
        ...restNormalizedSent,
        ...(normalizedSentCandidates && normalizedSentCandidates.length > 0
          ? { pointCandidates: normalizedSentCandidates }
          : {}),
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
              ...(normalizedSentCandidates !== undefined
                ? { pointCandidates: normalizedSentCandidates }
                : {}),
              ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
              ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
              provenance: persistedSentCard4.provenance,
            },
            userId,
          });
          if (updRes.card4) {
            const preservedCandidates = updRes.card4.pointCandidates ?? normalizedSentCandidates;
            persistedSentCard4 = {
              ...updRes.card4,
              ...(preservedCandidates && preservedCandidates.length > 0
                ? { pointCandidates: preservedCandidates }
                : {}),
              ...(card4.pointTones ? { pointTones: card4.pointTones } : {}),
              ...(card4.pointBriefs ? { pointBriefs: card4.pointBriefs } : {}),
            };
          }
        } catch {
          // Non-blocking
        }
      }
      if (allowMemStore) {
        updateQuickImCard4(buildingId, persistedSentCard4, {
          ownerId: userId,
          brokerProfile: brokerProfileMeta,
        });
      }
    }

    let wsCanonicalId: string | undefined;
    try {
      const stateRes = await updateWorkspaceItemState(supabase, {
        id: buildingId,
        userId,
        isAdmin,
        kind: "dealcard",
        status: "sent",
        ...(persistedSentCard4
          ? {
              publishedSnapshot: {
                card4: persistedSentCard4,
                brokerProfile: brokerProfileMeta || null,
              },
            }
          : {}),
      });
      if (stateRes.item) {
        wsCanonicalId = stateRes.item.id;
      } else if (persistedSentCard4) {
        const verifiedSsotBuildingId =
          isUuid(buildingId) && ctx.buildingExistsInSsot !== false ? buildingId : null;
        const upRes = await upsertWorkspaceItem(supabase, {
          legacyId: verifiedSsotBuildingId ? null : buildingId,
          buildingId: verifiedSsotBuildingId,
          ownerId: userId,
          isAdmin,
          kind: "dealcard",
          status: "sent",
          title: `${persistedSentCard4.region} ${persistedSentCard4.use}`.trim(),
          address: persistedSentCard4.region,
          priceBand: persistedSentCard4.priceBand,
          draftPayload: { card4: persistedSentCard4, brokerProfile: brokerProfileMeta || null },
          publishedSnapshot: { card4: persistedSentCard4, brokerProfile: brokerProfileMeta || null },
        });
        wsCanonicalId = upRes.item?.id;
      } else {
        return NextResponse.json(
          {
            ok: false,
            code: "DEALCARD_NOT_FOUND",
            error: "발행할 딜카드를 찾을 수 없습니다.",
            buildingId,
            persisted: false,
          },
          { status: 404 }
        );
      }
      if (isUuid(buildingId)) {
        await syncLegacyBuildingPublishedStatus(supabase, buildingId);
      }
    } catch (err) {
      return repoErrorResponse(err);
    }
    if (allowMemStore) markDealCardSent(buildingId);

    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "dealcard_sent",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
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
            .update({ visibility: "public_blind", status: "shared_external" })
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
      id: wsCanonicalId || buildingId,
      legacyId: isUuid(buildingId) ? null : buildingId,
      action: "mark_sent",
      buildingId,
      status: "sent",
      persisted: true,
      ...(persistedSentCard4 ? { card4: persistedSentCard4 } : {}),
    });
  }

  if (action === "delete_im") {
    const imId = String(body?.imId || buildingId);
    try {
      await softDeleteWorkspaceItem(supabase, { id: imId, userId, isAdmin, kind: "im" });
      if (buildingId !== imId) {
        await softDeleteWorkspaceItem(supabase, { id: buildingId, userId, isAdmin, kind: "im" });
      }
    } catch (err) {
      return repoErrorResponse(err);
    }
    if (allowMemStore) {
      deleteQuickImRecord(buildingId);
      if (imId && imId !== buildingId) deleteQuickImRecord(imId);
    }
    if (isUuid(buildingId) && uuidOwnerVerified) {
      try {
        await supabase
          .from("document_objects")
          .update({ status: "archived", updated_at: new Date().toISOString() })
          .eq("building_id", buildingId)
          .in("document_type", ["mobile_im", "im_lite", "im_lite_draft"]);
      } catch {
        // Non-blocking
      }
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "im_deleted",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
        metadata: { building_id: buildingId, im_id: imId },
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

  if (action === "restore_im") {
    const imId = String(body?.imId || buildingId);
    const imItem = body?.imItem && typeof body.imItem === "object" ? body.imItem : undefined;
    let restoredSnapshot: Record<string, unknown> | null = null;
    try {
      const restoreRes = await restoreWorkspaceItem(supabase, { id: imId, userId, isAdmin, kind: "im" });
      restoredSnapshot = restoreRes.item?.publishedSnapshot ?? null;
    } catch (err) {
      return repoErrorResponse(err);
    }
    const restoredDocStatus = restoredSnapshot ? "published" : "draft";
    if (isUuid(buildingId)) {
      try {
        const docUpd = supabase
          .from("document_objects")
          .update({ status: restoredDocStatus, updated_at: new Date().toISOString() })
          .eq("building_id", buildingId)
          .eq("status", "archived");
        await (typeof docUpd.in === "function"
          ? docUpd.in("document_type", ["mobile_im", "im_lite", "im_lite_draft"])
          : docUpd);
      } catch {
        // Non-blocking fallback
      }
    }
    if (isUuid(imId) && imId !== buildingId) {
      try {
        await supabase
          .from("document_objects")
          .update({ status: restoredDocStatus, updated_at: new Date().toISOString() })
          .eq("id", imId)
          .eq("status", "archived");
      } catch {
        // Non-blocking fallback
      }
    }
    if (allowMemStore && imItem) {
      synthesizeQuickRecordFromImItem(
        buildingId,
        imItem as Record<string, unknown>,
        brokerProfileMeta,
        userId
      );
    }
    try {
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "im_restored",
        entity_type: "building",
        entity_id: isUuid(buildingId) ? buildingId : userId,
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

  if (action === "revoke_link") {
    const reason = typeof body?.reason === "string" ? body.reason : "개업공인중개사 회수";
    const res = await revokeShareLinkToken({
      buildingId,
      brokerId: userId,
      isAdmin,
      reason,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status || 403 });
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
      revalidatePath(`/im-lite/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({ ok: true, action: "revoke_link", buildingId, persisted: true });
  }

  if (action === "restore_link") {
    const scopeOwner = isAdmin ? undefined : userId;
    const [existingDc, existingIm] = await Promise.all([
      getWorkspaceItemByAnyId(supabase, buildingId, "dealcard", scopeOwner).catch(() => null),
      getWorkspaceItemByAnyId(supabase, buildingId, "im", scopeOwner).catch(() => null),
    ]);
    if (existingDc?.publishedSnapshot || existingIm?.publishedSnapshot) {
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

    const res = await restoreShareLinkToken({
      buildingId,
      brokerId: userId,
      isAdmin,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status || 403 });
    }
    try {
      revalidatePath(`/dc/${buildingId}`);
      revalidatePath(`/im-lite/${buildingId}`);
    } catch {
      // Ignore
    }
    return NextResponse.json({ ok: true, action: "restore_link", buildingId, persisted: true });
  }

  if (action === "update_correction_notice") {
    const rawNotice = body?.message !== undefined ? body.message : body?.notice;
    if (rawNotice === undefined || (rawNotice !== null && typeof rawNotice !== "string")) {
      return NextResponse.json({ ok: false, error: "정정 공지 내용을 입력해 주세요." }, { status: 400 });
    }
    const trimmedMessage = typeof rawNotice === "string" ? rawNotice.trim() : "";
    const notice =
      rawNotice === null || trimmedMessage === ""
        ? null
        : { message: trimmedMessage, updatedAt: new Date().toISOString() };
    try {
      const stateRes = await updateWorkspaceItemState(supabase, {
        id: buildingId,
        userId,
        isAdmin,
        correctionNotice: notice,
      });
      try {
        await supabase.from("activity_events").insert({
          actor_id: userId,
          event_type: notice ? "correction_notice_published" : "correction_notice_cleared",
          entity_type: "building",
          entity_id: isUuid(buildingId) ? buildingId : userId,
          metadata: {
            building_id: buildingId,
            ...(notice ? { message: notice.message, updated_at: notice.updatedAt } : { cleared: true }),
          },
        });
      } catch {
        // Non-blocking pre-cutover compliance audit
      }
      try {
        revalidatePath(`/dc/${buildingId}`);
        revalidatePath(`/im-lite/${buildingId}`);
      } catch {
        // Ignore
      }
      return NextResponse.json({
        ok: true,
        id: stateRes.item?.id || buildingId,
        action: "update_correction_notice",
        buildingId,
        correctionNotice: notice,
        persisted: true,
      });
    } catch (err) {
      return repoErrorResponse(err);
    }
  }

  return null;
}
