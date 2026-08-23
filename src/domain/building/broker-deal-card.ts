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
import { verifyAgainstPublicData } from "@/domain/verification/public-data-verifier";
import { SupabaseBuildingRepository } from "./building-repository.supabase";
import { geocodeAddress } from "@/domain/verification/address-resolver";
import { getModel } from "@/ai/model-selector";
import { detectDuplicateBuilding, type DedupResult } from "./building-dedup";
import { linkBuildingToCanonicalProperty } from "./canonical-property";
import { extractSlotsFromMemo } from "./memo-slot-mapper";

export interface BrokerDealCardFromMemoInput {
  memo: string;
  visibilityPreference: "blind" | "internal";
  photoUrls?: string[];
  /** 기존 물건 업데이트 시 해당 building ID */
  existingBuildingId?: string;
}

/**
 * 딜카드 생성 전 동일 물건 중복 여부를 사전 검사합니다.
 * AI 파이프라인 실행 전 단계에서 호출하여 불필요한 AI 비용을 방지합니다.
 */
export async function checkDuplicateBeforeCreation(
  memo: string,
  userId: string,
): Promise<DedupResult> {
  const supabase = createServiceClient();
  return detectDuplicateBuilding(supabase, userId, memo);
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
      model: getModel("sol"),
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

  // 1.5. Geocoding & Address Resolution
  const exactAddress = aiResult.parsedMemo.extractedFacts.exactAddressCandidate;
  const addressQuery = exactAddress || aiResult.parsedMemo.extractedFacts.region;
  let coordinates = null;
  if (addressQuery) {
    coordinates = await geocodeAddress(addressQuery);
  }

  // resolvedAddress from AI agent contains PNU from address resolution
  const resolvedAddr = aiResult.resolvedAddress || {};

  const layersData: Record<string, any> = {};
  if (coordinates) layersData.coordinates = coordinates;
  if (addressQuery || exactAddress) {
    layersData.location = {
      address: addressQuery,
      // 정확한 주소 후보 (메모에서 파싱된 원문 그대로)
      raw_address: exactAddress || null,
      // 주소 해석 결과 (PNU, 도로명 등)
      pnu: resolvedAddr.pnu || null,
    };
  }
  // PNU를 top-level에도 저장 (ssot-adapter에서 빠르게 접근)
  if (resolvedAddr.pnu) {
    layersData.pnu = resolvedAddr.pnu;
  }
  if (input.photoUrls && input.photoUrls.length > 0) {
    layersData.photos = input.photoUrls.map((url, i) => ({
      url,
      type: i === 0 ? "exterior" : "interior",
      label: i === 0 ? "건물 외관" : "기타",
    }));
  }

  // 1.6. 원문 메모 및 AI 추출 결과 기반 정밀 재무/물리 데이터 보존
  const memoSlots = extractSlotsFromMemo(input.memo || '');
  const slotMap = new Map(memoSlots.slots.map(s => [s.key, s.value]));

  const exactAskingPriceManwon = buildingTruth.askingPriceManwon
    || (slotMap.get('askingPriceKrw') ? Number(slotMap.get('askingPriceKrw')) / 10000 : null);
  const exactAskingPriceKrw = exactAskingPriceManwon ? exactAskingPriceManwon * 10000 : (Number(slotMap.get('askingPriceKrw')) || null);

  const exactMonthlyRentKrw = Number(slotMap.get('monthlyRentKrw')) || null;
  const exactTotalDepositKrw = Number(slotMap.get('totalDepositKrw')) || null;
  const exactLoanAmountKrw = Number(slotMap.get('loanAmountKrw')) || null;
  const exactLandAreaPyung = Number(slotMap.get('landAreaPyung')) || null;
  const exactFloorAreaPyung = Number(slotMap.get('totalFloorAreaPyung')) || null;

  layersData.finance = {
    asking_price_krw: exactAskingPriceKrw,
    asking_price_manwon: exactAskingPriceManwon,
    monthly_rent_krw: exactMonthlyRentKrw,
    monthly_rent_manwon: exactMonthlyRentKrw ? exactMonthlyRentKrw / 10000 : null,
    total_deposit_krw: exactTotalDepositKrw,
    total_deposit_manwon: exactTotalDepositKrw ? exactTotalDepositKrw / 10000 : null,
    loan_amount_krw: exactLoanAmountKrw,
    loan_amount_manwon: exactLoanAmountKrw ? exactLoanAmountKrw / 10000 : null,
  };

  // lease_summary: 바텀시트 prefill 및 하위 호환성을 위한 다층 바인딩
  // page.tsx가 leaseSum.total_deposit_krw / leaseSum.monthly_rent_krw를 우선 참조하므로
  // finance와 동일한 값을 lease_summary에도 병렬 저장
  layersData.lease_summary = {
    total_deposit_krw: exactTotalDepositKrw,
    total_deposit_manwon: exactTotalDepositKrw ? exactTotalDepositKrw / 10000 : null,
    monthly_rent_krw: exactMonthlyRentKrw,
    monthly_rent_manwon: exactMonthlyRentKrw ? exactMonthlyRentKrw / 10000 : null,
  };

  if (exactLandAreaPyung) layersData.land_area_pyung = exactLandAreaPyung;
  if (exactFloorAreaPyung) layersData.total_floor_area_pyung = exactFloorAreaPyung;

  // 2. Create or update building_ssot_lite (via Repository Pattern)
  const buildingRepo = new SupabaseBuildingRepository(supabase);
  const isUpdate = !!input.existingBuildingId;
  let building: { id: string };

  if (isUpdate) {
    // ── 기존 물건 업데이트 모드 ──
    building = { id: input.existingBuildingId! };
    await buildingRepo.updateBuildingSsotLite(building.id, {
      raw_input: input.memo,
      raw_address: exactAddress || null,
      area_signal: buildingTruth.areaSignal,
      asset_type: buildingTruth.assetType,
      price_band: buildingTruth.priceBand,
      size_signal: buildingTruth.sizeSignal,
      current_use_signal: buildingTruth.currentUseSignal,
      vacancy_signal: buildingTruth.vacancySignal,
      fit_summary: buildingTruth.fitSummary,
      caution_summary: buildingTruth.cautionSummary,
      hidden_fields: buildingTruth.hiddenFields,
      layers: layersData,
      confidence: buildingTruth.confidence as unknown as Record<string, unknown>,
      disclosure: { guard_checked: true },
      status: "public_signal_ready",
    });
  } else {
    // ── 신규 물건 생성 모드 ──
    building = await buildingRepo.createBuildingSsotLite({
      owner_id: userId,
      created_by_role: "broker",
      input_type: "broker_memo",
      raw_input: input.memo,
      raw_address: exactAddress || null,
      area_signal: buildingTruth.areaSignal,
      asset_type: buildingTruth.assetType,
      price_band: buildingTruth.priceBand,
      size_signal: buildingTruth.sizeSignal,
      current_use_signal: buildingTruth.currentUseSignal,
      vacancy_signal: buildingTruth.vacancySignal,
      fit_summary: buildingTruth.fitSummary,
      caution_summary: buildingTruth.cautionSummary,
      hidden_fields: buildingTruth.hiddenFields,
      layers: layersData,
      confidence: buildingTruth.confidence as unknown as Record<string, unknown>,
      disclosure: { guard_checked: true },
      status: "public_signal_ready",
    });
  }

  // 2-b. photo_urls 칼럼 동기화 (IM, 매거진, Vibe 카드 등에서 참조)
  if (input.photoUrls && input.photoUrls.length > 0) {
    await supabase
      .from("building_ssot_lite")
      .update({ photo_urls: input.photoUrls })
      .eq("id", building.id);
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
  await Promise.all([
    recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: "broker_memo_submitted",
      entityType: "building_ssot_lite",
      entityId: building.id,
      metadata: { source: isUpdate ? "broker_deal_card_update" : "broker_deal_card_new" },
    }),
    recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: isUpdate ? "building_ssot_lite_updated" : "building_ssot_lite_created",
      entityType: "building_ssot_lite",
      entityId: building.id,
      metadata: {
        input_type: "broker_memo",
        hidden_fields: buildingTruth.hiddenFields,
      },
    }),
    recordEvent(supabase, {
      actorId: userId,
      actorRole: "broker",
      eventType: "building_signal_card_created",
      entityType: "building_signal_card",
      entityId: signalCard.id,
      metadata: {
        building_id: building.id,
        visibility,
      },
    }),
    recordEvent(supabase, {
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
    }),
  ]);

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

  // 11. 공공데이터 교차검증 (건축물대장 API) — fire-and-forget
  if (buildingTruth.areaSignal || buildingTruth.assetType) {
    verifyAgainstPublicData(
      buildingTruth.areaSignal || "",
      buildingTruth.assetType || "",
      buildingTruth.sizeSignal || "",
    )
      .then(async (verificationResult) => {
        await supabase
          .from("building_ssot_lite")
          .update({
            verification_status: verificationResult.status,
            verification_result: verificationResult as unknown as Record<string, unknown>,
          })
          .eq("id", building.id);
      })
      .catch((verifyErr) => {
        console.warn("[broker-deal-card] Public data verification failed:", verifyErr);
      });
  }

  // 12. P1: Canonical Property 연결 — fire-and-forget
  linkBuildingToCanonicalProperty(supabase, building.id, {
    jibunAddress: addressQuery ?? null,
    coordinates: coordinates ?? null,
  }).catch((cpErr) => {
    console.warn("[broker-deal-card] Canonical property link failed:", cpErr);
  });

  return {
    buildingId: building.id,
    signalCardId: signalCard.id,
    teaserDocId: teaserDoc.id,
    hiddenFields: buildingTruth.hiddenFields,
  };
}
