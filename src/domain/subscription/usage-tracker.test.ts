import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCurrentBillingMonth,
  getCurrentKstDailyKey,
  resolveBillingPeriodKey,
  getMonthlyUsage,
  incrementUsage,
} from "./usage-tracker";
import { checkFeatureAccess } from "./tier-gate";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Usage Tracker & Tier Gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getCurrentBillingMonth & KST Daily Key", () => {
    it("should return monthly string in YYYY-MM format using KST (Asia/Seoul)", () => {
      const billingMonth = getCurrentBillingMonth();
      expect(billingMonth).toMatch(/^\d{4}-\d{2}$/);

      // 2026-11-30T15:30:00Z is 2026-12-01T00:30:00+09:00 in KST
      const utcLateNight = new Date("2026-11-30T15:30:00.000Z");
      expect(getCurrentBillingMonth(utcLateNight)).toBe("2026-12");
      expect(getCurrentKstDailyKey(utcLateNight)).toBe("daily:2026-12-01");
      expect(resolveBillingPeriodKey("ai_generation_daily", utcLateNight)).toBe("daily:2026-12-01");
      expect(resolveBillingPeriodKey("deal_card_creation", utcLateNight)).toBe("2026-12");
    });
  });

  describe("getMonthlyUsage", () => {
    it("should return correct limit and access status when under limit", async () => {
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: { current_count: 1, max_limit: 3 }, error: null })
      };
      
      const mockSupabase = {
        from: () => mockQueryBuilder
      } as unknown as SupabaseClient;

      const result = await getMonthlyUsage(mockSupabase, "user-123", "deal_card_creation", 3);
      
      expect(result.currentCount).toBe(1);
      expect(result.maxLimit).toBe(3);
      expect(result.hasAccess).toBe(true);
    });

    it("should reject access when limit is reached", async () => {
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: { current_count: 3, max_limit: 3 }, error: null })
      };
      
      const mockSupabase = {
        from: () => mockQueryBuilder
      } as unknown as SupabaseClient;

      const result = await getMonthlyUsage(mockSupabase, "user-123", "deal_card_creation", 3);
      
      expect(result.currentCount).toBe(3);
      expect(result.hasAccess).toBe(false);
    });

    it("supports daily AI usage tracking with daily:YYYY-MM-DD billing key", async () => {
      const observedEqCalls: Array<[string, unknown]> = [];
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: (col: string, val: unknown) => {
          observedEqCalls.push([col, val]);
          return mockQueryBuilder;
        },
        maybeSingle: () =>
          Promise.resolve({ data: { current_count: 12, max_limit: 100 }, error: null }),
      };

      let rpcArgs: Record<string, unknown> | null = null;
      const mockSupabase = {
        from: () => mockQueryBuilder,
        rpc: (_fn: string, args: Record<string, unknown>) => {
          rpcArgs = args;
          return Promise.resolve({ error: null });
        },
      } as unknown as SupabaseClient;

      const dailyUsage = await getMonthlyUsage(
        mockSupabase,
        "user-123",
        "ai_generation_daily",
        100
      );
      expect(dailyUsage.currentCount).toBe(12);
      expect(dailyUsage.maxLimit).toBe(100);
      expect(dailyUsage.hasAccess).toBe(true);
      const billingFilter = observedEqCalls.find(([c]) => c === "billing_month");
      expect(String(billingFilter?.[1] ?? "")).toMatch(/^daily:\d{4}-\d{2}-\d{2}$/);

      const incremented = await incrementUsage(mockSupabase, "user-123", "ai_generation_daily");
      expect(incremented).toBe(true);
      expect(String(rpcArgs?.["p_billing_month"] ?? "")).toMatch(/^daily:\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("checkFeatureAccess", () => {
    it("should integrate with Early-Access tier limitations and dynamic ROI values (zero fake 175k)", async () => {
      const mockQueryData = [
        { tier: "free", status: "active", current_period_end: null }, // 1회차: user_subscriptions 조회
        { current_count: 2, max_limit: 50 },                          // 2회차: usage_counters 조회
        { data: null, error: null },                                  // 3회차 (ROI): broker_profiles 조회
        { count: 2, data: [], error: null },                          // 4회차 (ROI): deal_card_creation 횟수 조회
        { count: 0, data: [], error: null },                          // 5회차 (ROI): buyer_intent_created 조회
        { count: 0, data: [], error: null },                          // 6회차 (ROI): match_results 조회
        { count: 0, data: [], error: null },                          // 7회차 (ROI): im_lite_generated 조회
      ];
      
      let queryIdx = 0;
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        gte: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: mockQueryData[queryIdx++], error: null }),
        then: (resolve: any) => {
          const val = mockQueryData[queryIdx++];
          resolve(val);
        }
      };

      const mockSupabase = {
        from: () => mockQueryBuilder
      } as unknown as SupabaseClient;

      const result = await checkFeatureAccess(mockSupabase, "user-123", "deal_card_creation");

      expect(result.tier).toBe("free");
      expect(result.currentCount).toBe(2);
      expect(result.maxLimit).toBe(50);
      expect(result.hasAccess).toBe(true);
      expect(result.estimatedSavingsMoney).toBe(105000);
    });

    it("returns 0 estimatedSavingsMoney instead of fabricated 175000 when broker has 0 saved activity", async () => {
      const mockQueryData = [
        { tier: "free", status: "active", current_period_end: null },
        { current_count: 0, max_limit: 50 },
        { data: null, error: null },
        { count: 0, data: [], error: null },
        { count: 0, data: [], error: null },
        { count: 0, data: [], error: null },
        { count: 0, data: [], error: null },
      ];

      let queryIdx = 0;
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        gte: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: mockQueryData[queryIdx++], error: null }),
        then: (resolve: any) => resolve(mockQueryData[queryIdx++]),
      };

      const mockSupabase = { from: () => mockQueryBuilder } as unknown as SupabaseClient;
      const result = await checkFeatureAccess(mockSupabase, "user-zero", "deal_card_creation");
      expect(result.estimatedSavingsMoney).toBe(0);
    });
  });
});
