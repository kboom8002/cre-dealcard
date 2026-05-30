import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonthlyUsage, type FeatureName, type UsageStatus } from "./usage-tracker";
import { calculateBrokerMonthlyRoi } from "../analytics/roi-calculator";

export type SubscriptionTier = 'free' | 'pro' | 'premium';

export interface TierGateResult extends UsageStatus {
  tier: SubscriptionTier;
  estimatedSavingsMoney: number; // 결제 넛지용 가치 연동 (₩)
}

// 티어별 기능 한도 매핑 (Free: 월 3건, Pro: 무제한, Premium: 무제한)
const TIER_LIMITS: Record<SubscriptionTier, Record<FeatureName, number | null>> = {
  free: {
    deal_card_creation: 3,
    ai_matching: null, // AI 매칭은 UI 레벨에서 Stage 제어하므로 제한 없음
    im_generation: 0,
  },
  pro: {
    deal_card_creation: null,
    ai_matching: null,
    im_generation: 1,
  },
  premium: {
    deal_card_creation: null,
    ai_matching: null,
    im_generation: null,
  },
};

/**
 * 당월 특정 기능에 대한 브로커의 진입 권한 체크 및 넛지 가치(ROI) 자동 산출
 */
export async function checkFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName
): Promise<TierGateResult> {
  try {
    // 1. 유저의 구독 등급 조회
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();

    const tier = (sub?.tier as SubscriptionTier) ?? 'free';
    const limit = TIER_LIMITS[tier][featureName];

    // 2. 사용량 트래커 조회
    const usage = await getMonthlyUsage(supabase, userId, featureName, limit);

    // 3. 결제 넛지용 당월 실시간 누적 절약 금액(ROI) 구하기
    const roi = await calculateBrokerMonthlyRoi(supabase, userId);
    
    // 무료 회원인데 아직 절약한 금액이 전혀 없을 시 기본 체감용 가치(₩175,000)를 제공
    const estimatedSavingsMoney = roi.totalMoneySaved > 0 ? roi.totalMoneySaved : 175000;

    return {
      tier,
      currentCount: usage.currentCount,
      maxLimit: usage.maxLimit,
      hasAccess: usage.hasAccess,
      estimatedSavingsMoney,
    };
  } catch (err) {
    console.error("[tier-gate] Access validation failed:", err);
    return {
      tier: 'free',
      currentCount: 0,
      maxLimit: 3,
      hasAccess: true,
      estimatedSavingsMoney: 175000,
    };
  }
}
