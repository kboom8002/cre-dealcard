/**
 * DELETE /api/broker/deal-card/[id]/delete
 *
 * 딜카드(building_ssot_lite) 삭제 API
 * - owner_id 검증 (본인 딜카드만 삭제 가능)
 * - 연관 document_objects (blind_teaser 등) 함께 삭제
 * - 연관 building_signal_cards 함께 삭제
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 인증 확인
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const service = createServiceClient();

  // 소유권 확인을 위해 building_ssot_lite에서 직접 조회
  const { data: building, error: fetchError } = await service
    .from("building_ssot_lite")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (fetchError || !building) {
    return NextResponse.json({ error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
  }

  if (building.owner_id !== user.id) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  try {
    // 1. 연관 데이터 선삭제 (참조 무결성 및 외래키 제약 준수)
    await Promise.allSettled([
      service.from("document_objects").delete().eq("building_id", id),
      service.from("building_signal_cards").delete().eq("building_id", id),
      service.from("gate_requests").delete().eq("building_id", id),
      service.from("owner_readiness_checks").delete().eq("building_id", id),
      service.from("deal_card_personas").delete().eq("building_id", id),
      service.from("deal_matches").delete().eq("building_id", id),
      service.from("price_predictions").delete().eq("building_id", id),
      service.from("lease_spaces").delete().eq("building_id", id),
      service.from("full_im_handoffs").delete().eq("source_building_ssot_lite_id", id),
      service.from("space_ai_handoffs").delete().eq("source_building_ssot_lite_id", id),
    ]);

    // 2. 메인 레코드 삭제 (Hard delete 시도)
    const { error: hardDeleteErr } = await service
      .from("building_ssot_lite")
      .delete()
      .eq("id", id);

    if (hardDeleteErr) {
      console.warn("[deal-card/delete] Hard delete failed, falling back to soft delete:", hardDeleteErr.message);
      // Hard delete 실패 시 soft delete 수행 (status만 갱신 — archived_at 컬럼 미존재)
      const { error: softDeleteErr } = await service
        .from("building_ssot_lite")
        .update({ status: "archived" })
        .eq("id", id);

      if (softDeleteErr) {
        console.error("[deal-card/delete] Soft delete error:", softDeleteErr);
        return NextResponse.json({ error: `삭제 실패: ${softDeleteErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
  } catch (err: any) {
    console.error("[deal-card/delete] Unexpected error:", err);
    return NextResponse.json({ error: `오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}
