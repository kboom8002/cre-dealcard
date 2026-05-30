import { describe, it, expect, vi, beforeEach } from "vitest";
import { importPortfolioMemos } from "./portfolio-import";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";
import { runBrokerDealCard } from "@/ai/agents/broker-deal-card";

// Mock dependencies
vi.mock("@/domain/building/memo-quality-gate", () => ({
  validateMemoQuality: vi.fn(),
}));

vi.mock("@/ai/agents/broker-deal-card", () => ({
  runBrokerDealCard: vi.fn(),
}));

describe("importPortfolioMemos", () => {
  let mockSupabase: any;
  const userId = "test-broker-id";

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a Chainable Proxy Fluent Mock Client for Supabase
    const createMockChain = () => {
      const chain: any = {};
      const methods = [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "like",
        "ilike",
        "order",
        "limit",
        "single",
        "maybeSingle",
        "contains",
      ];

      methods.forEach((method) => {
        chain[method] = vi.fn().mockImplementation(() => chain);
      });

      // Handle resolving values
      chain.then = vi.fn().mockImplementation((resolve) => {
        resolve({ data: { id: "mocked-building-id" }, error: null });
        return chain;
      });

      return chain;
    };

    mockSupabase = {
      from: vi.fn().mockImplementation(() => createMockChain()),
    };
  });

  it("should split and process multi-line memos successfully", async () => {
    // Setup Mock Returns
    (validateMemoQuality as any).mockReturnValue({
      pass: true,
      score: 4,
      detectedFields: ["location", "asset_type", "numeric", "deal_type"],
      missingFields: [],
      suggestion: "",
    });

    (runBrokerDealCard as any).mockResolvedValue({
      buildingTruth: {
        areaSignal: "강남구 역삼동",
        assetType: "오피스빌딩",
        priceBand: "500억",
        sizeSignal: "1200평",
        fitSummary: "역세권 빌딩",
        cautionSummary: "없음",
      },
    });

    const rawMemosText = `
역삼역 인근 오피스빌딩 매매 500억 연면적 1200평
---
성수동 꼬마빌딩 120억 수익형 매각 3층 건물
    `;

    const summary = await importPortfolioMemos(mockSupabase, userId, rawMemosText);

    expect(summary.totalCount).toBe(2);
    expect(summary.successCount).toBe(2);
    expect(summary.failCount).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[1].success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("building_ssot_lite");
    expect(mockSupabase.from).toHaveBeenCalledWith("activity_events");
  });

  it("should filter out low quality memos at the quality gate", async () => {
    // Setup Mock Returns: First memo passes, second memo fails
    (validateMemoQuality as any)
      .mockReturnValueOnce({
        pass: true,
        score: 3,
        detectedFields: ["location", "asset_type", "deal_type"],
        missingFields: ["numeric"],
        suggestion: "",
      })
      .mockReturnValueOnce({
        pass: false,
        score: 1,
        detectedFields: ["deal_type"],
        missingFields: ["location", "asset_type", "numeric"],
        suggestion: '메모에 다음 정보를 추가해주세요: 위치, 자산 유형, 수치.',
      });

    (runBrokerDealCard as any).mockResolvedValue({
      buildingTruth: {
        areaSignal: "강남구 역삼동",
        assetType: "오피스빌딩",
        priceBand: "500억",
        sizeSignal: "1200평",
        fitSummary: "역세권 빌딩",
        cautionSummary: "없음",
      },
    });

    const rawMemosText = `
역삼역 오피스 매각 원함
---
좋은 빌딩 팝니다
    `;

    const summary = await importPortfolioMemos(mockSupabase, userId, rawMemosText);

    expect(summary.totalCount).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.failCount).toBe(1);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[1].success).toBe(false);
    expect(summary.results[1].errorReason).toContain("최소 품질 미달");
  });
});
