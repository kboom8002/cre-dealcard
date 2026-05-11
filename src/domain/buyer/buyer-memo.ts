/**
 * Domain service: buyer memo
 *
 * Orchestrates: Building SSoT Lite + Buyer Intent Lite → BuyerMemoWriterAgent → document_object
 * Logs: ai_run, activity_event
 *
 * Source: docs/08-api-contracts.md section 10
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runBuyerMemoWriter } from "@/ai/agents/buyer-memo-writer";
import { recordEvent } from "@/domain/analytics/record-event";

export interface GenerateBuyerMemoInput {
  buildingId: string;
  buyerIntentId: string;
  tone?: "kakao" | "professional" | "brief";
}

export interface GenerateBuyerMemoResult {
  documentId: string;
  fitReasons: string[];
  cautionReasons: string[];
  missingData: string[];
  recommendedNextAction: string;
  kakaoMessage: string;
}

export async function generateBuyerMemo(
  input: GenerateBuyerMemoInput,
  userId: string,
): Promise<GenerateBuyerMemoResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Fetch building_ssot_lite
  const { data: building, error: buildingErr } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, current_use_signal, vacancy_signal, fit_summary, caution_summary",
    )
    .eq("id", input.buildingId)
    .single();

  if (buildingErr || !building) {
    throw new Error(`Building not found: ${buildingErr?.message}`);
  }

  // 2. Fetch buyer_intent_lite
  const { data: intent, error: intentErr } = await supabase
    .from("buyer_intent_lite")
    .select(
      "id, buyer_type, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance, financing_note",
    )
    .eq("id", input.buyerIntentId)
    .single();

  if (intentErr || !intent) {
    throw new Error(`Buyer intent not found: ${intentErr?.message}`);
  }

  // 3. Run AI Buyer Memo Writer
  let aiResult;
  try {
    aiResult = await runBuyerMemoWriter({
      building: {
        areaSignal: building.area_signal,
        assetType: building.asset_type,
        priceBand: building.price_band,
        currentUseSignal: building.current_use_signal,
        vacancySignal: building.vacancy_signal,
        fitSummary: building.fit_summary,
        cautionSummary: building.caution_summary,
      },
      buyerIntent: {
        buyerType: intent.buyer_type || "",
        budgetDisplay: intent.budget_display || "",
        preferredRegions: (intent.preferred_regions as string[]) || [],
        assetTypes: (intent.asset_types as string[]) || [],
        purchasePurpose: intent.purchase_purpose || "",
        mustHave: (intent.must_have as string[]) || [],
        niceToHave: (intent.nice_to_have as string[]) || [],
        riskTolerance: intent.risk_tolerance || "unknown",
        financingNote: intent.financing_note,
      },
      tone: input.tone || "kakao",
    });
  } catch (aiErr) {
    await supabase.from("ai_runs").insert({
      user_id: userId,
      run_type: "buyer_memo_writer",
      input_ref: {
        building_id: input.buildingId,
        buyer_intent_id: input.buyerIntentId,
      },
      output_ref: {},
      model: process.env.AI_DEFAULT_MODEL || "gpt-4o",
      prompt_version: "prompt_buyer_memo_v1",
      status: "failed",
      latency_ms: Date.now() - startTime,
      error: aiErr instanceof Error ? aiErr.message : "Unknown error",
    });

    await recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: "ai_run_failed",
      entityType: "session",
      metadata: { run_type: "buyer_memo_writer" },
    });

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;
  const { memo } = aiResult;

  // 4. Log AI run
  const { data: aiRun } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      run_type: "buyer_memo_writer",
      input_ref: {
        building_id: input.buildingId,
        buyer_intent_id: input.buyerIntentId,
      },
      output_ref: { fit_count: memo.fitReasons.length },
      model: aiResult.model,
      prompt_version: aiResult.promptVersion,
      status: "completed",
      token_usage: { total_tokens: aiResult.usage?.totalTokens ?? 0 },
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  // 5. Create document_object
  const { data: doc, error: docErr } = await supabase
    .from("document_objects")
    .insert({
      owner_id: userId,
      source_type: "buyer_intent_lite",
      source_id: input.buyerIntentId,
      building_id: input.buildingId,
      document_type: "buyer_fit_memo",
      visibility: "internal_only",
      status: "draft",
      title: `매수자 메모 — ${building.area_signal || "건물"} × ${intent.budget_display || "매수자"}`,
      body: memo as unknown as Record<string, unknown>,
      markdown: memo.kakaoMessage,
      source_refs: {
        building_ssot_lite_id: input.buildingId,
        buyer_intent_lite_id: input.buyerIntentId,
        ai_run_id: aiRun?.id ?? null,
        prompt_version: aiResult.promptVersion,
      },
      model_version: aiResult.model,
      prompt_version: aiResult.promptVersion,
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    throw new Error(`Failed to create document: ${docErr?.message}`);
  }

  // 6. Log event
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "buyer_memo_generated",
    entityType: "document_object",
    entityId: doc.id,
    metadata: {
      building_id: input.buildingId,
      buyer_intent_id: input.buyerIntentId,
      document_type: "buyer_fit_memo",
    },
  });

  return {
    documentId: doc.id,
    fitReasons: memo.fitReasons,
    cautionReasons: memo.cautionReasons,
    missingData: memo.missingData,
    recommendedNextAction: memo.recommendedNextAction,
    kakaoMessage: memo.kakaoMessage,
  };
}
