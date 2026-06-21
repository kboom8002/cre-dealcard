/**
 * API: POST /api/spaces/[spaceId]/generate-campaign-copy
 * 채널별 마케팅 카피 생성 에이전트 호출 → campaign_copies DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runCampaignCopyAgent } from "@/ai/agents/campaign-copy-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const body = await req.json();
    const supabase = createServiceClient();

    const { data: space } = await supabase
      .from("spaces")
      .select("id, display_name, blind_name, area_signal, asset_type, price_band, status, floor, area_private_py")
      .eq("id", spaceId)
      .single();

    if (!space) {
      return NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 });
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
    return NextResponse.json(
      { error: "캠페인 카피 생성에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}

// ── GET: 저장된 카피 목록 조회 ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const supabase = createServiceClient();

    const { data: copies } = await supabase
      .from("campaign_copies")
      .select("id, copy_type, target_tenant_type, title, body, status, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ copies: copies ?? [] });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
