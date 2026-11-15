/**
 * API: POST /api/spaces/[spaceId]/classify-photos
 * 사진 분류 에이전트 호출 (브로커 소유자 전용)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { runVisualClassificationAgent } from "@/ai/agents/visual-classification-agent";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("space-classify-photos-route");

export const runtime = "nodejs";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSpaceOwnership(
  supabase: ReturnType<typeof createServiceClient>,
  spaceId: string,
  userId: string,
  role: string | null,
): Promise<{ ok: true; space: any } | { ok: false; response: NextResponse }> {
  if (!spaceId || typeof spaceId !== "string" || !spaceId.trim()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "유효하지 않은 공간 ID입니다." }, { status: 400 }),
    };
  }

  const { data: space, error: spaceErr } = await supabase
    .from("spaces")
    .select("id, created_by, building_ssot_lite_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceErr) {
    log.error("[spaces-authz] space lookup error:", spaceErr.message);
    return {
      ok: false,
      response: NextResponse.json({ error: "공간 권한을 확인하지 못했습니다." }, { status: 500 }),
    };
  }

  if (!space) {
    return {
      ok: false,
      response: NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 }),
    };
  }

  const directOwnerId =
    (space.created_by as string | null | undefined) ??
    ((space as Record<string, unknown>).owner_id as string | null | undefined) ??
    ((space as Record<string, unknown>).broker_id as string | null | undefined) ??
    null;

  if (directOwnerId && directOwnerId === userId) {
    return { ok: true, space };
  }

  if (!directOwnerId) {
    if (typeof space.building_ssot_lite_id === "string" && space.building_ssot_lite_id) {
      const bOwn = await assertBuildingOwner(supabase, space.building_ssot_lite_id, userId, {
        allowAdmin: true,
        role,
      });
      if (bOwn.ok) return { ok: true, space };
      if (bOwn.status === 500) return { ok: false, response: bOwn.response };
    }

    const { data: leaseSpace, error: lsErr } = await supabase
      .from("lease_spaces")
      .select("id, broker_id, building_id")
      .eq("aipage_space_id", spaceId)
      .limit(1)
      .maybeSingle();

    if (lsErr) {
      log.error("[spaces-authz] lease_spaces lookup error:", lsErr.message);
      return {
        ok: false,
        response: NextResponse.json({ error: "공간 권한을 확인하지 못했습니다." }, { status: 500 }),
      };
    }

    if (leaseSpace?.broker_id && leaseSpace.broker_id === userId) {
      return { ok: true, space };
    }

    if (!leaseSpace?.broker_id && typeof leaseSpace?.building_id === "string" && leaseSpace.building_id) {
      const lbOwn = await assertBuildingOwner(supabase, leaseSpace.building_id, userId, {
        allowAdmin: true,
        role,
      });
      if (lbOwn.ok) return { ok: true, space };
      if (lbOwn.status === 500) return { ok: false, response: lbOwn.response };
    }
  }

  if (role === "admin") {
    return { ok: true, space };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "이 공간에 대한 권한이 없습니다." }, { status: 403 }),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const { spaceId } = await params;
    const supabase = createServiceClient();

    const access = await assertSpaceOwnership(supabase, spaceId, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const result = await runVisualClassificationAgent({
      space_context: {
        space_id: spaceId,
        target_tenant_types: body.target_tenant_types,
      },
      visual_assets: body.visual_assets || [],
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error(
      "[classify-photos] POST error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "사진 분류에 실패했습니다." },
      { status: 500 },
    );
  }
}
