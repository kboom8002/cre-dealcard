"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { runMatchingEngine } from "@/domain/matching/matching-engine";
import { extractMatchCasePack } from "@/domain/casepack/casepack-extractor";
import { computePromotionScore } from "@/domain/promotion/promotion-ranker";
import { onMatchResultCreated } from "@/domain/graph/knowledge-graph";
import { generateCasePackEmbedding } from "@/domain/graph/deal-semantic-search";
import { classifyNewBuyer } from "@/domain/prediction/buyer-clustering";
import { revalidatePath } from "next/cache";

export async function updateBuyerIntent(
  buyerIntentId: string,
  fields: {
    buyer_type?: string;
    budget_display?: string;
    preferred_regions?: string[];
    asset_types?: string[];
    purchase_purpose?: string;
    risk_tolerance?: string;
    financing_note?: string;
    must_have?: string[];
    nice_to_have?: string[];
    normalized?: any;
  }
) {
  try {
    const supabase = createServiceClient();
    
    // Auth Check
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const { error } = await supabase
      .from("buyer_intent_lite")
      .update(fields)
      .eq("id", buyerIntentId)
      .eq("owner_id", userId);

    if (error) {
      throw error;
    }

    // G-X / P-D2: Classify buyer into cluster & update graph if applicable
    classifyNewBuyer(buyerIntentId).catch((e) =>
      console.warn("[cluster] re-classify failed", e)
    );

    revalidatePath(`/broker/buyer-intents/${buyerIntentId}`);
    return { success: true };
  } catch (err: any) {
    console.error("Update intent error:", err);
    return { success: false, error: err?.message || "저장에 실패했습니다." };
  }
}

