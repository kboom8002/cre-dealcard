import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { isRealProductionRuntime } from "@/lib/env";
import { getQuickImRecord, isUuid } from "@/lib/im-lite/quick-generate-store";
import {
  buildSanitizedDealCardPublicSnapshot,
  DEMO_SEED_LEGACY_IDS,
  getWorkspaceItemByAnyId,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from "@/lib/workspace/workspace-repository";
import { z } from "zod";

type PersonasAccessResult =
  | { ok: true; mode: "building"; wsItem: null; ownerId: string }
  | { ok: true; mode: "standalone_workspace"; wsItem: WorkspaceItemRecord; ownerId: string }
  | { ok: true; mode: "legacy_non_uuid"; wsItem: null; ownerId: string }
  | { ok: false; response: NextResponse };

async function authorizePersonasAccess(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  role: string | null | undefined
): Promise<PersonasAccessResult> {
  if (!id) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Missing ID" }, { status: 400 }),
    };
  }

  const rawId = id.trim();
  if (!isUuid(rawId)) {
    const quickRec = getQuickImRecord(rawId);
    if (quickRec?.ownerId && quickRec.ownerId !== userId && role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
          { status: 403 }
        ),
      };
    }

    if (supabase && typeof supabase.from === "function") {
      try {
        const scopedOwnerId = role === "admin" ? undefined : userId;
        const wsItem = await getWorkspaceItemByAnyId(supabase, id, "dealcard", scopedOwnerId);
        if (wsItem) {
          if (wsItem.status === "archived" || Boolean(wsItem.deletedAt)) {
            return {
              ok: false,
              response: NextResponse.json(
                { ok: false, error: "딜카드를 찾을 수 없습니다.", code: "NOT_FOUND" },
                { status: 404 }
              ),
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
            wsItem,
            ownerId: wsItem.ownerId,
          };
        }
        if (role !== "admin" && !DEMO_SEED_LEGACY_IDS.has(id.trim())) {
          const crossOwnerItem = await getWorkspaceItemByAnyId(supabase, id, "dealcard");
          if (crossOwnerItem && !crossOwnerItem.deletedAt && crossOwnerItem.ownerId !== userId) {
            return {
              ok: false,
              response: NextResponse.json(
                { ok: false, error: "이 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
                { status: 403 }
              ),
            };
          }
        }
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          if (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === "1") {
            return {
              ok: false,
              response: NextResponse.json(
                { ok: false, error: err.message, code: err.code },
                { status: err.status }
              ),
            };
          }
        }
      }
    }

    return { ok: true, mode: "legacy_non_uuid", wsItem: null, ownerId: userId };
  }

  const ownership = await assertBuildingOwner(supabase, id, userId, {
    allowAdmin: true,
    role,
  });
  if (ownership.ok) {
    return {
      ok: true,
      mode: "building",
      wsItem: null,
      ownerId: ownership.ownerId ?? userId,
    };
  }
  if (ownership.status !== 404) {
    return { ok: false, response: ownership.response };
  }

  try {
    const scopedOwnerId = role === "admin" ? undefined : userId;
    const wsItem =
      (await getWorkspaceItemByAnyId(supabase, id, "dealcard", scopedOwnerId)) ??
      (role !== "admin" ? await getWorkspaceItemByAnyId(supabase, id, "dealcard") : null);
    if (!wsItem) {
      return { ok: false, response: ownership.response };
    }
    if (wsItem.status === "archived" || Boolean(wsItem.deletedAt)) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "딜카드를 찾을 수 없습니다.", code: "NOT_FOUND" },
          { status: 404 }
        ),
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
      wsItem,
      ownerId: wsItem.ownerId,
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
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "권한 확인에 실패했습니다." }, { status: 500 }),
    };
  }
}

/**
 * GET /api/broker/deal-card/[id]/personas
 * DB에서 저장된 페르소나 데이터를 로드합니다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();
    const access = await authorizePersonasAccess(supabase, id, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    if (access.mode === "legacy_non_uuid") {
      return NextResponse.json({ ok: true, success: true, data: [] });
    }

    if (access.mode === "standalone_workspace") {
      const storedPersonas = (access.wsItem.draftPayload as Record<string, any> | undefined)?.personas ?? [];
      return NextResponse.json({
        ok: true,
        success: true,
        data: storedPersonas,
        updatedAt: access.wsItem.updatedAt,
      });
    }

    const { data, error } = await supabase
      .from("deal_card_personas")
      .select("personas_data, updated_at")
      .eq("building_ssot_lite_id", id)
      .eq("broker_id", access.ownerId)
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return NextResponse.json({ ok: true, success: true, data: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: true, success: true, data: [] });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      data: data.personas_data,
      updatedAt: data.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST / PATCH /api/broker/deal-card/[id]/personas
 * 페르소나 데이터를 DB에 upsert합니다.
 */
