/**
 * src/domain/building/mobile-im/__tests__/comparable-benchmark.test.ts
 * 비교사례 벤치마킹 단위 테스트
 */
import { describe, it, expect } from "vitest";
import { calculateBenchmarkMetrics } from "../comparable-benchmark";
import type { ComparableListing } from "@/lib/external/naver-realestate-api";

const mockComparables: ComparableListing[] = [
  { source: "네이버부동산", title: "A빌딩", priceKrw: 4e9, pricePerSqmKrw: 20e6, areaSqm: 200, distanceKm: 0.3, listedDate: "2026-06-01" },
  { source: "네이버부동산", title: "B빌딩", priceKrw: 6e9, pricePerSqmKrw: 24e6, areaSqm: 250, distanceKm: 0.5, listedDate: "2026-05-15" },
];

describe("Comparable Benchmark", () => {
  it("should return Market Rate when price is near average", () => {
    // avg = 22M/㎡, target = 22M/㎡ → Market Rate
    const result = calculateBenchmarkMetrics(4.4e9, 200, mockComparables);
    expect(result.competitivenessStatus).toBe("Market Rate");
    expect(Math.abs(result.premiumPct)).toBeLessThan(5);
  });

  it("should flag Highly Competitive when price is below average by >5%", () => {
    // avg = 22M/㎡, target = 18M/㎡ → -18% → Highly Competitive
    const result = calculateBenchmarkMetrics(3.6e9, 200, mockComparables);
    expect(result.competitivenessStatus).toBe("Highly Competitive");
    expect(result.premiumPct).toBeLessThan(-5);
  });

  it("should flag Overpriced when price exceeds average by >10%", () => {
    // avg = 22M/㎡, target = 30M/㎡ → +36% → Overpriced
    const result = calculateBenchmarkMetrics(6e9, 200, mockComparables);
    expect(result.competitivenessStatus).toBe("Overpriced");
    expect(result.premiumPct).toBeGreaterThan(10);
  });

  it("should handle zero comparables gracefully", () => {
    const result = calculateBenchmarkMetrics(4e9, 200, []);
    expect(result.competitivenessStatus).toBe("Market Rate");
    expect(result.avgComparablePricePerSqm).toBe(0);
  });

  it("should handle zero area gracefully", () => {
    const result = calculateBenchmarkMetrics(4e9, 0, mockComparables);
    expect(result.targetPricePerSqm).toBe(0);
  });
});
