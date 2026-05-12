/**
 * Zod schemas for Buyer Intent Normalizer and Buyer Memo Writer
 * Source: docs/09-ai-agent-contracts.md sections 12-13
 */
import { z } from "zod/v4";

// ---- Buyer Intent Lite Output (section 12.3) ----

export const BuyerIntentLiteOutputSchema = z.object({
  buyerType: z.string().catch("알 수 없음"),
  budgetRange: z.object({
    min: z.coerce.number().nullable().catch(null),
    max: z.coerce.number().nullable().catch(null),
    display: z.string().catch("예산 미정"),
  }),
  preferredRegions: z.array(z.string()).catch([]),
  assetTypes: z.array(z.string()).catch([]),
  purchasePurpose: z.string().catch(""),
  mustHave: z.array(z.string()).catch([]),
  niceToHave: z.array(z.string()).catch([]),
  riskTolerance: z.string().toLowerCase().pipe(z.enum(["low", "medium", "high", "unknown"])).catch("unknown"),
  financingNote: z.string().nullable().catch(null),
  missingQuestions: z.array(z.string()).catch([]),
  privacyNotes: z.array(z.string()).catch([]),
  // Inferred fields (v2 업그레이드)
  inferredPurpose: z.string().pipe(z.enum(["사옥", "투자", "증여", "혼합", "unknown"])).catch("unknown").optional(),
  taxSensitivity: z.string().toLowerCase().pipe(z.enum(["very_high", "high", "medium", "low"])).catch("medium").optional(),
  urgency: z.string().toLowerCase().pipe(z.enum(["high", "medium", "low"])).catch("medium").optional(),
  hiddenKeywords: z.array(z.string()).catch([]).optional(),
  recommendedWeightProfile: z.string().pipe(z.enum(["사옥", "투자", "증여", "default"])).catch("default").optional(),
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
