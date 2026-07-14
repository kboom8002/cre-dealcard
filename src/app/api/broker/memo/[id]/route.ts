import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const body = await req.json();
    const { memo_text, is_pinned, tags, status, converted_to } = body;

    const supabase = createServiceClient();

    // Ownership check
    const { data: existing, error: fetchError } = await supabase
      .from("broker_memos")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.user_id !== user!.id) {
      return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    }

    // Build update payload — only include provided fields
    const updates: Record<string, unknown> = {};
    if (memo_text !== undefined) updates.memo_text = memo_text;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (tags !== undefined) updates.tags = tags;
    if (status !== undefined) updates.status = status;
    if (converted_to !== undefined) updates.converted_to = converted_to;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("broker_memos")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[PUT /api/broker/memo/[id]]", updateError);
      return NextResponse.json({ error: "메모 수정 실패" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: any) {
    console.error("[PUT /api/broker/memo/[id]]", err);
    return NextResponse.json({ error: "메모 수정 실패" }, { status: 500 });
  }
}

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

    // Try broker_memos first
    const { data: existing, error: fetchError } = await supabase
      .from("broker_memos")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      // Table might not exist — try deleting from activity_events fallback
      const { error: aeDeleteErr } = await supabase
        .from("activity_events")
        .delete()
        .eq("id", id)
        .eq("actor_id", user!.id);

      if (aeDeleteErr) {
        return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (!existing) {
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
