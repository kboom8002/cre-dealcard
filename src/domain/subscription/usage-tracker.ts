import type { SupabaseClient } from "@supabase/supabase-js";

export type FeatureName = 'deal_card_creation' | 'ai_matching' | 'im_generation';

export interface UsageStatus {
  currentCount: number;
  maxLimit: number | null;
  hasAccess: boolean;
}

/**
 * 현재 연월 구하기 (포맷: YYYY-MM)
 */
export function getCurrentBillingMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 당월 특정 기능의 현재 사용량 및 한도 정보 조회
 */
export async function getMonthlyUsage(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName,
  tierLimit: number | null
): Promise<UsageStatus> {
  const billingMonth = getCurrentBillingMonth();

  try {
    // 1. usage_counters 테이블 조회
    const { data: fetchedCounter, error } = await supabase
      .from("usage_counters")
      .select("current_count, max_limit")
      .eq("user_id", userId)
      .eq("feature_name", featureName)
      .eq("billing_month", billingMonth)
      .maybeSingle();

    let counter = fetchedCounter;

    // 2. 레코드가 존재하지 않는 경우 자동 초기화 생성
    if (!counter && !error) {
      const { data: newCounter, error: insertError } = await supabase
        .from("usage_counters")
        .insert({
          user_id: userId,
          feature_name: featureName,
          billing_month: billingMonth,
          current_count: 0,
          max_limit: tierLimit,
        })
        .select("current_count, max_limit")
        .single();

      if (insertError) {
        console.error("[usage-tracker] Failed to initialize usage counter:", insertError.message);
      } else {
        counter = newCounter;
      }
    }

    const currentCount = counter?.current_count ?? 0;
    const maxLimit = counter ? counter.max_limit : tierLimit;
    const hasAccess = maxLimit === null ? true : currentCount < maxLimit;

    return {
      currentCount,
      maxLimit,
      hasAccess,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[usage-tracker] Unexpected error during usage fetch:", errMsg);
    return {
      currentCount: 0,
      maxLimit: tierLimit,
      hasAccess: true,
    };
  }
}

/**
 * 기능 호출 성공 완료 시 당월 사용량 1 카운트 증가
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName
): Promise<boolean> {
  const billingMonth = getCurrentBillingMonth();

  try {
    // 1. Try atomic increment via RPC
    const { error: rpcError } = await supabase.rpc("increment_usage_counter", {
      p_user_id: userId,
      p_feature_name: featureName,
      p_billing_month: billingMonth,
    });

    if (!rpcError) {
      return true;
    }

    // If RPC fails (e.g. function does not exist), fall back to select-and-upsert
    console.warn(
      `[usage-tracker] RPC increment failed, falling back to non-atomic upsert: ${rpcError.message}`
    );

    const { data: currentCounter } = await supabase
      .from("usage_counters")
      .select("current_count")
      .eq("user_id", userId)
      .eq("feature_name", featureName)
      .eq("billing_month", billingMonth)
      .maybeSingle();

    const nextCount = (currentCounter?.current_count ?? 0) + 1;

    const { error: upsertError } = await supabase
      .from("usage_counters")
      .upsert({
        user_id: userId,
        feature_name: featureName,
        billing_month: billingMonth,
        current_count: nextCount,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,feature_name,billing_month"
      });

    if (upsertError) {
      console.error("[usage-tracker] Failed to increment usage counter via fallback:", upsertError.message);
      return false;
    }

    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[usage-tracker] Failed during incrementUsage:", errMsg);
    return false;
  }
}

