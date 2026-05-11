/**
 * Unit tests: Zod Schema Validation
 *
 * Tests that AI output schemas accept valid input and reject invalid input.
 * Source: docs/14-test-plan.md section 3.1
 */
import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// ─── Inline schemas mirroring src/ai/schemas/ ─────────────────────────────────

const BuildingMiniTruthSchema = z.object({
  areaSignal: z.string().min(1),
  assetType: z.string().min(1),
  priceBand: z.string().min(1),
  sizeSignal: z.string().nullable(),
  currentUseSignal: z.string().nullable(),
  vacancySignal: z.string().nullable(),
  fitSummary: z.string().min(1),
  cautionSummary: z.string().min(1),
  hiddenFields: z.array(z.string()),
  confidence: z.record(z.string(), z.number()),
});

const BlindTeaserOutputSchema = z.object({
  title: z.string().min(1),
  areaSummary: z.string().min(1),
  dealPoints: z.array(z.string()).min(1).max(5),
  cautionPoints: z.array(z.string()).min(1).max(5),
  disclosureNote: z.string().min(1),
  boundaryNote: z.string().min(1),
  kakaoText: z.string().min(1),
});

const BuyerIntentLiteOutputSchema = z.object({
  buyerType: z.string().min(1),
  budgetRange: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    display: z.string(),
  }),
  preferredRegions: z.array(z.string()),
  purchasePurpose: z.string().min(1),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()).default([]),
  riskTolerance: z.enum(["low", "medium", "high", "unknown"]),
  financingNote: z.string().nullable(),
  missingQuestions: z.array(z.string()),
  privacyNotes: z.string().nullable(),
});

const GateRequestCreateSchema = z.object({
  buildingId: z.string().uuid(),
  requestedLevel: z.enum(["G1", "G2", "G3"]),
  requestedFields: z.array(z.string()).default([]),
  reason: z.string().optional(),
});

const OwnerReadinessChecklistSchema = z.object({
  buildingRegister: z.boolean().default(false),
  registry: z.boolean().default(false),
  landUsePlan: z.boolean().default(false),
  rentRoll: z.boolean().default(false),
  photos: z.boolean().default(false),
  floorPlan: z.boolean().default(false),
  repairHistory: z.boolean().default(false),
  vacancyStatus: z.boolean().default(false),
  askingPrice: z.boolean().default(false),
  disclosurePolicy: z.boolean().default(false),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BuildingMiniTruthSchema", () => {
  const VALID = {
    areaSignal: "성수권역",
    assetType: "근생 복합",
    priceBand: "80억대",
    sizeSignal: "연면적 약 800평 내외",
    currentUseSignal: "1층 상가 + 상층 사무실",
    vacancySignal: null,
    fitSummary: "사옥+임대 겸용 검토 가능",
    cautionSummary: "임대차 만기 확인 필요",
    hiddenFields: ["exact_address", "tenant_name"],
    confidence: { area: 0.9, price: 0.7 },
  };

  it("accepts valid building mini truth", () => {
    expect(() => BuildingMiniTruthSchema.parse(VALID)).not.toThrow();
  });

  it("rejects missing areaSignal", () => {
    expect(() =>
      BuildingMiniTruthSchema.parse({ ...VALID, areaSignal: "" }),
    ).toThrow();
  });

  it("rejects missing assetType", () => {
    expect(() =>
      BuildingMiniTruthSchema.parse({ ...VALID, assetType: undefined }),
    ).toThrow();
  });

  it("allows nullable vacancySignal", () => {
    const result = BuildingMiniTruthSchema.parse({ ...VALID, vacancySignal: null });
    expect(result.vacancySignal).toBeNull();
  });

  it("hiddenFields is an array", () => {
    const result = BuildingMiniTruthSchema.parse(VALID);
    expect(Array.isArray(result.hiddenFields)).toBe(true);
  });
});

