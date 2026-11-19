/**
 * DELETE /api/broker/deal-card/[id]/delete
 *
 * 딜카드(building_ssot_lite) 삭제 API
 * - owner_id 검증 (본인 딜카드만 삭제 가능)
 * - 연관 document_objects (blind_teaser 등) 함께 삭제
 * - 연관 building_signal_cards 함께 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import {
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  softDeleteWorkspaceItem,
  WorkspaceRepositoryError,
} from "@/lib/workspace/workspace-repository";
import { deleteDealCardDependents } from "@/lib/deal-card/delete-dependents";
import {
  isUuid,
  getQuickImRecord,
  markDealCardDeleted,
  deleteQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

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
        await softDeleteWorkspaceItem(service, {
          id,
          userId: user.id,
          isAdmin: guard.role === "admin",
          kind: "dealcard",
        });
      } catch {
        // Non-blocking if only in-memory record exists
      }
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

  let targetBuildingId = id;
  let ownership = await assertBuildingOwner(service, targetBuildingId, user.id, {
    allowAdmin: true,
    role: guard.role,
  });

  if (!ownership.ok && ownership.status === 404) {
    try {
      const { data: sigCard } = await service
        .from("building_signal_cards")
        .select("id, building_id")
        .eq("id", id)
        .maybeSingle();
      if (sigCard?.building_id) {
        targetBuildingId = String(sigCard.building_id);
        ownership = await assertBuildingOwner(service, targetBuildingId, user.id, {
          allowAdmin: true,
          role: guard.role,
        });
      }
    } catch {
      // Ignore
    }
  }

  if (!ownership.ok && ownership.status === 404) {
    try {
      const wsItem =
        (await getWorkspaceItemByAnyId(service, id, "dealcard")) ||
        (targetBuildingId !== id
          ? await getWorkspaceItemByAnyId(service, targetBuildingId, "dealcard")
          : null);
      if (wsItem) {
        if (wsItem.status === "archived" || Boolean(wsItem.deletedAt)) {
          return NextResponse.json({ ok: false, error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
        }
        if (wsItem.ownerId !== user.id && guard.role !== "admin") {
          return NextResponse.json(
            { ok: false, error: "삭제 권한이 없습니다.", code: "FORBIDDEN" },
            { status: 403 }
          );
        }

        const delRes = await softDeleteWorkspaceItem(service, {
          id: wsItem.id,
          userId: user.id,
          isAdmin: guard.role === "admin",
          kind: "dealcard",
          requireExisting: true,
        });
        if (!delRes.deleted && !delRes.tableAvailable) {
          return NextResponse.json(
            { ok: false, error: "삭제 처리에 실패했습니다.", code: "DB_WRITE_FAILED" },
            { status: 500 }
          );
        }

        markDealCardDeleted(wsItem.id);
        deleteQuickImRecord(wsItem.id);
        if (id !== wsItem.id) {
          markDealCardDeleted(id);
          deleteQuickImRecord(id);
        }

        try {
          await service.from("activity_events").insert({
            actor_id: user.id,
            event_type: "dealcard_deleted",
            entity_type: "building",
            entity_id: wsItem.id,
            metadata: { building_id: wsItem.id },
          });
        } catch {
          // Non-blocking
        }

        try {
          revalidatePath(`/dc/${wsItem.id}`);
          if (id !== wsItem.id) revalidatePath(`/dc/${id}`);
        } catch {
          // Ignore
        }

        return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
      }
    } catch (err) {
      if (err instanceof WorkspaceRepositoryError) {
        return NextResponse.json(
          { ok: false, error: err.message, code: err.code },
          { status: err.status }
        );
      }
      return NextResponse.json(
        { ok: false, error: "삭제 처리 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }
  }

  if (!ownership.ok) {
    return ownership.response;
  }

  try {
    // 0. WP-7.3C P2: canonical workspace_items soft-delete FIRST (while ownership is
    //    still resolvable) and never swallow unexpected failures — a surviving
    //    published workspace row would keep the public /dc card alive.
    try {
      await softDeleteWorkspaceItem(service, {
        id: targetBuildingId,
        userId: user.id,
        isAdmin: guard.role === "admin",
        kind: "dealcard",
      });
      if (id !== targetBuildingId) {
        await softDeleteWorkspaceItem(service, {
          id,
          userId: user.id,
          isAdmin: guard.role === "admin",
          kind: "dealcard",
        });
      }
    } catch (err) {
      if (!isMissingRelationOrColumnError(err)) {
        log.error("[deal-card/delete] workspace_items soft delete failed:", err);
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, error: err.message, code: err.code },
            { status: err.status }
          );
        }
        return NextResponse.json(
          { ok: false, error: "삭제 처리 중 오류가 발생했습니다." },
          { status: 500 }
        );
      }
      // Pre-cutover: workspace_items not migrated yet — legacy tables only.
    }

    // 1. 연관 데이터 선삭제 (참조 무결성 및 외래키 제약 준수)
    const dependentFailures = await deleteDealCardDependents(service, targetBuildingId);
    if (dependentFailures.length > 0) {
      log.error("[deal-card/delete] dependent cleanup failures:", dependentFailures);
    }

    // 2. 메인 레코드 삭제 (Hard delete 시도)
    const { error: hardDeleteErr } = await service
      .from("building_ssot_lite")
      .delete()
      .eq("id", targetBuildingId);

    if (hardDeleteErr) {
      log.warn("[deal-card/delete] Hard delete failed, falling back to soft delete:", hardDeleteErr.message);
      // Hard delete 실패 시 soft delete 수행 (status만 갱신 — archived_at 컬럼 미존재)
      const { error: softDeleteErr } = await service
        .from("building_ssot_lite")
        .update({ status: "archived" })
        .eq("id", targetBuildingId);

      if (softDeleteErr) {
        log.error("[deal-card/delete] Soft delete error:", softDeleteErr);
        return NextResponse.json({ error: `삭제 실패: ${softDeleteErr.message}` }, { status: 500 });
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
    log.error("[deal-card/delete] Unexpected error:", err);
    return NextResponse.json({ error: `오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}
