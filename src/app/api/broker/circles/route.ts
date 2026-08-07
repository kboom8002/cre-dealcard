/**
 * GET  /api/broker/circles — 내 서클 목록 + 초대 대기 목록 조회
 * POST /api/broker/circles — 새 서클 생성
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createCircle, getMyCircles, getPendingInvitations } from "@/domain/team/circle-service";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [circles, pendingInvitations] = await Promise.all([
      getMyCircles(user.id),
      getPendingInvitations(user.id),
    ]);

    return NextResponse.json({
      circles,
      pending_invitations: pendingInvitations,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, description, avatarEmoji } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "서클 이름을 입력해주세요." }, { status: 400 });
    }

    const circle = await createCircle({
      name: name.trim(),
      description: description?.trim(),
      avatarEmoji,
      createdBy: user.id,
    });

    return NextResponse.json({ circle }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
