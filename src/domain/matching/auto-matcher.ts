import { createServiceClient } from "@/lib/supabase/service";
import { runMatchingEngine } from "@/domain/matching/matching-engine";
import { extractMatchCasePack } from "@/domain/casepack/casepack-extractor";
import { computePromotionScore } from "@/domain/promotion/promotion-ranker";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('auto-matcher');


export async function runAutoMatch(buildingId: string, brokerId: string) {
  const supabase = createServiceClient();

  // 1. Fetch building
  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, vacancy_signal, fit_summary, caution_summary, vacancy_inquiry_count, vacancy_demand_verified, created_at")
    .eq("id", buildingId)
    .single();

  if (!building) return;

  // 2. Fetch curiosity score
  const { data: cardRow } = await supabase
    .from("building_signal_cards")
    .select("deal_curiosity_score")
    .eq("building_ssot_lite_id", buildingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dealCuriosityScore = cardRow?.deal_curiosity_score ?? 50;

  // 3. Fetch all buyer intents
  const { data: intents } = await supabase
    .from("buyer_intent_lite")
    .select("id, owner_id, buyer_type, budget_min, budget_max, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance, normalized, source");

  if (!intents || intents.length === 0) return;

  // 4. Run matching for each intent
  // P2-04 Batch Query Fix
  const intentIds = intents.map(i => i.id);
  const { data: existingMatches } = await supabase
    .from("match_results")
    .select("buyer_intent_lite_id")
    .eq("building_ssot_lite_id", buildingId)
    .in("buyer_intent_lite_id", intentIds);
  const existingMatchedIntentIds = new Set((existingMatches || []).map(m => m.buyer_intent_lite_id));

  const pendingMatches: Array<{
    payload: any;
    intentId: string;
  }> = [];

  for (const intent of intents) {
    if (existingMatchedIntentIds.has(intent.id)) continue;

    try {
      const matchResult = await runMatchingEngine({
        buildingSsotLiteId: buildingId,
        buyerIntentLiteId: intent.id,
        brokerId: intent.owner_id || brokerId,
        building: {
          areaSignal: building.area_signal,
          assetType: building.asset_type,
          priceBand: building.price_band,
          vacancySignal: building.vacancy_signal,
          fitSummary: building.fit_summary,
          cautionSummary: building.caution_summary,
          dealCuriosityScore,
        },
        intent: {
          buyerType: intent.buyer_type,
          budgetRange: {
            min: intent.budget_min,
            max: intent.budget_max,
            display: intent.budget_display,
          },
          preferredRegions: intent.preferred_regions,
          assetTypes: intent.asset_types,
          purchasePurpose: intent.purchase_purpose,
          mustHave: intent.must_have,
          niceToHave: intent.nice_to_have,
          riskTolerance: intent.risk_tolerance,
          inferredPurpose: intent.normalized?.inferred_purpose || "unknown",
          recommendedWeightProfile: intent.normalized?.recommended_weight_profile || "balanced",
          buyerTemperatureScore: (intent as any).normalized?.buyer_temperature_score ?? (intent.source === 'magazine_auto_intent' ? 85 : undefined),
        },
      });

      pendingMatches.push({
        intentId: intent.id,
        payload: {
          building_ssot_lite_id: buildingId,
          buyer_intent_lite_id: intent.id,
          broker_id: brokerId,
          grade: matchResult.grade,
          score: matchResult.score,
          stage1_passed: matchResult.stage1Passed,
          stage1_details: matchResult.stage1Details ?? {},
          stage2_similarity: matchResult.stage2Similarity,
          stage3_score: matchResult.stage3Score,
          stage3_weights: matchResult.stage3Weights ?? {},
          reasoning: matchResult.reasoning,
          purpose_weight_profile: matchResult.purposeWeightProfile,
        },
      });
    } catch (e) {
      log.warn(`[auto-match] Failed for intent ${intent.id}`, e);
    }
  }

  if (pendingMatches.length > 0) {
    const { data: savedMatches, error: matchErr } = await supabase
      .from("match_results")
      .insert(pendingMatches.map(p => p.payload))
      .select("id, buyer_intent_lite_id, grade, score, reasoning, purpose_weight_profile");

    if (matchErr) {
      log.error("[auto-match] Bulk insert match_results failed:", matchErr);
    } else if (savedMatches) {
      const casePacks = savedMatches.map(saved =>
        extractMatchCasePack({
          buildingId,
          brokerId,
          buildingLabel: `${building.area_signal} ${building.asset_type}`,
          matchGrade: saved.grade,
          matchScore: saved.score,
          reasoning: saved.reasoning,
          purposeProfile: saved.purpose_weight_profile,
        })
      );

      const activityEvents = savedMatches
        .filter(saved => saved.grade === 'S' || saved.grade === 'A')
        .map(saved => ({
          actor_id: brokerId,
          actor_role: 'system',
          event_type: 'deal_card.matched',
          entity_type: 'match_result',
          entity_id: saved.id,
          metadata: {
            building_id: buildingId,
            buyer_intent_id: saved.buyer_intent_lite_id,
            grade: saved.grade,
            score: saved.score,
            reasoning: saved.reasoning?.slice(0, 200),
          },
        }));

      if (casePacks.length > 0) {
        const { error: cpErr } = await supabase.from("deal_casepacks").insert(casePacks);
        if (cpErr) log.error("[auto-match] Bulk insert deal_casepacks failed:", cpErr);
      }
      if (activityEvents.length > 0) {
        const { error: actErr } = await supabase.from("activity_events").insert(activityEvents);
        if (actErr) log.error("[auto-match] Bulk insert activity_events failed:", actErr);
      }
    }
  }

  // 5. Update matched_buyer_count
  const { count: matchedCount } = await supabase
    .from("match_results")
    .select("id", { count: "exact", head: true })
    .eq("building_ssot_lite_id", buildingId)
    .in("grade", ["S", "A"]);

  const promoResult = computePromotionScore({
    dealCuriosityScore,
    matchedBuyerCount: matchedCount ?? 0,
    inquiryCount: building.vacancy_inquiry_count ?? 0,
    vacancyDemandVerified: building.vacancy_demand_verified ?? false,
    createdAt: building.created_at,
  });

  await supabase
    .from("building_ssot_lite")
    .update({
      promotion_score: promoResult.score,
      promotion_updated_at: new Date().toISOString(),
    })
    .eq("id", buildingId);
}

export async function runAutoMatchForBuyer(buyerIntentId: string, brokerId: string) {
  const supabase = createServiceClient();

  const { data: intent } = await supabase
    .from("buyer_intent_lite")
    .select("id, owner_id, buyer_type, budget_min, budget_max, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance, normalized, source")
    .eq("id", buyerIntentId)
    .single();

  if (!intent) return;

  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, vacancy_signal, fit_summary, caution_summary");

  if (!buildings || buildings.length === 0) return;

  // P2-04 Batch Query Fix
  const buildingIds = buildings.map(b => b.id);
  const [{ data: existingMatches }, { data: cards }] = await Promise.all([
    supabase.from("match_results").select("building_ssot_lite_id").eq("buyer_intent_lite_id", intent.id).in("building_ssot_lite_id", buildingIds),
    supabase.from("building_signal_cards").select("building_ssot_lite_id, deal_curiosity_score").in("building_ssot_lite_id", buildingIds).order("created_at", { ascending: false })
  ]);
  
  const existingMatchedBuildingIds = new Set((existingMatches || []).map(m => m.building_ssot_lite_id));
  const cardMap = new Map();
  if (cards) {
    for (const card of cards.reverse()) {
      cardMap.set(card.building_ssot_lite_id, card);
    }
  }

  const pendingMatches: Array<{
    payload: any;
    buildingId: string;
  }> = [];

  for (const building of buildings) {
    if (existingMatchedBuildingIds.has(building.id)) continue;

    const cardRow = cardMap.get(building.id);

    const dealCuriosityScore = cardRow?.deal_curiosity_score ?? 50;

    try {
      const matchResult = await runMatchingEngine({
        buildingSsotLiteId: building.id,
        buyerIntentLiteId: intent.id,
        brokerId: intent.owner_id || brokerId,
        building: {
          areaSignal: building.area_signal,
          assetType: building.asset_type,
          priceBand: building.price_band,
          vacancySignal: building.vacancy_signal,
          fitSummary: building.fit_summary,
          cautionSummary: building.caution_summary,
          dealCuriosityScore,
        },
        intent: {
          buyerType: intent.buyer_type,
          budgetRange: {
            min: intent.budget_min,
            max: intent.budget_max,
            display: intent.budget_display,
          },
          preferredRegions: intent.preferred_regions,
          assetTypes: intent.asset_types,
          purchasePurpose: intent.purchase_purpose,
          mustHave: intent.must_have,
          niceToHave: intent.nice_to_have,
          riskTolerance: intent.risk_tolerance,
          inferredPurpose: intent.normalized?.inferred_purpose || "unknown",
          recommendedWeightProfile: intent.normalized?.recommended_weight_profile || "balanced",
          buyerTemperatureScore: (intent as any).normalized?.buyer_temperature_score ?? (intent.source === 'magazine_auto_intent' ? 85 : undefined),
        },
      });

      pendingMatches.push({
        buildingId: building.id,
        payload: {
          building_ssot_lite_id: building.id,
          buyer_intent_lite_id: intent.id,
          broker_id: brokerId,
          grade: matchResult.grade,
          score: matchResult.score,
          stage1_passed: matchResult.stage1Passed,
          stage1_details: matchResult.stage1Details ?? {},
          stage2_similarity: matchResult.stage2Similarity,
          stage3_score: matchResult.stage3Score,
          stage3_weights: matchResult.stage3Weights ?? {},
          reasoning: matchResult.reasoning,
          purpose_weight_profile: matchResult.purposeWeightProfile,
        },
      });
    } catch (e) {
      log.warn(`[auto-match] Failed for building ${building.id}`, e);
    }
  }

  if (pendingMatches.length > 0) {
    const { data: savedMatches, error: matchErr } = await supabase
      .from("match_results")
      .insert(pendingMatches.map(p => p.payload))
      .select("id, building_ssot_lite_id, grade, score, reasoning, purpose_weight_profile");

    if (matchErr) {
      log.error("[auto-match] Bulk insert match_results failed:", matchErr);
    } else if (savedMatches) {
      const buildingMap = new Map(buildings.map(b => [b.id, b]));

      const casePacks = savedMatches.map(saved => {
        const b = buildingMap.get(saved.building_ssot_lite_id);
        const buildingLabel = b ? `${b.area_signal} ${b.asset_type}` : "상업용 빌딩";
        return extractMatchCasePack({
          buildingId: saved.building_ssot_lite_id,
          brokerId,
          buildingLabel,
          matchGrade: saved.grade,
          matchScore: saved.score,
          reasoning: saved.reasoning,
          purposeProfile: saved.purpose_weight_profile,
        });
      });

      const activityEvents = savedMatches
        .filter(saved => saved.grade === 'S' || saved.grade === 'A')
        .map(saved => ({
          actor_id: brokerId,
          actor_role: 'system',
          event_type: 'deal_card.matched',
          entity_type: 'match_result',
          entity_id: saved.id,
          metadata: {
            building_id: saved.building_ssot_lite_id,
            buyer_intent_id: intent.id,
            grade: saved.grade,
            score: saved.score,
            reasoning: saved.reasoning?.slice(0, 200),
          },
        }));

      if (casePacks.length > 0) {
        const { error: cpErr } = await supabase.from("deal_casepacks").insert(casePacks);
        if (cpErr) log.error("[auto-match] Bulk insert deal_casepacks failed:", cpErr);
      }
      if (activityEvents.length > 0) {
        const { error: actErr } = await supabase.from("activity_events").insert(activityEvents);
        if (actErr) log.error("[auto-match] Bulk insert activity_events failed:", actErr);
      }
    }
  }
}

