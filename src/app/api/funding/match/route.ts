import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runFundingMatchingEngine } from "@/domain/matching/funding-matching-engine";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

export async function POST(request: NextRequest) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_match_post", 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { projectId, investorProfileId } = await request.json();

    if (projectId) {
      // 1. Match a single project against all investor profiles
      const { data: project, error: pErr } = await supabase
        .from("funding_projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (pErr || !project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      if (!isAdmin && project.operator_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: profiles, error: prErr } = await supabase
        .from("investor_profiles")
        .select("*");

      if (prErr) throw prErr;

      const matches = [];
      for (const profile of profiles || []) {
        const match = await runFundingMatchingEngine({
          project: {
            id: project.id,
            projectName: project.project_name,
            assetType: project.asset_type as any,
            targetAmount: Number(project.target_amount),
            minInvestment: Number(project.min_investment),
            expectedReturnPct: Number(project.expected_return_pct),
            investmentPeriodMonths: Number(project.investment_period_months),
            riskLevel: Number(project.risk_level),
            tokenType: project.token_type as any,
            descriptionMemo: project.description_memo,
          },
          investor: {
            id: profile.id,
            investorType: profile.investor_type as any,
            investmentPreference: profile.investment_preference,
            preferredSectors: profile.preferred_sectors,
            investmentMin: profile.investment_min ? Number(profile.investment_min) : null,
            investmentMax: profile.investment_max ? Number(profile.investment_max) : null,
            maxRiskTolerance: profile.max_risk_tolerance ? Number(profile.max_risk_tolerance) : null,
            expectedReturnMin: profile.expected_return_min ? Number(profile.expected_return_min) : null,
            investmentHorizonMonths: profile.investment_horizon_months ? Number(profile.investment_horizon_months) : null,
            mustHaveCriteria: profile.must_have_criteria,
            niceToHaveCriteria: profile.nice_to_have_criteria,
          },
        });

        // Save result
        await supabase.from("funding_match_results").upsert({
          funding_project_id: project.id,
          investor_profile_id: profile.id,
          grade: match.grade,
          score: match.score,
          reasoning: match.reasoning,
        });

        matches.push({ profileId: profile.id, ...match });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully computed matching for ${matches.length} investors.`,
        data: matches,
      });
    }

    if (investorProfileId) {
      // 2. Match a single investor against all projects
      const { data: profile, error: prErr } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("id", investorProfileId)
        .single();

      if (prErr || !profile) {
        return NextResponse.json({ error: "Investor profile not found" }, { status: 404 });
      }

      if (!isAdmin && profile.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: projects, error: pErr } = await supabase
        .from("funding_projects")
        .select("*")
        .eq("status", "open");

      if (pErr) throw pErr;

      const matches = [];
      for (const project of projects || []) {
        const match = await runFundingMatchingEngine({
          project: {
            id: project.id,
            projectName: project.project_name,
            assetType: project.asset_type as any,
            targetAmount: Number(project.target_amount),
            minInvestment: Number(project.min_investment),
            expectedReturnPct: Number(project.expected_return_pct),
            investmentPeriodMonths: Number(project.investment_period_months),
            riskLevel: Number(project.risk_level),
            tokenType: project.token_type as any,
            descriptionMemo: project.description_memo,
          },
          investor: {
            id: profile.id,
            investorType: profile.investor_type as any,
            investmentPreference: profile.investment_preference,
            preferredSectors: profile.preferred_sectors,
            investmentMin: profile.investment_min ? Number(profile.investment_min) : null,
            investmentMax: profile.investment_max ? Number(profile.investment_max) : null,
            maxRiskTolerance: profile.max_risk_tolerance ? Number(profile.max_risk_tolerance) : null,
            expectedReturnMin: profile.expected_return_min ? Number(profile.expected_return_min) : null,
            investmentHorizonMonths: profile.investment_horizon_months ? Number(profile.investment_horizon_months) : null,
            mustHaveCriteria: profile.must_have_criteria,
            niceToHaveCriteria: profile.nice_to_have_criteria,
          },
        });

        // Save result
        await supabase.from("funding_match_results").upsert({
          funding_project_id: project.id,
          investor_profile_id: profile.id,
          grade: match.grade,
          score: match.score,
          reasoning: match.reasoning,
        });

        matches.push({ projectId: project.id, ...match });
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully computed matching for ${matches.length} projects.`,
        data: matches,
      });
    }

    return NextResponse.json({ error: "Missing projectId or investorProfileId" }, { status: 400 });
  } catch (error: unknown) {
    log.error("[POST /api/funding/match]", error);
    return NextResponse.json(
      { ok: false, error: "펀딩 매칭 실행 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
