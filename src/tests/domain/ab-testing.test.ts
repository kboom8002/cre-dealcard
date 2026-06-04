import { describe, test, expect, vi } from "vitest";
import {
  logAbVariantView,
  logAbVariantClick,
  syncClientReactionToCrm,
  generateWeeklyAdminInsightReport
} from "@/domain/analytics/ab-testing";

// Mock SupabaseClient
const mockSupabase = {
  from: (table: string) => {
    return {
      select: () => {
        return {
          eq: () => ({
            eq: () => ({
              single: () => {
                if (table === "lead_scores") {
                  return Promise.resolve({ data: { id: "existing-lead-id", score: 50, engagement_count: 5 }, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              }
            })
          })
        };
      },
      upsert: (row: any) => {
        return {
          select: () => ({
            single: () => Promise.resolve({ data: row, error: null })
          })
        };
      }
    };
  },
  rpc: (funcName: string) => {
    return Promise.resolve({ error: null });
  }
} as any;

describe("CRE Analytics - G4 A/B, G5 CRM, G6 Admin Reports", () => {
  test("G4: logAbVariantView saves variant definition", async () => {
    const res = await logAbVariantView(mockSupabase, "curation-1", "A", "Title A", "Desc A");
    expect(res.success).toBe(true);
    expect(res.data.variant).toBe("A");
  });

  test("G4: logAbVariantClick runs increment rpc", async () => {
    const res = await logAbVariantClick(mockSupabase, "curation-1", "B");
    expect(res.success).toBe(true);
  });

  test("G5: syncClientReactionToCrm adds score dynamically and caps at 100", async () => {
    const res = await syncClientReactionToCrm(mockSupabase, "broker-1", "김대표", 15, { note: "hot lead" });
    expect(res.score).toBe(65); // 50 + 15 = 65
    expect(res.engagement_count).toBe(6); // 5 + 1 = 6
  });

  test("G6: generateWeeklyAdminInsightReport aggregates stats cleanly", async () => {
    const mockFullSupabase = {
      from: (table: string) => {
        return {
          select: (fields: string, opts?: any) => {
            if (opts?.count) {
              return Promise.resolve({ count: 125, error: null });
            }
            if (table === "poc_surveys") {
              return Promise.resolve({ data: [{ answers: { nps: 10 } }, { answers: { nps: 5 } }], error: null });
            }
            if (table === "market_sentiment_polls") {
              return Promise.resolve({ data: [{ score: 80 }, { score: 90 }], error: null });
            }
            if (table === "activity_events") {
              return Promise.resolve({ data: [{ event_type: "deal_card_created" }, { event_type: "deal_card_created" }], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }
        };
      }
    } as any;

    const report = await generateWeeklyAdminInsightReport(mockFullSupabase);
    expect(report.reportDate).toBeDefined();
    expect(report.metrics.netPromoterScore).toBe(0); // 1 promoter, 1 detractor = 0%
    expect(report.metrics.brokerSentimentIndex).toBe(85); // average of 80 and 90 is 85
    expect(report.topFeaturesUsed[0].name).toBe("deal_card_created");
    expect(report.topFeaturesUsed[0].count).toBe(2);
  });
});
