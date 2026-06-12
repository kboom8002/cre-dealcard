/**
 * Domain service: broker lease card
 * Orchestrates: lease memo → LeaseMemoParser → LeaseMiniTruth → LeaseBlindTeaser
 * Persists: lease_spaces, document_objects (blind_teaser)
 * Logs: ai_run, activity_events
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runLeaseBrokerDealCard } from "@/ai/agents/lease-deal-card";
import { recordEvent } from "@/domain/analytics/record-event";

export interface BrokerLeaseCardFromMemoInput {
  memo: string;
}

export interface BrokerLeaseCardFromMemoResult {
  leaseSpaceId: string;
  teaserDocId: string;
  hiddenFields: string[];
}

export async function brokerLeaseCardFromMemo(
  input: BrokerLeaseCardFromMemoInput,
  userId: string,
): Promise<BrokerLeaseCardFromMemoResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Run chained AI pipeline
  let aiResult;
  try {
    aiResult = await runLeaseBrokerDealCard({
      memo: input.memo,
    });
  } catch (aiErr) {
    // Log failed AI run
    await supabase.from("ai_runs").insert({
      user_id: userId,
      run_type: "broker_lease_card",
      input_ref: {},
      output_ref: {},
      model: process.env.AI_DEFAULT_MODEL || "gpt-5.4",
      prompt_version: "prompt_lease_memo_parser_v1",
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
        run_type: "broker_lease_card",
        error_code: "ai_generation_failed",
      },
    });

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;
  const { leaseTruth, blindTeaser } = aiResult;

  // 2. Create lease_spaces
  const { data: space, error: spaceErr } = await supabase
    .from("lease_spaces")
    .insert({
      broker_id: userId,
      deal_type: "lease",
      floor: leaseTruth.floor,
      area_sqm: leaseTruth.areaSqm,
      space_type: leaseTruth.spaceType,
      deposit: leaseTruth.deposit,
      monthly_rent: leaseTruth.monthlyRent,
      maintenance_fee: leaseTruth.maintenanceFee,
      available_from: leaseTruth.availableFrom === "즉시입주" ? null : (leaseTruth.availableFrom || null),
      lease_term_months: leaseTruth.leaseTermMonths,
      incentives: leaseTruth.incentives as unknown as Record<string, unknown>,
      restrictions: leaseTruth.restrictions,
      status: "active",
      is_marketplace_listed: false,
      hidden_fields: leaseTruth.hiddenFields,
    })
    .select("id")
    .single();

  if (spaceErr || !space) {
    throw new Error(`Failed to create lease_space: ${spaceErr?.message}`);
  }

  // 3. Log AI run
  const { data: aiRun } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      run_type: "broker_lease_card",
      input_ref: { lease_space_id: space.id },
      output_ref: {
        lease_space_id: space.id,
        hidden_fields: leaseTruth.hiddenFields,
      },
      model: aiResult.model,
      prompt_version: `${aiResult.promptVersions.memoParser}+${aiResult.promptVersions.leaseMiniTruth}+${aiResult.promptVersions.blindTeaser}`,
      status: "completed",
      token_usage: { total_tokens: aiResult.usage.totalTokens },
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  // 4. Create blind_teaser document_object
  const { data: teaserDoc, error: teaserErr } = await supabase
    .from("document_objects")
    .insert({
      owner_id: userId,
      source_type: "manual", // using manual or separate check type
      source_id: space.id,
      document_type: "blind_teaser",
      visibility: "public_blind",
      status: "draft",
      title: blindTeaser.title,
      body: blindTeaser as unknown as Record<string, unknown>,
      markdown: blindTeaser.kakaoText,
      source_refs: {
        lease_space_id: space.id,
        ai_run_id: aiRun?.id ?? null,
        prompt_versions: aiResult.promptVersions,
        // lease metadata for UI parsing
        region: leaseTruth.region,
        floor: leaseTruth.floor,
        area_sqm: leaseTruth.areaSqm,
        space_type: leaseTruth.spaceType,
        deposit: leaseTruth.deposit,
        monthly_rent: leaseTruth.monthlyRent,
        maintenance_fee: leaseTruth.maintenanceFee,
        fit_summary: leaseTruth.fitSummary,
        caution_summary: leaseTruth.cautionSummary,
      },
      model_version: aiResult.model,
      prompt_version: aiResult.promptVersions.blindTeaser,
    })
    .select("id")
    .single();

  if (teaserErr || !teaserDoc) {
    throw new Error(`Failed to create lease teaser doc: ${teaserErr?.message}`);
  }

  // 5. Log activity events
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "broker_memo_submitted",
    entityType: "building_ssot_lite",
    entityId: space.id,
    metadata: { source: "broker_lease_card_new" },
  });

  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "building_ssot_lite_created",
    entityType: "building_ssot_lite",
    entityId: space.id,
    metadata: {
      hidden_fields: leaseTruth.hiddenFields,
      space_type: leaseTruth.spaceType,
    },
  });

  await recordEvent(supabase, {
    actorId: userId,
    actorRole: "broker",
    eventType: "blind_teaser_generated",
    entityType: "document_object",
    entityId: teaserDoc.id,
    metadata: {
      lease_space_id: space.id,
      document_type: "blind_teaser",
      prompt_version: aiResult.promptVersions.blindTeaser,
    },
  });

  // 6. Run initial auto-matching for this lease space
  try {
    const { runLeaseAutoMatcher } = await import("@/domain/matching/lease-auto-matcher");
    await runLeaseAutoMatcher(space.id, userId);
  } catch (matchErr) {
    console.warn("[broker-lease-card] Auto-match failed", matchErr);
  }

  return {
    leaseSpaceId: space.id,
    teaserDocId: teaserDoc.id,
    hiddenFields: leaseTruth.hiddenFields,
  };
}
