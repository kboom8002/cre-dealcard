import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInvestorGateLevel, filterProjectByGate } from "@/domain/gate/funding-gate";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

const UpdateFundingProjectSchema = z
  .object({
    project_name: z.string().min(1).max(200).optional(),
    asset_type: z.enum(["real_estate", "startup", "art", "ip"]).optional(),
    target_amount: z.number().positive().optional(),
    min_investment: z.number().positive().optional(),
    expected_return_pct: z.number().min(0).max(100).optional(),
    investment_period_months: z.number().int().min(1).max(360).optional(),
    risk_level: z.number().int().min(1).max(5).optional(),
    token_type: z.enum(["sto", "equity", "profit_share"]).optional(),
    regulatory_status: z.string().max(200).nullable().optional(),
    description_memo: z.string().max(10_000).nullable().optional(),
    status: z.enum(["draft", "open", "closed"]).optional(),
    is_public: z.boolean().optional(),
    gate_level: z.number().int().min(0).max(4).optional(),
    hidden_fields: z.array(z.string().max(100)).max(50).optional(),
  })
  .strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request) ?? "anonymous";
  const allowed = await checkRateLimit(ip, "funding_project_get", 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { id } = await params;

    // Get current user session
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch the project
    const { data: project, error: pErr } = await supabase
      .from("funding_projects")
      .select("*")
      .eq("id", id)
      .single();

    if (pErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // If operator is the owner, bypass gate check
    if (user && project.operator_id === user.id) {
      return NextResponse.json({ ok: true, data: project });
    }

    if (!project.is_public || project.status !== "open") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Determine investor gate level
    let gateLevel = 0; // default anon/non-member
    if (user) {
      const { data: profile } = await supabase
        .from("investor_profiles")
        .select("investor_type, kyc_verified")
        .eq("user_id", user.id)
        .single();

      gateLevel = profile
        ? getInvestorGateLevel(profile.investor_type as any, profile.kyc_verified)
        : 1; // standard member if no profile yet
    }

    // Filter project details based on gate level
    const filteredProject = filterProjectByGate(project, gateLevel as any);

    return NextResponse.json({
      ok: true,
      data: filteredProject,
      viewerGateLevel: gateLevel,
    });
  } catch (error: unknown) {
    log.error("[GET /api/funding/project/[id]]", error);
    return NextResponse.json(
      { ok: false, error: "프로젝트 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_project_put", 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const { id } = await params;
    const rawBody = await request.json();
    const parsed = UpdateFundingProjectSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "허용되지 않거나 올바르지 않은 수정 항목입니다." },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "수정할 항목이 없습니다." },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: project, error: checkErr } = await supabase
      .from("funding_projects")
      .select("operator_id")
      .eq("id", id)
      .single();

    if (checkErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.operator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: updated, error } = await supabase
      .from("funding_projects")
      .update(parsed.data)
      .eq("id", id)
      .eq("operator_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data: updated });
  } catch (error: unknown) {
    log.error("[PUT /api/funding/project/[id]]", error);
    return NextResponse.json(
      { ok: false, error: "프로젝트 수정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_project_delete", 15, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { id } = await params;

    const { data: project, error: checkErr } = await supabase
      .from("funding_projects")
      .select("operator_id")
      .eq("id", id)
      .single();

    if (checkErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.operator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("funding_projects")
      .delete()
      .eq("id", id)
      .eq("operator_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Project deleted successfully" });
  } catch (error: unknown) {
    log.error("[DELETE /api/funding/project/[id]]", error);
    return NextResponse.json(
      { ok: false, error: "프로젝트 삭제 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
