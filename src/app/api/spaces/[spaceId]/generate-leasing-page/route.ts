/**
 * API: POST /api/spaces/[spaceId]/generate-leasing-page
 * 리싱 페이지 생성 에이전트 호출 → leasing_pages + leasing_page_sections DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { runLeasingPageWriterAgent } from "@/ai/agents/leasing-page-writer-agent";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("space-generate-leasing-page-route");

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

/** 슬러그 생성: 공간명 + 랜덤 4자 */
function generateSlug(spaceName: string): string {
  const base = spaceName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9가-힣-]/g, "")
    .toLowerCase()
    .slice(0, 30);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
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

    // ── 기존 fit 결과 조회 ────────────────────────────────────────
    const [{ data: tenantFits }, { data: vibeFit }] = await Promise.all([
      supabase.from("tenant_fit_results").select("*").eq("space_id", spaceId),
      supabase
        .from("vibe_fit_results")
        .select("*")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ── 에이전트 실행 ────────────────────────────────────────────
    const result = await runLeasingPageWriterAgent({
      space_ssot: space,
      tenant_fit_results: tenantFits ?? body.tenant_fit_results ?? [],
      vibe_fit_result: vibeFit ?? body.vibe_fit_result,
      visual_albums: body.visual_albums,
    });

    if (result.status !== "success" || !result.output) {
      log.error("[generate-leasing-page] agent failed", { spaceId, status: result.status });
      return NextResponse.json({ error: "페이지 생성에 실패했습니다." }, { status: 500 });
    }

    const output = result.output;
    const slug = body.slug || generateSlug(output.title || space.display_name || spaceId);

    // ── leasing_pages upsert ────────────────────────────────────
    const { data: existingPage } = await supabase
      .from("leasing_pages")
      .select("id")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let leasingPageId: string;

    if (existingPage?.id) {
      await supabase
        .from("leasing_pages")
        .update({
          title: output.title,
          subtitle: output.subtitle,
          answer_hero: output.answer_hero,
          boundary_note: output.boundary_note,
          seo: output.seo ?? {},
          status: "generated",
          target_tenant_types: body.target_tenant_types ?? [],
          tenant_fit_result_ids: (tenantFits ?? []).map((f: { id: string }) => f.id),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPage.id);
      leasingPageId = existingPage.id;
    } else {
      const { data: newPage, error: pageInsertError } = await supabase
        .from("leasing_pages")
        .insert({
          space_id: spaceId,
          slug,
          title: output.title,
          subtitle: output.subtitle,
          answer_hero: output.answer_hero,
          boundary_note: output.boundary_note,
          seo: output.seo ?? {},
          status: "generated",
          target_tenant_types: body.target_tenant_types ?? [],
          tenant_fit_result_ids: (tenantFits ?? []).map((f: { id: string }) => f.id),
        })
        .select("id")
        .single();

      if (pageInsertError || !newPage?.id) {
        log.error("[generate-leasing-page] page insert failed:", pageInsertError?.message);
        return NextResponse.json({ error: "리싱 페이지 저장에 실패했습니다." }, { status: 500 });
      }
      leasingPageId = newPage.id;
    }

    // ── leasing_page_sections 재생성 ─────────────────────────────
    await supabase.from("leasing_page_sections").delete().eq("page_id", leasingPageId);

    if (output.sections && output.sections.length > 0) {
      const sectionsToInsert = output.sections.map((section, idx) => ({
        page_id: leasingPageId,
        section_type: section.section_type,
        title: section.title,
        sort_order: section.sort_order ?? idx,
        markdown: section.markdown ?? "",
        content_json: section.content_json ?? {},
        linked_album_ids: section.linked_album_ids ?? [],
        linked_visual_asset_ids: section.linked_visual_asset_ids ?? [],
        visibility: section.visibility ?? "public_blind",
        status: "generated",
      }));

      await supabase.from("leasing_page_sections").insert(sectionsToInsert);
    }

    // ── spaces 상태 업데이트 ────────────────────────────────────
    await supabase
      .from("spaces")
      .update({ status: "page_generated", updated_at: new Date().toISOString() })
      .eq("id", spaceId);

    return NextResponse.json({
      success: true,
      leasing_page_id: leasingPageId,
      slug,
      public_url: `/leasing/${slug}`,
      sections_count: output.sections?.length ?? 0,
      output: result,
    });
  } catch (error) {
    log.error(
      "[generate-leasing-page] POST error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "리싱 페이지 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}

// ── GET: 현재 리싱 페이지 조회 (브로커 소유자 전용) ───────────────────

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

    const { data: page, error } = await supabase
      .from("leasing_pages")
      .select("*, leasing_page_sections(*)")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.error("[generate-leasing-page] GET error:", error.message);
      return NextResponse.json({ error: "리싱 페이지 조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ page: page ?? null });
  } catch (error) {
    log.error(
      "[generate-leasing-page] GET unexpected error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "리싱 페이지 조회에 실패했습니다." }, { status: 500 });
  }
}
