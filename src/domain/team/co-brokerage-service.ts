import { createServiceClient } from "@/lib/supabase/service";
import { notifyMatchParties } from "./circle-notification-service";

export async function createCoBrokerageDeal(input: {
  circleMatchId: string;
  buildingId: string;
  buildingBrokerId: string;
  buyerIntentId: string;
  buyerBrokerId: string;
  grade: string;
  score: number;
}): Promise<{ dealId: string }> {
  const supabase = createServiceClient();

  // Fetch building label
  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select("area_signal, asset_type, price_band")
    .eq("id", input.buildingId)
    .single();

  const buildingLabel = building
    ? `${building.area_signal || "매물"} ${building.asset_type || ""}`
    : "공동중개 매물";

  // Create pipeline deal state for building broker
  const { data: deal1, error: err1 } = await supabase
    .from("deal_pipeline_states")
    .insert({
      broker_id: input.buildingBrokerId,
      building_ssot_lite_id: input.buildingId,
      current_stage: "buyer_meeting",
      entered_at: new Date().toISOString(),
      metadata: {
        co_brokerage: true,
        circle_match_id: input.circleMatchId,
        partner_broker_id: input.buyerBrokerId,
        role: "building_broker",
        grade: input.grade,
        score: input.score,
        building_label: buildingLabel,
      },
    })
    .select("id")
    .single();

  if (err1) {
    console.error("[createCoBrokerageDeal] Error creating deal1:", err1.message);
  }

  // Create pipeline deal state for buyer broker
  const { data: deal2, error: err2 } = await supabase
    .from("deal_pipeline_states")
    .insert({
      broker_id: input.buyerBrokerId,
      building_ssot_lite_id: input.buildingId,
      current_stage: "buyer_meeting",
      entered_at: new Date().toISOString(),
      metadata: {
        co_brokerage: true,
        circle_match_id: input.circleMatchId,
        partner_broker_id: input.buildingBrokerId,
        role: "buyer_broker",
        grade: input.grade,
        score: input.score,
        building_label: buildingLabel,
      },
    })
    .select("id")
    .single();

  if (err2) {
    console.error("[createCoBrokerageDeal] Error creating deal2:", err2.message);
  }

  const primaryDealId = deal1?.id || deal2?.id || "";

  // Link deal ID to match result
  if (primaryDealId) {
    await supabase
      .from("circle_match_results")
      .update({ co_brokerage_deal_id: primaryDealId })
      .eq("id", input.circleMatchId);
  }

  // Notify both brokers
  await notifyMatchParties({
    circleMatchId: input.circleMatchId,
    type: "circle_revealed",
    title: "🤝 자동 공동중개 파이프라인 생성!",
    body: `"${buildingLabel}" 물건에 대한 양측 승인이 완료되어 파이프라인 딜이 자동 생성되었습니다.`,
    link: `/broker/pipeline`,
    metadata: { match_id: input.circleMatchId, deal_id: primaryDealId },
  });

  return { dealId: primaryDealId };
}
