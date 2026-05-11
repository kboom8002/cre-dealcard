/**
 * Domain service: broker deal card
 *
 * Orchestrates: memo → MemoParser → BuildingMiniTruth → BlindTeaser
 * Persists: building_ssot_lite, building_signal_card, document_object (blind_teaser)
 * Logs: ai_run, 4 activity_events
 *
 * Source: docs/08-api-contracts.md section 7
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runBrokerDealCard } from "@/ai/agents/broker-deal-card";
import { recordEvent } from "@/domain/analytics/record-event";
import { extractDealCardCasePack } from "@/domain/casepack/casepack-extractor";
import { computePromotionScore } from "@/domain/promotion/promotion-ranker";

export interface BrokerDealCardFromMemoInput {
  memo: string;
  visibilityPreference: "blind" | "internal";
}

export interface BrokerDealCardFromMemoResult {
  buildingId: string;
  signalCardId: string;
  teaserDocId: string;
  hiddenFields: string[];
}

export async function brokerDealCardFromMemo(
  input: BrokerDealCardFromMemoInput,
  userId: string,
): Promise<BrokerDealCardFromMemoResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Run chained AI pipeline
  let aiResult;
  try {
    aiResult = await runBrokerDealCard({
      memo: input.memo,
      visibilityPreference: input.visibilityPreference,
    });
  } catch (aiErr) {
    // Log failed AI run
    await supabase.from("ai_runs").insert({
      user_id: userId,
      run_type: "broker_deal_card",
      input_ref: {},
      output_ref: {},
      model: process.env.AI_DEFAULT_MODEL || "gpt-4o",
      prompt_version: "prompt_memo_parser_v1",
      status: "failed",
      latency_ms: Date.now() - startTime,
      error: aiErr instanceof Error ? aiErr.message : "Unknown error",
    });

    await recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: "ai_run_failed",
      entityType: "session",
      metadata: {
        run_type: "broker_deal_card",
        error_code: "ai_generation_failed",
      },
    });

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;
  const { buildingTruth, blindTeaser } = aiResult;

  // 2. Create building_ssot_lite
  const { data: building, error: buildingErr } = await supabase
    .from("building_ssot_lite")
    .insert({
      owner_id: userId,
      created_by_role: "broker",
      input_type: "broker_memo",
      raw_input: input.memo,
      area_signal: buildingTruth.areaSignal,
      asset_type: buildingTruth.assetType,
      price_band: buildingTruth.priceBand,
      size_signal: buildingTruth.sizeSignal,
      current_use_signal: buildingTruth.currentUseSignal,
      vacancy_signal: buildingTruth.vacancySignal,
      fit_summary: buildingTruth.fitSummary,
      caution_summary: buildingTruth.cautionSummary,
      hidden_fields: buildingTruth.hiddenFields,
      layers: {},
      confidence: buildingTruth.confidence as unknown as Record<string, unknown>,
      disclosure: { guard_checked: true },
      status: "public_signal_ready",
    })
    .select("id")
    .single();

  if (buildingErr || !building) {
    throw new Error(`Failed to create building_ssot_lite: ${buildingErr?.message}`);
  }

  // 3. Create building_signal_card
  const visibility =
    input.visibilityPreference === "internal" ? "internal_only" : "public_blind";

  const { data: signalCard, error: signalErr } = await supabase
    .from("building_signal_cards")
    .insert({
      building_id: building.id,
      owner_id: userId,
      title: blindTeaser.title,
      area_signal: buildingTruth.areaSignal,
      asset_type: buildingTruth.assetType,
      price_band: buildingTruth.priceBand,
      deal_points: blindTeaser.dealPoints,
      caution_points: blindTeaser.cautionPoints,
      buyer_fit_types: [],
      visibility,
      status: "draft",
      body: blindTeaser as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (signalErr || !signalCard) {
    throw new Error(`Failed to create signal card: ${signalErr?.message}`);
  }

  // 4. Log AI run
  const { data: aiRun } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      run_type: "broker_deal_card",
      input_ref: { building_id: building.id },
      output_ref: {
        signal_card_id: signalCard.id,
        hidden_fields: buildingTruth.hiddenFields,
      },
      model: aiResult.model,
      prompt_version: `${aiResult.promptVersions.memoParser}+${aiResult.promptVersions.buildingMiniTruth}+${aiResult.promptVersions.blindTeaser}`,
      status: "completed",
      token_usage: { total_tokens: aiResult.usage.totalTokens },
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  // 5. Create blind_teaser document_object
  const { data: teaserDoc, error: teaserErr } = await supabase
    .from("document_objects")
    .insert({
      owner_id: userId,
      source_type: "building_ssot_lite",
      source_id: building.id,
      building_id: building.id,
      document_type: "blind_teaser",
      visibility,
      status: "draft",
      title: blindTeaser.title,
      body: blindTeaser as unknown as Record<string, unknown>,
      markdown: blindTeaser.kakaoText,
      source_refs: {
        building_ssot_lite_id: building.id,
        signal_card_id: signalCard.id,
        ai_run_id: aiRun?.id ?? null,
        prompt_versions: aiResult.promptVersions,
      },
      model_version: aiResult.model,
      prompt_version: aiResult.promptVersions.blindTeaser,
    })
    .select("id")
    .single();

  if (teaserErr || !teaserDoc) {
    throw new Error(`Failed to create teaser doc: ${teaserErr?.message}`);
  }

  // 6. Log activity events
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "broker_memo_submitted",
    entityType: "building_ssot_lite",
    entityId: building.id,
    metadata: { source: "broker_deal_card_new" },
  });

  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "building_ssot_lite_created",
    entityType: "building_ssot_lite",
    entityId: building.id,
    metadata: {
      input_type: "broker_memo",
      hidden_fields: buildingTruth.hiddenFields,
    },
  });

  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "building_signal_card_created",
    entityType: "building_signal_card",
    entityId: signalCard.id,
    metadata: {
      building_id: building.id,
      visibility,
    },
  });

  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "blind_teaser_generated",
    entityType: "document_object",
    entityId: teaserDoc.id,
    metadata: {
      building_id: building.id,
      signal_card_id: signalCard.id,
      document_type: "blind_teaser",
      prompt_version: aiResult.promptVersions.blindTeaser,
    },
  });

  // 7. CasePack extraction (Phase 2 ④)
  try {
    const casePack = extractDealCardCasePack(aiResult, building.id, userId);
    await supabase.from("deal_casepacks").insert(casePack);
  } catch (cpErr) {
    console.warn("[broker-deal-card] CasePack extraction failed", cpErr);
  }

  // 8. Initialize deal pipeline (Phase 2 ⑤)
  try {
    await supabase.from("deal_pipeline_states").insert({
      building_ssot_lite_id: building.id,
      broker_id: userId,
      stage: "deal_card_created",
      metadata: {
        building_ssot_lite_id: building.id,
        signal_card_id: signalCard.id,
      },
    });
  } catch (pipeErr) {
    console.warn("[broker-deal-card] Pipeline init failed", pipeErr);
  }

  // 9. Initial promotion score (Phase 1 ③)
  try {
    const promoResult = computePromotionScore({
      dealCuriosityScore: 50, // no curiosity score yet at creation time
      matchedBuyerCount: 0,
      inquiryCount: 0,
      vacancyDemandVerified: false,
      createdAt: new Date().toISOString(),
    });
    await supabase
      .from("building_ssot_lite")
      .update({
        promotion_score: promoResult.score,
        promotion_updated_at: new Date().toISOString(),
      })
      .eq("id", building.id);
  } catch (promoErr) {
    console.warn("[broker-deal-card] Promotion score init failed", promoErr);
  }

  return {
    buildingId: building.id,
    signalCardId: signalCard.id,
    teaserDocId: teaserDoc.id,
    hiddenFields: buildingTruth.hiddenFields,
  };
}