const postSchema = z.object({
  personasData: z.object({
    personas: z.array(z.any()).optional()
  }).optional(),
  personas: z.array(z.any()).optional(),
  name: z.string().optional(),
  type: z.string().optional()
});

async function handleUpsertPersonas(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();
    const access = await authorizePersonasAccess(supabase, id, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    let body;
    try {
      const raw = await req.json();
      body = postSchema.parse(raw);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: 'Validation failed', details: e.issues }, { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    let personasData = body.personasData;
    if (!personasData) {
      if (body.personas) {
        personasData = body;
      } else if (body.name || body.type) {
        personasData = { personas: [{ id: 'persona-1', name: body.name, type: body.type }] };
      }
    }

    if (!personasData || !Array.isArray(personasData.personas) || personasData.personas.length === 0) {
      return NextResponse.json(
        { error: "personasData with non-empty personas array is required" },
        { status: 400 }
      );
    }

    let savedId = 'persona-1';
    let updatedAt = new Date().toISOString();

    if (access.mode === "standalone_workspace") {
      try {
        const saved = await upsertWorkspaceItem(supabase, {
          id: access.wsItem.id,
          legacyId: access.wsItem.legacyId,
          buildingId: access.wsItem.buildingId,
          ownerId: access.wsItem.ownerId,
          isAdmin: guard.role === "admin",
          kind: "dealcard",
          status: access.wsItem.status,
          title: access.wsItem.title,
          address: access.wsItem.address,
          priceBand: access.wsItem.priceBand,
          draftPayload: {
            ...(access.wsItem.draftPayload || {}),
            personas: personasData,
          },
          publishedSnapshot: access.wsItem.publishedSnapshot
            ? buildSanitizedDealCardPublicSnapshot(access.wsItem.publishedSnapshot)
            : null,
          version: access.wsItem.version,
          docHash: access.wsItem.docHash,
        });
        if (!saved.item) {
          return NextResponse.json({ ok: false, error: "페르소나 저장에 실패했습니다." }, { status: 500 });
        }
        savedId = saved.item.id;
        updatedAt = saved.item.updatedAt;
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
        }
        return NextResponse.json({ ok: false, error: "페르소나 저장 중 오류가 발생했습니다." }, { status: 500 });
      }
    } else if (access.mode === "building") {
      const { data, error } = await supabase
        .from("deal_card_personas")
        .upsert(
          {
            building_ssot_lite_id: id,
            broker_id: access.ownerId,
            personas_data: personasData,
          },
          { onConflict: "building_ssot_lite_id,broker_id" }
        )
        .select("id, updated_at")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { ok: false, error: error?.message || "페르소나 저장에 실패했습니다." },
          { status: 500 }
        );
      }
      savedId = data.id;
      updatedAt = data.updated_at;
    }

    return NextResponse.json({ ok: true, success: true, id: savedId, updatedAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpsertPersonas(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpsertPersonas(req, context);
}

/**
 * DELETE /api/broker/deal-card/[id]/personas
 * 저장된 페르소나 데이터를 삭제합니다.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();
    const access = await authorizePersonasAccess(supabase, id, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    if (access.mode === "legacy_non_uuid") {
      return NextResponse.json({ ok: true, success: true });
    }

    if (access.mode === "standalone_workspace") {
      const nextDraft = { ...(access.wsItem.draftPayload || {}) };
      delete nextDraft.personas;
      await upsertWorkspaceItem(supabase, {
        id: access.wsItem.id,
        legacyId: access.wsItem.legacyId,
        buildingId: access.wsItem.buildingId,
        ownerId: access.wsItem.ownerId,
        isAdmin: guard.role === "admin",
        kind: "dealcard",
        status: access.wsItem.status,
        title: access.wsItem.title,
        address: access.wsItem.address,
        priceBand: access.wsItem.priceBand,
        draftPayload: nextDraft,
        publishedSnapshot: access.wsItem.publishedSnapshot
          ? buildSanitizedDealCardPublicSnapshot(access.wsItem.publishedSnapshot)
          : null,
        version: access.wsItem.version,
        docHash: access.wsItem.docHash,
      });
      return NextResponse.json({ ok: true, success: true });
    }

    const { error } = await supabase
      .from("deal_card_personas")
      .delete()
      .eq("building_ssot_lite_id", id)
      .eq("broker_id", access.ownerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
