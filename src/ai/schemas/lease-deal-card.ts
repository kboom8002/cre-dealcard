/**
 * Zod schemas for LeaseMemoParser and LeaseBlindTeaser
 * Inspired by docs/09-ai-agent-contracts.md and docs/leasing-dealcard-expansion-strategy.md
 */
import { z } from "zod/v4";

// ---- Lease Memo Parser Output ----

export const LeaseMemoParserOutputSchema = z.object({
  extractedFacts: z.object({
    region: z.string().nullable(),
    exactAddressCandidate: z.string().nullable(),
    exactUnitCandidate: z.string().nullable(),
    floor: z.string().nullable(),
    areaSqmText: z.string().nullable(),
    spaceType: z.enum(["office", "retail", "f_and_b", "warehouse", "other"]).nullable(),
    depositText: z.string().nullable(),
    monthlyRentText: z.string().nullable(),
    maintenanceFeeText: z.string().nullable(),
    availableFromText: z.string().nullable(),
    leaseTermMonthsText: z.string().nullable(),
    incentivesText: z.string().nullable(),
    restrictions: z.array(z.string()).default([]),
    landlordIdentity: z.string().nullable(),
    currentTenant: z.string().nullable(),
    vacancyReason: z.string().nullable(),
    rentNegotiation: z.string().nullable(),
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
  ),
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
  region: z.string(),
  floor: z.string().nullable(),
  areaSqm: z.number().nullable(),
  spaceType: z.enum(["office", "retail", "f_and_b", "warehouse", "other"]),
  deposit: z.number().nullable(),       // 만원 단위 수치화
  monthlyRent: z.number().nullable(),   // 만원 단위 수치화
  maintenanceFee: z.number().nullable(), // 만원 단위 수치화
  availableFrom: z.string().nullable(),  // ISO Date or '즉시입주'
  leaseTermMonths: z.number().nullable(),
  incentives: z.object({
    rentFreeMonths: z.number().default(0),
    interiorSupport: z.string().nullable().default(null),
    freeRentDetail: z.string().nullable().default(null),
  }),
  restrictions: z.array(z.string()).default([]),
  fitSummary: z.string(),
  cautionSummary: z.string(),
  hiddenFields: z.array(LeaseHiddenFieldEnum),
  confidence: z.object({
    region: LeaseConfidenceLevelEnum,
    spaceType: LeaseConfidenceLevelEnum,
    rent: LeaseConfidenceLevelEnum,
    fitSummary: z.enum(["ai_hypothesis", "needs_verification"]),
  }),
  missingData: z.array(z.string()),
  boundaryNote: z.string(),
});

export type LeaseMiniTruthOutput = z.infer<typeof LeaseMiniTruthOutputSchema>;


// ---- Lease Blind Teaser Output ----

export const LeaseBlindTeaserOutputSchema = z.object({
  title: z.string(),
  shortSummary: z.string(),
  dealPoints: z.array(z.string()).min(2).max(7),
  cautionPoints: z.array(z.string()).min(1).max(7),
  hiddenInfoNotice: z.array(z.string()),
  gateMessage: z.string(),
  kakaoText: z.string(),
  boundaryNote: z.string(),
});

export type LeaseBlindTeaserOutput = z.infer<typeof LeaseBlindTeaserOutputSchema>;
