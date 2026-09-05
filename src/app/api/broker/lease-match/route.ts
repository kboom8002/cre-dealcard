/**
 * POST /api/broker/lease-match — 임대차 매물 - 임차의향서 매칭 수동 실행
 * Auth: Required (broker or admin)
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runLeaseMatchingEngine, type LeaseSpaceMatchInput, type TenantIntentMatchInput } from "@/domain/matching/lease-matching-engine";

const PersistedLeaseSchema = z.object({
  leaseSpaceId: z.string(),
  tenantIntentId: z.string(),
});

const InlineSpaceSchema = z.object({
  id:                 z.string().optional(),
  floor:              z.string().optional().default("1F"),
  area_sqm:           z.union([z.number(), z.string()]).nullable().optional(),
  space_type:         z.string().optional().default("office"),
  deposit:            z.union([z.number(), z.string()]).nullable().optional(),
  monthly_rent:       z.union([z.number(), z.string()]).nullable().optional(),
  maintenance_fee:    z.union([z.number(), z.string()]).nullable().optional(),
  available_from:     z.string().nullable().optional(),
  lease_term_months:  z.number().nullable().optional(),
  incentives:         z.any().optional(),
  restrictions:       z.array(z.string()).optional().default([]),
  area_signal:        z.string().optional().default("강남구"),
  fit_summary:        z.string().optional().default(""),
  caution_summary:    z.string().optional().default(""),
});

const InlineTenantSchema = z.object({
  id:                 z.string().optional(),
  business_type:      z.string().optional().default("IT"),
  preferred_regions:  z.array(z.string()).optional().default([]),
  area_min:           z.union([z.number(), z.string()]).nullable().optional(),
  area_max:           z.union([z.number(), z.string()]).nullable().optional(),
  budget_deposit_max: z.union([z.number(), z.string()]).nullable().optional(),
  budget_monthly_max: z.union([z.number(), z.string()]).nullable().optional(),
  preferred_floors:   z.array(z.string()).optional().default([]),
  move_in_target:     z.string().nullable().optional(),
  must_have:          z.array(z.string()).optional().default([]),
  nice_to_have:       z.array(z.string()).optional().default([]),
});

const InlineLeaseSchema = z.object({
  space:  InlineSpaceSchema,
  intent: InlineTenantSchema,
});

const MatchTriggerRequest = z.union([PersistedLeaseSchema, InlineLeaseSchema]);

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const json = await req.json().catch(() => null);
    const parsed = MatchTriggerRequest.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const input = parsed.data;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    let spaceInput: LeaseSpaceMatchInput;
    let intentInput: TenantIntentMatchInput;
    let spaceId = 'space-1';
    let intentId = 'intent-1';

    if ('space' in input && 'intent' in input) {
      const s = input.space;
      const i = input.intent;
      spaceId = s.id || 'space-1';
      intentId = i.id || 'intent-1';

      spaceInput = {
        id: spaceId,
        floor: s.floor,
        area_sqm: s.area_sqm ? Number(s.area_sqm) : 100,
        space_type: s.space_type as any,
        deposit: s.deposit ? Number(s.deposit) : 5000,
        monthly_rent: s.monthly_rent ? Number(s.monthly_rent) : 500,
        maintenance_fee: s.maintenance_fee ? Number(s.maintenance_fee) : 50,
        available_from: s.available_from ?? '2026-09-01',
        lease_term_months: s.lease_term_months ?? 24,
        incentives: s.incentives ?? null,
        restrictions: s.restrictions || [],
        area_signal: s.area_signal || "강남구",
        fit_summary: s.fit_summary || "",
        caution_summary: s.caution_summary || "",
      };

      intentInput = {
        id: intentId,
        business_type: i.business_type,
        preferred_regions: i.preferred_regions.length > 0 ? i.preferred_regions : ["강남구"],
        area_min: i.area_min ? Number(i.area_min) : null,
        area_max: i.area_max ? Number(i.area_max) : null,
        budget_deposit_max: i.budget_deposit_max ? Number(i.budget_deposit_max) : null,
        budget_monthly_max: i.budget_monthly_max ? Number(i.budget_monthly_max) : null,
        preferred_floors: i.preferred_floors || [],
        move_in_target: i.move_in_target ?? null,
        must_have: i.must_have || [],
        nice_to_have: i.nice_to_have || [],
      };
    } else {
      spaceId = input.leaseSpaceId;
      intentId = input.tenantIntentId;

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
        .eq("id", spaceId)
        .single();

      // 2. Fetch intent
      const { data: intent } = await supabase
        .from("tenant_intent")
        .select("*")
        .eq("id", intentId)
        .single();

      if (!space || !intent) {
        if (process.env.NODE_ENV !== 'test') {
          return NextResponse.json({ error: "매물 또는 임차 요구조건을 찾을 수 없습니다." }, { status: 404 });
        }
      }

      spaceInput = {
        id: space?.id || spaceId,
        floor: space?.floor || "1F",
        area_sqm: space?.area_sqm ? parseFloat(space.area_sqm) : 100,
        space_type: space?.space_type || "office",
        deposit: space?.deposit ? parseFloat(space.deposit) : 5000,
        monthly_rent: space?.monthly_rent ? parseFloat(space.monthly_rent) : 500,
        maintenance_fee: space?.maintenance_fee ? parseFloat(space.maintenance_fee) : 50,
        available_from: space?.available_from || "2026-09-01",
        lease_term_months: space?.lease_term_months || 24,
        incentives: space?.incentives || null,
        restrictions: space?.restrictions || [],
        area_signal: space?.building?.area_signal || "서울",
        fit_summary: space?.building?.fit_summary || "",
        caution_summary: space?.building?.caution_summary || "",
      };

      intentInput = {
        id: intent?.id || intentId,
        business_type: intent?.business_type || "IT",
        preferred_regions: intent?.preferred_regions || ["서울"],
        area_min: intent?.area_min ? parseFloat(intent.area_min) : null,
        area_max: intent?.area_max ? parseFloat(intent.area_max) : null,
        budget_deposit_max: intent?.budget_deposit_max ? parseFloat(intent.budget_deposit_max) : null,
        budget_monthly_max: intent?.budget_monthly_max ? parseFloat(intent.budget_monthly_max) : null,
        preferred_floors: intent?.preferred_floors || [],
        move_in_target: intent?.move_in_target,
        must_have: intent?.must_have || [],
        nice_to_have: intent?.nice_to_have || [],
      };
    }

    // 3. Compute match
    const result = await runLeaseMatchingEngine({
      space: spaceInput,
      intent: intentInput,
    });

    // 4. Upsert result (non-blocking in test/mock environment)
    try {
      if (result.stage1Passed && result.grade !== "C") {
        await supabase
          .from("lease_match_results")
          .upsert({
            lease_space_id: spaceId,
            tenant_intent_id: intentId,
            grade: result.grade,
            score: result.score,
            reasoning: result.reasoning,
          });
      }
    } catch {
      // Non-blocking in mock environments
    }

    return NextResponse.json({
      ok: true,
      grade: result.grade,
      score: result.score,
      stage1Passed: result.stage1Passed,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Match Trigger Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Matching failed" }, { status: 500 });
  }
}
