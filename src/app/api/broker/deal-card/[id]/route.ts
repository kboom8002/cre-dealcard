import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { z } from "zod/v4";

import { createModuleLogger } from '@/lib/logger';
import {
  computeCard4Hash,
  updateDealCard4,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { normalizeDealCardCopy } from '@/lib/deal-card/copy-limits';
import {
  isUuid,
  getQuickImRecord,
  resolveOrSynthesizeQuickImRecord,
  updateQuickImCard4,
  markDealCardDeleted,
  isDealCardDeleted,
  deleteQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';

const log = createModuleLogger('route');

const UpdateSchema = z.object({
  title: z.string().optional(),
  shortSummary: z.string().optional(),
  dealPoints: z.array(z.string()).optional(),
  cautionPoints: z.array(z.string()).optional(),
  kakaoText: z.string().optional(),
  pricing: z.object({
    askingPrice: z.number().optional(),
    deposit: z.number().optional(),
    monthlyRent: z.number().optional(),
    maintenanceFee: z.number().optional(),
  }).optional(),
  curiosityScore: z.number().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  hookCopy: z.string().optional(),
  structureChips: z.array(z.string()).optional(),
  vacancyLabel: z.string().optional(),
  curiosityHook: z.string().optional(),
  // SSoT 건물 신호 필드 인라인 편집
  ssotUpdate: z.object({
    area_signal: z.string().optional(),
    asset_type: z.string().optional(),
    price_band: z.string().optional(),
    current_use_signal: z.string().optional(),
  }).optional(),
  // 4-Item Deal Card & optimistic versioning (WP-P1-03)
  card4: z.object({
    headline: z.string().optional(),
    posture: z.enum(['income', 'owner_occupied', 'value_add']).optional(),
    region: z.string(),
    use: z.string(),
    area: z.string().optional(),
    gfaPyung: z.number().optional(),
    landAreaPyung: z.number().optional(),
    priceBand: z.string(),
    points: z.tuple([z.string(), z.string(), z.string()]),
    pointTones: z.tuple([
      z.enum(['amber', 'sky', 'mint', 'lavender', 'peach']),
      z.enum(['amber', 'sky', 'mint', 'lavender', 'peach']),
      z.enum(['amber', 'sky', 'mint', 'lavender', 'peach']),
    ]).optional(),
    pointBriefs: z.tuple([z.string(), z.string(), z.string()]).optional(),
    provenance: z.object({
      points: z.tuple([
        z.enum(['public', 'broker', 'ai']),
        z.enum(['public', 'broker', 'ai']),
        z.enum(['public', 'broker', 'ai']),
      ]),
    }).optional(),
  }).optional(),
  expectedVersion: z.number().optional(),
});

async function resolveTargetBuildingId(
  serviceClient: ReturnType<typeof createServiceClient>,
  id: string
): Promise<string> {
  if (!isUuid(id)) return id;
  try {
    const { data: bld } = await serviceClient
      .from("building_ssot_lite")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (bld?.id) return String(bld.id);

    const { data: sigCard } = await serviceClient
      .from("building_signal_cards")
      .select("id, building_id")
      .eq("id", id)
      .maybeSingle();
    if (sigCard?.building_id) return String(sigCard.building_id);
  } catch {
    // Fallback to original id
  }
  return id;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    if (isDealCardDeleted(id)) {
      return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
    }

    let serviceClient: ReturnType<typeof createServiceClient> | null = null;
    try {
      serviceClient = createServiceClient();
    } catch {
      serviceClient = null;
    }

    if (!isUuid(id)) {
      const quickRec =
        getQuickImRecord(id) ||
        (serviceClient ? await resolveOrSynthesizeQuickImRecord(id, serviceClient) : null);
      if (!quickRec) {
        return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
      }
      if (quickRec.ownerId && quickRec.ownerId !== guard.user!.id && guard.role !== "admin") {
        return NextResponse.json({ ok: false, error: "이 매물에 대한 권한이 없습니다." }, { status: 403 });
      }
      return NextResponse.json({
        ok: true,
        success: true,
        id: quickRec.buildingId,
        buildingId: quickRec.buildingId,
        card4: quickRec.card4,
        data: quickRec,
      });
    }

    if (!serviceClient) {
      return NextResponse.json({ ok: false, error: "서비스 연결 실패" }, { status: 500 });
    }

    const targetBuildingId = await resolveTargetBuildingId(serviceClient, id);
    const ownership = await assertBuildingOwner(serviceClient, targetBuildingId, guard.user!.id, {
      allowAdmin: true,
      role: guard.role,
      select: "id, owner_id, status, area_signal, asset_type, price_band, fit_summary, updated_at, layers",
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    const buildingRow = ownership.row as Record<string, any>;
    if (buildingRow?.status === "archived") {
      return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: teaserDoc } = await serviceClient
      .from("document_objects")
      .select("id, body, title, status, updated_at")
      .eq("building_id", targetBuildingId)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (teaserDoc?.status === "archived") {
      return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
    }

    const card4 = (teaserDoc?.body as Record<string, any> | undefined)?.card4 || null;
    return NextResponse.json({
      ok: true,
      success: true,
      id: targetBuildingId,
      buildingId: targetBuildingId,
      building: buildingRow,
      document: teaserDoc || null,
      card4,
      data: {
        building: buildingRow,
        document: teaserDoc || null,
        card4,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const json = await req.json();
    const updateData = UpdateSchema.parse(json);

    // Server-side blind-guard check across all incoming text fields
    const textsToValidate: string[] = [];
    if (updateData.title) textsToValidate.push(updateData.title);
    if (updateData.shortSummary) textsToValidate.push(updateData.shortSummary);
    if (Array.isArray(updateData.dealPoints)) textsToValidate.push(...updateData.dealPoints);
    if (updateData.kakaoText) textsToValidate.push(updateData.kakaoText);
    if (updateData.ogTitle) textsToValidate.push(updateData.ogTitle);
    if (updateData.ogDescription) textsToValidate.push(updateData.ogDescription);
    if (updateData.hookCopy) textsToValidate.push(updateData.hookCopy);
    if (updateData.ssotUpdate?.area_signal) textsToValidate.push(updateData.ssotUpdate.area_signal);
    if (updateData.card4) {
      textsToValidate.push(
        updateData.card4.region || '',
        updateData.card4.use || '',
        updateData.card4.priceBand || '',
        updateData.card4.headline || '',
        updateData.card4.area || '',
        ...updateData.card4.points
      );
    }

    if (textsToValidate.length > 0) {
      const blindCheck = validateBlindPoints(textsToValidate, {
        region: updateData.card4?.region || updateData.ssotUpdate?.area_signal,
        assetType: updateData.card4?.use || updateData.ssotUpdate?.asset_type,
      });
      if (!blindCheck.isValid) {
        return NextResponse.json(
          {
            ok: false,
            error:
              blindCheck.violations[0]?.reason ||
              '건물 위치가 드러날 수 있는 표현이 포함되어 있습니다.',
            violations: blindCheck.violations,
          },
          { status: 422 }
        );
      }
    }

    let serviceClient: ReturnType<typeof createServiceClient> | null = null;
    try {
      serviceClient = createServiceClient();
    } catch {
      serviceClient = null;
    }

    // Handle non-UUID Deal Card IDs via QuickImStore + activity_events
    if (!isUuid(id)) {
      const existingQuick = getQuickImRecord(id);
      if (
        existingQuick?.ownerId &&
        existingQuick.ownerId !== guard.user!.id &&
        guard.role !== 'admin'
      ) {
        return NextResponse.json(
          { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }

      const baseCard4: Card4Data = updateData.card4
        ? {
            ...(existingQuick?.card4 || {}),
            ...updateData.card4,
            provenance: updateData.card4.provenance || existingQuick?.card4?.provenance || {
              points: ['broker', 'broker', 'broker'],
            },
            card4_version: existingQuick?.card4?.card4_version || 1,
          }
        : {
            ...(existingQuick?.card4 || {
              region: '서울시 핵심권역',
              use: '근린생활시설',
              priceBand: '가격 협의',
              points: ['우수 입지', '추천 매물', '안정 수익'],
              provenance: { points: ['broker', 'broker', 'broker'] },
              card4_version: 1,
            }),
            ...(updateData.ssotUpdate?.area_signal ? { region: updateData.ssotUpdate.area_signal } : {}),
            ...(updateData.ssotUpdate?.asset_type ? { use: updateData.ssotUpdate.asset_type } : {}),
            ...(updateData.ssotUpdate?.price_band ? { priceBand: updateData.ssotUpdate.price_band } : {}),
            ...(updateData.title || updateData.ogTitle
              ? { headline: updateData.ogTitle || updateData.title }
              : {}),
            ...(Array.isArray(updateData.dealPoints) && updateData.dealPoints.length >= 3
              ? {
                  points: [
                    updateData.dealPoints[0],
                    updateData.dealPoints[1],
                    updateData.dealPoints[2],
                  ] as [string, string, string],
                }
              : {}),
          };

      const normalized = normalizeDealCardCopy(baseCard4, { fillHeadline: true });
      const nextVersion = (baseCard4.card4_version || 1) + 1;
      const nextHash = computeCard4Hash(normalized);
      const nextCard4: Card4Data = {
        ...normalized,
        ...(updateData.card4?.pointTones ? { pointTones: updateData.card4.pointTones } : {}),
        ...(updateData.card4?.pointBriefs ? { pointBriefs: updateData.card4.pointBriefs } : {}),
        card4_version: nextVersion,
        card4_hash: nextHash,
      };

      updateQuickImCard4(id, nextCard4, { ownerId: guard.user!.id });

      if (serviceClient && typeof serviceClient.from === 'function') {
        try {
          await serviceClient.from('activity_events').insert({
            actor_id: guard.user!.id,
            event_type: 'dealcard_upserted',
            entity_type: 'building',
            entity_id: guard.user!.id,
            metadata: {
              building_id: id,
              card4: nextCard4,
            },
          });
        } catch {
          // Non-blocking
        }
      }

      try {
        revalidatePath(`/dc/${id}`);
      } catch {
        // Ignore
      }

      return NextResponse.json({
        ok: true,
        success: true,
        body: { card4: nextCard4 },
        card4: nextCard4,
        version: nextVersion,
        hash: nextHash,
      });
    }

    if (!serviceClient) {
      return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });
    }

    const targetBuildingId = await resolveTargetBuildingId(serviceClient, id);

    // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정
    const ownership = await assertBuildingOwner(serviceClient, targetBuildingId, guard.user!.id, {
      allowAdmin: true,
      role: guard.role,
    });
    if (!ownership.ok) return ownership.response;

    // Handle Card4 atomic update with optimistic locking (WP-P1-03)
    if (updateData.card4) {
      const card4Result = await updateDealCard4(serviceClient, targetBuildingId, {
        card4: updateData.card4,
        expectedVersion: updateData.expectedVersion,
        userId: guard.user!.id,
      });

      if (card4Result.conflict) {
        return NextResponse.json(
          {
            error: card4Result.error,
            conflict: true,
            currentVersion: card4Result.currentVersion,
          },
          { status: 409 }
        );
      }

      if (!card4Result.success) {
        return NextResponse.json({ error: card4Result.error }, { status: 400 });
      }

      const mergedCard4: Card4Data | undefined = card4Result.card4
        ? {
            ...card4Result.card4,
            ...(updateData.card4.pointTones ? { pointTones: updateData.card4.pointTones } : {}),
            ...(updateData.card4.pointBriefs ? { pointBriefs: updateData.card4.pointBriefs } : {}),
          }
        : undefined;

      if (mergedCard4) {
        updateQuickImCard4(targetBuildingId, mergedCard4, { ownerId: guard.user!.id });
        try {
          await serviceClient.from('activity_events').insert({
            actor_id: guard.user!.id,
            event_type: 'dealcard_upserted',
            entity_type: 'building',
            entity_id: targetBuildingId,
            metadata: {
              building_id: targetBuildingId,
              card4: mergedCard4,
            },
          });
        } catch {
          // Non-blocking
        }
      }

      try {
        revalidatePath(`/dc/${targetBuildingId}`);
      } catch {
        // Ignore
      }

      return NextResponse.json({
        ok: true,
        success: true,
        body: { card4: mergedCard4 },
        card4: mergedCard4,
        version: card4Result.version,
        hash: card4Result.hash,
      });
    }

    // Fetch existing document to merge updates
    const { data: teaserDoc, error: fetchError } = await serviceClient
      .from("document_objects")
      .select("id, body")
      .eq("building_id", targetBuildingId)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const currentBody = teaserDoc?.body ? (teaserDoc.body as Record<string, any>) : {};
    const updatedBody = { ...currentBody };

    if (updateData.title !== undefined) updatedBody.title = updateData.title;
    if (updateData.shortSummary !== undefined) updatedBody.shortSummary = updateData.shortSummary;
    if (updateData.dealPoints !== undefined) updatedBody.dealPoints = updateData.dealPoints;
    if (updateData.cautionPoints !== undefined) updatedBody.cautionPoints = updateData.cautionPoints;
    if (updateData.kakaoText !== undefined) updatedBody.kakaoText = updateData.kakaoText;
    if (updateData.pricing !== undefined) updatedBody.pricing = updateData.pricing;
    if (updateData.ogTitle !== undefined) updatedBody.ogTitle = updateData.ogTitle;
    if (updateData.ogDescription !== undefined) updatedBody.ogDescription = updateData.ogDescription;
    if (updateData.hookCopy !== undefined) updatedBody.hookCopy = updateData.hookCopy;
    if (updateData.structureChips !== undefined) updatedBody.structureChips = updateData.structureChips;
    if (updateData.vacancyLabel !== undefined) updatedBody.vacancyLabel = updateData.vacancyLabel;
    if (updateData.curiosityHook !== undefined) updatedBody.curiosityHook = updateData.curiosityHook;

    // Keep updatedBody.card4 in sync when legacy fields or ssotUpdate are edited
    const prevCard4 = (currentBody.card4 || {}) as Partial<Card4Data>;
    const syncedRegion = updateData.ssotUpdate?.area_signal || prevCard4.region || "서울시 핵심권역";
    const syncedUse = updateData.ssotUpdate?.asset_type || prevCard4.use || "근린생활시설";
    const syncedPriceBand = updateData.ssotUpdate?.price_band || prevCard4.priceBand || "가격 협의";
    const rawSyncedPoints =
      Array.isArray(updateData.dealPoints) && updateData.dealPoints.length > 0
        ? updateData.dealPoints
        : Array.isArray(prevCard4.points)
        ? prevCard4.points
        : ["우수 입지", "추천 매물", "안정 수익"];
    const syncedPoints: [string, string, string] = [
      rawSyncedPoints[0] || "우수 입지",
      rawSyncedPoints[1] || "추천 매물",
      rawSyncedPoints[2] || "안정 수익",
    ];
    const syncedCard4Candidate: Card4Data = normalizeDealCardCopy(
      {
        ...prevCard4,
        headline: updateData.ogTitle ?? updateData.title ?? prevCard4.headline,
        region: syncedRegion,
        use: syncedUse,
        priceBand: syncedPriceBand,
        points: syncedPoints,
        provenance: prevCard4.provenance || { points: ["broker", "broker", "broker"] },
        card4_version: (prevCard4.card4_version || 1) + 1,
      },
      { fillHeadline: true }
    );
    syncedCard4Candidate.card4_hash = computeCard4Hash(syncedCard4Candidate);
    updatedBody.card4 = syncedCard4Candidate;

    // Update document_objects (body + markdown for kakaoText)
    const docUpdate: Record<string, unknown> = {
      body: updatedBody,
      updated_at: new Date().toISOString(),
    };
    if (updateData.kakaoText !== undefined) docUpdate.markdown = updateData.kakaoText;
    if (updateData.title !== undefined) docUpdate.title = updateData.title;

    if (teaserDoc) {
      const { error: updateError } = await serviceClient
        .from("document_objects")
        .update(docUpdate)
        .eq("id", teaserDoc.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await serviceClient
        .from("document_objects")
        .insert({
          owner_id: guard.user!.id,
          source_type: "building_ssot_lite",
          source_id: targetBuildingId,
          building_id: targetBuildingId,
          document_type: "blind_teaser",
          title: updatedBody.title || "블라인드 티저",
          body: updatedBody,
          markdown: updateData.kakaoText || "",
          visibility: "public_blind",
          status: "draft"
        });
      if (insertError) throw insertError;
    }

    // Sync building_signal_cards
    const signalCardUpdate: Record<string, unknown> = {};
    if (updateData.title !== undefined) signalCardUpdate.title = updateData.title;
    if (updateData.dealPoints !== undefined) signalCardUpdate.deal_points = updateData.dealPoints;
    if (updateData.curiosityScore !== undefined) signalCardUpdate.deal_curiosity_score = updateData.curiosityScore;
    if (updateData.hookCopy !== undefined) signalCardUpdate.hook_copy = updateData.hookCopy;

    if (Object.keys(signalCardUpdate).length > 0) {
      await serviceClient
        .from("building_signal_cards")
        .update(signalCardUpdate)
        .eq("building_id", targetBuildingId);
    }

    // SSoT 건물 신호 필드 인라인 편집 반영
    if (updateData.ssotUpdate && Object.keys(updateData.ssotUpdate).length > 0) {
      const ssotFields: Record<string, unknown> = {};
      const { area_signal, asset_type, price_band, current_use_signal } = updateData.ssotUpdate;
      if (area_signal !== undefined) ssotFields.area_signal = area_signal;
      if (asset_type !== undefined) ssotFields.asset_type = asset_type;
      if (price_band !== undefined) ssotFields.price_band = price_band;
      if (current_use_signal !== undefined) ssotFields.current_use_signal = current_use_signal;

      if (Object.keys(ssotFields).length > 0) {
        const { error: ssotError } = await serviceClient
          .from("building_ssot_lite")
          .update(ssotFields)
          .eq("id", targetBuildingId);
        if (ssotError) {
          log.error("[deal-card PATCH] SSoT update failed:", ssotError);
        }
      }
    }

    updateQuickImCard4(targetBuildingId, syncedCard4Candidate, { ownerId: guard.user!.id });
    try {
      await serviceClient.from("activity_events").insert({
        actor_id: guard.user!.id,
        event_type: "dealcard_upserted",
        entity_type: "building",
        entity_id: targetBuildingId,
        metadata: {
          building_id: targetBuildingId,
          card4: syncedCard4Candidate,
        },
      });
    } catch {
      // Non-blocking
    }

    try {
      revalidatePath(`/dc/${targetBuildingId}`);
    } catch {
      // Ignore
    }

    return NextResponse.json({
      ok: true,
      success: true,
      body: updatedBody,
      card4: syncedCard4Candidate,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const user = guard.user!;

    let service: ReturnType<typeof createServiceClient> | null = null;
    try {
      service = createServiceClient();
    } catch {
      service = null;
    }

    if (!isUuid(id)) {
      const existingQuick = getQuickImRecord(id);
      if (
        existingQuick?.ownerId &&
        existingQuick.ownerId !== user.id &&
        guard.role !== "admin"
      ) {
        return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
      }
      markDealCardDeleted(id);
      deleteQuickImRecord(id);
      if (service && typeof service.from === "function") {
        try {
          await service.from("activity_events").insert({
            actor_id: user.id,
            event_type: "dealcard_deleted",
            entity_type: "building",
            entity_id: user.id,
            metadata: { building_id: id },
          });
        } catch {
          // Non-blocking
        }
      }
      try {
        revalidatePath(`/dc/${id}`);
      } catch {
        // Ignore
      }
      return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
    }

    if (!service) {
      return NextResponse.json({ error: "서비스 연결 실패" }, { status: 500 });
    }

    const targetBuildingId = await resolveTargetBuildingId(service, id);
    const ownership = await assertBuildingOwner(service, targetBuildingId, user.id, {
      allowAdmin: true,
      role: guard.role,
    });
    if (!ownership.ok) return ownership.response;

    // 연관 데이터 선삭제
    await Promise.allSettled([
      service.from("document_objects").delete().eq("building_id", targetBuildingId),
      service.from("building_signal_cards").delete().eq("building_id", targetBuildingId),
      service.from("gate_requests").delete().eq("building_id", targetBuildingId),
      service.from("owner_readiness_checks").delete().eq("building_id", targetBuildingId),
      service.from("deal_card_personas").delete().eq("building_ssot_lite_id", targetBuildingId),
      service.from("deal_matches").delete().eq("building_id", targetBuildingId),
      service.from("price_predictions").delete().eq("building_id", targetBuildingId),
      service.from("lease_spaces").delete().eq("building_id", targetBuildingId),
      service.from("full_im_handoffs").delete().eq("source_building_ssot_lite_id", targetBuildingId),
      service.from("space_ai_handoffs").delete().eq("source_building_ssot_lite_id", targetBuildingId),
      service.from("match_results").delete().eq("building_ssot_lite_id", targetBuildingId),
      service.from("circle_shared_assets").delete().eq("building_id", targetBuildingId),
      service.from("deal_pipeline_states").delete().eq("building_ssot_lite_id", targetBuildingId),
      service.from("deal_casepacks").delete().eq("building_ssot_lite_id", targetBuildingId),
    ]);

    // 메인 레코드 삭제 (Hard delete 시도 후 soft delete fallback)
    const { error: hardDeleteErr } = await service
      .from("building_ssot_lite")
      .delete()
      .eq("id", targetBuildingId);

    if (hardDeleteErr) {
      log.warn("[deal-card/delete] Hard delete failed, fallback to soft delete:", hardDeleteErr.message);
      const { error: softDeleteErr } = await service
        .from("building_ssot_lite")
        .update({ status: "archived" })
        .eq("id", targetBuildingId);

      if (softDeleteErr) {
        console.error('[deal-card] Delete failed:', softDeleteErr);
        return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
      }
    }

    markDealCardDeleted(targetBuildingId);
    deleteQuickImRecord(targetBuildingId);
    if (id !== targetBuildingId) {
      markDealCardDeleted(id);
      deleteQuickImRecord(id);
    }

    try {
      await service.from("activity_events").insert({
        actor_id: user.id,
        event_type: "dealcard_deleted",
        entity_type: "building",
        entity_id: targetBuildingId,
        metadata: { building_id: targetBuildingId },
      });
    } catch {
      // Non-blocking
    }

    try {
      revalidatePath(`/dc/${targetBuildingId}`);
    } catch {
      // Ignore
    }

    return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ error: `오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}

