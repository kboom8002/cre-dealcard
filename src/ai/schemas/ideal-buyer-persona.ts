/**
 * Zod schema for Ideal Buyer Persona generation.
 * AI가 매물 SSoT Lite를 분석하여 3가지 이상적 매수자 페르소나를 도출합니다.
 */
import { z } from "zod/v4";

export const BuyerPersonaSchema = z.object({
  /** 페르소나 라벨 (예: "IT 중견기업 사옥 이전형") */
  label: z.string(),
  /** 매수자 유형 (법인/개인/펀드 등) */
  buyerType: z.string(),
  /** 추정 예산 범위 */
  budgetRange: z.string(),
  /** 매입 동기 (왜 이 매물을 사려 하는가) */
  motivation: z.string(),
  /** 핵심 니즈 3~5개 */
  coreNeeds: z.array(z.string()).min(2).max(6),
  /** 이 페르소나를 어디서 찾을 수 있는가 */
  whereToFind: z.array(z.string()).min(2).max(5),
  /** 접근법: 어떤 메시지로 어필해야 하는가 */
  approachStrategy: z.string(),
  /** 매칭 가중치 프로파일 (사옥/투자/증여/혼합) */
  purposeProfile: z.enum(["사옥", "투자", "증여", "혼합"]),
  /** 예상 적합도 (0~100) */
  fitScore: z.number().min(0).max(100),
});

export const IdealBuyerPersonasOutputSchema = z.object({
  /** 매물 한줄 요약 */
  propertySummary: z.string(),
  /** 3가지 이상적 매수자 페르소나 */
  personas: z.array(BuyerPersonaSchema).min(2).max(4),
  /** 공통 브로커 행동 추천 */
  brokerActionPlan: z.array(z.string()).min(2).max(5),
  /** 면책문구 */
  boundaryNote: z.string(),
});

export type BuyerPersona = z.infer<typeof BuyerPersonaSchema>;
export type IdealBuyerPersonasOutput = z.infer<typeof IdealBuyerPersonasOutputSchema>;
