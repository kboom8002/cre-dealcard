import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const supabase = createServiceClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from("broker_memos")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.user_id !== user!.id) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("broker_memos")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/broker/memo/[id]]", err);
    return NextResponse.json({ error: "메모 삭제 실패" }, { status: 500 });
  }
}
