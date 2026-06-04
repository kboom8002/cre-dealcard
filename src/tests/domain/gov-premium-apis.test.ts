import { describe, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getGovData } from "@/app/api/public/gov-data/route";

// Mock Supabase service
vi.mock("@/lib/supabase/service", () => {
  return {
    createServiceClient: () => {
      const fromMock = (table: string) => {
        const deleteChain = {
          eq: () => deleteChain,
          then: (resolve: any) => resolve({ data: null, error: null })
        };

        return {
          insert: (row: any) => {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null })
              })
            };
          },
          upsert: (row: any) => {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null })
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

describe("CRE Premium Government APIs (A1-A6)", () => {
  test("GET /api/public/gov-data?action=verify triggers all government endpoints", async () => {
    const req = new NextRequest("http://localhost:3000/api/public/gov-data?action=verify");
    const res = await getGovData(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.rentalTrend).toBeDefined();
    expect(body.data.landUse).toBeDefined();
    expect(body.data.registerSummary.ok).toBe(true);
    expect(body.data.energyRating).toBeDefined();
    expect(body.data.district).toBeDefined();
    expect(body.data.officialPrice).toBeDefined();
  });
});
