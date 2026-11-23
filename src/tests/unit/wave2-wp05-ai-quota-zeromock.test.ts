import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

import {
  callLLM,
  registerProvider,
  LLMMockNotAllowedError,
} from "@/ai/llm-client";
import { MockOpenAIProvider } from "@/ai/providers/mock-openai";
import { OpenAIProvider } from "@/ai/providers/openai";
import {
  checkFeatureAccess,
  getBrokerSubscriptionTier,
  getTierLimits,
} from "@/domain/subscription/tier-gate";
import {
  checkRateLimit,
  clearRateLimitBuckets,
  getRateLimitBucketSize,
  MAX_RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limiter";
import {
  enforceBrokerAiQuota,
  enforceFeatureQuota,
  AI_SERVER_UNAVAILABLE_KO,
} from "@/lib/ai-quota-guard";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";

const mockCreateServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

describe("Wave 2 — WP-05: Zero-Mock Production AI, Distributed Quota & PG-Ready Free-Tier Engine", () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    mockCreateServiceClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearRateLimitBuckets();
  });

  it("(a) callLLM in NODE_ENV='production' throws LLMMockNotAllowedError when provider is MockOpenAIProvider", async () => {
    registerProvider("openai", new MockOpenAIProvider());
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LLM_MOCK", "");

    await expect(
      callLLM({
        systemPrompt: "CRE analyst",
        userPrompt: "역삼동 빌딩 분석",
        model: "gpt-5.6-terra",
      }),
    ).rejects.toBeInstanceOf(LLMMockNotAllowedError);

    // Explicit allowMock: true or ALLOW_LLM_MOCK='true' opt-in still works when explicitly intended
    vi.stubEnv("ALLOW_LLM_MOCK", "true");
    const allowedRes = await callLLM({
      systemPrompt: "CRE analyst",
      userPrompt: "역삼동 빌딩 분석",
      model: "gpt-5.6-terra",
    });
    expect(allowedRes.isMock).toBe(true);
  });

  it("(b) OpenAIProvider passes signal in 2nd request-options argument and never in JSON requestBody", async () => {
    const createSpy = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"headline":"강남 역세권 빌딩"}' } }],
      usage: { total_tokens: 42 },
      model: "gpt-5.6-luna",
    });

    const fakeOpenAiClient = {
      chat: {
        completions: {
          create: createSpy,
        },
      },
    } as unknown as OpenAI;

    const provider = new OpenAIProvider(fakeOpenAiClient);
    const abortController = new AbortController();

    const result = await provider.chat({
      systemPrompt: "System prompt",
      userPrompt: "User prompt",
      model: "gpt-5.6-luna",
      responseFormat: "json_object",
      signal: abortController.signal,
    });

    expect(result.content).toBe('{"headline":"강남 역세권 빌딩"}');
    expect(createSpy).toHaveBeenCalledTimes(1);

    const [firstArgBody, secondArgOptions] = createSpy.mock.calls[0];
    expect("signal" in firstArgBody).toBe(false);
    expect(secondArgOptions).toEqual({ signal: abortController.signal });
  });

  it("(c) tier-gate downgrades expired pro subscription back to free when current_period_end is past", async () => {
    const pastIso = new Date(Date.now() - 86_400_000).toISOString();
    const futureIso = new Date(Date.now() + 86_400_000 * 30).toISOString();

    // 1. Expired Pro -> downgraded to Free (isPaid: false)
    const expiredSubClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  tier: "pro",
                  status: "active",
                  current_period_end: pastIso,
                },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const expiredTier = await getBrokerSubscriptionTier(expiredSubClient, "user-expired-pro");
    expect(expiredTier.tier).toBe("free");
    expect(expiredTier.isPaid).toBe(false);
    expect(expiredTier.status).toBe("expired");

    // Verify checkFeatureAccess also downgrades expired Pro to Free limits (default 50 deal cards)
    const mockFeatureRows = [
      { tier: "pro", status: "active", current_period_end: pastIso }, // user_subscriptions
      { current_count: 50, max_limit: 50 }, // usage_counters
      { data: null, error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
    ];
    let rowIdx = 0;
    const mockFeatureBuilder: any = {
      select: () => mockFeatureBuilder,
      eq: () => mockFeatureBuilder,
      gte: () => mockFeatureBuilder,
      maybeSingle: () => Promise.resolve({ data: mockFeatureRows[rowIdx++], error: null }),
      then: (resolve: any) => resolve(mockFeatureRows[rowIdx++]),
    };
    const expiredAccess = await checkFeatureAccess(
      { from: () => mockFeatureBuilder } as unknown as SupabaseClient,
      "user-expired-pro",
      "deal_card_creation",
    );
    expect(expiredAccess.tier).toBe("free");
    expect(expiredAccess.maxLimit).toBe(50);
    expect(expiredAccess.hasAccess).toBe(false);
    expect(expiredAccess.estimatedSavingsMoney).toBe(0);

    // 2. Active non-expired Pro -> remains Pro (isPaid: true, unlimited IM generation)
    const activeProClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  tier: "pro",
                  status: "active",
                  current_period_end: futureIso,
                },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const activeTier = await getBrokerSubscriptionTier(activeProClient, "user-active-pro");
    expect(activeTier.tier).toBe("pro");
    expect(activeTier.isPaid).toBe(true);

    const limits = getTierLimits();
    expect(limits.free.deal_card_creation).toBe(50);
    expect(limits.free.im_generation).toBe(30);
    expect(limits.free.ai_generation_daily).toBe(100);
    expect(limits.pro.im_generation).toBeNull();
    expect(limits.pro.ai_generation_daily).toBe(500);
  });

  it("(d) enforceBrokerAiQuota blocks burst (429 AI_RATE_LIMITED) and daily quota (429 AI_DAILY_QUOTA_EXCEEDED)", async () => {
    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/broker/studio/ai-draft", {
        method: "POST",
      });

    // 1. Burst limit (perMinute: 2)
    expect(await enforceBrokerAiQuota(makeReq(), "broker-burst-1", "test_burst", { perMinute: 2 })).toBeNull();
    expect(await enforceBrokerAiQuota(makeReq(), "broker-burst-1", "test_burst", { perMinute: 2 })).toBeNull();
    const burstBlocked = await enforceBrokerAiQuota(makeReq(), "broker-burst-1", "test_burst", {
      perMinute: 2,
    });
    expect(burstBlocked).not.toBeNull();
    expect(burstBlocked!.status).toBe(429);
    const burstJson = await burstBlocked!.json();
    expect(burstJson).toMatchObject({
      ok: false,
      code: "AI_RATE_LIMITED",
      error: "AI 요청이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.",
    });

    // 2. Daily AI quota when ENFORCE_AI_QUOTA_IN_TEST='true'
    vi.stubEnv("ENFORCE_AI_QUOTA_IN_TEST", "true");
    vi.stubEnv("FREE_TIER_DAILY_AI_LIMIT", "100");

    const quotaRows = [
      { tier: "free", status: "active", current_period_end: null },
      { current_count: 100, max_limit: 100 },
    ];
    let qIdx = 0;
    const quotaBuilder: any = {
      select: () => quotaBuilder,
      eq: () => quotaBuilder,
      maybeSingle: () => Promise.resolve({ data: quotaRows[qIdx++], error: null }),
    };
    mockCreateServiceClient.mockReturnValue({
      from: () => quotaBuilder,
      rpc: () => Promise.resolve({ error: null }),
    });

    const dailyBlocked = await enforceBrokerAiQuota(
      makeReq(),
      "broker-daily-exhausted",
      "test_daily",
      { perMinute: 15 },
    );
    expect(dailyBlocked).not.toBeNull();
    expect(dailyBlocked!.status).toBe(429);
    const dailyJson = await dailyBlocked!.json();
    expect(dailyJson).toMatchObject({
      ok: false,
      code: "AI_DAILY_QUOTA_EXCEEDED",
      error: "오늘의 무료 AI 생성 한도를 모두 사용했습니다.",
    });

    // 3. Monthly feature quota guard (deal_card_creation) + bounded in-memory rate-limit cap <= 5,000
    const featureRows = [
      { tier: "free", status: "active", current_period_end: null },
      { current_count: 50, max_limit: 50 },
      { data: null, error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
      { count: 0, data: [], error: null },
    ];
    let fIdx = 0;
    const featureBuilder: any = {
      select: () => featureBuilder,
      eq: () => featureBuilder,
      gte: () => featureBuilder,
      maybeSingle: () => Promise.resolve({ data: featureRows[fIdx++], error: null }),
      then: (resolve: any) => resolve(featureRows[fIdx++]),
    };
    mockCreateServiceClient.mockReturnValue({
      from: () => featureBuilder,
      rpc: () => Promise.resolve({ error: null }),
    });

    const featureBlocked = await enforceFeatureQuota("broker-deal-exhausted", "deal_card_creation");
    expect(featureBlocked).not.toBeNull();
    expect(featureBlocked!.status).toBe(429);
    const featureJson = await featureBlocked!.json();
    expect(featureJson.code).toBe("FEATURE_QUOTA_EXCEEDED");

    // Verify hard eviction cap <= 5,000 under IP spray
    clearRateLimitBuckets();
    for (let i = 0; i < MAX_RATE_LIMIT_BUCKETS + 250; i++) {
      await checkRateLimit(`10.0.${Math.floor(i / 256)}.${i % 256}`, "ip_spray", 5, 60_000);
    }
    expect(getRateLimitBucketSize()).toBeLessThanOrEqual(MAX_RATE_LIMIT_BUCKETS);
    expect(AI_SERVER_UNAVAILABLE_KO).toBe(
      "AI 분석 서버 연결을 확인 중입니다. 직접 입력 모드로 계속 진행하실 수 있습니다.",
    );
  });

  it("(e) UpgradeModal renders clean Early-Access limit expansion UX without fake demo toast or fabricated 175k savings", () => {
    const htmlZeroSavings = renderToStaticMarkup(
      React.createElement(UpgradeModal, {
        isOpen: true,
        onClose: () => {},
        estimatedSavingsMoney: 0,
        currentCount: 50,
        maxLimit: 50,
        featureNameKo: "매매 딜카드 생성",
      }),
    );

    expect(htmlZeroSavings).toContain('role="dialog"');
    expect(htmlZeroSavings).toContain('aria-modal="true"');
    expect(htmlZeroSavings).toContain("Pro 얼리액세스 한도 증설 안내");
    expect(htmlZeroSavings).toContain("50 / 50건");
    expect(htmlZeroSavings).toContain("support@credeal.");
    expect(htmlZeroSavings).toContain("담당팀에 무료 한도 증설 요청 (이메일 복사)");
    expect(htmlZeroSavings).toContain("확인 (닫기)");
    expect(htmlZeroSavings).not.toContain("데모 연동 완료");
    expect(htmlZeroSavings).not.toContain("175,000");
    expect(htmlZeroSavings).not.toContain("절약 완료");

    // Also verify source file contains zero tiny 9px/10px classes and zero demo toast text
    const modalSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/subscription/UpgradeModal.tsx"),
      "utf-8",
    );
    expect(modalSource).not.toContain("데모 연동 완료");
    expect(modalSource).not.toContain("text-[9px]");
    expect(modalSource).not.toContain("text-[10px]");

    // Verify migration file locks down RPCs to service_role
    const migrationSql = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261115000001_ai_quota_and_rpc_lockdown.sql",
      ),
      "utf-8",
    );
    expect(migrationSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text) FROM PUBLIC, anon, authenticated;",
    );
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.rate_limit_counters");
    expect(migrationSql).toContain("check_distributed_rate_limit");
    expect(migrationSql).toContain("SECURITY DEFINER");
  });
});
