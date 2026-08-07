import { createServiceClient } from "@/lib/supabase/service";
import { runMatchingEngine } from "@/domain/matching/matching-engine";
import type { MatchInput, MatchGrade } from "@/domain/matching/matching-types";
import { notifyMatchParties } from "./circle-notification-service";
import { createCoBrokerageDeal } from "./co-brokerage-service";

export interface CircleMatchSummary {
  totalMatched: number;
  sCount: number;
  aCount: number;
}

export interface RevealedIdentity {
  building: {
    address?: string;
    owner_name?: string;
  };
  buyer: {
    name?: string;
    company?: string;
    phone?: string;
  };
}

export interface CircleMatchWithDetail {
  id: string;
  circle_id: string;
  building_id: string;
  building_broker_id: string;
  buyer_intent_id: string;
  buyer_broker_id: string;
  grade: MatchGrade;
  score: number;
  stage1_passed: boolean;
  stage2_similarity: number;
  stage3_score: number;
  reasoning: string;
  purpose_weight_profile: string;
  building_broker_approved: boolean;
  buyer_broker_approved: boolean;
  building_broker_approved_at: string | null;
  buyer_broker_approved_at: string | null;
  identity_revealed_at: string | null;
  co_brokerage_deal_id: string | null;
  co_brokerage_note: string | null;
  fee_split_ratio: string | null;
  created_at: string;
  building_detail?: Record<string, any>;
  buyer_intent_detail?: Record<string, any>;
  building_broker_profile?: Record<string, any>;
  buyer_broker_profile?: Record<string, any>;
}

