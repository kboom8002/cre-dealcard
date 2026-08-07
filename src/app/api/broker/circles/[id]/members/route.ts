/**
 * POST   /api/broker/circles/[id]/members — 서클 멤버 초대
 * DELETE /api/broker/circles/[id]/members — 서클 멤버 강퇴/제거
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inviteMember, removeMember } from "@/domain/team/circle-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { identifier } = body;

    if (!identifier) {
      return NextResponse.json({ error: "초대할 대상을 입력하세요." }, { status: 400 });
    }

    const res = await inviteMember({
      circleId: id,
      inviterBrokerId: user.id,
      inviteeIdentifier: identifier,
    });

    if (res.status === "not_found") {
      return NextResponse.json({ error: "해당 전화번호 또는 ID의 사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    if (res.status === "already_member") {
      return NextResponse.json({ error: "이미 서클 멤버입니다." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { targetId } = body;

    if (!targetId) {
      return NextResponse.json({ error: "대상 ID가 필요합니다." }, { status: 400 });
    }

    await removeMember({
      circleId: id,
      adminBrokerId: user.id,
      targetBrokerId: targetId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
