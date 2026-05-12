/**
 * Domain service: buyer intent
 *
 * Orchestrates: buyer memo → BuyerIntentNormalizerAgent → buyer_intent_lite
 * Logs: ai_run, activity_event
 *
 * Source: docs/08-api-contracts.md section 9
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runBuyerIntentNormalizer } from "@/ai/agents/buyer-intent-normalizer";
import { recordEvent } from "@/domain/analytics/record-event";

export interface CreateBuyerIntentInput {
  memo: string;
}

export interface CreateBuyerIntentResult {
  buyerIntentId: string;
  summary: {
    budgetDisplay: string | null;
    preferredRegions: string[];
    purchasePurpose: string | null;
    mustHave: string[];
  };
}

export async function createBuyerIntentFromMemo(
  input: CreateBuyerIntentInput,
  userId: string | null,
): Promise<CreateBuyerIntentResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Run AI normalizer
  let aiResult;
  try {
    aiResult = await runBuyerIntentNormalizer(input.memo);
  } catch (aiErr) {
    // Only log ai_run if userId is not null (FK constraint)
    if (userId) {
      await supabase.from("ai_runs").insert({
        user_id: userId,
        run_type: "buyer_intent_normalizer",
        input_ref: {},
        output_ref: {},
        model: process.env.AI_DEFAULT_MODEL || "gpt-4o",
        prompt_version: "prompt_buyer_intent_normalizer_v1",
        status: "failed",
        latency_ms: Date.now() - startTime,
        error: aiErr instanceof Error ? aiErr.message : "Unknown error",
      });

      await recordEvent(supabase, {
        actorId: userId,
        actorRole: "broker",
        eventType: "ai_run_failed",
        entityType: "session",
        metadata: { run_type: "buyer_intent_normalizer" },
      });
    }

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;
  const { intent } = aiResult;

  // 2. Create buyer_intent_lite row (owner_id allows null)
  const { data: buyerIntent, error: intentErr } = await supabase
    .from("buyer_intent_lite")
    .insert({
      owner_id: userId ?? null,
      raw_input: input.memo,
      buyer_type: intent.buyerType,
      budget_min: intent.budgetRange.min,
      budget_max: intent.budgetRange.max,
      budget_display: intent.budgetRange.display,
      preferred_regions: intent.preferredRegions,
      asset_types: intent.assetTypes,
      purchase_purpose: intent.purchasePurpose,
      must_have: intent.mustHave,
      nice_to_have: intent.niceToHave,
      risk_tolerance: intent.riskTolerance,
      financing_note: intent.financingNote,
      visibility: "anonymous_matchable",
      normalized: {
        missingQuestions: intent.missingQuestions,
        privacyNotes: Array.isArray(intent.privacyNotes)
          ? intent.privacyNotes
          : typeof intent.privacyNotes === "string"
            ? [intent.privacyNotes]
            : [],
      },
    })
    .select("id")
    .single();

  if (intentErr || !buyerIntent) {
    throw new Error(`Failed to create buyer_intent_lite: ${intentErr?.message}`);
  }

  // 3. Log AI run (only if authenticated user)
  if (userId) {
    await supabase.from("ai_runs").insert({
      user_id: userId,
      run_type: "buyer_intent_normalizer",
      input_ref: { buyer_intent_id: buyerIntent.id },
      output_ref: { buyer_type: intent.buyerType },
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
      entityId: buyerIntent.id,
      metadata: {
        budget_display: intent.budgetRange.display,
        preferred_regions: intent.preferredRegions,
      },
    });
  }

  // 5. Auto-match with existing buildings
  try {
    const { runAutoMatchForBuyer } = await import("@/domain/matching/auto-matcher");
    await runAutoMatchForBuyer(buyerIntent.id, userId ?? "system");
  } catch (autoMatchErr) {
    console.warn("[buyer-intent] Auto-match failed", autoMatchErr);
  }

  return {
    buyerIntentId: buyerIntent.id,
    summary: {
      budgetDisplay: intent.budgetRange.display,
      preferredRegions: intent.preferredRegions,
      purchasePurpose: intent.purchasePurpose,
      mustHave: intent.mustHave,
    },
  };
}
