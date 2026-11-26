/**
 * GET  /api/broker/circles/[id]/match — 팀 크로스 매칭 결과 조회
 * POST /api/broker/circles/[id]/match — 수동 전체 재매칭 실행
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { CircleAccessError } from "@/domain/team/circle-service";
import { getCircleMatches, runFullCircleMatch } from "@/domain/team/circle-matching-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  try {
    const gradesParam = req.nextUrl.searchParams.get("grades");
    const onlyMine = req.nextUrl.searchParams.get("onlyMine") === "true";

    const gradeFilter = gradesParam ? (gradesParam.split(",") as any) : undefined;

    const matches = await getCircleMatches(id, user.id, {
      gradeFilter,
      onlyMine,
      isAdmin,
    });

    return NextResponse.json({ matches });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "매칭 결과 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  try {
    const res = await runFullCircleMatch(id, user.id, { isAdmin });
    return NextResponse.json({ ok: true, summary: res, matches: [] });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error(`[circle/match] Match failed for ${id}:`, err);
    return NextResponse.json({ ok: false, error: "매칭 실행에 실패했습니다." }, { status: 500 });
  }
}
