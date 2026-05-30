import { describe, it, expect } from "vitest";
import { getCurrentBillingMonth, getMonthlyUsage, incrementUsage } from "./usage-tracker";
import { checkFeatureAccess } from "./tier-gate";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Usage Tracker & Tier Gate", () => {
  describe("getCurrentBillingMonth", () => {
    it("should return monthly string in YYYY-MM format", () => {
      const billingMonth = getCurrentBillingMonth();
      expect(billingMonth).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("getMonthlyUsage", () => {
    it("should return correct limit and access status when under limit", async () => {
      // 당월 누적 카운터 조회 시 1회 사용으로 모의
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
      expect(result.hasAccess).toBe(true); // 1 < 3 이므로 억세스 허용
    });

    it("should reject access when limit is reached", async () => {
      // 3회 가득 채운 것으로 모의
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
      expect(result.hasAccess).toBe(false); // 3 == 3 이므로 추가 차단
    });
  });

  describe("checkFeatureAccess", () => {
    it("should integrate with tier limitations and dynamic ROI values", async () => {
      // 1. 유저 티어 조회 (free)
      // 2. 당월 누적 사용량 조회 (2건)
      // 3. 당월 누적 절약 금액(ROI) 조회 (2 * 3.5시간 = 7.0시간 -> ₩350,000)
      const mockQueryData = [
        { tier: "free" },                                  // 1회차: user_subscriptions tier 조회
        { current_count: 2, max_limit: 3 },                // 2회차: usage_counters 조회
        { count: 2, data: [], error: null },               // 3회차 (ROI): deal_card_creation 횟수 조회
        { count: 0, data: [], error: null },               // 4회차 (ROI): buyer_intent_created 조회
        { count: 0, data: [], error: null },               // 5회차 (ROI): match_results 조회
        { count: 0, data: [], error: null },               // 6회차 (ROI): im_lite_generated 조회
      ];
      
      let queryIdx = 0;
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        gte: () => mockQueryBuilder,
        maybeSingle: () => Promise.resolve({ data: mockQueryData[queryIdx++], error: null }),
        // Promise.resolve 형태의 chain 지원
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
      expect(result.maxLimit).toBe(3);
      expect(result.hasAccess).toBe(true); // 2 < 3 이므로 허용
      
      // 2건의 딜카드 생성 * 3.5시간 * 50,000 = ₩350,000 절약 가치 연동 성공!
      expect(result.estimatedSavingsMoney).toBe(350000);
    });
  });
});
