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

  if (!ownership.ok) {
    return ownership.response;
  }

  try {
    // 1. 연관 데이터 선삭제 (참조 무결성 및 외래키 제약 준수)
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
