import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runInvestorProfileNormalizer } from "@/ai/agents/investor-profile-normalizer";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
  } catch (error: any) {
    console.error("[GET /api/funding/investor/profile]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rawMemo, investorType, kycVerified } = await request.json();

    let structuredProfile: any = {};
    if (rawMemo) {
      // Parse using AI normalizer agent
      const aiResult = await runInvestorProfileNormalizer(rawMemo);
      structuredProfile = aiResult.profile;
    }

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
      kyc_verified: kycVerified !== undefined ? kycVerified : false,
      kyc_verified_at: kycVerified ? new Date().toISOString() : null,
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
  } catch (error: any) {
    console.error("[POST /api/funding/investor/profile]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
