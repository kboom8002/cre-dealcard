import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runInvestorProfileNormalizer } from "@/ai/agents/investor-profile-normalizer";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

export async function GET(request: NextRequest) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_investor_profile_get", 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: profile, error } = await supabase
      .from("investor_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: profile || null,
    });
  } catch (error: unknown) {
    log.error("[GET /api/funding/investor/profile]", error);
    return NextResponse.json(
      { ok: false, error: "투자자 프로필 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_investor_profile_post", 15, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { rawMemo, investorType, kycVerified, kyc_verified } = body ?? {};

    let structuredProfile: any = {};
    if (rawMemo && typeof rawMemo === "string") {
      // Parse using AI normalizer agent
      const aiResult = await runInvestorProfileNormalizer(rawMemo.slice(0, 4000));
      structuredProfile = aiResult.profile;
    }

    // Never trust client kycVerified / kyc_verified: true unless caller is admin
    const resolvedKycVerified =
      isAdmin && (kycVerified === true || kyc_verified === true);

    const upsertData = {
      user_id: user.id,
      investor_type: investorType || structuredProfile.investorType || "general",
      investment_preference: structuredProfile.investmentPreference || [],
      preferred_sectors: structuredProfile.preferredSectors || [],
      investment_min: structuredProfile.investmentMin || 1000000,
      investment_max: structuredProfile.investmentMax || 10000000,
      max_risk_tolerance: structuredProfile.maxRiskTolerance || 3,
      expected_return_min: structuredProfile.expectedReturnMin || 5.0,
      investment_horizon_months: structuredProfile.investmentHorizonMonths || 12,
      must_have_criteria: structuredProfile.mustHaveCriteria || [],
      nice_to_have_criteria: structuredProfile.niceToHaveCriteria || [],
      kyc_verified: resolvedKycVerified,
      kyc_verified_at: resolvedKycVerified ? new Date().toISOString() : null,
    };

    const { data: profile, error } = await supabase
      .from("investor_profiles")
      .upsert(upsertData, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: profile,
      aiParsed: !!rawMemo,
    });
  } catch (error: unknown) {
    log.error("[POST /api/funding/investor/profile]", error);
    return NextResponse.json(
      { ok: false, error: "투자자 프로필 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
