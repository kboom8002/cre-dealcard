/**
 * Zod schemas for Buyer Intent Normalizer and Buyer Memo Writer
 * Source: docs/09-ai-agent-contracts.md sections 12-13
 */
import { z } from "zod/v4";

// ---- Buyer Intent Lite Output (section 12.3) ----

export const BuyerIntentLiteOutputSchema = z.object({
  buyerType: z.string(),
  budgetRange: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    display: z.string(),
  }),
  preferredRegions: z.array(z.string()),
  assetTypes: z.array(z.string()),
  purchasePurpose: z.string(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  riskTolerance: z.enum(["low", "medium", "high", "unknown"]),
  financingNote: z.string().nullable(),
  missingQuestions: z.array(z.string()),
  privacyNotes: z.array(z.string()),
  // Inferred fields (v2 업그레이드) — optional for backward compat
  inferredPurpose: z.enum(["사옥", "투자", "증여", "혼합", "unknown"]).optional(),
  taxSensitivity: z.enum(["very_high", "high", "medium", "low"]).optional(),
  urgency: z.enum(["high", "medium", "low"]).optional(),
  hiddenKeywords: z.array(z.string()).optional(),
  recommendedWeightProfile: z.enum(["사옥", "투자", "증여", "default"]).optional(),
});

export type BuyerIntentLiteOutput = z.infer<typeof BuyerIntentLiteOutputSchema>;

// ---- Buyer Memo Output (section 13.3) ----

export const BuyerMemoOutputSchema = z.object({
  fitReasons: z.array(z.string()),
  cautionReasons: z.array(z.string()),
  missingData: z.array(z.string()),
  recommendedNextAction: z.string(),
  kakaoMessage: z.string(),
  boundaryNote: z.string(),
});

export type BuyerMemoOutput = z.infer<typeof BuyerMemoOutputSchema>;
