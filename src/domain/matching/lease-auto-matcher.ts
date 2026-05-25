/**
 * Lease Auto Matcher
 * Automatically runs match engine between lease spaces and tenant intents.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runLeaseMatchingEngine, type LeaseSpaceMatchInput, type TenantIntentMatchInput } from "./lease-matching-engine";

export async function runLeaseAutoMatcher(
  leaseSpaceId: string,
  brokerId: string,
): Promise<void> {
  const supabase = createServiceClient();

  // 1. Fetch lease space
  const { data: space, error: spaceErr } = await supabase
    .from("lease_spaces")
    .select(`
      *,
      building:building_id (
        area_signal,
        fit_summary,
        caution_summary
      )
    `)
    .eq("id", leaseSpaceId)
    .single();

  if (spaceErr || !space) {
    console.error("[LeaseAutoMatcher] Lease space not found", spaceErr);
    return;
  }

  // 2. Fetch all tenant intents of this broker
  const { data: intents, error: intentsErr } = await supabase
    .from("tenant_intent")
    .select("*")
    .eq("broker_id", brokerId);

  if (intentsErr || !intents || intents.length === 0) {
    console.log("[LeaseAutoMatcher] No active tenant intents to match");
    return;
  }

  // 3. Map lease space to match engine input
  const spaceInput: LeaseSpaceMatchInput = {
    id: space.id,
    building_id: space.building_id,
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

  // 4. Run match for each intent
  for (const intent of intents) {
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

    try {
      const matchResult = await runLeaseMatchingEngine({
        space: spaceInput,
        intent: intentInput,
      });

      if (matchResult.stage1Passed && matchResult.grade !== "C") {
        // Upsert matching result
        await supabase
          .from("lease_match_results")
          .upsert({
            lease_space_id: space.id,
            tenant_intent_id: intent.id,
            grade: matchResult.grade,
            score: matchResult.score,
            reasoning: matchResult.reasoning,
          });
      } else {
        // Delete if exists and no longer matches
        await supabase
          .from("lease_match_results")
          .delete()
          .eq("lease_space_id", space.id)
          .eq("tenant_intent_id", intent.id);
      }
    } catch (err) {
      console.error(`[LeaseAutoMatcher] Matching failed for intent ${intent.id}:`, err);
    }
  }
}

/**
 * Run auto-matching for a specific tenant intent against all active lease spaces
 */
export async function runTenantAutoMatcher(
  tenantIntentId: string,
  brokerId: string,
): Promise<void> {
  const supabase = createServiceClient();

  // 1. Fetch tenant intent
  const { data: intent, error: intentErr } = await supabase
    .from("tenant_intent")
    .select("*")
    .eq("id", tenantIntentId)
    .single();

  if (intentErr || !intent) {
    console.error("[LeaseAutoMatcher] Tenant intent not found", intentErr);
    return;
  }

  // 2. Fetch all active lease spaces of this broker
  const { data: spaces, error: spacesErr } = await supabase
    .from("lease_spaces")
    .select(`
      *,
      building:building_id (
        area_signal,
        fit_summary,
        caution_summary
      )
    `)
    .eq("broker_id", brokerId)
    .eq("status", "active");

  if (spacesErr || !spaces || spaces.length === 0) {
    console.log("[LeaseAutoMatcher] No active lease spaces to match");
    return;
  }

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

  for (const space of spaces) {
    const spaceInput: LeaseSpaceMatchInput = {
      id: space.id,
      building_id: space.building_id,
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

    try {
      const matchResult = await runLeaseMatchingEngine({
        space: spaceInput,
        intent: intentInput,
      });

      if (matchResult.stage1Passed && matchResult.grade !== "C") {
        await supabase
          .from("lease_match_results")
          .upsert({
            lease_space_id: space.id,
            tenant_intent_id: intent.id,
            grade: matchResult.grade,
            score: matchResult.score,
            reasoning: matchResult.reasoning,
          });
      } else {
        await supabase
          .from("lease_match_results")
          .delete()
          .eq("lease_space_id", space.id)
          .eq("tenant_intent_id", intent.id);
      }
    } catch (err) {
      console.error(`[LeaseAutoMatcher] Matching failed for space ${space.id}:`, err);
    }
  }
}
