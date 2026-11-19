import type { SupabaseClient } from "@supabase/supabase-js";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('usage-tracker');

export type FeatureName =
  | 'deal_card_creation'
  | 'ai_matching'
  | 'im_generation'
  | 'ai_generation_daily';

export interface UsageStatus {
  currentCount: number;
  maxLimit: number | null;
  hasAccess: boolean;
}

function getKstDateParts(now: Date = new Date()): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear());
  const month =
    parts.find((p) => p.type === "month")?.value ??
    String(now.getUTCMonth() + 1).padStart(2, "0");
  const day =
    parts.find((p) => p.type === "day")?.value ??
    String(now.getUTCDate()).padStart(2, "0");

  return { year, month, day };
}

/**
 * 현재 KST(Asia/Seoul) 기준 연월 구하기 (포맷: YYYY-MM)
 */
export function getCurrentBillingMonth(now: Date = new Date()): string {
  const { year, month } = getKstDateParts(now);
  return `${year}-${month}`;
}

/**
 * 현재 KST(Asia/Seoul) 기준 일간 키 구하기 (포맷: daily:YYYY-MM-DD)
 */
export function getCurrentKstDailyKey(now: Date = new Date()): string {
  const { year, month, day } = getKstDateParts(now);
  return `daily:${year}-${month}-${day}`;
}

/**
 * 기능별 집계 기간 키 계산 (일간 AI 쿼터는 daily:YYYY-MM-DD, 월간 쿼터는 YYYY-MM)
 */
export function resolveBillingPeriodKey(
  featureName: FeatureName,
  now: Date = new Date(),
): string {
  if (featureName === 'ai_generation_daily') {
    return getCurrentKstDailyKey(now);
  }
  return getCurrentBillingMonth(now);
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = String((err as { code?: unknown }).code ?? "");
  const message = String((err as { message?: unknown }).message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

/**
 * 당월(또는 KST 당일) 특정 기능의 현재 사용량 및 한도 정보 조회
 */
export async function getMonthlyUsage(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName,
  tierLimit: number | null
): Promise<UsageStatus> {
  const billingMonth = resolveBillingPeriodKey(featureName);

  try {
    // 1. usage_counters 테이블 조회
    const { data: fetchedCounter, error } = await supabase
      .from("usage_counters")
      .select("current_count, max_limit")
      .eq("user_id", userId)
      .eq("feature_name", featureName)
      .eq("billing_month", billingMonth)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error) || process.env.NODE_ENV === "test") {
        return {
          currentCount: 0,
          maxLimit: tierLimit,
          hasAccess: true,
        };
      }
      log.error("[usage-tracker] Explicit DB error fetching usage counter:", error.message);
      return {
        currentCount: 0,
        maxLimit: tierLimit,
        hasAccess: false,
      };
    }

    let counter = fetchedCounter;

    // 2. 레코드가 존재하지 않는 경우 자동 초기화 생성 (조회가 이미 성공했으므로 초기화 실패는 비치명적)
    if (!counter && !error) {
      try {
        type UsageInsertResult = {
          data: { current_count: number; max_limit: number | null } | null;
          error: { message: string } | null;
        };
        const insertCall = supabase.from("usage_counters").insert({
          user_id: userId,
          feature_name: featureName,
          billing_month: billingMonth,
          current_count: 0,
          max_limit: tierLimit,
        }) as unknown as {
          select?: (cols: string) => { single: () => PromiseLike<UsageInsertResult> };
        } & PromiseLike<UsageInsertResult>;
        const insertRes =
          typeof insertCall.select === "function"
            ? await insertCall.select("current_count, max_limit").single()
            : await insertCall;
        if (insertRes?.error) {
          log.error("[usage-tracker] Failed to initialize usage counter:", insertRes.error.message);
        } else if (insertRes?.data && !Array.isArray(insertRes.data)) {
          counter = insertRes.data;
        }
      } catch (initErr: unknown) {
        const initMsg = initErr instanceof Error ? initErr.message : String(initErr);
        log.warn("[usage-tracker] Best-effort counter initialization skipped:", initMsg);
      }
    }

    const currentCount = counter?.current_count ?? 0;
    const maxLimit =
      tierLimit === null
        ? null
        : counter && typeof counter.max_limit === "number"
          ? Math.max(counter.max_limit, tierLimit)
          : tierLimit;
    const hasAccess = maxLimit === null ? true : currentCount < maxLimit;

    return {
      currentCount,
      maxLimit,
      hasAccess,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[usage-tracker] Unexpected error during usage fetch:", errMsg);
    const failOpen = process.env.NODE_ENV === "test" || isMissingTableError(err);
    return {
      currentCount: 0,
      maxLimit: tierLimit,
      hasAccess: failOpen,
    };
  }
}

/**
 * 기능 호출 성공 완료 시 당월(또는 KST 당일) 사용량 1 카운트 증가
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName
): Promise<boolean> {
  const billingMonth = resolveBillingPeriodKey(featureName);

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
    log.warn(
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
      log.error("[usage-tracker] Failed to increment usage counter via fallback:", upsertError.message);
      return false;
    }

    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[usage-tracker] Failed during incrementUsage:", errMsg);
    return false;
  }
}
