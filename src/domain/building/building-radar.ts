/**
 * Domain service: building-radar
 *
 * Orchestrates the public "이 건물, 딜 될까?" flow:
 * 1. Create building_ssot_lite
 * 2. Run AI Deal Curiosity Writer
 * 3. Store document_object
 * 4. Log ai_run
 * 5. Log activity_events
 *
 * Source: docs/08-api-contracts.md section 5
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runDealCuriosityWriter } from "@/ai/agents/deal-curiosity-writer";
import { recordEvent } from "@/domain/analytics/record-event";
import type { PublicRadarGenerateReq } from "@/ai/schemas/api-building-radar";
import { resolveAddressToComponents } from "@/domain/verification/address-resolver";
import { fetchBuildingRegister } from "@/domain/verification/govt-api-client";

export interface BuildingRadarGenerateResult {
  buildingId: string;
  reportId: string;
  status: "completed";
}

export async function generateBuildingRadar(
  input: PublicRadarGenerateReq,
  userId?: string,
): Promise<BuildingRadarGenerateResult> {
  const supabase = createServiceClient();
  const startTime = Date.now();

  // 1. Create building_ssot_lite row
  const { data: building, error: buildingErr } = await supabase
    .from("building_ssot_lite")
    .insert({
      owner_id: userId ?? null,
      created_by_role: userId ? "public_user" : "public_user",
      input_type: input.inputType === "manual_text" ? "manual_form" : "address",
      raw_input: input.input,
      hidden_fields: [
        "exact_address",
        "tenant_name",
        "unit_rent",
        "seller_motivation",
      ],
      status: "draft",
    })
    .select("id")
    .single();

  if (buildingErr || !building) {
    throw new Error(`Failed to create building_ssot_lite: ${buildingErr?.message}`);
  }

  // 2. Log address_submitted event
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: userId ? "public_user" : "anonymous",
    eventType: "address_submitted",
    entityType: "building_ssot_lite",
    entityId: building.id,
    metadata: {
      input_type: input.inputType,
      user_purpose: input.userPurpose,
      source_page: "/building-radar",
    },
  });

  // 3. Run AI Deal Curiosity Writer
  let aiResult;
  try {
    aiResult = await runDealCuriosityWriter({
      rawInput: input.input,
      inputType: input.inputType,
      userPurpose: input.userPurpose,
    });
  } catch (aiErr) {
    // Log failed AI run
    await supabase.from("ai_runs").insert({
      user_id: userId ?? null,
      run_type: "deal_curiosity_report",
      input_ref: { building_id: building.id },
      output_ref: {},
      model: process.env.AI_DEFAULT_MODEL || "gpt-5.4",
      prompt_version: "prompt_deal_curiosity_report_v1",
      status: "failed",
      latency_ms: Date.now() - startTime,
      error: aiErr instanceof Error ? aiErr.message : "Unknown AI error",
    });

    await recordEvent(supabase, {
      actorId: userId,
      actorRole: userId ? "public_user" : "anonymous",
      eventType: "ai_run_failed",
      entityType: "building_ssot_lite",
      entityId: building.id,
      metadata: {
        run_type: "deal_curiosity_report",
        prompt_version: "prompt_deal_curiosity_report_v1",
        error_code: "ai_generation_failed",
      },
    });

    throw aiErr;
  }

  const latencyMs = Date.now() - startTime;

  // 4. Update building_ssot_lite with AI-extracted fields
  await supabase
    .from("building_ssot_lite")
    .update({
      area_signal: aiResult.report.dealPoints[0]?.split(" ")[0] || null,
      fit_summary: aiResult.report.oneLineDiagnosis,
      caution_summary: aiResult.report.riskQuestions.join("; "),
      status: "public_signal_ready",
    })
    .eq("id", building.id);

  // 4-b. 공공데이터 보강 — 주소 → 법정동코드 → 건축물대장 조회 (fire-and-forget)
  const addressInput = input.input || aiResult.report.dealPoints?.[0] || "";
  if (addressInput) {
    resolveAddressToComponents(addressInput)
      .then(async (comps) => {
        if (!comps) return;
        const govtInfo = await fetchBuildingRegister(
          comps.sigunguCd,
          comps.bjdongCd,
          comps.bun,
          comps.ji,
        );
        if (!govtInfo.exists) return;

        // 건축물대장 데이터로 building_ssot_lite 보강
        await supabase
          .from("building_ssot_lite")
          .update({
            verification_status: "verified",
            verification_result: {
              govtAddress: govtInfo.address,
              govtPurpose: govtInfo.mainPurpose,
              govtArea: govtInfo.totalFloorArea,
              govtFloors: govtInfo.floors,
              govtBuildYear: govtInfo.buildYear,
              govtStructure: govtInfo.mainStructure,
              govtCoverageRatio: govtInfo.buildingCoverageRatio,
              govtFloorAreaRatio: govtInfo.floorAreaRatio,
            } as unknown as Record<string, unknown>,
          })
          .eq("id", building.id);
      })
      .catch((enrichErr) => {
        console.warn("[building-radar] Public data enrichment failed:", enrichErr);
      });
  }

  // 5. Log successful AI run
  const { data: aiRun } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId ?? null,
      run_type: "deal_curiosity_report",
      input_ref: { building_id: building.id },
      output_ref: { report_keys: Object.keys(aiResult.report) },
      model: aiResult.model,
      prompt_version: aiResult.promptVersion,
      status: "completed",
      token_usage: aiResult.usage ?? {},
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  // 6. Create document_object
  const { data: doc, error: docErr } = await supabase
    .from("document_objects")
    .insert({
      owner_id: userId ?? null,
      source_type: "building_ssot_lite",
      source_id: building.id,
      building_id: building.id,
      document_type: "deal_curiosity_report",
      visibility: "public",
      status: "draft",
      title: aiResult.report.oneLineDiagnosis,
      body: aiResult.report as unknown as Record<string, unknown>,
      markdown: null,
      source_refs: {
        building_ssot_lite_id: building.id,
        ai_run_id: aiRun?.id ?? null,
        prompt_version: aiResult.promptVersion,
      },
      model_version: aiResult.model,
      prompt_version: aiResult.promptVersion,
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    throw new Error(`Failed to create document_object: ${docErr?.message}`);
  }

  // 7. Log building_ssot_lite_created event
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: userId ? "public_user" : "anonymous",
    eventType: "building_ssot_lite_created",
    entityType: "building_ssot_lite",
    entityId: building.id,
    metadata: {
      input_type: input.inputType,
      source: "public_building_radar",
      hidden_fields: [
        "exact_address",
        "tenant_name",
        "unit_rent",
        "seller_motivation",
      ],
    },
  });

  // 8. Log deal_curiosity_report_generated event
  await recordEvent(supabase, {
    actorId: userId,
    actorRole: userId ? "public_user" : "anonymous",
    eventType: "deal_curiosity_report_generated",
    entityType: "document_object",
    entityId: doc.id,
    metadata: {
      building_id: building.id,
      score: aiResult.report.dealCuriosityScore,
      document_type: "deal_curiosity_report",
      prompt_version: aiResult.promptVersion,
    },
  });

  return {
    buildingId: building.id,
    reportId: doc.id,
    status: "completed",
  };
}
