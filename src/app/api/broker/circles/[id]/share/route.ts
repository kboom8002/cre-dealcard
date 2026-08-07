/**
 * GET    /api/broker/circles/[id]/share — 공유된 자산 목록 조회
 * POST   /api/broker/circles/[id]/share — 자산 공유 (Always-On 매칭 트리거)
 * DELETE /api/broker/circles/[id]/share — 공유 해제
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shareAssetToCircle, unshareAsset, getSharedAssets } from "@/domain/team/circle-sharing-service";

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
    const assetType = req.nextUrl.searchParams.get("assetType") as any;
    const shared = await getSharedAssets(id, { assetType });
    return NextResponse.json({ shared_assets: shared });
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
    });

    return NextResponse.json({ ok: true, sharedAssetId: res.sharedAssetId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    const body = await req.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json({ error: "assetId가 필요합니다." }, { status: 400 });
    }

    await unshareAsset(id, assetId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
