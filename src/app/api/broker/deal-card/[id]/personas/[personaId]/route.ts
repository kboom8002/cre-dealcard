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

type PersonaDeleteAccess =
  | { ok: true; mode: "building"; ownerId: string | null }
  | { ok: true; mode: "standalone_workspace"; wsItem: WorkspaceItemRecord }
  | { ok: true; mode: "legacy_non_uuid" }
  | { ok: false; response: NextResponse };

async function authorizePersonaDeleteAccess(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  role: string | null | undefined
): Promise<PersonaDeleteAccess> {
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
          return { ok: true, mode: "standalone_workspace", wsItem };
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
        if (
          err instanceof WorkspaceRepositoryError &&
          (isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === "1")
        ) {
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

    return { ok: true, mode: "legacy_non_uuid" };
  }

  const ownership = await assertBuildingOwner(supabase, id, userId, {
    allowAdmin: true,
    role,
  });
  if (ownership.ok) {
    return {
      ok: true,
      mode: "building",
      ownerId: ownership.ownerId ?? (role === "admin" ? null : userId),
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
    return { ok: true, mode: "standalone_workspace", wsItem };
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
 * DELETE /api/broker/deal-card/[id]/personas/[personaId]
 * 특정 페르소나 또는 딜카드의 페르소나를 삭제합니다.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; personaId: string }> }
) {
  try {
    const { id, personaId } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();
    const access = await authorizePersonaDeleteAccess(supabase, id, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    if (access.mode === "legacy_non_uuid") {
      return NextResponse.json({ ok: true, success: true, deletedId: personaId });
    }

    if (access.mode === "standalone_workspace") {
      const rawPersonas = (access.wsItem.draftPayload as Record<string, unknown> | undefined)?.personas;
      const existingObj =
        rawPersonas && typeof rawPersonas === "object" && !Array.isArray(rawPersonas)
          ? (rawPersonas as Record<string, unknown>)
          : null;
      const currentList: unknown[] = Array.isArray(rawPersonas)
        ? rawPersonas
        : Array.isArray(existingObj?.personas)
        ? existingObj.personas
        : [];
      const remaining = currentList.filter((item) => {
        const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return String(rec.id || rec.personaId || "") !== String(personaId);
      });

      const nextDraft: Record<string, unknown> = { ...(access.wsItem.draftPayload || {}) };
      if (remaining.length > 0) {
        nextDraft.personas = existingObj
          ? { ...existingObj, personas: remaining }
          : { personas: remaining };
      } else {
        delete nextDraft.personas;
      }

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
          draftPayload: nextDraft,
          publishedSnapshot: access.wsItem.publishedSnapshot
            ? buildSanitizedDealCardPublicSnapshot(access.wsItem.publishedSnapshot)
            : null,
          version: access.wsItem.version,
          docHash: access.wsItem.docHash,
        });
        if (!saved.item) {
          return NextResponse.json({ ok: false, error: "페르소나 삭제에 실패했습니다." }, { status: 500 });
        }
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
        }
        return NextResponse.json({ ok: false, error: "페르소나 삭제 중 오류가 발생했습니다." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, success: true, deletedId: personaId });
    }

    // Building mode (owner or admin bypass)
    let selectQ = supabase
      .from("deal_card_personas")
      .select("id, personas_data, broker_id")
      .eq("building_ssot_lite_id", id);
    if (access.ownerId) {
      selectQ = selectQ.eq("broker_id", access.ownerId);
    }
    const { data: existingRow, error: readErr } = await selectQ.maybeSingle();
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 400 });
    }

    const existingData =
      existingRow?.personas_data && typeof existingRow.personas_data === "object"
        ? (existingRow.personas_data as Record<string, unknown>)
        : null;
    const currentList = Array.isArray(existingData?.personas) ? existingData.personas : [];
    const remaining = currentList.filter((item) => {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return String(rec.id || rec.personaId || "") !== String(personaId);
    });

    if (existingRow && remaining.length > 0) {
      let updQ = supabase
        .from("deal_card_personas")
        .update({
          personas_data: {
            ...existingData,
            personas: remaining,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("building_ssot_lite_id", id);
      if (access.ownerId) {
        updQ = updQ.eq("broker_id", access.ownerId);
      } else if (existingRow.broker_id) {
        updQ = updQ.eq("broker_id", existingRow.broker_id);
      }
      const { error: updErr } = await updQ;
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
    } else if (existingRow) {
      let delQ = supabase
        .from("deal_card_personas")
        .delete()
        .eq("building_ssot_lite_id", id);
      if (access.ownerId) {
        delQ = delQ.eq("broker_id", access.ownerId);
      } else if (existingRow.broker_id) {
        delQ = delQ.eq("broker_id", existingRow.broker_id);
      }
      const { error: delErr } = await delQ;
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, success: true, deletedId: personaId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
