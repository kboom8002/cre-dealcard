/**
 * POST /api/broker/circles/invite-link — 카카오톡 공유용 초대 링크 생성
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