export async function updateBuyerMemo(
  documentId: string,
  updatedBody: {
    fitReasons?: string[];
    cautionReasons?: string[];
    missingData?: string[];
    recommendedNextAction?: string;
    kakaoMessage?: string;
  }
) {
  try {
    const supabase = createServiceClient();
    
    // Auth Check
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch existing document to preserve other fields
    const { data: existingDoc } = await supabase
      .from("document_objects")
      .select("body, source_id")
      .eq("id", documentId)
      .eq("owner_id", userId)
      .single();

    if (!existingDoc) {
      return { success: false, error: "문서를 찾을 수 없습니다." };
    }

    const newBody = {
      ...(existingDoc.body as Record<string, any>),
      ...updatedBody,
    };

    const { error } = await supabase
      .from("document_objects")
      .update({
        body: newBody as any,
        markdown: updatedBody.kakaoMessage || (existingDoc.body as any).kakaoMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("owner_id", userId);

    if (error) throw error;

    revalidatePath(`/broker/buyer-intents/${existingDoc.source_id}`);
    return { success: true };
  } catch (err: any) {
    console.error("Update memo error:", err);
    return { success: false, error: err?.message || "저장에 실패했습니다." };
  }
}

export async function triggerReMatching(buyerIntentId: string) {
  try {
    const supabase = createServiceClient();
    
    // Auth Check
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch buyer intent
    const { data: intent, error: iErr } = await supabase
      .from("buyer_intent_lite")
      .select("*")
      .eq("id", buyerIntentId)
      .eq("owner_id", userId)
      .single();

    if (iErr || !intent) {
      return { success: false, error: "매수자 조건을 찾을 수 없습니다." };
    }

    // Fetch all active building SSoT Lite of the broker
    const { data: buildings, error: bErr } = await supabase
      .from("building_ssot_lite")
      .select("*")
      .eq("owner_id", userId);

    if (bErr || !buildings || buildings.length === 0) {
      return { success: false, error: "매칭할 매물이 존재하지 않습니다." };
    }

    let matchCount = 0;

    // Loop through all buildings and compute match
    for (const building of buildings) {
      // Fetch deal curiosity score
      const { data: cardRow } = await supabase
        .from("building_signal_cards")
        .select("deal_curiosity_score")
        .eq("building_id", building.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const matchInput = {
        buildingSsotLiteId: building.id,
        buyerIntentLiteId:  buyerIntentId,
        brokerId:           userId,
        building: {
          areaSignal:         building.area_signal,
          assetType:          building.asset_type,
          priceBand:          building.price_band,
          vacancySignal:      building.vacancy_signal,
          fitSummary:         building.fit_summary,
          cautionSummary:     building.caution_summary,
          dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
        },
        intent: {
          buyerType:         intent.buyer_type,
          budgetRange:       intent.budget_range,
          preferredRegions:  intent.preferred_regions,
          assetTypes:        intent.asset_types,
          purchasePurpose:   intent.purchase_purpose,
          mustHave:          intent.must_have,
          niceToHave:        intent.nice_to_have,
          riskTolerance:     intent.risk_tolerance,
          inferredPurpose:   intent.inferred_purpose,
          recommendedWeightProfile: intent.recommended_weight_profile,
        },
      };

      // Run matching engine
      const matchResult = await runMatchingEngine(matchInput);

      // Check if match already exists
      const { data: existingMatch } = await supabase
        .from("match_results")
        .select("id")
        .eq("building_ssot_lite_id", building.id)
        .eq("buyer_intent_lite_id", buyerIntentId)
        .maybeSingle();

      let savedMatchId = existingMatch?.id;

      if (existingMatch) {
        await supabase
          .from("match_results")
          .update({
            grade:                 matchResult.grade,
            score:                 matchResult.score,
            stage1_passed:         matchResult.stage1Passed,
            stage2_similarity:     matchResult.stage2Similarity,
            stage3_score:          matchResult.stage3Score,
            reasoning:             matchResult.reasoning,
            purpose_weight_profile: matchResult.purposeWeightProfile,
            created_at:            new Date().toISOString(),
          })
          .eq("id", existingMatch.id);
      } else {
        const { data: newMatch } = await supabase
          .from("match_results")
          .insert({
            building_ssot_lite_id: building.id,
            buyer_intent_lite_id:  buyerIntentId,
            broker_id:             userId,
            grade:                 matchResult.grade,
            score:                 matchResult.score,
            stage1_passed:         matchResult.stage1Passed,
            stage2_similarity:     matchResult.stage2Similarity,
            stage3_score:          matchResult.stage3Score,
            reasoning:             matchResult.reasoning,
            purpose_weight_profile: matchResult.purposeWeightProfile,
          })
          .select("id")
          .single();
        savedMatchId = newMatch?.id;
      }

      // Save CasePack
      const casePack = extractMatchCasePack({
        buildingId: building.id,
        brokerId:      userId,
        buildingLabel: `${building.area_signal} ${building.asset_type}`,
        matchGrade:    matchResult.grade,
        matchScore:    matchResult.score,
        reasoning:     matchResult.reasoning,
        purposeProfile: matchResult.purposeWeightProfile,
      });

      // Insert deal casepack (with conflict resolution or duplicate control)
      const { data: existingCP } = await supabase
        .from("deal_casepacks")
        .select("id")
        .eq("building_ssot_lite_id", building.id)
        .eq("match_grade", matchResult.grade)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingCP) {
        await supabase.from("deal_casepacks").insert(casePack);
      }

      // Update matched count for the building
      const { count: matchedCount } = await supabase
        .from("match_results")
        .select("id", { count: "exact", head: true })
        .eq("building_ssot_lite_id", building.id)
        .in("grade", ["S", "A"]);

      const promoResult = computePromotionScore({
        dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
        matchedBuyerCount:  matchedCount ?? 0,
        inquiryCount:       building.vacancy_inquiry_count ?? 0,
        vacancyDemandVerified: building.vacancy_demand_verified ?? false,
        createdAt:          building.created_at,
      });

      await supabase
        .from("building_ssot_lite")
        .update({
          matched_buyer_count: matchedCount ?? 0,
          promotion_score:     promoResult.score,
          promotion_updated_at: new Date().toISOString(),
        })
        .eq("id", building.id);

      // Activity event
      await supabase.from("activity_events").insert({
        actor_id:    userId,
        actor_role:  "broker",
        event_type:  "match_computed",
        entity_type: "building_ssot_lite",
        entity_id:   building.id,
        metadata: {
          match_id:   savedMatchId,
          grade:      matchResult.grade,
          score:      matchResult.score,
          buyer_intent_id: buyerIntentId,
        },
      });

      // Knowledge graph edges (non-blocking)
      onMatchResultCreated({
        buildingId: building.id,
        buyerIntentId,
        matchGrade: matchResult.grade,
        matchScore: matchResult.score,
      }).catch((e) => console.warn("[graph] edge create failed", e));

      // Generate CasePack embedding (non-blocking)
      if (casePack) {
        const cp = casePack as unknown as { id: string };
        if (cp.id) {
          generateCasePackEmbedding(cp.id)
            .catch((e) => console.warn("[graph] casepack embed failed", e));
        }
      }

      matchCount++;
    }

    // Re-classify buyer cluster
    classifyNewBuyer(buyerIntentId).catch((e) =>
      console.warn("[cluster] classify failed", e)
    );

    revalidatePath(`/broker/buyer-intents/${buyerIntentId}`);
    return { success: true, count: matchCount };
  } catch (err: any) {
    console.error("Re-matching error:", err);
    return { success: false, error: err?.message || "재매칭 수행 도중 에러가 발생했습니다." };
  }
}
