/**
 * EditionContentV1 zod 스키마 (D2-19, E-01 연동)
 *
 * - 에디터 PATCH/뷰어/cron 이 같은 계약을 검증하도록 단일 출처로 둔다.
 * - passthrough: 뷰어가 읽는 기존 확장 키(예: brokerComment, keyStats …)는 보존한다.
 * - 선택 섹션(topNews, sentiment, tax_clinic …)은 데이터가 없으면 키 자체가 없다 — null/빈 배열로 위장하지 않는다.
 */

import { z } from 'zod';
import type { EditionContentV1 } from './types';

const recordArray = z.array(z.record(z.string(), z.unknown()));

export const marketTemperatureSchema = z.enum(['적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계']);

const brokerSchema = z.object({
  name: z.string(),
  slug: z.string().min(1),
  company: z.string(),
  phone: z.string(),
  photoUrl: z.string().nullable(),
  tagline: z.string(),
  specialtyRegions: z.array(z.string()),
  specialtyAssets: z.array(z.string()),
  totalDeals: z.number(),
  activeDeals: z.number(),
});

const qualityGateSchema = z.object({
  passed: z.boolean(),
  status: z.enum(['draft', 'needs_review']),
  score: z.number(),
  totalClaims: z.number(),
  matchedClaims: z.number(),
  failureReasons: z.array(z.string()),
  issues: z.array(z.string()),
});

const generationSchema = z.object({
  model: z.string().nullable(),
  isMock: z.boolean(),
  totalTokens: z.number(),
  llmCalls: z.number(),
  generatedAt: z.string(),
  qualityGate: qualityGateSchema.nullable(),
  sources: z.record(z.string(), z.boolean()),
  sourceErrors: z.array(z.string()),
});

const taxClinicSchema = z.object({
  title: z.string().min(1),
  scenario: z.string().min(1),
  comparison: z.string(),
  conclusion: z.string(),
  source: z.string(),
  disclaimer: z.string().min(1),
  taxYear: z.number(),
  asOf: z.string(),
  reviewStatus: z.string(),
  topicId: z.string(),
  weekLabel: z.string(),
});

/** 에디터(브로커 직접 작성) 세무 클리닉 — 생성기 시나리오와 별개의 Q/A 형태. 뷰어는 두 형태를 모두 렌더한다. */
const customTaxClinicSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  source: z.string().optional(),
  disclaimer: z.string().optional(),
});

/** 설문 선택지 — intent 는 'seller' 판정용 메타(P0-05). 순서와 무관. */
const pollOptionSchema = z.object({
  label: z.string().min(1),
  intent: z.enum(['seller', 'buyer', 'neutral']).optional(),
});

/** 섹션 on/off (DC-10). enabled=false 면 뷰어가 해당 섹션을 숨긴다. */
export const sectionToggleSchema = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean(),
});

export const targetSegmentSchema = z.enum(['all', 'buyer', 'seller']);

export const editionContentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['weekly', 'special', 'daily']),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weekLabel: z.string().optional(),
    headline: z.string(),
    briefing: z.string(),
    ai_briefing: z.string(),
    broker: brokerSchema,
    market_temp: marketTemperatureSchema.nullable(),
    cover_keywords: z.array(z.string()),
    cover_image_url: z.string().nullable(),
    theme_title: z.string(),
    theme_body_md: z.string(),
    theme_asset_types: z.array(z.string()),
    featured_deal_ids: z.array(z.string()),
    theme_color: z.string(),
    poll: z
      .object({
        question: z.string(),
        choices: z.array(z.string()),
        options: z.array(pollOptionSchema).optional(),
      })
      .optional(),
    topNews: recordArray.optional(),
    recentTransactions: recordArray.optional(),
    sentiment: z
      .object({
        score: z.number(),
        status: z.string(),
        items: recordArray,
        asOf: z.string(),
      })
      .optional(),
    dealHighlights: recordArray.optional(),
    teaserCards: z.array(z.unknown()).optional(),
    auctionPicks: recordArray.optional(),
    reports: recordArray.optional(),
    rentalTrend: z.record(z.string(), z.unknown()).optional(),
    commercialDistrict: z.record(z.string(), z.unknown()).optional(),
    monthlySummary: z.union([z.record(z.string(), z.unknown()), recordArray]).optional(),
    tax_clinic: z.union([taxClinicSchema, customTaxClinicSchema]).optional(),
    sections: z.array(sectionToggleSchema).optional(),
    section_order: z.array(z.string()).optional(),
    target_segment: targetSegmentSchema.optional(),
    generation: generationSchema,
  })
  .passthrough();

/**
 * 임시저장(draft) 검증 — 에디터가 작성/수정하는 키의 형태만 확인한다.
 * 생성기 산출 필드(broker·generation·tax_clinic 시나리오 등)는 건드리지 않고 통과시킨다.
 * 전체 계약(EditionContentV1) 검증은 발행 시점에만 수행한다.
 */
export const editionContentDraftSchema = z
  .object({
    headline: z.string().max(300).optional(),
    briefing: z.string().max(30000).optional(),
    poll: z
      .object({
        question: z.string().max(300),
        choices: z.array(z.string().max(200)).max(6),
        options: z.array(pollOptionSchema).max(6).optional(),
      })
      .optional(),
    sections: z.array(sectionToggleSchema).max(40).optional(),
    section_order: z.array(z.string().max(40)).max(40).optional(),
    target_segment: targetSegmentSchema.optional(),
    selected_news_ids: z.array(z.string().max(200)).max(50).optional(),
    topNews: recordArray.max(30).optional(),
  })
  .passthrough();

export type EditionContentDraftParseResult = { ok: true } | { ok: false; issues: string[] };

export function parseEditionContentDraft(input: unknown): EditionContentDraftParseResult {
  const r = editionContentDraftSchema.safeParse(input);
  if (r.success) return { ok: true };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

export type EditionContentV1Parsed = z.infer<typeof editionContentV1Schema>;

export type EditionContentParseResult =
  | { ok: true; data: EditionContentV1 }
  | { ok: false; issues: string[] };

/** 저장·발행 직전 검증용. 실패 시 어느 경로가 틀렸는지 문자열 배열로 돌려준다. */
export function parseEditionContent(input: unknown): EditionContentParseResult {
  const r = editionContentV1Schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data as unknown as EditionContentV1 };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
