import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  AgentInputEnvelope,
  AgentOutputEnvelope,
  createSuccessEnvelope,
  createErrorEnvelope,
} from "@/ai/envelope";
import { ScheduleMatchInput } from "@/domain/matching/matching-types";
import { ScheduleRecommendationSchema, ScheduleRecommendation } from "@/ai/schemas/schedule-advisor";
import { SCHEDULE_ADVISOR_PROMPT } from "@/ai/prompts/schedule-advisor";

export interface ScheduleAdvisorInput {
  availableSlots: ScheduleMatchInput['vendor']['availableSlots'];
  clientSchedule: ScheduleMatchInput['clientSchedule'];
  domain: string;
  vendorType: string;
}

export async function runScheduleAdvisor(
  input: AgentInputEnvelope<ScheduleAdvisorInput>
): Promise<AgentOutputEnvelope<ScheduleRecommendation>> {
  const { payload } = input;

  try {
    // 1. Gate 레벨에 따라 슬롯 정보 필터링 (Mocked for now)
    // In a real implementation, we would filter out exact price details, etc.
    const filteredSlots = payload.availableSlots;

    // 2. AI 추천 생성
    const recommendation = await callLLM({
      systemPrompt: SCHEDULE_ADVISOR_PROMPT.system,
      userPrompt: SCHEDULE_ADVISOR_PROMPT.user(
        filteredSlots,
        payload.clientSchedule,
        { domain: payload.domain, vendorType: payload.vendorType }
      ),
      model: 'gpt-4o-mini',
      responseFormat: 'json_object',
      temperature: 0.3,
    });

    // 3. Safe Language 가드레일
    const safeResult = rewriteUnsafeText(recommendation.content);
    const safeRecommendation = ScheduleRecommendationSchema.parse(JSON.parse(safeResult.safeText));

    // 4. Envelope 래핑
    return createSuccessEnvelope(safeRecommendation, {
      boundary_note: '추천 일정은 실시간 가용성 기준이며, 예약 확정 시 변동될 수 있습니다.',
      confidence: filteredSlots.length > 0 ? 'broker_verified' : 'memo_based_inference',
    });
  } catch (error: any) {
    return createErrorEnvelope(`Schedule Advisor failed: ${error.message}`);
  }
}
