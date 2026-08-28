import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// PATCH /api/broker/magazine/subscribers/[id] - 구독자 상태 및 관심사 정보 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { status, interest_tags, interest_profile, channel, subscriber_name, subscriber_email, subscriber_phone } = body;

    const updateFields: any = {};

    if (status) {
      if (!["active", "paused", "unsubscribed"].includes(status)) {
        return NextResponse.json({ error: "올바르지 않은 상태 값입니다." }, { status: 400 });
      }
      updateFields.status = status;
      updateFields.unsubscribed_at = status === "unsubscribed" ? new Date().toISOString() : null;
    }

    if (interest_tags !== undefined) updateFields.interest_tags = interest_tags;
    if (interest_profile !== undefined) updateFields.interest_profile = interest_profile;
    if (channel && ["kakao", "email", "both"].includes(channel)) updateFields.channel = channel;
    if (subscriber_name !== undefined) updateFields.subscriber_name = subscriber_name;
    if (subscriber_email !== undefined) updateFields.subscriber_email = subscriber_email;
    if (subscriber_phone !== undefined) updateFields.subscriber_phone = subscriber_phone.replace(/[^0-9]/g, "");

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "수정할 항목이 제공되지 않았습니다." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("magazine_subscribers")
      .update(updateFields)
      .eq("id", id)
      .eq("broker_id", user.id) // 보안: 내 구독자만 수정 가능
      .select()
      .single();

    if (error) {
      console.error("[Subscriber PATCH] Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscriber: data });
  } catch (err: any) {
    console.error("[Subscriber PATCH] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/broker/magazine/subscribers/[id] - 구독자 완전 삭제 (하드 삭제)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { error } = await supabase
      .from("magazine_subscribers")
      .delete()
      .eq("id", id)
      .eq("broker_id", user.id); // 보안: 내 구독자만 삭제 가능

    if (error) {
      console.error("[Subscriber DELETE] Delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "구독자가 완전히 삭제되었습니다." });
  } catch (err: any) {
    console.error("[Subscriber DELETE] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
