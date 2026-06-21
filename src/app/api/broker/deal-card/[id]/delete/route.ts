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

  // 소유권 확인
  const { data: building, error: fetchError } = await service
    .from("building_ssot_lite")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !building) {
    return NextResponse.json({ error: "딜카드를 찾을 수 없습니다." }, { status: 404 });
  }

  if (building.owner_id !== user.id) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  try {
    // 1. 연관 document_objects 삭제 (blind_teaser, im_lite_draft 등)
    await service
      .from("document_objects")
      .delete()
      .eq("building_id", id);

    // 2. 연관 building_signal_cards 삭제
    await service
      .from("building_signal_cards")
      .delete()
      .eq("building_id", id);

    // 3. 연관 gate_requests 삭제
    await service
      .from("gate_requests")
      .delete()
      .eq("building_id", id);

    // 4. 메인 레코드 삭제
    const { error: deleteError } = await service
      .from("building_ssot_lite")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[deal-card/delete] Delete error:", deleteError);
      return NextResponse.json({ error: `삭제 실패: ${deleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "딜카드가 삭제되었습니다." });
  } catch (err: any) {
    console.error("[deal-card/delete] Unexpected error:", err);
    return NextResponse.json({ error: `오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}
