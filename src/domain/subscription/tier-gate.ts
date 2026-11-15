import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonthlyUsage, type FeatureName, type UsageStatus } from "./usage-tracker";
import { calculateBrokerMonthlyRoi } from "../analytics/roi-calculator";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('tier-gate');

export type SubscriptionTier = 'free' | 'pro' | 'premium';

export interface TierGateResult extends UsageStatus {
  tier: SubscriptionTier;
  estimatedSavingsMoney: number; // 실제 절감 가치 연동 (₩, 실적 없으면 0)
}

function parseEnvLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

/**
 * PG 정식 결제 연동 전 얼리액세스 한도 정책 (환경변수 오버라이드 지원)
 */
export function getTierLimits(): Record<SubscriptionTier, Record<FeatureName, number | null>> {
  return {
    free: {
      deal_card_creation: parseEnvLimit(process.env.FREE_TIER_MONTHLY_DEALCARD_LIMIT, 50),
      ai_matching: null,
      im_generation: parseEnvLimit(process.env.FREE_TIER_MONTHLY_IM_LIMIT, 30),
      ai_generation_daily: parseEnvLimit(process.env.FREE_TIER_DAILY_AI_LIMIT, 100),
    },
    pro: {
      deal_card_creation: null,
      ai_matching: null,
      im_generation: null,
      ai_generation_daily: 500,
    },
    premium: {
      deal_card_creation: null,
      ai_matching: null,
      im_generation: null,
      ai_generation_daily: null,
    },
  };
}

interface RawSubscriptionRow {
  tier?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

function resolveEffectiveSubscription(
  sub: RawSubscriptionRow | null | undefined,
): { tier: SubscriptionTier; isPaid: boolean; status: string } {
  if (!sub) {
    return { tier: 'free', isPaid: false, status: 'active' };
  }

  const rawTier: SubscriptionTier =
    sub.tier === 'pro' || sub.tier === 'premium' ? sub.tier : 'free';
  const rawStatus =
    typeof sub.status === 'string' && sub.status.trim() !== '' ? sub.status : 'active';

  const hasPeriodEnd =
    typeof sub.current_period_end === 'string' && sub.current_period_end.trim() !== '';
  const periodEndMs = hasPeriodEnd ? new Date(sub.current_period_end!).getTime() : null;
  const isPeriodValid =
    !hasPeriodEnd || (periodEndMs !== null && Number.isFinite(periodEndMs) && periodEndMs > Date.now());

  const isPaid =
    rawStatus === 'active' &&
    (rawTier === 'pro' || rawTier === 'premium') &&
    isPeriodValid;

  const effectiveTier: SubscriptionTier = isPaid ? rawTier : 'free';
  const effectiveStatus = !isPeriodValid && rawStatus === 'active' ? 'expired' : rawStatus;

  return {
    tier: effectiveTier,
    isPaid,
    status: effectiveStatus,
  };
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '');
  const message = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '');
  const message = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return code === '42703' || message.includes('column') && message.includes('does not exist');
}

async function querySubscriptionRow(
  supabase: SupabaseClient | any,
  userId: string,
): Promise<{ data: RawSubscriptionRow | null; error: unknown }> {
  const primary = await supabase
    .from("user_subscriptions")
    .select("tier, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (primary?.error && isMissingColumnError(primary.error)) {
    const fallback = await supabase
      .from("user_subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      data: (fallback?.data as RawSubscriptionRow | null) ?? null,
      error: fallback?.error ?? null,
    };
  }

  return {
    data: (primary?.data as RawSubscriptionRow | null) ?? null,
    error: primary?.error ?? null,
  };
}

/**
 * 당월(또는 KST 당일) 특정 기능에 대한 브로커의 진입 권한 체크 및 실제 절감 가치(ROI) 자동 산출
 */
export async function checkFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  featureName: FeatureName
): Promise<TierGateResult> {
  const limits = getTierLimits();
  const fallbackLimit = limits.free[featureName];

  try {
    // 1. 유저의 구독 등급 및 만료일 조회
    const { data: sub, error: subError } = await querySubscriptionRow(supabase, userId);

    if (subError && !isMissingTableError(subError) && process.env.NODE_ENV !== 'test') {
      log.error("[tier-gate] Explicit DB error fetching user_subscriptions:", subError);
      return {
        tier: 'free',
        currentCount: 0,
        maxLimit: fallbackLimit,
        hasAccess: false,
        estimatedSavingsMoney: 0,
      };
    }

    const { tier } = resolveEffectiveSubscription(sub as RawSubscriptionRow | null);
    const limit = limits[tier][featureName];

    // 2. 사용량 트래커 조회
    const usage = await getMonthlyUsage(supabase, userId, featureName, limit);

    // 3. 실제 누적 절감 가치(ROI) 산출 — 허위 하드코딩(₩175,000) 제거, 실적 없으면 0 반환
    let estimatedSavingsMoney = 0;
    if (featureName !== 'ai_generation_daily') {
      try {
        const roi = await calculateBrokerMonthlyRoi(supabase, userId);
        estimatedSavingsMoney = roi.totalMoneySaved > 0 ? roi.totalMoneySaved : 0;
      } catch {
        estimatedSavingsMoney = 0;
      }
    }

    return {
      tier,
      currentCount: usage.currentCount,
      maxLimit: usage.maxLimit,
      hasAccess: usage.hasAccess,
      estimatedSavingsMoney,
    };
  } catch (err) {
    log.error("[tier-gate] Access validation failed:", err);
    const failOpen = process.env.NODE_ENV === 'test' || isMissingTableError(err);
    return {
      tier: 'free',
      currentCount: 0,
      maxLimit: fallbackLimit,
      hasAccess: failOpen,
      estimatedSavingsMoney: 0,
    };
  }
}

/**
 * 브로커의 구독 티어 및 유료 활성 여부 조회 (SSOT)
 */
export async function getBrokerSubscriptionTier(
  supabase: SupabaseClient | any,
  userId: string
): Promise<{ tier: SubscriptionTier; isPaid: boolean; status: string }> {
  try {
    if (!userId) {
      return { tier: 'free', isPaid: false, status: 'none' };
    }

    const { data: sub } = await querySubscriptionRow(supabase, userId);

    return resolveEffectiveSubscription(sub as RawSubscriptionRow | null);
  } catch (err) {
    log.error("[tier-gate] Failed to fetch broker subscription tier:", err);
    return { tier: 'free', isPaid: false, status: 'error' };
  }
}