export async function runCircleAutoMatch(
  circleId: string,
  triggerAssetType: 'building' | 'buyer_intent',
  triggerAssetId: string
): Promise<CircleMatchSummary> {
  const supabase = createServiceClient();

  let sCount = 0;
  let aCount = 0;
  let totalMatched = 0;

  if (triggerAssetType === "building") {
    // 1. Fetch trigger building
    const { data: building } = await supabase
      .from("building_ssot_lite")
      .select("*")
      .eq("id", triggerAssetId)
      .single();

    if (!building) return { totalMatched: 0, sCount: 0, aCount: 0 };

    // Fetch curiosity score
    const { data: cardRow } = await supabase
      .from("building_signal_cards")
      .select("deal_curiosity_score")
      .eq("building_ssot_lite_id", triggerAssetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dealCuriosityScore = cardRow?.deal_curiosity_score ?? 50;

    // 2. Fetch all shared buyer_intents in circle
    const { data: sharedIntents } = await supabase
      .from("circle_shared_assets")
      .select("asset_id, broker_id")
      .eq("circle_id", circleId)
      .eq("asset_type", "buyer_intent");

    if (!sharedIntents || sharedIntents.length === 0) {
      return { totalMatched: 0, sCount: 0, aCount: 0 };
    }

    for (const item of sharedIntents) {
      // Don't match self with self if not desired, or match if desired
      const { data: intent } = await supabase
        .from("buyer_intent_lite")
        .select("*")
        .eq("id", item.asset_id)
        .maybeSingle();

      if (!intent) continue;

      const matchInput: MatchInput = {
        buildingSsotLiteId: triggerAssetId,
        buyerIntentLiteId: intent.id,
        brokerId: building.broker_id || building.owner_id,
        building: {
          areaSignal: building.area_signal || "",
          assetType: building.asset_type || "",
          priceBand: building.price_band || null,
          vacancySignal: building.vacancy_signal || null,
          fitSummary: building.fit_summary || "",
          cautionSummary: building.caution_summary || "",
          dealCuriosityScore,
        },
        intent: {
          buyerType: intent.buyer_type || "",
          budgetRange: intent.budget_range || { min: null, max: null, display: intent.budget_display || "" },
          preferredRegions: intent.preferred_regions || [],
          assetTypes: intent.asset_types || [],
          purchasePurpose: intent.purchase_purpose || "",
          mustHave: intent.must_have || [],
          niceToHave: intent.nice_to_have || [],
          riskTolerance: intent.risk_tolerance || "",
          inferredPurpose: intent.inferred_purpose,
          recommendedWeightProfile: intent.recommended_weight_profile,
        },
      };

      try {
        const res = await runMatchingEngine(matchInput);
        totalMatched++;
        if (res.grade === "S") sCount++;
        if (res.grade === "A") aCount++;

        // UPSERT match result
        const { data: savedMatch } = await supabase
          .from("circle_match_results")
          .upsert({
            circle_id: circleId,
            building_id: triggerAssetId,
            building_broker_id: building.broker_id || building.owner_id,
            buyer_intent_id: intent.id,
            buyer_broker_id: intent.broker_id || intent.owner_id,
            grade: res.grade,
            score: res.score,
            stage1_passed: res.stage1Passed,
            stage2_similarity: res.stage2Similarity,
            stage3_score: res.stage3Score,
            reasoning: res.reasoning,
            purpose_weight_profile: res.purposeWeightProfile,
          }, { onConflict: "circle_id,building_id,buyer_intent_id" })
          .select("id")
          .single();

        // Progressive Trust: Upgrade visibility on S/A match
        if (res.grade === "S" || res.grade === "A") {
          await supabase
            .from("circle_shared_assets")
            .update({ visibility: "basic_info" })
            .eq("circle_id", circleId)
            .in("asset_id", [triggerAssetId, intent.id])
            .eq("visibility", "signal_only");

          if (savedMatch) {
            notifyMatchParties({
              circleMatchId: savedMatch.id,
              type: "circle_match",
              title: `⚡ 서클 ${res.grade}등급 팀 매칭 발견!`,
              body: `${res.grade}등급 매칭 (${res.score}점)이 발견되었습니다. 서클 대시보드에서 확인하세요.`,
              link: `/broker/circles/${circleId}`,
              metadata: { circle_id: circleId, grade: res.grade, score: res.score },
            }).catch((e) => console.warn("[circle-matching] Notify failed:", e));
          }
        }
      } catch (err) {
        console.error("[runCircleAutoMatch] Engine error:", err);
      }
    }
  } else if (triggerAssetType === "buyer_intent") {
    // 1. Fetch trigger buyer intent
    const { data: intent } = await supabase
      .from("buyer_intent_lite")
      .select("*")
      .eq("id", triggerAssetId)
      .single();

    if (!intent) return { totalMatched: 0, sCount: 0, aCount: 0 };

    // 2. Fetch all shared buildings in circle
    const { data: sharedBuildings } = await supabase
      .from("circle_shared_assets")
      .select("asset_id, broker_id")
      .eq("circle_id", circleId)
      .eq("asset_type", "building");

    if (!sharedBuildings || sharedBuildings.length === 0) {
      return { totalMatched: 0, sCount: 0, aCount: 0 };
    }

    for (const item of sharedBuildings) {
      const { data: building } = await supabase
        .from("building_ssot_lite")
        .select("*")
        .eq("id", item.asset_id)
        .maybeSingle();

      if (!building) continue;

      const { data: cardRow } = await supabase
        .from("building_signal_cards")
        .select("deal_curiosity_score")
        .eq("building_ssot_lite_id", building.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const matchInput: MatchInput = {
        buildingSsotLiteId: building.id,
        buyerIntentLiteId: triggerAssetId,
        brokerId: building.broker_id || building.owner_id,
        building: {
          areaSignal: building.area_signal || "",
          assetType: building.asset_type || "",
          priceBand: building.price_band || null,
          vacancySignal: building.vacancy_signal || null,
          fitSummary: building.fit_summary || "",
          cautionSummary: building.caution_summary || "",
          dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
        },
        intent: {
          buyerType: intent.buyer_type || "",
          budgetRange: intent.budget_range || { min: null, max: null, display: intent.budget_display || "" },
          preferredRegions: intent.preferred_regions || [],
          assetTypes: intent.asset_types || [],
          purchasePurpose: intent.purchase_purpose || "",
          mustHave: intent.must_have || [],
          niceToHave: intent.nice_to_have || [],
          riskTolerance: intent.risk_tolerance || "",
          inferredPurpose: intent.inferred_purpose,
          recommendedWeightProfile: intent.recommended_weight_profile,
        },
      };

      try {
        const res = await runMatchingEngine(matchInput);
        totalMatched++;
        if (res.grade === "S") sCount++;
        if (res.grade === "A") aCount++;

        const { data: savedMatch } = await supabase
          .from("circle_match_results")
          .upsert({
            circle_id: circleId,
            building_id: building.id,
            building_broker_id: building.broker_id || building.owner_id,
            buyer_intent_id: triggerAssetId,
            buyer_broker_id: intent.broker_id || intent.owner_id,
            grade: res.grade,
            score: res.score,
            stage1_passed: res.stage1Passed,
            stage2_similarity: res.stage2Similarity,
            stage3_score: res.stage3Score,
            reasoning: res.reasoning,
            purpose_weight_profile: res.purposeWeightProfile,
          }, { onConflict: "circle_id,building_id,buyer_intent_id" })
          .select("id")
          .single();

        if (res.grade === "S" || res.grade === "A") {
          await supabase
            .from("circle_shared_assets")
            .update({ visibility: "basic_info" })
            .eq("circle_id", circleId)
            .in("asset_id", [building.id, triggerAssetId])
            .eq("visibility", "signal_only");

          if (savedMatch) {
            notifyMatchParties({
              circleMatchId: savedMatch.id,
              type: "circle_match",
              title: `⚡ 서클 ${res.grade}등급 팀 매칭 발견!`,
              body: `${res.grade}등급 매칭 (${res.score}점)이 발견되었습니다. 서클 대시보드에서 확인하세요.`,
              link: `/broker/circles/${circleId}`,
              metadata: { circle_id: circleId, grade: res.grade, score: res.score },
            }).catch((e) => console.warn("[circle-matching] Notify failed:", e));
          }
        }
      } catch (err) {
        console.error("[runCircleAutoMatch] Engine error:", err);
      }
    }
  }

  return { totalMatched, sCount, aCount };
}

export async function runFullCircleMatch(circleId: string): Promise<CircleMatchSummary> {
  const supabase = createServiceClient();

  const [{ data: sharedBuildings }, { data: sharedIntents }] = await Promise.all([
    supabase.from("circle_shared_assets").select("asset_id").eq("circle_id", circleId).eq("asset_type", "building"),
    supabase.from("circle_shared_assets").select("asset_id").eq("circle_id", circleId).eq("asset_type", "buyer_intent"),
  ]);

  if (!sharedBuildings || sharedBuildings.length === 0 || !sharedIntents || sharedIntents.length === 0) {
    return { totalMatched: 0, sCount: 0, aCount: 0 };
  }

  let totalMatched = 0;
  let sCount = 0;
  let aCount = 0;

  for (const b of sharedBuildings) {
    const res = await runCircleAutoMatch(circleId, "building", b.asset_id);
    totalMatched += res.totalMatched;
    sCount += res.sCount;
    aCount += res.aCount;
  }

  return { totalMatched, sCount, aCount };
}

export async function approveIdentityReveal(input: {
  circleMatchId: string;
  approvingBrokerId: string;
}): Promise<{ bothApproved: boolean; revealedData?: RevealedIdentity }> {
  const supabase = createServiceClient();

  const { data: match } = await supabase
    .from("circle_match_results")
    .select("*")
    .eq("id", input.circleMatchId)
    .single();

  if (!match) throw new Error("매칭 결과를 찾을 수 없습니다.");

  const isBuildingBroker = match.building_broker_id === input.approvingBrokerId;
  const isBuyerBroker = match.buyer_broker_id === input.approvingBrokerId;

  if (!isBuildingBroker && !isBuyerBroker) {
    throw new Error("해당 매칭 건의 담당 중개사가 아닙니다.");
  }

  const updates: Record<string, any> = {};
  if (isBuildingBroker) {
    updates.building_broker_approved = true;
    updates.building_broker_approved_at = new Date().toISOString();
  }
  if (isBuyerBroker) {
    updates.buyer_broker_approved = true;
    updates.buyer_broker_approved_at = new Date().toISOString();
  }

  const buildingApproved = isBuildingBroker ? true : match.building_broker_approved;
  const buyerApproved = isBuyerBroker ? true : match.buyer_broker_approved;

  const bothApproved = buildingApproved && buyerApproved;

  if (bothApproved) {
    updates.identity_revealed_at = new Date().toISOString();
    // Upgrade shared asset visibility to full_detail
    await supabase
      .from("circle_shared_assets")
      .update({ visibility: "full_detail" })
      .eq("circle_id", match.circle_id)
      .in("asset_id", [match.building_id, match.buyer_intent_id]);
  }

  await supabase
    .from("circle_match_results")
    .update(updates)
    .eq("id", input.circleMatchId);

  if (bothApproved) {
    // Create Auto Co-brokerage deal pipeline (Phase 2 feature)
    createCoBrokerageDeal({
      circleMatchId: input.circleMatchId,
      buildingId: match.building_id,
      buildingBrokerId: match.building_broker_id,
      buyerIntentId: match.buyer_intent_id,
      buyerBrokerId: match.buyer_broker_id,
      grade: match.grade,
      score: match.score,
    }).catch((e) => console.warn("[approveIdentityReveal] Auto co-brokerage deal creation failed:", e));

    return { bothApproved: true };
  } else {
    // Notify counterparty
    const targetBrokerId = isBuildingBroker ? match.buyer_broker_id : match.building_broker_id;

    notifyMatchParties({
      circleMatchId: input.circleMatchId,
      type: "circle_approval",
      title: "🔒 매칭 승인 요청",
      body: "상대 중개사가 신원 공개를 승인했습니다. 확인 후 승인해 주세요.",
      link: `/broker/circles/${match.circle_id}`,
      metadata: { match_id: input.circleMatchId },
    }).catch((e) => console.warn("[approveIdentityReveal] Notify counterparty failed:", e));

    return { bothApproved: false };
  }
}

export async function getCircleMatches(circleId: string, brokerId: string, filter?: {
  gradeFilter?: MatchGrade[];
  onlyMine?: boolean;
}): Promise<CircleMatchWithDetail[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("circle_match_results")
    .select(`
      *,
      building_broker_profile:profiles!circle_match_results_building_broker_id_fkey(display_name, company, phone),
      buyer_broker_profile:profiles!circle_match_results_buyer_broker_id_fkey(display_name, company, phone)
    `)
    .eq("circle_id", circleId)
    .order("score", { ascending: false });

  if (filter?.gradeFilter && filter.gradeFilter.length > 0) {
    query = query.in("grade", filter.gradeFilter);
  }

  if (filter?.onlyMine) {
    query = query.or(`building_broker_id.eq.${brokerId},buyer_broker_id.eq.${brokerId}`);
  }

  const { data: matches, error } = await query;
  if (error || !matches) return [];

  const result: CircleMatchWithDetail[] = [];

  for (const m of matches) {
    const [{ data: building }, { data: intent }] = await Promise.all([
      supabase.from("building_ssot_lite").select("id, area_signal, asset_type, price_band, fit_summary").eq("id", m.building_id).maybeSingle(),
      supabase.from("buyer_intent_lite").select("id, buyer_type, budget_display, preferred_regions, purchase_purpose").eq("id", m.buyer_intent_id).maybeSingle(),
    ]);

    result.push({
      ...(m as CircleMatchWithDetail),
      building_detail: building || undefined,
      buyer_intent_detail: intent || undefined,
    });
  }

  return result;
}

export async function expireStaleApprovals(): Promise<number> {
  const supabase = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data, error } = await supabase
    .from("circle_match_results")
    .update({ expired_at: new Date().toISOString() })
    .is("identity_revealed_at", null)
    .lt("created_at", sevenDaysAgo)
    .select("id");

  if (error) return 0;
  return data?.length ?? 0;
}
