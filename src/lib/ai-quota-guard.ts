import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limiter";
import { checkFeatureAccess } from "@/domain/subscription/tier-gate";
import { incrementUsage } from "@/domain/subscription/usage-tracker";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("ai-quota-guard");

export const AI_SERVER_UNAVAILABLE_KO =
  "AI 분석 서버 연결을 확인 중입니다. 직접 입력 모드로 계속 진행하실 수 있습니다.";

export function isLLMMockNotAllowedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { name?: unknown }).name === "LLMMockNotAllowedError";
}

export function buildAiUnavailable503Response(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "LLM_UNAVAILABLE",
      error: {
        code: "LLM_UNAVAILABLE",
        message: AI_SERVER_UNAVAILABLE_KO,
      },
      message: AI_SERVER_UNAVAILABLE_KO,
    },
    { status: 503 },
  );
}

function shouldEnforceDbQuota(): boolean {
  if (process.env.NODE_ENV === "test") {
    return process.env.ENFORCE_AI_QUOTA_IN_TEST === "true";
  }
  return true;
}

function resolveClientSubject(req: NextRequest, userId: string): string {
  if (userId && userId.trim().length > 0) {
    return userId.trim();
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "anonymous";
}

/**
 * Broker AI endpoint guard:
 * 1) Per-user burst rate limit (`checkRateLimit`, default 15/min) -> 429 AI_RATE_LIMITED
 * 2) Daily AI quota (`ai_generation_daily`, default 100/day free, 500/day pro) -> 429 AI_DAILY_QUOTA_EXCEEDED
 */
export async function enforceBrokerAiQuota(
  req: NextRequest,
  userId: string,
  actionKey: string,
  opts?: { perMinute?: number },
): Promise<NextResponse | null> {
  const perMinute = opts?.perMinute ?? 15;
  const subject = resolveClientSubject(req, userId);

  const burstAllowed = await checkRateLimit(subject, "ai_" + actionKey, perMinute, 60_000);
  if (!burstAllowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "AI_RATE_LIMITED",
        error: "AI 요청이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 429 },
    );
  }

  if (!shouldEnforceDbQuota() || !userId) {
    return null;
  }

  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const supabase = createServiceClient();
    const access = await checkFeatureAccess(supabase, userId, "ai_generation_daily");

    if (!access.hasAccess) {
      return NextResponse.json(
        {
          ok: false,
          code: "AI_DAILY_QUOTA_EXCEEDED",
          error: "오늘의 무료 AI 생성 한도를 모두 사용했습니다.",
          currentCount: access.currentCount,
          maxLimit: access.maxLimit,
          tier: access.tier,
        },
        { status: 429 },
      );
    }

    // Fire-and-forget safe increment (incrementUsage catches internal errors)
    incrementUsage(supabase, userId, "ai_generation_daily").then(undefined, (err) => {
      log.warn({ err }, "[ai-quota-guard] Failed to increment ai_generation_daily");
    });
  } catch (err) {
    log.warn({ err }, "[ai-quota-guard] Quota check skipped due to service client error");
  }

  return null;
}

/**
 * Monthly feature quota guard (`deal_card_creation` | `im_generation`).
 * Non-blocking in NODE_ENV === 'test' unless ENFORCE_AI_QUOTA_IN_TEST === 'true'.
 */
export async function enforceFeatureQuota(
  userId: string,
  feature: "deal_card_creation" | "im_generation",
): Promise<NextResponse | null> {
  if (!shouldEnforceDbQuota() || !userId) {
    return null;
  }

  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const supabase = createServiceClient();
    const access = await checkFeatureAccess(supabase, userId, feature);

    if (!access.hasAccess) {
      const errorMsg =
        feature === "deal_card_creation"
          ? "이번 달 무료 딜카드 생성 한도를 모두 사용했습니다."
          : "이번 달 무료 IM 생성 한도를 모두 사용했습니다.";

      return NextResponse.json(
        {
          ok: false,
          code: "FEATURE_QUOTA_EXCEEDED",
          error: errorMsg,
          feature,
          currentCount: access.currentCount,
          maxLimit: access.maxLimit,
          tier: access.tier,
          estimatedSavingsMoney: access.estimatedSavingsMoney,
        },
        { status: 429 },
      );
    }

    incrementUsage(supabase, userId, feature).then(undefined, (err) => {
      log.warn({ err, feature }, "[ai-quota-guard] Failed to increment feature usage");
    });
  } catch (err) {
    log.warn({ err, feature }, "[ai-quota-guard] Feature quota check skipped due to service client error");
  }

  return null;
}
