/**
 * POST /api/broker/circles/[id]/match/[matchId]/approve — 상대방 신원 공개 양측 승인 API
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { approveIdentityReveal } from "@/domain/team/circle-matching-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { matchId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await approveIdentityReveal({
      circleMatchId: matchId,
      approvingBrokerId: user.id,
    });

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
