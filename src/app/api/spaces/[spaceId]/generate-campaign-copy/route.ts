/**
 * API: POST /api/spaces/[spaceId]/generate-campaign-copy
 * 채널별 마케팅 카피 생성 에이전트 호출 → campaign_copies DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { runCampaignCopyAgent } from "@/ai/agents/campaign-copy-agent";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("space-generate-campaign-copy-route");

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
    .select("*")
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
    (space.owner_id as string | null | undefined) ??
    (space.broker_id as string | null | undefined) ??
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
    const space = access.space;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    // 최신 리싱 페이지 조회
    const { data: leasingPage } = await supabase
      .from("leasing_pages")
      .select("id, slug, title, answer_hero")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pageUrl = leasingPage?.slug
      ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://credeal.net"}/leasing/${leasingPage.slug}`
      : undefined;

    const result = await runCampaignCopyAgent({
      space_summary: space,
      leasing_page_info: leasingPage ?? body.leasing_page_info,
      tenant_fit_results: body.tenant_fit_results,
      copy_types: body.copy_types || ["kakao", "naver_listing"],
      target_tenant_types: body.target_tenant_types || [],
      page_url: pageUrl ?? body.page_url,
    });

    // ── DB 저장 ──────────────────────────────────────────────────
    if (result.status === "success" && result.output?.copies?.length) {
      const rows = result.output.copies.map((copy) => ({
        space_id: spaceId,
        leasing_page_id: leasingPage?.id ?? null,
        copy_type: copy.copy_type,
        target_tenant_type: copy.target_tenant_type ?? null,
        title: copy.title,
        body: copy.body,
        boundary_note: copy.boundary_note_short,
        status: "generated",
        ai_generated: true,
      }));

      await supabase.from("campaign_copies").insert(rows);
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error(
      "[generate-campaign-copy] POST error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "캠페인 카피 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}

// ── GET: 저장된 카피 목록 조회 (브로커 소유자 전용) ──────────────────

export async function GET(
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

    const { data: copies, error } = await supabase
      .from("campaign_copies")
      .select("id, copy_type, target_tenant_type, title, body, status, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("[generate-campaign-copy] GET error:", error.message);
      return NextResponse.json({ error: "카피 목록 조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ copies: copies ?? [] });
  } catch (error) {
    log.error(
      "[generate-campaign-copy] GET unexpected error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "카피 목록 조회에 실패했습니다." }, { status: 500 });
  }
}
