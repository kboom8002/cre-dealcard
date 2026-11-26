/**
 * GET    /api/broker/circles/[id] — 서클 상세 조회
 * PATCH  /api/broker/circles/[id] — 서클 정보 수정
 * DELETE /api/broker/circles/[id] — 서클 삭제 (owner만)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import {
  getCircleDetail,
  updateCircle,
  deleteCircle,
  CircleAccessError,
} from "@/domain/team/circle-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  try {
    const detail = await getCircleDetail(id, user.id, { isAdmin });
    return NextResponse.json(detail);
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  try {
    const body = await req.json();
    await updateCircle(id, user.id, {
      name: typeof body?.name === "string" ? body.name.trim() : undefined,
      description: typeof body?.description === "string" ? body.description.trim() : undefined,
      avatarEmoji: typeof body?.avatarEmoji === "string" ? body.avatarEmoji.trim() : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  try {
    await deleteCircle(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
