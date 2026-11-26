/**
 * GET    /api/broker/circles/[id]/share — 공유된 자산 목록 조회
 * POST   /api/broker/circles/[id]/share — 자산 공유 (Always-On 매칭 트리거)
 * DELETE /api/broker/circles/[id]/share — 공유 해제
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { CircleAccessError } from "@/domain/team/circle-service";
import { shareAssetToCircle, unshareAsset, getSharedAssets } from "@/domain/team/circle-sharing-service";

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
    const assetType = req.nextUrl.searchParams.get("assetType") as any;
    const shared = await getSharedAssets(id, user.id, { assetType, isAdmin });
    return NextResponse.json({ shared_assets: shared });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
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
    const body = await req.json();
    const { assetType, assetId } = body;

    if (!assetType || !assetId) {
      return NextResponse.json({ error: "assetType과 assetId가 필요합니다." }, { status: 400 });
    }

    const res = await shareAssetToCircle({
      circleId: id,
      brokerId: user.id,
      assetType,
      assetId,
      isAdmin,
    });

    return NextResponse.json({ ok: true, sharedAssetId: res.sharedAssetId });
  } catch (err: unknown) {
    if (err instanceof CircleAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
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
    const body = await req.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json({ error: "assetId가 필요합니다." }, { status: 400 });
    }

    await unshareAsset(id, assetId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[circles] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
