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
  priceBand: z.string().nullable(),
  sizeSignal: z.string().nullable(),
  currentUseSignal: z.string().nullable(),
  vacancySignal: z.string().nullable(),
  fitSummary: z.string(),
  cautionSummary: z.string(),
  hiddenFields: z.array(HiddenFieldEnum),
  confidence: z.object({
    areaSignal: ConfidenceLevelEnum,
    assetType: ConfidenceLevelEnum,
    priceBand: ConfidenceLevelEnum,
    fitSummary: z.enum(["ai_hypothesis", "needs_verification"]),
  }),
  missingData: z.array(z.string()),
  boundaryNote: z.string(),
});

export type BuildingMiniTruthOutput = z.infer<
  typeof BuildingMiniTruthOutputSchema
>;
