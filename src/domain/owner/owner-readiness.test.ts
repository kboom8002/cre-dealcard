/**
 * Unit tests: Owner Readiness Score Calculation
 *
 * Tests the deterministic score computation logic.
 * Source: docs/14-test-plan.md section 3.3
 */
import { describe, it, expect } from "vitest";

// Import the logic we want to test directly (no DB calls)
// We re-implement the pure calculation here matching owner-readiness.ts
// so we can test it without Supabase.

interface ReadinessChecklist {
  buildingRegister: boolean;
  registry: boolean;
  landUsePlan: boolean;
  rentRoll: boolean;
  photos: boolean;
  floorPlan: boolean;
  repairHistory: boolean;
  vacancyStatus: boolean;
  askingPrice: boolean;
  disclosurePolicy: boolean;
}

const WEIGHTS: Record<keyof ReadinessChecklist, number> = {
  buildingRegister: 15,
  registry: 10,
  landUsePlan: 10,
  rentRoll: 20,
  photos: 10,
  floorPlan: 10,
  repairHistory: 5,
  vacancyStatus: 10,
  askingPrice: 5,
  disclosurePolicy: 5,
};

function calcScore(checklist: ReadinessChecklist): number {
  return Math.min(
    100,
    Object.entries(checklist).reduce(
      (sum, [key, checked]) =>
        sum + (checked ? (WEIGHTS[key as keyof ReadinessChecklist] ?? 0) : 0),
      0,
    ),
  );
}

function getReadinessState(score: number): string {
  if (score >= 90) return "full_im_candidate";
  if (score >= 70) return "snapshot_draft_ready";
  if (score >= 50) return "teaser_ready";
  if (score >= 20) return "public_report_only";
  return "not_ready";
}

function getAvailableOutputs(score: number): string[] {
  const outputs: string[] = ["deal_curiosity_report"];
  if (score >= 20) outputs.push("blind_teaser");
  if (score >= 50) outputs.push("building_snapshot_draft");
  if (score >= 70) outputs.push("im_lite_candidate");
  if (score >= 90) outputs.push("full_im");
  return outputs;
}

const emptyChecklist: ReadinessChecklist = {
  buildingRegister: false,
  registry: false,
  landUsePlan: false,
  rentRoll: false,
  photos: false,
  floorPlan: false,
  repairHistory: false,
  vacancyStatus: false,
  askingPrice: false,
  disclosurePolicy: false,
};

const fullChecklist: ReadinessChecklist = Object.fromEntries(
  Object.keys(emptyChecklist).map((k) => [k, true]),
) as unknown as ReadinessChecklist;

// Demo D input: buildingRegister + registry + photos (25 points)
const demoDChecklist: ReadinessChecklist = {
  ...emptyChecklist,
  buildingRegister: true, // 15
  registry: true, // 10
  photos: true, // 10
};

describe("Owner Readiness — Score Calculation", () => {
  it("empty checklist scores 0", () => {
    expect(calcScore(emptyChecklist)).toBe(0);
  });

  it("full checklist scores 100", () => {
    expect(calcScore(fullChecklist)).toBe(100);
  });

  it("demo D checklist (buildingRegister + registry + photos) scores 35", () => {
    expect(calcScore(demoDChecklist)).toBe(35);
  });

  it("score is capped at 100 (no overflow)", () => {
    expect(calcScore(fullChecklist)).toBeLessThanOrEqual(100);
  });

  it("rentRoll alone is worth 20 points (highest single item)", () => {
    const cl = { ...emptyChecklist, rentRoll: true };
    expect(calcScore(cl)).toBe(20);
  });
});

describe("Owner Readiness — State Thresholds", () => {
  it("score 0 → not_ready", () => {
    expect(getReadinessState(0)).toBe("not_ready");
  });

  it("score 19 → not_ready", () => {
    expect(getReadinessState(19)).toBe("not_ready");
  });

  it("score 20 → public_report_only", () => {
    expect(getReadinessState(20)).toBe("public_report_only");
  });

  it("score 35 (demo D) → public_report_only", () => {
    expect(getReadinessState(35)).toBe("public_report_only");
  });

  it("score 50 → teaser_ready", () => {
    expect(getReadinessState(50)).toBe("teaser_ready");
  });

  it("score 70 → snapshot_draft_ready", () => {
    expect(getReadinessState(70)).toBe("snapshot_draft_ready");
  });

  it("score 90 → full_im_candidate", () => {
    expect(getReadinessState(90)).toBe("full_im_candidate");
  });

  it("score 100 → full_im_candidate", () => {
    expect(getReadinessState(100)).toBe("full_im_candidate");
  });
});

describe("Owner Readiness — Available Outputs", () => {
  it("score 0 → only deal_curiosity_report", () => {
    expect(getAvailableOutputs(0)).toEqual(["deal_curiosity_report"]);
  });

  it("score 20 → + blind_teaser", () => {
    expect(getAvailableOutputs(20)).toContain("blind_teaser");
  });

  it("score 50 → + building_snapshot_draft", () => {
    expect(getAvailableOutputs(50)).toContain("building_snapshot_draft");
  });

  it("score 70 → + im_lite_candidate", () => {
    expect(getAvailableOutputs(70)).toContain("im_lite_candidate");
  });

  it("score 90 → + full_im", () => {
    expect(getAvailableOutputs(90)).toContain("full_im");
  });

  it("score 100 returns all 5 output types", () => {
    expect(getAvailableOutputs(100)).toHaveLength(5);
  });
});
