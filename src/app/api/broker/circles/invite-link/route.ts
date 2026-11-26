/**
 * POST /api/broker/circles/invite-link — 카카오톡 공유용 초대 링크 생성
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActiveCircleMember, CircleAccessError } from "@/domain/team/circle-service";

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  try {
    const body = await req.json();
    const { circleId } = body;

    if (!circleId || typeof circleId !== "string") {
      return NextResponse.json({ error: "circleId가 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceClient();
    await assertActiveCircleMember(supabase, circleId, user.id, isAdmin);

    const { data: circle } = await supabase
      .from("broker_circles")
      .select("name, invite_code")
      .eq("id", circleId)
      .single();

    if (!circle) {
      return NextResponse.json({ error: "서클을 찾을 수 없습니다." }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://credeal.net";
    const inviteUrl = `${baseUrl}/broker/circles/join?code=${circle.invite_code}`;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const brokerName = profile?.display_name || "동료 중개사";

    return NextResponse.json({
      url: inviteUrl,
      inviteCode: circle.invite_code,
      circleName: circle.name,
      brokerName,
    });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "초대 링크 생성에 실패했습니다." }, { status: 500 });
  }
}
