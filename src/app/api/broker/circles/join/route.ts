/**
 * POST   /api/broker/circles/join — 초대 코드로 서클 가입
 * PATCH  /api/broker/circles/join — 초대 수락/거절
 * DELETE /api/broker/circles/join — 서클 탈퇴
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { joinByInviteCode, acceptInvitation, declineInvitation, leaveCircle } from "@/domain/team/circle-service";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: "초대 코드를 입력하세요." }, { status: 400 });
    }

    const res = await joinByInviteCode({
      inviteCode: code.trim(),
      brokerId: user.id,
    });

    if (res.status === "invalid_code") {
      return NextResponse.json({ error: "유효하지 않은 초대 코드입니다." }, { status: 404 });
    }

    if (res.status === "already_member") {
      return NextResponse.json({ error: "이미 가입되어 있는 서클입니다.", circleId: res.circleId }, { status: 409 });
    }

    if (res.status === "full") {
      return NextResponse.json({ error: "서클 최대 인원을 초과했습니다." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, circleId: res.circleId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { circleId, action } = body;

    if (!circleId || !action) {
      return NextResponse.json({ error: "circleId와 action이 필요합니다." }, { status: 400 });
    }

    if (action === "accept") {
      await acceptInvitation(circleId, user.id);
    } else if (action === "decline") {
      await declineInvitation(circleId, user.id);
    } else {
      return NextResponse.json({ error: "올바르지 않은 action입니다." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { circleId } = body;

    if (!circleId) {
      return NextResponse.json({ error: "circleId가 필요합니다." }, { status: 400 });
    }

    await leaveCircle(circleId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
