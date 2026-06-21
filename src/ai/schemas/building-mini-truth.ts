/**
 * Zod schemas for Building Mini Truth (Building SSoT Lite)
 * Source: docs/09-ai-agent-contracts.md section 8
 */
import { z } from "zod/v4";

export const HiddenFieldEnum = z.enum([
  "exact_address",
  "tenant_name",
  "unit_rent",
  "seller_motivation",
  "negotiation_memo",
  "owner_identity",
  "buyer_identity",
  "registry_detail",
  "lease_contract_raw_text",
]);

export const ConfidenceLevelEnum = z.enum([
  "confirmed",
  "user_provided",
  "public_data_inferred",
  "ai_hypothesis",
  "needs_verification",
  "unknown",
]);

export const BuildingMiniTruthOutputSchema = z.object({
  areaSignal: z.string(),
  assetType: z.string(),
  priceBand: z.string().nullable().default(null),
  sizeSignal: z.string().nullable().default(null),
  currentUseSignal: z.string().nullable().default(null),
  vacancySignal: z.string().nullable().default(null),
  fitSummary: z.string().default(""),
  cautionSummary: z.string().default(""),
  hiddenFields: z.array(HiddenFieldEnum).default([]),
  confidence: z.object({
    areaSignal: ConfidenceLevelEnum.default("ai_hypothesis"),
    assetType: ConfidenceLevelEnum.default("ai_hypothesis"),
    priceBand: ConfidenceLevelEnum.default("needs_verification"),
    fitSummary: z.enum(["ai_hypothesis", "needs_verification"]).default("ai_hypothesis"),
  }).default({ areaSignal: "ai_hypothesis", assetType: "ai_hypothesis", priceBand: "needs_verification", fitSummary: "ai_hypothesis" }),
  missingData: z.array(z.string()).default([]),
  boundaryNote: z.string().default("이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다."),
});

export type BuildingMiniTruthOutput = z.infer<
  typeof BuildingMiniTruthOutputSchema
>;
