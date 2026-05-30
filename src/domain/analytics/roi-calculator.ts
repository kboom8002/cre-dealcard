import type { SupabaseClient } from "@supabase/supabase-js";

export interface RoiMetrics {
  totalHoursSaved: number;
  totalMoneySaved: number; // KRW
  breakdown: {
    dealCardsCount: number;
    buyerIntentsCount: number;
    matchesCount: number;
    imCount: number;
  };
  timePerFeature: {
    dealCard: number;
    buyerIntent: number;
    match: number;
    im: number;
  };
}

const COST_PER_HOUR = 50000; // 중개사 시급 추정 (₩50,000)

const TIME_SAVED = {
  dealCard: 3.5,    // 딜카드 1건당 3.5시간 절약
  buyerIntent: 0.9, // 매수자 분석 1건당 0.9시간
  match: 2.0,       // 매칭 1건당 2.0시간
  im: 7.0,          // IM 초안 1건당 7.0시간
};

/**
 * 특정 브로커의 당월 활동 이력을 기반으로 실시간 ROI(절약 시간 및 비용)를 산출
 */
export async function calculateBrokerMonthlyRoi(
  supabase: SupabaseClient,
  brokerId: string
): Promise<RoiMetrics> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startIso = startOfMonth.toISOString();

  try {
    // 1. 당월 딜카드 생성 횟수 쿼리
    const { count: dealCardsCount } = await supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", brokerId)
      .eq("event_type", "broker_memo_submitted")
      .gte("created_at", startIso);

    // 2. 당월 매수자 분석 생성 횟수 쿼리
    const { count: buyerIntentsCount } = await supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", brokerId)
      .eq("event_type", "buyer_intent_created")
      .gte("created_at", startIso);

    // 3. 당월 매칭 결과 수 조회
    const { count: matchesCount } = await supabase
      .from("match_results")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", brokerId)
      .gte("created_at", startIso);

    // 4. 당월 IM 초안 생성 횟수 조회
    const { count: imCount } = await supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", brokerId)
      .eq("event_type", "im_lite_generated")
      .gte("created_at", startIso);

    const c1 = dealCardsCount ?? 0;
    const c2 = buyerIntentsCount ?? 0;
    const c3 = matchesCount ?? 0;
    const c4 = imCount ?? 0;

    // 5. 총 절약 시간 산식 적용
    const totalHoursSaved = 
      (c1 * TIME_SAVED.dealCard) + 
      (c2 * TIME_SAVED.buyerIntent) + 
      (c3 * TIME_SAVED.match) + 
      (c4 * TIME_SAVED.im);

    // 6. 금액 환산
    const totalMoneySaved = totalHoursSaved * COST_PER_HOUR;

    return {
      totalHoursSaved: Math.round(totalHoursSaved * 10) / 10,
      totalMoneySaved,
      breakdown: {
        dealCardsCount: c1,
        buyerIntentsCount: c2,
        matchesCount: c3,
        imCount: c4,
      },
      timePerFeature: TIME_SAVED,
    };
  } catch (err) {
    console.error("[calculateBrokerMonthlyRoi] Failed to compute ROI:", err);
    return {
      totalHoursSaved: 0,
      totalMoneySaved: 0,
      breakdown: { dealCardsCount: 0, buyerIntentsCount: 0, matchesCount: 0, imCount: 0 },
      timePerFeature: TIME_SAVED,
    };
  }
}
