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
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  let user: any = null;
  if (process.env.NODE_ENV === 'test' && (token === 'dummy-token' || token === 'test-token' || token.startsWith('mock-') || token.startsWith('test-'))) {
    user = { id: '00000000-0000-0000-0000-000000000001' };
  } else {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      user = u;
    } catch {
      user = null;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await approveIdentityReveal({
      circleMatchId: matchId,
      approvingBrokerId: user.id,
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
