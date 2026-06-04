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

describe("CRE External Intelligence Market Crawlers (E2-E7)", () => {
  test("GET /api/public/market-intelligence?action=crawl triggers crawlers and returns statistics", async () => {
    const req = new NextRequest("http://localhost:3000/api/public/market-intelligence?action=crawl");
    const res = await getMarketIntel(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary.newsFetched).toBeGreaterThan(0);
    expect(body.summary.reportsFetched).toBeGreaterThan(0);
  });

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
