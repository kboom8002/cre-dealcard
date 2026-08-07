/**
 * GET  /api/broker/circles/[id]/match — 팀 크로스 매칭 결과 조회
 * POST /api/broker/circles/[id]/match — 수동 전체 재매칭 실행
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCircleMatches, runFullCircleMatch } from "@/domain/team/circle-matching-service";

export async function GET(
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
    const gradesParam = req.nextUrl.searchParams.get("grades");
    const onlyMine = req.nextUrl.searchParams.get("onlyMine") === "true";

    const gradeFilter = gradesParam ? (gradesParam.split(",") as any) : undefined;

    const matches = await getCircleMatches(id, user.id, {
      gradeFilter,
      onlyMine,
    });

    return NextResponse.json({ matches });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
    const res = await runFullCircleMatch(id);
    return NextResponse.json({ ok: true, summary: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
