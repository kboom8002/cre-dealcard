import { describe, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getMarketIntel } from "@/app/api/public/market-intelligence/route";

// Mock Supabase service
vi.mock("@/lib/supabase/service", () => {
  return {
    createServiceClient: () => {
      const mockResult = { data: [{}], error: null };
      const fromMock = (table: string) => {
        const deleteChain = {
          eq: () => deleteChain,
          then: (resolve: any) => resolve({ data: null, error: null })
        };

        return {
          insert: () => {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "inserted-id" }, error: null })
              })
            };
          },
          upsert: () => {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "upserted-id" }, error: null })
              })
            };
          },
          select: () => {
            return {
              limit: () => Promise.resolve(mockResult),
              order: () => ({
                limit: () => Promise.resolve(mockResult)
              })
            };
          },
          delete: () => deleteChain
        };
      };
      return { from: fromMock };
    }
  };
});

// Mock external government APIs to avoid network timeouts
vi.mock("@/domain/external/gov-premium-apis", () => ({
  fetchRentalTrend: vi.fn().mockResolvedValue({ id: 1 }),
  fetchEnergyRating: vi.fn().mockResolvedValue({ id: 1 }),
  fetchCommercialDistrict: vi.fn().mockResolvedValue({ id: 1 }),
  fetchOfficialLandPrice: vi.fn().mockResolvedValue({ price_per_sqm: 1000n })
}));

// Mock market crawlers to avoid network timeouts
vi.mock("@/domain/external/market-crawlers", () => ({
  crawlCreNews: vi.fn().mockResolvedValue([{ id: 1 }]),
  ingestGlobalReports: vi.fn().mockResolvedValue([{ id: 1 }]),
  trackSocialSentiment: vi.fn().mockResolvedValue([{ id: 1 }]),
  trackYoutubeTrends: vi.fn().mockResolvedValue([{ id: 1 }]),
  crawlAuctions: vi.fn().mockResolvedValue([{ id: 1 }]),
  computeRentalMarketRates: vi.fn().mockResolvedValue([{ id: 1 }])
}));

describe("CRE External Intelligence Market Crawlers (E2-E7)", () => {
  test("GET /api/public/market-intelligence?action=crawl triggers crawlers and returns statistics", async () => {
    const req = new NextRequest("http://localhost:3000/api/public/market-intelligence?action=crawl");
    const res = await getMarketIntel(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary.newsFetched).toBeGreaterThan(0);
    expect(body.summary.reportsFetched).toBeGreaterThan(0);
  }, 15000);

  test("GET /api/public/market-intelligence returns consolidated view", async () => {
    const req = new NextRequest("http://localhost:3000/api/public/market-intelligence");
    const res = await getMarketIntel(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.news).toBeDefined();
    expect(body.data.reports).toBeDefined();
    expect(body.data.youtube).toBeDefined();
  });
});
