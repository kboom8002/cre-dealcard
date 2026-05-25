/**
 * Domain service: tenant intent
 * Orchestrates: tenant memo → TenantIntentNormalizerAgent → tenant_intent table
 * Logs: ai_run, activity_event
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runTenantIntentNormalizer } from "@/ai/agents/tenant-intent-normalizer";
import { recordEvent } from "@/domain/analytics/record-event";

export interface CreateTenantIntentInput {
  memo: string;
  clientId?: string | null;
}

export interface CreateTenantIntentResult {
  tenantIntentId: string;
  summary: {
    businessType: string;
    preferredRegions: string[];
    budgetMonthlyMax: number | null;
    mustHave: string[];
  };
}

export async function createTenantIntentFromMemo(
  input: CreateTenantIntentInput,
  userId: string,
): Promise<CreateTenantIntentResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Run AI normalizer
  let aiResult;
  try {
    aiResult = await runTenantIntentNormalizer(input.memo);
  } catch (aiErr) {
    await supabase.from("ai_runs").insert({
      user_id: userId,
      run_type: "tenant_intent_normalizer",
      input_ref: {},
      output_ref: {},
      model: process.env.AI_DEFAULT_MODEL || "gpt-4o",
      prompt_version: "prompt_tenant_intent_normalizer_v1",
      status: "failed",
      latency_ms: Date.now() - startTime,
      error: aiErr instanceof Error ? aiErr.message : "Unknown error",
    });

    await recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: "ai_run_failed",
      entityType: "session",
      metadata: { run_type: "tenant_intent_normalizer" },
    });

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;
  const { intent } = aiResult;

  // 2. Create tenant_intent row
  const { data: tenantIntent, error: intentErr } = await supabase
    .from("tenant_intent")
    .insert({
      broker_id: userId,
      client_id: input.clientId || null,
      business_type: intent.businessType,
      preferred_regions: intent.preferredRegions,
      area_min: intent.areaMin,
      area_max: intent.areaMax,
      budget_deposit_max: intent.budgetDepositMax,
      budget_monthly_max: intent.budgetMonthlyMax,
      preferred_floors: intent.preferredFloors,
      move_in_target: intent.moveInTargetText === "즉시입주" ? null : null, // keep simple or soft representation
      must_have: intent.mustHave,
      nice_to_have: intent.niceToHave,
    })
    .select("id")
    .single();

  if (intentErr || !tenantIntent) {
    throw new Error(`Failed to create tenant_intent: ${intentErr?.message}`);
  }

  // 3. Log AI run
  await supabase.from("ai_runs").insert({
    user_id: userId,
    run_type: "tenant_intent_normalizer",
    input_ref: { tenant_intent_id: tenantIntent.id },
    output_ref: { business_type: intent.businessType },
    model: aiResult.model,
    prompt_version: aiResult.promptVersion,
    status: "completed",
    token_usage: { total_tokens: aiResult.usage?.totalTokens ?? 0 },
    latency_ms: latencyMs,
  });

  // 4. Log event
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "buyer_intent_created",
    entityType: "buyer_intent_lite",
    entityId: tenantIntent.id,
    metadata: {
      business_type: intent.businessType,
      preferred_regions: intent.preferredRegions,
    },
  });

  // 5. Trigger matching engine for this tenant intent against all active lease spaces
  try {
    const { runTenantAutoMatcher } = await import("@/domain/matching/lease-auto-matcher");
    await runTenantAutoMatcher(tenantIntent.id, userId);
  } catch (matchErr) {
    console.warn("[tenant-intent] Auto-match failed", matchErr);
  }

  return {
    tenantIntentId: tenantIntent.id,
    summary: {
      businessType: intent.businessType,
      preferredRegions: intent.preferredRegions,
      budgetMonthlyMax: intent.budgetMonthlyMax,
      mustHave: intent.mustHave,
    },
  };
}
