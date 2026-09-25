/**
 * GET    /api/broker/circles/[id] — 서클 상세 조회
 * PATCH  /api/broker/circles/[id] — 서클 정보 수정
 * DELETE /api/broker/circles/[id] — 서클 삭제 (owner만)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCircleDetail, updateCircle, deleteCircle } from "@/domain/team/circle-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const detail = await getCircleDetail(id, user.id);
    return NextResponse.json(detail);
  } catch (err: any) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function PATCH(
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
    await updateCircle(id, user.id, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
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
    await deleteCircle(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
