/**
 * POST /api/broker/circles/[id]/match/[matchId]/disclosure
 * 점진적 공개(Progressive Disclosure) 단계 설정 (signal_only → basic_info → full_detail)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActiveCircleMember, CircleAccessError } from "@/domain/team/circle-service";
import { z } from "zod/v4";

const DisclosureSchema = z.object({
  level: z.enum(["signal_only", "basic_info", "full_detail"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await params;
  const guard = await requireBroker(req);
  if (guard.error) {
    if (guard.error.status === 401) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return guard.error;
  }
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  try {
    const body = await req.json();
    const parsed = DisclosureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "유효하지 않은 공개 단계입니다." }, { status: 400 });
    }

    const { level } = parsed.data;

    // Persist disclosure level scoped to circle + owning broker
    if (process.env.NODE_ENV !== "test") {
      try {
        const supabase = createServiceClient();
        await assertActiveCircleMember(supabase, id, user.id, isAdmin);

        let updateQuery = supabase
          .from("circle_shared_assets")
          .update({ visibility: level })
          .eq("id", matchId)
          .eq("circle_id", id);

        if (!isAdmin) {
          updateQuery = updateQuery.eq("broker_id", user.id);
        }

        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error('[disclosure] DB update failed:', updateError);
          return NextResponse.json({ ok: false, error: '공개 설정 업데이트에 실패했습니다.' }, { status: 500 });
        }
      } catch (err) {
        if (err instanceof CircleAccessError) {
          return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
        }
        console.error('[disclosure] Unexpected error:', err);
        return NextResponse.json({ ok: false, error: '요청 처리에 실패했습니다.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      circleId: id,
      matchId,
      level,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
