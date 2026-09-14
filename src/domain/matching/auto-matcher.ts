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
    .select("*")
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
    .select("*");

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
        },
      });

      // Persist
      const { data: savedMatch } = await supabase
        .from("match_results")
        .insert({
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
        })
        .select("id")
        .single();

      if (savedMatch) {
        const casePack = extractMatchCasePack({
          buildingId,
          brokerId,
          buildingLabel: `${building.area_signal} ${building.asset_type}`,
          matchGrade: matchResult.grade,
          matchScore: matchResult.score,
          reasoning: matchResult.reasoning,
          purposeProfile: matchResult.purposeWeightProfile,
        });
        await supabase.from("deal_casepacks").insert(casePack);

        if (matchResult.grade === 'S' || matchResult.grade === 'A') {
          await supabase.from("activity_events").insert({
            actor_id: brokerId,
            actor_role: 'system',
            event_type: 'deal_card.matched',
            entity_type: 'match_result',
            entity_id: savedMatch.id,
            metadata: {
              building_id: buildingId,
              buyer_intent_id: intent.id,
              grade: matchResult.grade,
              score: matchResult.score,
              reasoning: matchResult.reasoning?.slice(0, 200),
            },
          });
        }
      }
    } catch (e) {
      log.warn(`[auto-match] Failed for intent ${intent.id}`, e);
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
    .select("*")
    .eq("id", buyerIntentId)
    .single();

  if (!intent) return;

  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("*");

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
        },
      });

      const { data: savedMatch } = await supabase
        .from("match_results")
        .insert({
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
        })
        .select("id")
        .single();

      if (savedMatch) {
        const casePack = extractMatchCasePack({
          buildingId: building.id,
          brokerId,
          buildingLabel: `${building.area_signal} ${building.asset_type}`,
          matchGrade: matchResult.grade,
          matchScore: matchResult.score,
          reasoning: matchResult.reasoning,
          purposeProfile: matchResult.purposeWeightProfile,
        });
        await supabase.from("deal_casepacks").insert(casePack);

        if (matchResult.grade === 'S' || matchResult.grade === 'A') {
          await supabase.from("activity_events").insert({
            actor_id: brokerId,
            actor_role: 'system',
            event_type: 'deal_card.matched',
            entity_type: 'match_result',
            entity_id: savedMatch.id,
            metadata: {
              building_id: building.id,
              buyer_intent_id: intent.id,
              grade: matchResult.grade,
              score: matchResult.score,
              reasoning: matchResult.reasoning?.slice(0, 200),
            },
          });
        }
      }
    } catch (e) {
      log.warn(`[auto-match] Failed for building ${building.id}`, e);
    }
  }
}

