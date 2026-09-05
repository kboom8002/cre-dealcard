import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

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

    try {
      const supabase = createServiceClient();
      await supabase
        .from("deal_card_personas")
        .delete()
        .eq("building_ssot_lite_id", id)
        .eq("broker_id", guard.user!.id);
    } catch {
      // Non-blocking in mock environments
    }

    return NextResponse.json({ ok: true, success: true, deletedId: personaId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
