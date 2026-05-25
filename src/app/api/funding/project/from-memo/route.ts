import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runFundingProjectCard } from "@/ai/agents/funding-project-card";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { memo } = await request.json();
    if (!memo) {
      return NextResponse.json({ error: "Memo is required" }, { status: 400 });
    }

    // Call AI parsing agent
    const aiResult = await runFundingProjectCard(memo);

    // Save draft in funding_projects
    const { data: project, error } = await supabase
      .from("funding_projects")
      .insert({
        operator_id: user.id,
        project_name: aiResult.projectData.projectName,
        asset_type: aiResult.projectData.assetType,
        target_amount: aiResult.projectData.targetAmount,
        min_investment: aiResult.projectData.minInvestment,
        expected_return_pct: aiResult.projectData.expectedReturnPct,
        investment_period_months: aiResult.projectData.investmentPeriodMonths,
        risk_level: aiResult.projectData.riskLevel,
        token_type: aiResult.projectData.tokenType,
        regulatory_status: aiResult.projectData.regulatoryStatus,
        description_memo: aiResult.projectData.descriptionMemo || memo,
        ssot_data: {
          parsedFacts: aiResult.projectData,
          teaser: aiResult.blindTeaser,
        },
        status: "draft",
        is_public: false,
        gate_level: 0,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: {
        project,
        aiResult,
      },
    });
  } catch (error: any) {
    console.error("[POST /api/funding/project/from-memo]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
