import { describe, it, expect } from "vitest";
import { calculateBrokerMonthlyRoi } from "./roi-calculator";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("ROI Calculator", () => {
  it("should calculate correctly based on mocked query counts", async () => {
    // 4회의 Supabase 카운트 조회 쿼리에 대해 순차적으로 반환할 데이터 정의
    // 딜카드: 2건, 매수자: 5건, 매칭: 10건, IM: 1건
    const mockCounts = [2, 5, 10, 1];
    let queryCallIndex = 0;

    // Fluent 인터페이스 체인 및 Promise(then)를 완벽 지원하는 Mock Supabase Client
    const mockQueryBuilder: any = {
      select: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      gte: () => mockQueryBuilder,
      order: () => mockQueryBuilder,
      limit: () => mockQueryBuilder,
      maybeSingle: () => mockQueryBuilder,
      single: () => mockQueryBuilder,
      // async/await를 만나면 then 메소드가 실행되어 결과를 반환합니다.
      then: (resolve: any) => {
        const countVal = mockCounts[queryCallIndex++];
        resolve({ count: countVal, data: [], error: null });
      }
    };

    const mockSupabase = {
      from: () => mockQueryBuilder
    } as unknown as SupabaseClient;

    const result = await calculateBrokerMonthlyRoi(mockSupabase, "broker-123");

    // 검산:
    // 2 * 3.5 = 7.0 시간
    // 5 * 0.9 = 4.5 시간
    // 10 * 2.0 = 20.0 시간
    // 1 * 7.0 = 7.0 시간
    // 합계 = 38.5 시간
    // 금액 = 38.5 * ₩50,000 = ₩1,925,000 원
    expect(result.totalHoursSaved).toBe(38.5);
    expect(result.totalMoneySaved).toBe(1925000);
    expect(result.breakdown.dealCardsCount).toBe(2);
    expect(result.breakdown.buyerIntentsCount).toBe(5);
    expect(result.breakdown.matchesCount).toBe(10);
    expect(result.breakdown.imCount).toBe(1);
  });
});
