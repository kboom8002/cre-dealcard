/**
 * POST /api/broker/circles/[id]/match/[matchId]/approve — 상대방 신원 공개 양측 승인 API
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { CircleAccessError } from "@/domain/team/circle-service";
import { approveIdentityReveal } from "@/domain/team/circle-matching-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { matchId } = await params;
  const guard = await requireBroker(req);
  if (guard.error) {
    if (guard.error.status === 401) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return guard.error;
  }
  const user = guard.user!;

  try {
    const res = await approveIdentityReveal({
      circleMatchId: matchId,
      approvingBrokerId: user.id,
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "매칭 승인 처리에 실패했습니다." }, { status: 500 });
  }
}
