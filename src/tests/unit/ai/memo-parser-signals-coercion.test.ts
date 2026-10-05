import { describe, it, expect } from "vitest";
import {
  MemoParserOutputSchema,
  TradingSignalsSchema,
  HospitalitySignalsSchema,
  DevelopmentSignalsSchema,
  OwnerOccupiedSignalsSchema,
  coerceSignalNumber,
  collectRangeNotes,
} from "@/ai/schemas/broker-deal-card";

describe("MemoParser *Signals 숫자 coercion (D12)", () => {
  it("marketPriceManwon 배열(범위)도 파싱 성공 → 단일 숫자", () => {
    const r = MemoParserOutputSchema.safeParse({
      extractedFacts: { tradingSignals: { marketPriceManwon: [80000, 90000] } },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data.extractedFacts.tradingSignals.marketPriceManwon).toBe("number");
      expect(r.data.extractedFacts.tradingSignals.marketPriceManwon).toBe(80000);
      expect(r.data.extractedFacts.tradingSignals.pricePerPyeongManwon).toBeNull();
    }
  });

  it("coerceSignalNumber: 배열/콤마 문자열/잡값", () => {
    expect(coerceSignalNumber([90000, 80000, 100000])).toBe(90000);
    expect(coerceSignalNumber(["80,000", "90,000"])).toBe(80000);
    expect(coerceSignalNumber("1,234")).toBe(1234);
    expect(coerceSignalNumber(42)).toBe(42);
    expect(coerceSignalNumber([])).toBeNull();
    expect(coerceSignalNumber(["약 8억"])).toBeNull();
    expect(coerceSignalNumber("8~9억")).toBeNull();
    expect(coerceSignalNumber(undefined)).toBeNull();
    expect(coerceSignalNumber(NaN)).toBeNull();
  });

  it("모든 *Signals 서브스키마가 배열 값을 단일 숫자로 수용", () => {
    expect(HospitalitySignalsSchema.parse({ roomCount: [50, 60], adr: ["10", "12"] })).toMatchObject({ roomCount: 50, adr: 10, occupancyRate: null });
    expect(DevelopmentSignalsSchema.parse({ farPct: [300, 400], bcrPct: "60" })).toMatchObject({ farPct: 300, bcrPct: 60, landAreaPyung: null });
    expect(TradingSignalsSchema.parse({ holdingPeriodMonths: [12, 24], pricePerPyeongManwon: "5,000" })).toMatchObject({ holdingPeriodMonths: 12, pricePerPyeongManwon: 5000 });
    expect(OwnerOccupiedSignalsSchema.parse({ currentLeaseCostManwon: [300, 400], selfUseIntent: true })).toMatchObject({ currentLeaseCostManwon: 300, selfUseIntent: true });
  });

  it("빈 객체/누락 필드는 기본값 null", () => {
    expect(TradingSignalsSchema.parse({})).toEqual({ pricePerPyeongManwon: null, marketPriceManwon: null, holdingPeriodMonths: null });
  });

  it("collectRangeNotes: 범위 배열만 문자열로 수집", () => {
    expect(collectRangeNotes({ marketPriceManwon: [80000, 90000], pricePerPyeongManwon: 5000, holdingPeriodMonths: [12] }))
      .toEqual(["marketPriceManwon 범위: 80000~90000"]);
    expect(collectRangeNotes(null)).toEqual([]);
  });
});
