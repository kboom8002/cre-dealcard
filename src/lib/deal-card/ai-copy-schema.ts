/**
 * @file src/lib/deal-card/ai-copy-schema.ts
 * @description 딜카드 한 줄 제목(<=18자) + 장점 3줄(각 <=18자) 실제 AI 생성 스키마
 */
import { z } from 'zod';
import { DealCardPostureSchema } from './card4-schema';

export const dealCardAiCopyModeSchema = z.enum(['headline', 'points', 'both']);
export type DealCardAiCopyMode = z.infer<typeof dealCardAiCopyModeSchema>;

export const dealCardAiCopyRequestSchema = z.object({
  mode: dealCardAiCopyModeSchema.default('both'),
  posture: DealCardPostureSchema.default('income'),
  region: z.string().trim().max(60).optional().default(''),
  use: z.string().trim().max(60).optional().default(''),
  area: z.string().trim().max(60).optional().default(''),
  priceBand: z.string().trim().max(60).optional().default(''),
  currentHeadline: z.string().trim().max(100).optional().default(''),
  currentPoints: z.array(z.string().trim().max(120)).max(5).optional().default([]),
  facts: z
    .object({
      yieldPct: z.number().positive().optional(),
      completionYear: z.number().int().positive().optional(),
      roadContact: z.string().optional(),
      subwayWalkMinutes: z.number().int().positive().optional(),
      floorsLabel: z.string().optional(),
       zoning: z.string().optional(),
    })
    .optional(),
});

export type DealCardAiCopyRequest = z.infer<typeof dealCardAiCopyRequestSchema>;

export const dealCardAiCopyLLMOutputSchema = z.object({
  headline: z.string().trim().min(1).max(30).optional(),
  points: z.array(z.string().trim().min(1).max(40)).min(3).max(3).optional(),
});

export interface DealCardAiCopyResponse {
  ok: true;
  result: {
    headline?: string;
    points?: [string, string, string];
  };
  warnings?: string[];
}

export const DEAL_CARD_AI_SYSTEM_PROMPT = `당신은 상업용 부동산 중개인을 돕는 딜카드 카피라이팅 비서입니다.
카카오톡 썸네일 이미지에는 이미 [지역, 용도, 면적, 가격] 4가지가 큰 글씨로 표시됩니다.
따라서 아래 규칙을 엄격히 지켜 JSON 형식으로만 응답하세요.

1. 글자 수:
   - headline(한 줄 제목): 공백 포함 18자 이내.
   - points(장점 3줄): 정확히 3개 배열, 각 줄 공백 포함 18자 이내.
2. 동어반복 금지:
   - headline에는 이미 썸네일에 표시되는 지역명, 용도명, 면적, 가격구간을 그대로 반복하지 마세요.
   - 대신 매물 유형(임대수익용 / 사옥용 / 신축·개발용)에 맞는 핵심 장점 중심으로 작성하세요.
3. 사실 기반 (절대 지어내기 금지):
   - 입력 정보(현재 입력된 장점이나 사실 정보)에 없는 숫자(수익률 %, 도보 분, 층수, 연도, 금액, 평수)는 절대 새로 만들지 마세요.
   - 숫자가 입력에 없으면 숫자를 쓰지 말고 입지·가시성·활용성·임차 안정성 등 정성적 장점만 간결하게 표현하세요.
4. 건물 위치 보호 (블라인드 규칙):
   - 상세 지번(번지, 11-47 등), 건물 고유 이름(OO빌딩, OO타워), 특정 프랜차이즈 상호(스타벅스, 올리브영 등), 소유주 정보는 절대 쓰지 마세요.
5. 금지 표현:
   - 투자 권유, 원금·수익 보장, 단정적 시세차익 표현을 쓰지 마세요.

응답 JSON 형식 예시:
{
  "headline": "대로변 코너 가시성 우수 매물",
  "points": [
    "대로변 코너 뛰어난 가시성",
    "안정적인 임차 수요 확보",
    "즉시 활용 가능한 깔끔한 외관"
  ]
}`;
