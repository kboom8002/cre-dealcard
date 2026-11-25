/**
 * @file src/lib/deal-card/ai-copy-schema.ts
 * @description 딜카드 한 줄 제목(<=22자) + 장점 3줄 + 예비 후보(총 6~8개) 실제 AI 생성 스키마
 */
import { z } from 'zod';
import {
  DEAL_CARD_POINT_AXES,
  DealCardPointAxisSchema,
  DealCardPostureSchema,
  type DealCardPointAxis,
} from './card4-schema';
import { DEAL_CARD_LINE_MAX } from './copy-limits';
import { DEAL_CARD_COPY_SYSTEM } from '@/ai/prompts/broker-deal-card';

export { DEAL_CARD_POINT_AXES, DealCardPointAxisSchema, type DealCardPointAxis };

export const dealCardAiCopyModeSchema = z.enum(['headline', 'points', 'both']);
export type DealCardAiCopyMode = z.infer<typeof dealCardAiCopyModeSchema>;

export const dealCardPointCandidateSchema = z.object({
  text: z.string().min(2).max(DEAL_CARD_LINE_MAX),
  axis: DealCardPointAxisSchema,
  recommended: z.boolean(),
});
export type DealCardPointCandidate = z.infer<typeof dealCardPointCandidateSchema>;

export const dealCardAiCopyRequestSchema = z.object({
  mode: dealCardAiCopyModeSchema.default('both'),
  posture: DealCardPostureSchema.default('income'),
  region: z.string().trim().max(60).optional().default(''),
  use: z.string().trim().max(60).optional().default(''),
  area: z.string().trim().max(60).optional().default(''),
  priceBand: z.string().trim().max(60).optional().default(''),
  currentHeadline: z.string().trim().max(100).optional().default(''),
  avoidHeadlines: z.array(z.string().trim().max(100)).max(10).optional().default([]),
  currentPoints: z.array(z.string().trim().max(120)).max(5).optional().default([]),
  avoidPoints: z.array(z.string().trim().max(100)).max(12).optional().default([]),
  candidateCount: z.number().int().min(3).max(8).optional().default(6),
  facts: z
    .object({
      yieldPct: z.number().positive().optional(),
      regionalBenchmarkYieldPct: z.number().positive().optional(),
      completionYear: z.number().int().positive().optional(),
      remodelingYear: z.number().int().positive().optional(),
      roadContact: z.string().optional(),
      roadWidthMeters: z.number().positive().optional(),
      subwayWalkMinutes: z.number().int().positive().optional(),
      floorsLabel: z.string().optional(),
      zoning: z.string().optional(),
      parkingCount: z.number().int().positive().optional(),
      parkingType: z.enum(['자주식', '기계식']).optional(),
      hasElevator: z.boolean().optional(),
      occupancyStatus: z.string().optional(),
      anchorCategory: z.string().optional(),
      farPotential: z.string().optional(),
      landUnitPriceHint: z.string().optional(),
      memoSummary: z.string().trim().max(800).optional(),
    })
    .optional(),
});

export type DealCardAiCopyRequest = z.infer<typeof dealCardAiCopyRequestSchema>;

export const dealCardAiCopyLLMOutputSchema = z.object({
  headline: z.string().trim().min(1).max(80).optional(),
  points: z.array(z.string().trim().min(1).max(120)).min(3).optional(),
  alternativePoints: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  pointCandidates: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(120),
        axis: z.string().trim().optional(),
        recommended: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),
});

export interface DealCardAiCopyResponse {
  ok: true;
  result: {
    headline?: string;
    points?: [string, string, string];
    pointCandidates?: DealCardPointCandidate[];
  };
  warnings?: string[];
  /** 'llm' = AI 생성 + 결정적 교정, 'fallback' = AI 실패 시 입력 기반 결정적 문구 */
  source?: 'llm' | 'fallback';
}

/**
 * 하위 호환 이름. 실체는 TaskFlow TF8 하드닝 프롬프트(prompt_deal_card_copy_tf8_v2):
 * 역할/페르소나 · 단계별 taskflow · 근거 규칙 · 22자 체언형 6+ 후보 출력 계약 · few-shot · 자체 검증 체크리스트.
 */
export const DEAL_CARD_AI_SYSTEM_PROMPT = DEAL_CARD_COPY_SYSTEM;
