/**
 * API: POST /api/spaces/[spaceId]/generate-leasing-page
 * 리싱 페이지 생성 에이전트 호출 → leasing_pages + leasing_page_sections DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runLeasingPageWriterAgent } from "@/ai/agents/leasing-page-writer-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  try {
    const { spaceId } = await params;
    const body = await req.json();
    const supabase = createServiceClient();

    // ── 공간 + 기존 fit 결과 조회 ────────────────────────────────
    const [{ data: space }, { data: tenantFits }, { data: vibeFit }] = await Promise.all([
      supabase.from("spaces").select("*").eq("id", spaceId).single(),
      supabase.from("tenant_fit_results").select("*").eq("space_id", spaceId),
      supabase
        .from("vibe_fit_results")
        .select("*")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!space) {
      return NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 });
    }

    // ── 에이전트 실행 ────────────────────────────────────────────
    const result = await runLeasingPageWriterAgent({
      space_ssot: space,
      tenant_fit_results: tenantFits ?? body.tenant_fit_results ?? [],
      vibe_fit_result: vibeFit ?? body.vibe_fit_result,
      visual_albums: body.visual_albums,
    });

    if (result.status !== "success" || !result.output) {
      return NextResponse.json({ error: "페이지 생성에 실패했습니다.", detail: result }, { status: 500 });
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
      // 기존 페이지 업데이트
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
      // 새 페이지 생성
      const { data: newPage } = await supabase
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
      leasingPageId = newPage!.id;
    }

    // ── leasing_page_sections 재생성 ─────────────────────────────
    // 기존 섹션 삭제 후 새로 삽입
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
    return NextResponse.json(
      { error: "리싱 페이지 생성에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}

// ── GET: 현재 리싱 페이지 조회 ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const supabase = createServiceClient();

    const { data: page } = await supabase
      .from("leasing_pages")
      .select("*, leasing_page_sections(*)")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ page: page ?? null });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
