/**
 * API: POST /api/spaces/[spaceId]/evaluate-fit
 * 임차인 적합성 + 분위기 분석 에이전트 호출 → DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runTenantFitAgent } from "@/ai/agents/tenant-fit-agent";
import { runVibeFitAgent } from "@/ai/agents/vibe-fit-agent";

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
      .select("*")
      .eq("id", spaceId)
      .single();

    if (!space) {
      return NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 });
    }

    const target_tenant_types: string[] = body.target_tenant_types || [];

    // 에이전트 병렬 실행
    const [tenantFit, vibeFit] = await Promise.all([
      runTenantFitAgent({ space_ssot: space, target_tenant_types }),
      runVibeFitAgent({ space_ssot: space, target_tenant_types }),
    ]);

    // ── VibeFit DB 저장 ──────────────────────────────────────────
    let vibeFitResultId: string | null = null;
    if (vibeFit.status === "success" && vibeFit.output) {
      const { data: vibeRow } = await supabase
        .from("vibe_fit_results")
        .insert({
          space_id: spaceId,
          vibe_summary: vibeFit.output.vibe_summary,
          vibe_tags: vibeFit.output.vibe_tags,
          vad: vibeFit.output.vad,
          tenant_vibe_alignment: vibeFit.output.tenant_vibe_alignment,
          mixed_signal_risks: vibeFit.output.mixed_signal_risks,
          retrofit_vibe_opportunities: vibeFit.output.retrofit_vibe_opportunities,
          missing_evidence: vibeFit.output.missing_evidence,
          boundary_note: vibeFit.boundary_note ?? "사진 기준 예비 해석입니다.",
          confidence: vibeFit.confidence ?? "photo_based_inference",
          ai_generated: true,
        })
        .select("id")
        .single();
      vibeFitResultId = vibeRow?.id ?? null;
    }

    // ── TenantFit DB 저장 ────────────────────────────────────────
    const savedTenantFitIds: string[] = [];
    if (tenantFit.status === "success" && tenantFit.output) {
      for (const result of tenantFit.output.tenant_fit_results) {
        const { data: fitRow } = await supabase
          .from("tenant_fit_results")
          .upsert({
            space_id: spaceId,
            target_tenant_type: result.target_tenant_type,
            fit_level: result.fit_level,
            fit_score: result.fit_score ?? null,
            strengths: result.strengths,
            check_needed: result.check_needed,
            weaker_points: result.weaker_points,
            required_facility_checks: result.required_facility_checks,
            legal_or_permit_checks: result.legal_or_permit_checks,
            safe_summary: result.safe_summary,
            boundary_note: result.boundary_note,
            confidence: tenantFit.confidence ?? "memo_based_inference",
            ai_generated: true,
          }, {
            onConflict: "space_id,target_tenant_type",
          })
          .select("id")
          .single();
        if (fitRow?.id) savedTenantFitIds.push(fitRow.id);
      }
    }

    // ── spaces 상태 업데이트 ────────────────────────────────────
    await supabase
      .from("spaces")
      .update({ status: "visual_classified", updated_at: new Date().toISOString() })
      .eq("id", spaceId);

    return NextResponse.json({
      tenant_fit: tenantFit,
      vibe_fit: vibeFit,
      saved: {
        tenant_fit_ids: savedTenantFitIds,
        vibe_fit_result_id: vibeFitResultId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "적합성 분석에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}
