/**
 * Zod schemas for LeaseMemoParser and LeaseBlindTeaser
 * Inspired by docs/09-ai-agent-contracts.md and docs/leasing-dealcard-expansion-strategy.md
 */
import { z } from "zod/v4";

// ---- Lease Memo Parser Output ----

export const LeaseMemoParserOutputSchema = z.object({
  extractedFacts: z.object({
    region: z.string().nullable().default(null),
    exactAddressCandidate: z.string().nullable().default(null),
    exactUnitCandidate: z.string().nullable().default(null),
    floor: z.string().nullable().default(null),
    areaSqmText: z.string().nullable().default(null),
    spaceType: z.enum(["office", "retail", "f_and_b", "warehouse", "other"]).nullable().default(null),
    depositText: z.string().nullable().default(null),
    monthlyRentText: z.string().nullable().default(null),
    maintenanceFeeText: z.string().nullable().default(null),
    availableFromText: z.string().nullable().default(null),
    leaseTermMonthsText: z.string().nullable().default(null),
    incentivesText: z.string().nullable().default(null),
    restrictions: z.array(z.string()).default([]),
    landlordIdentity: z.string().nullable().default(null),
    currentTenant: z.string().nullable().default(null),
    vacancyReason: z.string().nullable().default(null),
    rentNegotiation: z.string().nullable().default(null),
    brokerNotes: z.array(z.string()).default([]),
  }),
  detectedSensitiveFields: z.array(
    z.enum([
      "exact_address",
      "exact_unit",
      "landlord_identity",
      "current_tenant",
      "vacancy_reason",
      "rent_negotiation",
      "incentive_detail",
    ]),
  ).default([]),
  ambiguousFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type LeaseMemoParserOutput = z.infer<typeof LeaseMemoParserOutputSchema>;


// ---- Lease SSoT Lite (Mini Truth) Schema ----

export const LeaseHiddenFieldEnum = z.enum([
  "exact_address",
  "exact_unit",
  "landlord_identity",
  "current_tenant",
  "vacancy_reason",
  "rent_negotiation",
  "incentive_detail",
  "lease_contract_raw_text",
]);

export const LeaseConfidenceLevelEnum = z.enum([
  "confirmed",
  "user_provided",
  "public_data_inferred",
  "ai_hypothesis",
  "needs_verification",
  "unknown",
]);

export const LeaseMiniTruthOutputSchema = z.object({
  region: z.string().default(""),
  floor: z.string().nullable().default(null),
  areaSqm: z.number().nullable().default(null),
  spaceType: z.enum(["office", "retail", "f_and_b", "warehouse", "other"]).default("other"),
  deposit: z.number().nullable().default(null),       // 만원 단위 수치화
  monthlyRent: z.number().nullable().default(null),   // 만원 단위 수치화
  maintenanceFee: z.number().nullable().default(null), // 만원 단위 수치화
  availableFrom: z.string().nullable().default(null),  // ISO Date or '즉시입주'
  leaseTermMonths: z.number().nullable().default(null),
  incentives: z.object({
    rentFreeMonths: z.number().nullable().default(0),
    interiorSupport: z.string().nullable().default(null),
    freeRentDetail: z.string().nullable().default(null),
  }).default({
    rentFreeMonths: 0,
    interiorSupport: null,
    freeRentDetail: null,
  }),
  restrictions: z.array(z.string()).default([]),
  fitSummary: z.string().default(""),
  cautionSummary: z.string().default(""),
  hiddenFields: z.array(LeaseHiddenFieldEnum).default([]),
  confidence: z.object({
    region: LeaseConfidenceLevelEnum.default("ai_hypothesis"),
    spaceType: LeaseConfidenceLevelEnum.default("ai_hypothesis"),
    rent: LeaseConfidenceLevelEnum.default("needs_verification"),
    fitSummary: z.enum(["ai_hypothesis", "needs_verification"]).default("ai_hypothesis"),
  }).default({
    region: "ai_hypothesis",
    spaceType: "ai_hypothesis",
    rent: "needs_verification",
    fitSummary: "ai_hypothesis",
  }),
  missingData: z.array(z.string()).default([]),
  boundaryNote: z.string().default(""),
});

export type LeaseMiniTruthOutput = z.infer<typeof LeaseMiniTruthOutputSchema>;


// ---- Lease Blind Teaser Output ----

export const LeaseBlindTeaserOutputSchema = z.object({
  title: z.string(),
  shortSummary: z.string().default(""),
  dealPoints: z.array(z.string()).min(2).max(7).default(["입지 및 공간 여건 우수", "즉시 입주 검토 가능"]),
  cautionPoints: z.array(z.string()).min(1).max(7).default(["현장 실사 및 계약 조건 확인 필요"]),
  hiddenInfoNotice: z.array(z.string()).default([]),
  gateMessage: z.string().default(""),
  kakaoText: z.string().default(""),
  boundaryNote: z.string().default(""),
  // ── v3 마케팅 확장 필드 ──
  hookCopy: z.string().optional(),
  structureChips: z.array(z.string()).optional(),
  regionLabel: z.string().optional(),
  assetTypeLabel: z.string().optional(),
  vacancyLabel: z.string().optional(),
  curiosityHook: z.string().optional(),
});

export type LeaseBlindTeaserOutput = z.infer<typeof LeaseBlindTeaserOutputSchema>;