describe("BlindTeaserOutputSchema", () => {
  const VALID = {
    title: "성수권역 80억대 근생 자산",
    areaSummary: "성수동 핵심 상권 인근 근생형 자산",
    dealPoints: ["사옥 겸 임대수익 구조", "상업 임차 수요 활발"],
    cautionPoints: ["임대차 만기 확인 필요", "공실 현황 검토 필요"],
    disclosureNote:
      "정확한 주소, 임차인명, 호실별 임대료는 Gate 승인 후 제공됩니다.",
    boundaryNote:
      "이 자료는 예비 검토 자료입니다. 가격, 수익률, 법률, 세무, 대출을 확정하지 않습니다.",
    kakaoText: "[딜카드] 성수권역 80억대 근생",
  };

  it("accepts valid blind teaser", () => {
    expect(() => BlindTeaserOutputSchema.parse(VALID)).not.toThrow();
  });

  it("rejects empty title", () => {
    expect(() =>
      BlindTeaserOutputSchema.parse({ ...VALID, title: "" }),
    ).toThrow();
  });

  it("rejects empty dealPoints array", () => {
    expect(() =>
      BlindTeaserOutputSchema.parse({ ...VALID, dealPoints: [] }),
    ).toThrow();
  });

  it("rejects dealPoints with >5 items", () => {
    expect(() =>
      BlindTeaserOutputSchema.parse({
        ...VALID,
        dealPoints: ["a", "b", "c", "d", "e", "f"],
      }),
    ).toThrow();
  });

  it("boundary note must be present", () => {
    expect(() =>
      BlindTeaserOutputSchema.parse({ ...VALID, boundaryNote: "" }),
    ).toThrow();
  });
});

describe("BuyerIntentLiteOutputSchema", () => {
  const VALID = {
    buyerType: "법인 또는 대표 개인",
    budgetRange: { min: 5000000000, max: 8000000000, display: "50억~80억" },
    preferredRegions: ["성수", "강남"],
    purchasePurpose: "사옥 사용 + 일부 임대수익",
    mustHave: ["주차", "임차인 만기 확인"],
    niceToHave: ["리모델링 가능"],
    riskTolerance: "medium" as const,
    financingNote: "대출 50% 수준 고려",
    missingQuestions: ["정확한 대출 계획?"],
    privacyNotes: "구체적 예산 범위 비공개",
  };

  it("accepts valid buyer intent", () => {
    expect(() => BuyerIntentLiteOutputSchema.parse(VALID)).not.toThrow();
  });

  it("rejects invalid riskTolerance value", () => {
    expect(() =>
      BuyerIntentLiteOutputSchema.parse({
        ...VALID,
        riskTolerance: "extreme",
      }),
    ).toThrow();
  });

  it("allows null financingNote", () => {
    const result = BuyerIntentLiteOutputSchema.parse({
      ...VALID,
      financingNote: null,
    });
    expect(result.financingNote).toBeNull();
  });

  it("niceToHave defaults to empty array", () => {
    const result = BuyerIntentLiteOutputSchema.parse({
      ...VALID,
      niceToHave: undefined,
    });
    expect(result.niceToHave).toEqual([]);
  });
});

describe("GateRequestCreateSchema", () => {
  const VALID = {
    buildingId: "123e4567-e89b-12d3-a456-426614174000",
    requestedLevel: "G2" as const,
    requestedFields: ["exact_address_request"],
    reason: "사옥 이전 후보 검토",
  };

  it("accepts valid G1 gate request", () => {
    expect(() =>
      GateRequestCreateSchema.parse({ ...VALID, requestedLevel: "G1" }),
    ).not.toThrow();
  });

  it("accepts valid G2 gate request", () => {
    expect(() => GateRequestCreateSchema.parse(VALID)).not.toThrow();
  });

  it("accepts valid G3 gate request", () => {
    expect(() =>
      GateRequestCreateSchema.parse({ ...VALID, requestedLevel: "G3" }),
    ).not.toThrow();
  });

  it("rejects G4 gate request (not in MVP)", () => {
    expect(() =>
      GateRequestCreateSchema.parse({ ...VALID, requestedLevel: "G4" }),
    ).toThrow();
  });

  it("rejects invalid buildingId (not UUID)", () => {
    expect(() =>
      GateRequestCreateSchema.parse({ ...VALID, buildingId: "not-a-uuid" }),
    ).toThrow();
  });

  it("requestedFields defaults to empty array", () => {
    const result = GateRequestCreateSchema.parse({
      ...VALID,
      requestedFields: undefined,
    });
    expect(result.requestedFields).toEqual([]);
  });
});

describe("OwnerReadinessChecklistSchema", () => {
  it("all false is valid", () => {
    const result = OwnerReadinessChecklistSchema.parse({});
    expect(result.buildingRegister).toBe(false);
  });

  it("all true is valid", () => {
    const input = Object.fromEntries(
      Object.keys(OwnerReadinessChecklistSchema.shape).map((k) => [k, true]),
    );
    const result = OwnerReadinessChecklistSchema.parse(input);
    expect(result.rentRoll).toBe(true);
  });

  it("defaults missing booleans to false", () => {
    const result = OwnerReadinessChecklistSchema.parse({
      buildingRegister: true,
    });
    expect(result.registry).toBe(false);
    expect(result.rentRoll).toBe(false);
  });
});
