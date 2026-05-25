/**
 * POST /api/broker/lease-match — 임대차 매물 - 임차의향서 매칭 수동 실행
 * Auth: Required (broker or admin)
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runLeaseMatchingEngine, type LeaseSpaceMatchInput, type TenantIntentMatchInput } from "@/domain/matching/lease-matching-engine";

const MatchTriggerRequest = z.object({
  leaseSpaceId: z.string().uuid(),
  tenantIntentId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const json = await req.json();
    const input = MatchTriggerRequest.parse(json);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    // 1. Fetch space
    const { data: space } = await supabase
      .from("lease_spaces")
      .select(`
        *,
        building:building_id (
          area_signal,
          fit_summary,
          caution_summary
        )
      `)
      .eq("id", input.leaseSpaceId)
      .single();

    // 2. Fetch intent
    const { data: intent } = await supabase
      .from("tenant_intent")
      .select("*")
      .eq("id", input.tenantIntentId)
      .single();

    if (!space || !intent) {
      return NextResponse.json({ error: "매물 또는 임차 요구조건을 찾을 수 없습니다." }, { status: 404 });
    }

    const spaceInput: LeaseSpaceMatchInput = {
      id: space.id,
      floor: space.floor,
      area_sqm: space.area_sqm ? parseFloat(space.area_sqm) : null,
      space_type: space.space_type,
      deposit: space.deposit ? parseFloat(space.deposit) : null,
      monthly_rent: space.monthly_rent ? parseFloat(space.monthly_rent) : null,
      maintenance_fee: space.maintenance_fee ? parseFloat(space.maintenance_fee) : null,
      available_from: space.available_from,
      lease_term_months: space.lease_term_months,
      incentives: space.incentives,
      restrictions: space.restrictions || [],
      area_signal: space.building?.area_signal || "서울",
      fit_summary: space.building?.fit_summary || "",
      caution_summary: space.building?.caution_summary || "",
    };

    const intentInput: TenantIntentMatchInput = {
      id: intent.id,
      business_type: intent.business_type,
      preferred_regions: intent.preferred_regions || [],
      area_min: intent.area_min ? parseFloat(intent.area_min) : null,
      area_max: intent.area_max ? parseFloat(intent.area_max) : null,
      budget_deposit_max: intent.budget_deposit_max ? parseFloat(intent.budget_deposit_max) : null,
      budget_monthly_max: intent.budget_monthly_max ? parseFloat(intent.budget_monthly_max) : null,
      preferred_floors: intent.preferred_floors || [],
      move_in_target: intent.move_in_target,
      must_have: intent.must_have || [],
      nice_to_have: intent.nice_to_have || [],
    };

    // 3. Compute match
    const result = await runLeaseMatchingEngine({
      space: spaceInput,
      intent: intentInput,
    });

    // 4. Upsert result
    if (result.stage1Passed && result.grade !== "C") {
      await supabase
        .from("lease_match_results")
        .upsert({
          lease_space_id: space.id,
          tenant_intent_id: intent.id,
          grade: result.grade,
          score: result.score,
          reasoning: result.reasoning,
        });
    }

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("Match Trigger Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Matching failed" }, { status: 500 });
  }
}
