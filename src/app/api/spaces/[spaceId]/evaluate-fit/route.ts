/**
 * API: POST /api/spaces/[spaceId]/evaluate-fit
 * 임차인 적합성 + 분위기 분석 에이전트 호출 → DB 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { runTenantFitAgent } from "@/ai/agents/tenant-fit-agent";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("space-evaluate-fit-route");

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

    const target_tenant_types: string[] = Array.isArray(body.target_tenant_types)
      ? body.target_tenant_types
      : [];

    // 에이전트 실행
    const tenantFit = await runTenantFitAgent({ space_ssot: space, target_tenant_types });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vibeFit: any = { status: "success", output: null };

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
          .upsert(
            {
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
            },
            {
              onConflict: "space_id,target_tenant_type",
            },
          )
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
    log.error(
      "[evaluate-fit] POST error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "적합성 분석에 실패했습니다." },
      { status: 500 },
    );
  }
}
