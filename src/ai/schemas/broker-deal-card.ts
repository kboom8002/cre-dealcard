/**
 * Zod schemas for MemoParser, DisclosureGuard, and BlindTeaser
 * Source: docs/09-ai-agent-contracts.md sections 7, 9, 10
 */
import { z } from "zod/v4";

// ---- Memo Parser Output (section 7.3) ----

export const MemoParserOutputSchema = z.object({
  extractedFacts: z.object({
    region: z.string().nullable().default(null),
    exactAddressCandidate: z.string().nullable().default(null),
    assetType: z.string().nullable().default(null),
    priceText: z.string().nullable().default(null),
    sizeText: z.string().nullable().default(null),
    currentUse: z.string().nullable().default(null),
    leaseSignal: z.string().nullable().default(null),
    vacancySignal: z.string().nullable().default(null),
    tenantNames: z.array(z.string()).default([]),
    unitRentTexts: z.array(z.string()).default([]),
    sellerMotivationText: z.string().nullable().default(null),
    brokerNotes: z.array(z.string()).default([]),
  }),
  detectedSensitiveFields: z.array(
    z.enum([
      "exact_address",
      "tenant_name",
      "unit_rent",
      "seller_motivation",
      "negotiation_memo",
      "owner_identity",
      "buyer_identity",
    ]),
  ).default([]),
  ambiguousFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type MemoParserOutput = z.infer<typeof MemoParserOutputSchema>;

// ---- Signal Composer Output (section 10.3) ----

export const SignalComposerOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  dealPoints: z.array(z.string()).min(2).max(7),
  cautionPoints: z.array(z.string()).min(1).max(7),
  hiddenInfoNotice: z.array(z.string()),
  recommendedGateLevel: z.enum([
    "G0_PUBLIC_SIGNAL",
    "G1_REGISTERED_INTEREST",
    "G2_QUALIFIED_SUMMARY",
    "G3_SNAPSHOT_OR_IM_LITE",
  ]),
  kakaoText: z.string(),
  boundaryNote: z.string(),
});

export type SignalComposerOutput = z.infer<typeof SignalComposerOutputSchema>;

// ---- Blind Teaser Output (prompt 8) ----

export const BlindTeaserOutputSchema = z.object({
  title: z.string(),
  shortSummary: z.string().default(""),
  dealPoints: z.array(z.string()).min(1).max(10),
  cautionPoints: z.array(z.string()).min(1).max(10),
  hiddenInfoNotice: z.array(z.string()).default([]),
  gateMessage: z.string().default(""),
  kakaoText: z.string(),
  boundaryNote: z.string().default(""),
});

export type BlindTeaserOutput = z.infer<typeof BlindTeaserOutputSchema>;
