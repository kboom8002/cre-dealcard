import { describe, it, expect, vi } from "vitest";
import { detectAnomalies } from "./hallucination-detector";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("AI Hallucination & Anomaly Detector", () => {
  it("should output zero flags for a completely normal building result", async () => {
    const mockSupabase = {} as unknown as SupabaseClient;
    const output = {
      areaSignal: "서울특별시 강남구 역삼동",
      assetType: "오피스빌딩",
      priceBand: "300억",
      sizeSignal: "연면적 3,000평",
    };

    const flags = await detectAnomalies(mockSupabase, "", output);
    expect(flags).toHaveLength(0);
  });

  it("should detect price_outlier for extremely high price", async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const output = {
      areaSignal: "역삼역",
      assetType: "오피스빌딩",
      priceBand: "6조 5천억원", // 6조는 5조 상한 초과
      sizeSignal: "3000평",
    };

    const flags = await detectAnomalies(mockSupabase, "run-111", output);
    
    expect(flags).toContainEqual(
      expect.objectContaining({
        type: "price_outlier",
        severity: "critical",
      })
    );
    expect(mockFrom).toHaveBeenCalledWith("ai_runs");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("should detect size_outlier for unrealistically small area", async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const output = {
      areaSignal: "여의도",
      assetType: "오피스",
      priceBand: "50억",
      sizeSignal: "연면적 0.5평", // 1평 미만
    };

    const flags = await detectAnomalies(mockSupabase, "run-222", output);
    
    expect(flags).toContainEqual(
      expect.objectContaining({
        type: "size_outlier",
        severity: "critical",
      })
    );
  });

  it("should detect region_hallucination for foreign address text", async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const output = {
      areaSignal: "미국 뉴욕 맨해튼 5번가", // 국내 주요 권역 없음
      assetType: "오피스빌딩",
      priceBand: "100억",
      sizeSignal: "300평",
    };

    const flags = await detectAnomalies(mockSupabase, "run-333", output);
    
    expect(flags).toContainEqual(
      expect.objectContaining({
        type: "region_hallucination",
        severity: "critical",
      })
    );
  });
});
