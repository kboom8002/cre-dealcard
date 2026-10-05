/**
 * Zod schemas for MemoParser, DisclosureGuard, and BlindTeaser
 * Source: docs/09-ai-agent-contracts.md sections 7, 9, 10
 */
import { z } from "zod/v4";

// ---- Memo Parser Output (section 7.3) ----

/** 숫자 후보 1개 변환 (콤마 숫자 문자열 허용, 유한수 아니면 null) */
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * LLM이 범위("8~9억")를 배열로 반환해도 단일 대표값(중앙값, 짝수 개면 하위 중앙)으로 강제한다.
 * 숫자 문자열("80,000") → 숫자, 그 외 → null.
 */
export function coerceSignalNumber(v: unknown): number | null {
  if (Array.isArray(v)) {
    const nums = v.map(toFiniteNumber).filter((n): n is number => n !== null).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    return nums[Math.floor((nums.length - 1) / 2)];
  }
  return toFiniteNumber(v);
}

/**
 * 원본 값이 복수 숫자(범위)였을 때, 대표값 외 나머지 값을 알리는 문자열 목록.
 * (brokerNotes로 옮기기 위한 용도 — 원문 값만 사용, 새 사실은 만들지 않음)
 */
export function collectRangeNotes(rawSignals: unknown): string[] {
  if (!rawSignals || typeof rawSignals !== "object") return [];
  const notes: string[] = [];
  for (const [key, val] of Object.entries(rawSignals as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;
    const nums = val.map(toFiniteNumber).filter((n): n is number => n !== null);
    if (nums.length < 2) continue;
    notes.push(`${key} 범위: ${nums.join("~")}`);
  }
  return notes;
}

const signalNumber = () => z.preprocess(coerceSignalNumber, z.number().nullable()).default(null);

export const HospitalitySignalsSchema = z.object({
  roomCount: signalNumber(),
  adr: signalNumber(),           // 만원/박
  occupancyRate: signalNumber(), // %
  gopMargin: signalNumber(),     // %
  operatingModel: z.string().nullable().default(null),
});

export const DevelopmentSignalsSchema = z.object({
  landAreaPyung: signalNumber(),
  farPct: signalNumber(),
  bcrPct: signalNumber(),
  constructionCostManwon: signalNumber(),
  expectedSalesPriceManwon: signalNumber(),
  developmentType: z.string().nullable().default(null),
});

export const TradingSignalsSchema = z.object({
  pricePerPyeongManwon: signalNumber(),
  marketPriceManwon: signalNumber(),
  holdingPeriodMonths: signalNumber(),
});

export const OwnerOccupiedSignalsSchema = z.object({
  selfUseIntent: z.boolean().nullable().default(null),
  currentLeaseCostManwon: signalNumber(),
});

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
    hospitalitySignals: HospitalitySignalsSchema.default({
      roomCount: null,
      adr: null,
      occupancyRate: null,
      gopMargin: null,
      operatingModel: null,
    }),
    developmentSignals: DevelopmentSignalsSchema.default({ landAreaPyung: null, farPct: null, bcrPct: null, constructionCostManwon: null, expectedSalesPriceManwon: null, developmentType: null }),
    tradingSignals: TradingSignalsSchema.default({ pricePerPyeongManwon: null, marketPriceManwon: null, holdingPeriodMonths: null }),
    ownerOccupiedSignals: OwnerOccupiedSignalsSchema.default({ selfUseIntent: null, currentLeaseCostManwon: null }),
  }),
  investmentPosture: z.enum(['income', 'owner_occupied', 'development', 'operating', 'trading']).optional(),

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
