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
    hospitalitySignals: z.object({
      roomCount: z.number().nullable().default(null),
      adr: z.number().nullable().default(null),         // 만원/박
      occupancyRate: z.number().nullable().default(null), // %
      gopMargin: z.number().nullable().default(null),     // %
      operatingModel: z.string().nullable().default(null),
    }).default({
      roomCount: null,
      adr: null,
      occupancyRate: null,
      gopMargin: null,
      operatingModel: null,
    }),
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
// v3: 구조화된 딜카드 필드 확장 (기존 필드 하위 호환 유지)

export const BlindTeaserOutputSchema = z.object({
  // 기존 필드 (v1 호환)
  title: z.string(),
  shortSummary: z.string().default(""),
  dealPoints: z.array(z.string()).min(1).max(10),
  cautionPoints: z.array(z.string()).min(1).max(10),
  hiddenInfoNotice: z.array(z.string()).default([]),
  gateMessage: z.string().default(""),
  kakaoText: z.string(),
  boundaryNote: z.string().default(""),

  // v3 확장 — 구조화 딜카드 슬롯
  hookCopy: z.string().optional(),              // copy-grammar 기반 한 줄 소구
  regionLabel: z.string().optional(),           // 권역 라벨 (동/지번 금지, 예: "역삼권")
  assetTypeLabel: z.string().optional(),        // B2C 자산유형 라벨 (예: "근린생활시설")
  vacancyLabel: z.string().optional(),          // 공실+명도 결합 라벨 (예: "만실 · 명도 불요")
  structureChips: z.array(z.string()).max(4).optional(), // 구조 신호 칩 (도로접면, 용적률 여유, 준공연대 등)
  curiosityHook: z.string().optional(),         // 궁금증 갭 문구
  investmentPosture: z.enum(['income', 'owner_occupied', 'development', 'operating', 'trading'])
    .describe('투자 관점. 브로커 메모의 매물 특성에서 자동 분류. income=임대수익형, owner_occupied=자가사용형(사옥), development=개발형, operating=운영형(호텔/물류 자가운영), trading=단기매매형')
    .optional(),
  kakaoOgTitle: z.string().optional(),          // 카카오 OG 카드 제목
  kakaoOgDescription: z.string().optional(),    // 카카오 OG 카드 설명
});

export type BlindTeaserOutput = z.infer<typeof BlindTeaserOutputSchema>;
