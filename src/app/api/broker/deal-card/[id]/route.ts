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
import { assertPublishable } from '@/lib/legal/publish-gate';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { validateBlindPriceBand } from '@/lib/deal-card/price-band';
import { evaluateDealCardPublishContent } from '@/lib/deal-card/publish-content-gate';
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
import {
  assertLegacyOrDbOwnership,
  buildSanitizedDealCardPublicSnapshot,
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  softDeleteWorkspaceItem,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { deleteDealCardDependents } from '@/lib/deal-card/delete-dependents';
import { buildBrokerProfileMeta } from '@/lib/workspace/summary/types-and-helpers';
import { isRealProductionRuntime } from '@/lib/env';

const PROD_SEED_BLOCK_IDS = new Set(['bld-01', 'bld-02', 'bld-03']);

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
  status: z.enum(['draft', 'published', 'sent']).optional(),
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

function isSchemaColumnErr(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /does not exist|schema cache/i.test(String(err.message || ""));
}

async function fetchVerifiedBrokerSnapshotProfile(
  serviceClient: ReturnType<typeof createServiceClient> | null,
  userId: string,
  statutoryFallback?: {
    company?: string;
    officeAddress?: string;
    phone?: string;
    officeRegNumber?: string;
    representativeName?: string;
  } | null
): Promise<Record<string, unknown> | null> {
  let pRow: Record<string, unknown> | null = null;
  let bpRow: Record<string, unknown> | null = null;

  if (serviceClient && typeof serviceClient.from === "function" && isUuid(userId)) {
    try {
      const pFull = await serviceClient
        .from("profiles")
        .select("display_name, company, phone, photo_url")
        .eq("id", userId)
        .maybeSingle();
      if (pFull?.error && isSchemaColumnErr(pFull.error)) {
        const pMin = await serviceClient
          .from("profiles")
          .select("display_name, company, phone")
          .eq("id", userId)
          .maybeSingle();
        pRow = (pMin?.data as Record<string, unknown> | null) ?? null;
      } else {
        pRow = (pFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      pRow = null;
    }

    try {
      const bpFull = await serviceClient
        .from("broker_profiles")
        .select(
          "user_id, slug, card_name, photo_url, deal_specialty, license_number, office_reg_number, office_address, representative_name"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (bpFull?.error && isSchemaColumnErr(bpFull.error)) {
        const bpCore = await serviceClient
          .from("broker_profiles")
          .select("user_id, slug, card_name, photo_url, license_number, office_reg_number")
          .eq("user_id", userId)
          .maybeSingle();
        if (bpCore?.error && isSchemaColumnErr(bpCore.error)) {
          const bpMin = await serviceClient
            .from("broker_profiles")
            .select("user_id, slug, office_reg_number")
            .eq("user_id", userId)
            .maybeSingle();
          bpRow = (bpMin?.data as Record<string, unknown> | null) ?? null;
        } else {
          bpRow = (bpCore?.data as Record<string, unknown> | null) ?? null;
        }
      } else {
        bpRow = (bpFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      bpRow = null;
    }
  }

  const meta = buildBrokerProfileMeta(pRow, bpRow);
  const company = meta?.company || statutoryFallback?.company || undefined;
  const officeAddress = meta?.officeAddress || statutoryFallback?.officeAddress || undefined;
  const phone = meta?.phone || statutoryFallback?.phone || undefined;
  const officeRegNumber = meta?.officeRegNumber || statutoryFallback?.officeRegNumber || undefined;
  const representativeName =
    meta?.representativeName || statutoryFallback?.representativeName || undefined;
  const displayName =
    meta?.displayName ||
    (typeof bpRow?.card_name === "string" && bpRow.card_name) ||
    representativeName ||
    undefined;
  const photoUrl =
    meta?.photoUrl ||
    (typeof bpRow?.photo_url === "string" ? bpRow.photo_url : undefined) ||
    (typeof pRow?.photo_url === "string" ? pRow.photo_url : undefined);

  if (!company && !officeAddress && !phone && !officeRegNumber && !representativeName && !displayName) {
    return null;
  }

  return {
    ...(meta || {}),
    ...(displayName ? { displayName, display_name: displayName } : {}),
    ...(company ? { company } : {}),
    ...(phone ? { phone } : {}),
    ...(officeAddress ? { officeAddress, office_address: officeAddress } : {}),
    ...(officeRegNumber
      ? {
          officeRegNumber,
          office_reg_number: officeRegNumber,
          registrationNo: officeRegNumber,
        }
      : {}),
    ...(representativeName
      ? { representativeName, representative_name: representativeName }
      : {}),
    ...(photoUrl ? { photoUrl, avatar_url: photoUrl } : {}),
    ...(typeof bpRow?.card_name === "string" && bpRow.card_name
      ? { card_name: bpRow.card_name }
      : {}),
    is_licensed: Boolean(meta?.is_licensed || officeRegNumber),
  };
}

type UuidAccessResult =
  | {
      ok: true;
      mode: "building";
      targetBuildingId: string;
      buildingRow: Record<string, unknown>;
      wsItem: null;
    }
  | {
      ok: true;
      mode: "standalone_workspace";
      targetBuildingId: string;
      buildingRow: null;
      wsItem: WorkspaceItemRecord;
    }
  | {
      ok: false;
      response: NextResponse;
    };

async function resolveUuidDealCardAccess(
  serviceClient: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  role: string | null | undefined,
  select?: string
): Promise<UuidAccessResult> {
  const targetBuildingId = await resolveTargetBuildingId(serviceClient, id);
  const ownership = await assertBuildingOwner(serviceClient, targetBuildingId, userId, {
    allowAdmin: true,
    role,
    ...(select ? { select } : {}),
  });

  if (ownership.ok) {
    return {
      ok: true,
      mode: "building",
      targetBuildingId,
      buildingRow: ownership.row as Record<string, unknown>,
      wsItem: null,
    };
  }

  if (ownership.status !== 404) {
    return { ok: false, response: ownership.response };
  }

  try {
    const wsItem =
      (await getWorkspaceItemByAnyId(serviceClient, id, "dealcard")) ||
      (targetBuildingId !== id
        ? await getWorkspaceItemByAnyId(serviceClient, targetBuildingId, "dealcard")
        : null);
    if (!wsItem) {
      return { ok: false, response: ownership.response };
    }
    if (wsItem.status === "archived" || Boolean(wsItem.deletedAt)) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 }),
      };
    }
    if (wsItem.ownerId !== userId && role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
          { status: 403 }
        ),
      };
    }
    return {
      ok: true,
      mode: "standalone_workspace",
      targetBuildingId: wsItem.id,
      buildingRow: null,
      wsItem,
    };
  } catch (err) {
    if (err instanceof WorkspaceRepositoryError) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: err.message, code: err.code },
          { status: err.status }
        ),
      };
    }
    throw err;
  }
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
      if (serviceClient) {
        try {
          const wsItem = await getWorkspaceItemByAnyId(serviceClient, id, "dealcard");
          if (wsItem) {
            if (wsItem.status === "archived" || Boolean(wsItem.deletedAt)) {
              return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
            }
            if (wsItem.ownerId !== guard.user!.id && guard.role !== "admin") {
              return NextResponse.json({ ok: false, error: "이 매물에 대한 권한이 없습니다." }, { status: 403 });
            }
            const card4Payload =
              (wsItem.publishedSnapshot as Record<string, unknown> | null)?.card4 ||
              (wsItem.draftPayload as Record<string, unknown> | null)?.card4 ||
              null;
            return NextResponse.json({
              ok: true,
              success: true,
              id: wsItem.id,
              legacyId: wsItem.legacyId,
              buildingId: wsItem.buildingId || wsItem.legacyId || wsItem.id,
              card4: card4Payload,
              data: wsItem.draftPayload,
            });
          }
          await assertLegacyOrDbOwnership(serviceClient, {
            id,
            userId: guard.user!.id,
            isAdmin: guard.role === "admin",
            kind: "dealcard",
          });
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
          }
          throw err;
        }
      }

      if (PROD_SEED_BLOCK_IDS.has(id) && isRealProductionRuntime()) {
        return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
      }

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

    const access = await resolveUuidDealCardAccess(
      serviceClient,
      id,
      guard.user!.id,
      guard.role,
      "id, owner_id, status, area_signal, asset_type, price_band, fit_summary, updated_at, layers"
    );

    if (!access.ok) {
      return access.response;
    }

    if (access.mode === "standalone_workspace") {
      const wsItem = access.wsItem;
      const card4Payload =
        (wsItem.publishedSnapshot as Record<string, unknown> | null)?.card4 ||
        (wsItem.draftPayload as Record<string, unknown> | null)?.card4 ||
        null;
      return NextResponse.json({
        ok: true,
        success: true,
        id: wsItem.id,
        legacyId: wsItem.legacyId,
        buildingId: wsItem.buildingId || wsItem.legacyId || wsItem.id,
        card4: card4Payload,
        data: wsItem.draftPayload,
      });
    }

    const { targetBuildingId, buildingRow } = access;
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

    const card4 = (teaserDoc?.body as Record<string, unknown> | undefined)?.card4 || null;
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function persistStandaloneWorkspaceCard4(params: {
  serviceClient: ReturnType<typeof createServiceClient> | null;
  id: string;
  userId: string;
  role: string | null | undefined;
  updateData: z.infer<typeof UpdateSchema>;
  wsItem: WorkspaceItemRecord | null;
  existingQuick: ReturnType<typeof getQuickImRecord> | null;
  isStandaloneUuid: boolean;
}): Promise<NextResponse> {
  const { serviceClient, id, userId, role, updateData, wsItem, existingQuick, isStandaloneUuid } = params;
  const wsCard4 = ((wsItem?.draftPayload as Record<string, unknown> | undefined)?.card4 ||
    (wsItem?.publishedSnapshot as Record<string, unknown> | null | undefined)?.card4) as
    | Partial<Card4Data>
    | undefined;

  if (
    isStandaloneUuid &&
    typeof updateData.expectedVersion === 'number' &&
    typeof wsCard4?.card4_version === 'number' &&
    updateData.expectedVersion !== wsCard4.card4_version
  ) {
    return NextResponse.json(
      {
        error: `409 Version Conflict: expected ${updateData.expectedVersion}, current ${wsCard4.card4_version}`,
        conflict: true,
        currentVersion: wsCard4.card4_version,
      },
      { status: 409 }
    );
  }

  const fallbackCard4: Card4Data = existingQuick?.card4 || {
    region: '서울시 핵심권역',
    use: '근린생활시설',
    priceBand: '가격 협의',
    points: ['우수 입지', '추천 매물', '안정 수익'],
    provenance: { points: ['broker', 'broker', 'broker'] },
    card4_version: 1,
  };
  const baseCard4: Card4Data = updateData.card4
    ? {
        ...fallbackCard4,
        ...wsCard4,
        ...updateData.card4,
        region: updateData.card4.region ?? wsCard4?.region ?? fallbackCard4.region,
        use: updateData.card4.use ?? wsCard4?.use ?? fallbackCard4.use,
        priceBand: updateData.card4.priceBand ?? wsCard4?.priceBand ?? fallbackCard4.priceBand,
        points: updateData.card4.points ?? wsCard4?.points ?? fallbackCard4.points,
        provenance: updateData.card4.provenance || wsCard4?.provenance || fallbackCard4.provenance,
        card4_version: wsCard4?.card4_version || fallbackCard4.card4_version || 1,
      }
    : {
        ...fallbackCard4,
        ...wsCard4,
        region: updateData.ssotUpdate?.area_signal ?? wsCard4?.region ?? fallbackCard4.region,
        use: updateData.ssotUpdate?.asset_type ?? wsCard4?.use ?? fallbackCard4.use,
        priceBand: updateData.ssotUpdate?.price_band ?? wsCard4?.priceBand ?? fallbackCard4.priceBand,
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
        provenance: wsCard4?.provenance || fallbackCard4.provenance,
        card4_version: wsCard4?.card4_version || fallbackCard4.card4_version || 1,
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

  // WP-7.6 P1-3: only treat PATCH as publishing/updating published_snapshot when status is
  // explicitly 'sent' or 'published'. Omitting status (or 'draft') on an already-sent card
  // saves into draft_payload (hasUnpublishedEdits: true) while preserving published_snapshot.
  const isPublishing = updateData.status === 'published' || updateData.status === 'sent';
  const alreadyPublished = wsItem?.status === 'published' || wsItem?.status === 'sent';
  const preservePublishedState = Boolean(alreadyPublished && !isPublishing);
  const targetStatus = isPublishing
    ? updateData.status === 'published'
      ? 'published'
      : 'sent'
    : preservePublishedState && wsItem
    ? wsItem.status
    : updateData.status ?? wsItem?.status ?? 'draft';
  let gateStatutory: {
    company?: string;
    officeAddress?: string;
    phone?: string;
    officeRegNumber?: string;
    representativeName?: string;
  } | null = null;

  if (isPublishing) {
    // WP-7.3C P1-5/P2: same content gate as summary mark_sent, applied to the exact
    // card4 that becomes the published snapshot (blocks placeholder fallback copy).
    const contentGate = evaluateDealCardPublishContent(nextCard4);
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
    const gate = await assertPublishable({
      supabase: serviceClient,
      userId,
      kind: 'dealcard',
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
    gateStatutory = gate.statutory;
  }

  const verifiedBrokerProfile = isPublishing
    ? await fetchVerifiedBrokerSnapshotProfile(serviceClient, userId, gateStatutory)
    : null;

  if (serviceClient) {
    try {
      const nextDraftPayload: Record<string, unknown> = { ...(wsItem?.draftPayload || {}) };
      if (!preservePublishedState && 'hasUnpublishedEdits' in nextDraftPayload) {
        delete nextDraftPayload.hasUnpublishedEdits;
      }
      nextDraftPayload.card4 = nextCard4;
      if (preservePublishedState) {
        nextDraftPayload.hasUnpublishedEdits = true;
      }
      await upsertWorkspaceItem(serviceClient, {
        id: wsItem?.id ?? (isStandaloneUuid ? id : undefined),
        legacyId: wsItem?.legacyId ?? (isStandaloneUuid ? null : id),
        buildingId: wsItem?.buildingId ?? null,
        ownerId: wsItem?.ownerId ?? userId,
        isAdmin: role === 'admin',
        kind: 'dealcard',
        status: targetStatus,
        title: nextCard4.headline || `${nextCard4.region} ${nextCard4.use}`,
        address: nextCard4.region,
        priceBand: nextCard4.priceBand,
        draftPayload: nextDraftPayload,
        ...(isPublishing
          ? {
              publishedSnapshot: buildSanitizedDealCardPublicSnapshot({
                ...(wsItem?.publishedSnapshot || {}),
                card4: nextCard4,
                ...(verifiedBrokerProfile ? { brokerProfile: verifiedBrokerProfile } : {}),
              }),
            }
          : preservePublishedState && wsItem
          ? { publishedSnapshot: wsItem.publishedSnapshot }
          : {}),
        docHash: nextHash,
        version: nextVersion,
        ...(isStandaloneUuid &&
        typeof updateData.expectedVersion === 'number' &&
        (wsCard4?.card4_version === undefined || wsItem?.version === wsCard4.card4_version)
          ? { expectedVersion: updateData.expectedVersion }
          : {}),
      });
    } catch (err) {
      if (err instanceof WorkspaceRepositoryError) {
        return NextResponse.json(
          {
            ok: false,
            error: err.message,
            code: err.code,
            ...(err.status === 409 ? { conflict: true, currentVersion: wsItem?.version } : {}),
          },
          { status: err.status }
        );
      }
      throw err;
    }
  }

  const memKey = wsItem?.id || id;
  if (!preservePublishedState) {
    updateQuickImCard4(memKey, nextCard4, { ownerId: wsItem?.ownerId ?? userId });
  }

  if (serviceClient && typeof serviceClient.from === 'function') {
    try {
      await serviceClient.from('activity_events').insert({
        actor_id: userId,
        event_type: 'dealcard_upserted',
        entity_type: 'building',
        entity_id: isStandaloneUuid ? memKey : userId,
        metadata: {
          building_id: memKey,
          status: isPublishing ? targetStatus : 'draft',
          ...(preservePublishedState ? { has_unpublished_edits: true } : {}),
          card4: nextCard4,
        },
      });
    } catch {
      // Non-blocking
    }
  }

  if (isPublishing || !preservePublishedState) {
    try {
      revalidatePath(`/dc/${memKey}`);
      if (id !== memKey) revalidatePath(`/dc/${id}`);
    } catch {
      // Ignore
    }
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

function validateDealCardPatchInput(
  updateData: z.infer<typeof UpdateSchema>,
  opts: { enforceSsotPriceBand: boolean }
): NextResponse | null {
  // Server-side blind-guard check across all incoming text fields
  const textsToValidate: string[] = [];
  if (updateData.title) textsToValidate.push(updateData.title);
  if (updateData.shortSummary) textsToValidate.push(updateData.shortSummary);
  if (Array.isArray(updateData.dealPoints)) textsToValidate.push(...updateData.dealPoints);
  if (Array.isArray(updateData.cautionPoints)) textsToValidate.push(...updateData.cautionPoints);
  if (updateData.kakaoText) textsToValidate.push(updateData.kakaoText);
  if (updateData.ogTitle) textsToValidate.push(updateData.ogTitle);
  if (updateData.ogDescription) textsToValidate.push(updateData.ogDescription);
  if (updateData.hookCopy) textsToValidate.push(updateData.hookCopy);
  if (Array.isArray(updateData.structureChips)) textsToValidate.push(...updateData.structureChips);
  if (updateData.vacancyLabel) textsToValidate.push(updateData.vacancyLabel);
  if (updateData.curiosityHook) textsToValidate.push(updateData.curiosityHook);
  if (updateData.ssotUpdate?.area_signal) textsToValidate.push(updateData.ssotUpdate.area_signal);
  if (updateData.ssotUpdate?.asset_type) textsToValidate.push(updateData.ssotUpdate.asset_type);
  if (updateData.ssotUpdate?.current_use_signal) textsToValidate.push(updateData.ssotUpdate.current_use_signal);
  if (updateData.card4) {
    textsToValidate.push(
      updateData.card4.region || '',
      updateData.card4.use || '',
      updateData.card4.priceBand || '',
      updateData.card4.headline || '',
      updateData.card4.area || '',
      ...updateData.card4.points,
      // WP-7.3C P1-5: pointBriefs flow into the published snapshot too.
      ...(updateData.card4.pointBriefs ?? [])
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

  const incomingPriceBand =
    updateData.card4?.priceBand ??
    (opts.enforceSsotPriceBand ? updateData.ssotUpdate?.price_band : undefined);
  if (incomingPriceBand && incomingPriceBand.trim().length > 0) {
    const bandCheck = validateBlindPriceBand(incomingPriceBand);
    if (!bandCheck.valid) {
      return NextResponse.json(
        {
          ok: false,
          code: 'BLIND_PRICE_BAND_INVALID',
          error: bandCheck.reason || '블라인드 가격 구간 형식을 확인해 주세요.',
        },
        { status: 422 }
      );
    }
  }

  return null;
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

    let serviceClient: ReturnType<typeof createServiceClient> | null = null;
    try {
      serviceClient = createServiceClient();
    } catch {
      serviceClient = null;
    }

    // Handle non-UUID Deal Card IDs via canonical workspace_items + QuickImStore
    if (!isUuid(id)) {
      if (PROD_SEED_BLOCK_IDS.has(id) && isRealProductionRuntime()) {
        return NextResponse.json({ ok: false, error: '딜카드를 찾을 수 없습니다.' }, { status: 404 });
      }

      let wsItem: Awaited<ReturnType<typeof getWorkspaceItemByAnyId>> = null;
      if (serviceClient) {
        try {
          wsItem = await getWorkspaceItemByAnyId(serviceClient, id, 'dealcard');
          if (wsItem) {
            if (wsItem.status === 'archived' || Boolean(wsItem.deletedAt)) {
              return NextResponse.json({ ok: false, error: '딜카드를 찾을 수 없습니다.' }, { status: 404 });
            }
            if (wsItem.ownerId !== guard.user!.id && guard.role !== 'admin') {
              return NextResponse.json(
                { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
                { status: 403 }
              );
            }
          } else {
            const ownCheck = await assertLegacyOrDbOwnership(serviceClient, {
              id,
              userId: guard.user!.id,
              isAdmin: guard.role === 'admin',
              kind: 'dealcard',
            });
            if (isRealProductionRuntime() && !ownCheck.ownerId) {
              return NextResponse.json({ ok: false, error: '딜카드를 찾을 수 없습니다.' }, { status: 404 });
            }
          }
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, error: err.message, code: err.code },
              { status: err.status }
            );
          }
          throw err;
        }
      }

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

      const nonUuidValidationErr = validateDealCardPatchInput(updateData, {
        enforceSsotPriceBand:
          updateData.status === 'published' ||
          updateData.status === 'sent' ||
          wsItem?.status === 'published' ||
          wsItem?.status === 'sent',
      });
      if (nonUuidValidationErr) return nonUuidValidationErr;

      return persistStandaloneWorkspaceCard4({
        serviceClient,
        id,
        userId: guard.user!.id,
        role: guard.role,
        updateData,
        wsItem,
        existingQuick,
        isStandaloneUuid: false,
      });
    }

    if (!serviceClient) {
      return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });
    }

    const access = await resolveUuidDealCardAccess(
      serviceClient,
      id,
      guard.user!.id,
      guard.role
    );
    if (!access.ok) return access.response;

    if (access.mode === 'standalone_workspace') {
      const standaloneValidationErr = validateDealCardPatchInput(updateData, {
        enforceSsotPriceBand:
          updateData.status === 'published' ||
          updateData.status === 'sent' ||
          access.wsItem.status === 'published' ||
          access.wsItem.status === 'sent',
      });
      if (standaloneValidationErr) return standaloneValidationErr;

      return persistStandaloneWorkspaceCard4({
        serviceClient,
        id: access.wsItem.id,
        userId: guard.user!.id,
        role: guard.role,
        updateData,
        wsItem: access.wsItem,
        existingQuick: null,
        isStandaloneUuid: true,
      });
    }

    const { targetBuildingId } = access;

    let existingWsItem: Awaited<ReturnType<typeof getWorkspaceItemByAnyId>> = null;
    try {
      existingWsItem = await getWorkspaceItemByAnyId(serviceClient, targetBuildingId, 'dealcard');
    } catch (err) {
      // WP-7.3C: an unknown status must not silently skip the publish gates for a
      // sent card — only the pre-cutover missing-table condition falls back.
      if (!isMissingRelationOrColumnError(err)) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, error: err.message, code: err.code },
            { status: err.status }
          );
        }
        return NextResponse.json(
          { ok: false, error: '작업 항목 조회에 실패했습니다.', code: 'DB_READ_FAILED' },
          { status: 500 }
        );
      }
      existingWsItem = null;
    }
    // WP-7.6 P1-3: only treat PATCH as publishing/updating published_snapshot when
    // updateData.status is explicitly 'sent' or 'published'. Non-publish PATCHes on an
    // already-sent/published workspace item keep status + publishedSnapshot untouched,
    // update draft_payload (hasUnpublishedEdits: true), and skip overwriting live
    // blind_teaser / building_signal_cards / building_ssot_lite rows.
    const isPublishingUuid =
      updateData.status === 'published' ||
      updateData.status === 'sent';
    const alreadyPublishedUuid =
      existingWsItem?.status === 'published' ||
      existingWsItem?.status === 'sent';
    const uuidValidationErr = validateDealCardPatchInput(updateData, {
      enforceSsotPriceBand:
        isPublishingUuid ||
        alreadyPublishedUuid ||
        access.buildingRow?.status === 'public_signal_ready',
    });
    if (uuidValidationErr) return uuidValidationErr;
    const preservePublishedUuid = Boolean(alreadyPublishedUuid && !isPublishingUuid);
    const targetStatus = isPublishingUuid
      ? updateData.status === 'published'
        ? 'published'
        : 'sent'
      : preservePublishedUuid && existingWsItem
      ? existingWsItem.status
      : updateData.status ?? existingWsItem?.status ?? 'draft';

    let uuidGateStatutory: {
      company?: string;
      officeAddress?: string;
      phone?: string;
      officeRegNumber?: string;
      representativeName?: string;
    } | null = null;

    if (isPublishingUuid) {
      const candidateBand =
        updateData.card4?.priceBand ?? updateData.ssotUpdate?.price_band ?? existingWsItem?.priceBand;
      if (candidateBand && String(candidateBand).trim().length > 0) {
        const bandCheck = validateBlindPriceBand(String(candidateBand));
        if (!bandCheck.valid) {
          return NextResponse.json(
            {
              ok: false,
              code: 'BLIND_PRICE_BAND_INVALID',
              error: bandCheck.reason || '블라인드 가격 구간 형식을 확인해 주세요.',
            },
            { status: 422 }
          );
        }
      }
      // WP-7.3C P1-5: the card4 path publishes updateData.card4 (+ pointBriefs) —
      // gate it before any write. The legacy-field path is gated below once the
      // synced card4 is known (before the document/workspace writes).
      if (updateData.card4) {
        const contentGate = evaluateDealCardPublishContent(updateData.card4);
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
      }
      const gate = await assertPublishable({
        supabase: serviceClient,
        userId: guard.user!.id,
        kind: 'dealcard',
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
      uuidGateStatutory = gate.statutory;
    }

    const verifiedUuidBrokerProfile = isPublishingUuid
      ? await fetchVerifiedBrokerSnapshotProfile(serviceClient, guard.user!.id, uuidGateStatutory)
      : null;

    // Handle Card4 atomic update with optimistic locking (WP-P1-03)
    if (updateData.card4) {
      let mergedCard4: Card4Data | undefined;
      let nextVersionOut: number | undefined;
      let nextHashOut: string | undefined;

      if (preservePublishedUuid && existingWsItem) {
        const prevDraftCard4 = (
          (existingWsItem.draftPayload as Record<string, unknown> | undefined)?.card4 ||
          (existingWsItem.publishedSnapshot as Record<string, unknown> | null | undefined)?.card4 ||
          {}
        ) as Partial<Card4Data>;
        const currentVer = prevDraftCard4.card4_version ?? existingWsItem.version;
        if (
          typeof updateData.expectedVersion === 'number' &&
          typeof currentVer === 'number' &&
          updateData.expectedVersion !== currentVer
        ) {
          return NextResponse.json(
            {
              error: `409 Version Conflict: expected ${updateData.expectedVersion}, current ${currentVer}`,
              conflict: true,
              currentVersion: currentVer,
            },
            { status: 409 }
          );
        }
        const normalizedDraft = normalizeDealCardCopy(
          {
            ...prevDraftCard4,
            ...updateData.card4,
            provenance:
              updateData.card4.provenance ||
              prevDraftCard4.provenance || { points: ['broker', 'broker', 'broker'] },
          },
          { fillHeadline: true }
        );
        nextVersionOut = (currentVer || 1) + 1;
        nextHashOut = computeCard4Hash(normalizedDraft);
        mergedCard4 = {
          ...normalizedDraft,
          ...(updateData.card4.pointTones ? { pointTones: updateData.card4.pointTones } : {}),
          ...(updateData.card4.pointBriefs ? { pointBriefs: updateData.card4.pointBriefs } : {}),
          card4_version: nextVersionOut,
          card4_hash: nextHashOut,
        };
      } else {
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

        nextVersionOut = card4Result.version;
        nextHashOut = card4Result.hash;
        mergedCard4 = card4Result.card4
          ? {
              ...card4Result.card4,
              ...(updateData.card4.pointTones ? { pointTones: updateData.card4.pointTones } : {}),
              ...(updateData.card4.pointBriefs ? { pointBriefs: updateData.card4.pointBriefs } : {}),
            }
          : undefined;
      }

      if (mergedCard4) {
        if (isPublishingUuid) {
          const pubIso = new Date().toISOString();
          await Promise.allSettled([
            serviceClient
              .from('document_objects')
              .update({
                status: 'published',
                visibility: 'public_blind',
                updated_at: pubIso,
              })
              .eq('building_id', targetBuildingId)
              .eq('document_type', 'blind_teaser'),
            serviceClient
              .from('building_signal_cards')
              .update({
                status: 'shared_external',
                visibility: 'public_blind',
                updated_at: pubIso,
              })
              .eq('building_id', targetBuildingId),
          ]);
        }
        try {
          const nextDraftPayload: Record<string, unknown> = {
            ...(existingWsItem?.draftPayload || {}),
          };
          if (!preservePublishedUuid && 'hasUnpublishedEdits' in nextDraftPayload) {
            delete nextDraftPayload.hasUnpublishedEdits;
          }
          nextDraftPayload.card4 = mergedCard4;
          if (preservePublishedUuid) {
            nextDraftPayload.hasUnpublishedEdits = true;
          }
          await upsertWorkspaceItem(serviceClient, {
            id: existingWsItem?.id,
            legacyId: existingWsItem?.legacyId ?? null,
            buildingId: targetBuildingId,
            ownerId: guard.user!.id,
            isAdmin: guard.role === 'admin',
            kind: 'dealcard',
            status: targetStatus,
            title: mergedCard4.headline || `${mergedCard4.region} ${mergedCard4.use}`,
            address: mergedCard4.region,
            priceBand: mergedCard4.priceBand,
            draftPayload: nextDraftPayload,
            ...(isPublishingUuid
              ? {
                  publishedSnapshot: buildSanitizedDealCardPublicSnapshot({
                    ...(existingWsItem?.publishedSnapshot || {}),
                    card4: mergedCard4,
                    ...(verifiedUuidBrokerProfile ? { brokerProfile: verifiedUuidBrokerProfile } : {}),
                  }),
                }
              : preservePublishedUuid && existingWsItem
              ? { publishedSnapshot: existingWsItem.publishedSnapshot }
              : {}),
            docHash: nextHashOut,
            version: nextVersionOut,
          });
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, error: err.message, code: err.code },
              { status: err.status }
            );
          }
          // Non-blocking if pre-cutover mock DB lacks workspace_items chain
        }
        if (!preservePublishedUuid) {
          updateQuickImCard4(targetBuildingId, mergedCard4, { ownerId: guard.user!.id });
        }
        try {
          await serviceClient.from('activity_events').insert({
            actor_id: guard.user!.id,
            event_type: 'dealcard_upserted',
            entity_type: 'building',
            entity_id: targetBuildingId,
            metadata: {
              building_id: targetBuildingId,
              status: isPublishingUuid ? targetStatus : 'draft',
              ...(preservePublishedUuid ? { has_unpublished_edits: true } : {}),
              card4: mergedCard4,
            },
          });
        } catch {
          // Non-blocking
        }
      }

      if (isPublishingUuid || !preservePublishedUuid) {
        try {
          revalidatePath(`/dc/${targetBuildingId}`);
        } catch {
          // Ignore
        }
      }

      return NextResponse.json({
        ok: true,
        success: true,
        body: { card4: mergedCard4 },
        card4: mergedCard4,
        version: nextVersionOut,
        hash: nextHashOut,
      });
    }

    // Fetch existing document to merge updates
    const { data: teaserDoc, error: fetchError } = await serviceClient
      .from("document_objects")
      .select("id, body, status")
      .eq("building_id", targetBuildingId)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const existingDraftBody = (
      existingWsItem?.draftPayload &&
      typeof (existingWsItem.draftPayload as Record<string, unknown>).teaserBody === 'object' &&
      (existingWsItem.draftPayload as Record<string, unknown>).teaserBody !== null
        ? ((existingWsItem.draftPayload as Record<string, unknown>).teaserBody as Record<string, unknown>)
        : null
    );
    const currentBody = preservePublishedUuid && existingDraftBody
      ? existingDraftBody
      : teaserDoc?.body
      ? (teaserDoc.body as Record<string, unknown>)
      : {};
    const updatedBody: Record<string, unknown> = { ...currentBody };

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
    const existingWsDraftCard4 = (
      existingWsItem?.draftPayload &&
      typeof (existingWsItem.draftPayload as Record<string, unknown>).card4 === 'object'
        ? ((existingWsItem.draftPayload as Record<string, unknown>).card4 as Partial<Card4Data>)
        : undefined
    );
    const prevCard4 = (
      (preservePublishedUuid && existingWsDraftCard4) ||
      currentBody.card4 ||
      {}
    ) as Partial<Card4Data>;
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

    // WP-7.3C P2: when explicitly publishing, the synced card4 becomes the
    // public snapshot — never let placeholder fallback copy / blind violations through.
    if (isPublishingUuid) {
      const contentGate = evaluateDealCardPublishContent(syncedCard4Candidate);
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
    }

    const isLegacyTeaserAlreadyPublished =
      Boolean(existingWsItem) &&
      Boolean(teaserDoc?.status) &&
      ['published', 'broker_reviewed', 'shared_external'].includes(String(teaserDoc?.status || ''));
    const skipLiveArtifactOverwrite =
      preservePublishedUuid || (!isPublishingUuid && isLegacyTeaserAlreadyPublished);

    if (!skipLiveArtifactOverwrite) {
      // Update document_objects (body + markdown for kakaoText)
      const docUpdate: Record<string, unknown> = {
        body: updatedBody,
        updated_at: new Date().toISOString(),
      };
      if (updateData.kakaoText !== undefined) docUpdate.markdown = updateData.kakaoText;
      if (updateData.title !== undefined) docUpdate.title = updateData.title;

      if (teaserDoc) {
        if (isPublishingUuid) {
          docUpdate.status = 'published';
          docUpdate.visibility = 'public_blind';
        }
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
            title:
              typeof updatedBody.title === "string" && updatedBody.title
                ? updatedBody.title
                : "블라인드 티저",
            body: updatedBody,
            markdown: updateData.kakaoText || "",
            visibility: "public_blind",
            status: isPublishingUuid ? "published" : "draft",
          });
        if (insertError) throw insertError;
      }

      // Sync building_signal_cards
      const signalCardUpdate: Record<string, unknown> = {};
      if (updateData.title !== undefined) signalCardUpdate.title = updateData.title;
      if (updateData.dealPoints !== undefined) signalCardUpdate.deal_points = updateData.dealPoints;
      if (updateData.curiosityScore !== undefined) signalCardUpdate.deal_curiosity_score = updateData.curiosityScore;
      if (updateData.hookCopy !== undefined) signalCardUpdate.hook_copy = updateData.hookCopy;
      if (isPublishingUuid) {
        signalCardUpdate.status = 'shared_external';
        signalCardUpdate.visibility = 'public_blind';
      }

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
    }

    try {
      const nextDraftPayload: Record<string, unknown> = {
        ...(existingWsItem?.draftPayload || {}),
      };
      if (!preservePublishedUuid && 'hasUnpublishedEdits' in nextDraftPayload) {
        delete nextDraftPayload.hasUnpublishedEdits;
      }
      nextDraftPayload.card4 = syncedCard4Candidate;
      if (preservePublishedUuid) {
        nextDraftPayload.teaserBody = updatedBody;
        nextDraftPayload.hasUnpublishedEdits = true;
      } else if ('teaserBody' in nextDraftPayload) {
        delete nextDraftPayload.teaserBody;
      }
      await upsertWorkspaceItem(serviceClient, {
        id: existingWsItem?.id,
        legacyId: existingWsItem?.legacyId ?? null,
        buildingId: targetBuildingId,
        ownerId: guard.user!.id,
        isAdmin: guard.role === 'admin',
        kind: 'dealcard',
        status: targetStatus,
        title: syncedCard4Candidate.headline || `${syncedCard4Candidate.region} ${syncedCard4Candidate.use}`,
        address: syncedCard4Candidate.region,
        priceBand: syncedCard4Candidate.priceBand,
        draftPayload: nextDraftPayload,
        ...(isPublishingUuid
          ? {
              publishedSnapshot: buildSanitizedDealCardPublicSnapshot({
                ...(existingWsItem?.publishedSnapshot || {}),
                card4: syncedCard4Candidate,
                ...(verifiedUuidBrokerProfile ? { brokerProfile: verifiedUuidBrokerProfile } : {}),
              }),
            }
          : preservePublishedUuid && existingWsItem
          ? { publishedSnapshot: existingWsItem.publishedSnapshot }
          : {}),
        docHash: syncedCard4Candidate.card4_hash,
        version: syncedCard4Candidate.card4_version,
      });
    } catch (err) {
      if (err instanceof WorkspaceRepositoryError) {
        return NextResponse.json(
          { ok: false, error: err.message, code: err.code },
          { status: err.status }
        );
      }
      // Non-blocking if pre-cutover mock DB lacks workspace_items chain
    }

    if (!preservePublishedUuid) {
      updateQuickImCard4(targetBuildingId, syncedCard4Candidate, { ownerId: guard.user!.id });
    }
    try {
      await serviceClient.from("activity_events").insert({
        actor_id: guard.user!.id,
        event_type: "dealcard_upserted",
        entity_type: "building",
        entity_id: targetBuildingId,
        metadata: {
          building_id: targetBuildingId,
          status: isPublishingUuid ? targetStatus : "draft",
          ...(preservePublishedUuid ? { has_unpublished_edits: true } : {}),
          card4: syncedCard4Candidate,
        },
      });
    } catch {
      // Non-blocking
    }

    if (isPublishingUuid || !preservePublishedUuid) {
      try {
        revalidatePath(`/dc/${targetBuildingId}`);
      } catch {
        // Ignore
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      body: updatedBody,
      card4: syncedCard4Candidate,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
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
      if (service) {
        try {
          await softDeleteWorkspaceItem(service, {
            id,
            userId: user.id,
            isAdmin: guard.role === "admin",
            kind: "dealcard",
          });
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          throw err;
        }
      }
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

    const access = await resolveUuidDealCardAccess(service, id, user.id, guard.role);
    if (!access.ok) return access.response;

    if (access.mode === "standalone_workspace") {
      try {
        await softDeleteWorkspaceItem(service, {
          id: access.wsItem.id,
          userId: user.id,
          isAdmin: guard.role === "admin",
          kind: "dealcard",
          requireExisting: true,
        });
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }

      markDealCardDeleted(access.wsItem.id);
      deleteQuickImRecord(access.wsItem.id);
      if (id !== access.wsItem.id) {
        markDealCardDeleted(id);
        deleteQuickImRecord(id);
      }
      try {
        await service.from("activity_events").insert({
          actor_id: user.id,
          event_type: "dealcard_deleted",
          entity_type: "building",
          entity_id: access.wsItem.id,
          metadata: { building_id: access.wsItem.id },
        });
      } catch {
        // Non-blocking
      }
      try {
        revalidatePath(`/dc/${access.wsItem.id}`);
        if (id !== access.wsItem.id) revalidatePath(`/dc/${id}`);
      } catch {
        // Ignore
      }
      return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
    }

    const { targetBuildingId } = access;

    try {
      await softDeleteWorkspaceItem(service, {
        id: targetBuildingId,
        userId: user.id,
        isAdmin: guard.role === "admin",
        kind: "dealcard",
      });
    } catch (err) {
      // WP-7.3C P2: only the pre-cutover missing-table condition is tolerated; any
      // other failure would leave a published workspace row (public /dc) alive.
      if (!isMissingRelationOrColumnError(err)) {
        log.error("[deal-card DELETE] workspace_items soft delete failed:", err);
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
        }
        return NextResponse.json({ error: "삭제 처리 중 오류가 발생했습니다." }, { status: 500 });
      }
    }

    // 연관 데이터 선삭제 (shared helper — circle_shared_assets keyed on asset_type/asset_id)
    const dependentFailures = await deleteDealCardDependents(service, targetBuildingId);
    if (dependentFailures.length > 0) {
      log.error("[deal-card DELETE] dependent cleanup failures:", dependentFailures);
    }

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
        log.error('[deal-card] Delete failed:', softDeleteErr);
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

