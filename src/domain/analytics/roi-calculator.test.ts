import { describe, it, expect } from "vitest";
import { calculateBrokerMonthlyRoi } from "./roi-calculator";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("ROI Calculator", () => {
  it("should calculate correctly based on mocked query counts", async () => {
    // 0: broker_profiles (null)
    // 1: dealCards: 2, 2: buyerIntents: 5, 3: matches: 10, 4: im: 1
    const mockResponses = [
      { data: null, error: null }, // broker_profiles
      { count: 2, data: [], error: null }, // deal_card_creation
      { count: 5, data: [], error: null }, // buyer_intent_created
      { count: 10, data: [], error: null }, // match_results
      { count: 1, data: [], error: null }, // im_lite_generated
    ];
    let queryCallIndex = 0;

    const mockQueryBuilder: any = {
      select: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      gte: () => mockQueryBuilder,
      order: () => mockQueryBuilder,
      limit: () => mockQueryBuilder,
      maybeSingle: () => mockQueryBuilder,
      single: () => mockQueryBuilder,
      then: (resolve: any) => {
        const res = mockResponses[queryCallIndex++] || { count: 0, data: [], error: null };
        resolve(res);
      }
    };

    const mockSupabase = {
      from: () => mockQueryBuilder
    } as unknown as SupabaseClient;

    const result = await calculateBrokerMonthlyRoi(mockSupabase, "broker-123");

    // 검산:
    // 2 * 1.5 = 3.0 시간
    // 5 * 0.5 = 2.5 시간
    // 10 * 0.2 = 2.0 시간
    // 1 * 3.0 = 3.0 시간
    // 합계 = 10.5 시간
    // 금액 = 10.5 * ₩35,000 = ₩367,500 원
    expect(result.totalHoursSaved).toBe(10.5);
    expect(result.totalMoneySaved).toBe(367500);
    expect(result.breakdown.dealCardsCount).toBe(2);
    expect(result.breakdown.buyerIntentsCount).toBe(5);
    expect(result.breakdown.matchesCount).toBe(10);
    expect(result.breakdown.imCount).toBe(1);
  });
});
