/**
 * Unit tests: Analytics Funnel Rate Computation
 *
 * Tests the computeFunnelRates helper that drives the analytics dashboard.
 * Source: docs/13-event-analytics.md section 6
 *         docs/14-test-plan.md section 3.3
 */
import { describe, it, expect } from "vitest";
import { computeFunnelRates } from "@/domain/analytics/admin-analytics";
import type { EventCountMap } from "@/domain/analytics/admin-analytics";

const makeCountMap = (overrides: Partial<EventCountMap>): EventCountMap => ({
  building_ssot_lite_created: 0,
  deal_curiosity_report_generated: 0,
  broker_memo_submitted: 0,
  blind_teaser_generated: 0,
  buyer_intent_created: 0,
  buyer_memo_generated: 0,
  gate_request_created: 0,
  gate_request_reviewed: 0,
  expert_note_requested: 0,
  owner_readiness_checked: 0,
  ai_run_failed: 0,
  ...overrides,
});

describe("computeFunnelRates — zero denominator returns null", () => {
  it("reportCompletionRate is null when building_ssot_lite_created = 0", () => {
    const counts = makeCountMap({ deal_curiosity_report_generated: 5 });
    const rates = computeFunnelRates(counts);
    expect(rates.reportCompletionRate).toBeNull();
  });

  it("gateRequestFromTeaser is null when blind_teaser_generated = 0", () => {
    const counts = makeCountMap({ gate_request_created: 3 });
    const rates = computeFunnelRates(counts);
    expect(rates.gateRequestFromTeaser).toBeNull();
  });
});

describe("computeFunnelRates — correct percentage calculation", () => {
  it("100% report completion rate", () => {
    const counts = makeCountMap({
      building_ssot_lite_created: 10,
      deal_curiosity_report_generated: 10,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.reportCompletionRate).toBe(100);
  });

  it("50% report completion rate", () => {
    const counts = makeCountMap({
      building_ssot_lite_created: 10,
      deal_curiosity_report_generated: 5,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.reportCompletionRate).toBe(50);
  });

  it("25% blind teaser conversion", () => {
    const counts = makeCountMap({
      deal_curiosity_report_generated: 8,
      blind_teaser_generated: 2,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.blindTeaserConversion).toBe(25);
  });

  it("33% expert note conversion (rounds to nearest integer)", () => {
    const counts = makeCountMap({
      deal_curiosity_report_generated: 3,
      expert_note_requested: 1,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.expertNoteConversion).toBe(33);
  });

  it("100% buyer memo conversion", () => {
    const counts = makeCountMap({
      buyer_intent_created: 5,
      buyer_memo_generated: 5,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.buyerMemoConversion).toBe(100);
  });

  it("deal card conversion from broker memos", () => {
    const counts = makeCountMap({
      broker_memo_submitted: 4,
      blind_teaser_generated: 3,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.dealCardConversion).toBe(75);
  });
});

describe("computeFunnelRates — realistic scenario", () => {
  it("broker funnel with realistic numbers", () => {
    const counts = makeCountMap({
      building_ssot_lite_created: 20,
      deal_curiosity_report_generated: 18,
      broker_memo_submitted: 10,
      blind_teaser_generated: 9,
      buyer_intent_created: 6,
      buyer_memo_generated: 5,
      gate_request_created: 3,
      expert_note_requested: 2,
    });
    const rates = computeFunnelRates(counts);
    expect(rates.reportCompletionRate).toBe(90);
    expect(rates.dealCardConversion).toBe(90);
    expect(rates.gateRequestFromTeaser).toBe(33);
    expect(rates.buyerMemoConversion).toBe(83);
  });
});
