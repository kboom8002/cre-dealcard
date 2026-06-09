/**
 * IdealBuyerPersonaAgent
 *
 * 매물 SSoT Lite를 분석하여 3가지 이상적 매수자 페르소나를 도출합니다.
 * 브로커가 "이 매물은 누가 사야 할까?"에 대한 답을 즉시 얻을 수 있습니다.
 *
 * 입력: 매물 SSoT Lite (areaSignal, assetType, priceBand 등)
 * 출력: 3가지 이상적 매수자 페르소나 + 브로커 행동 추천
 */
import { callLLM } from "@/ai/llm-client";
import {
  IdealBuyerPersonasOutputSchema,
  type IdealBuyerPersonasOutput,
} from "@/ai/schemas/ideal-buyer-persona";
import {
  SYSTEM_INSTRUCTION,
  USER_PROMPT_TEMPLATE,
  PROMPT_ID,
} from "@/ai/prompts/ideal-buyer-persona";

export interface PersonaAgentInput {
  areaSignal: string;
  assetType: string;
  priceBand: string;
  sizeSignal: string;
  vacancyStatus?: string;
  fitSummary?: string;
  cautionSummary?: string;
  curiosityScore?: number;
  completionYear?: string;
  keyFeatures?: string;
}

export interface PersonaAgentResult {
  output: IdealBuyerPersonasOutput;
  model: string;
  promptVersion: string;
  tokens: number;
}

export async function runIdealBuyerPersona(
  input: PersonaAgentInput,
): Promise<PersonaAgentResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const userPrompt = USER_PROMPT_TEMPLATE
    .replace("{area_signal}", input.areaSignal)
    .replace("{asset_type}", input.assetType)
    .replace("{price_band}", input.priceBand)
    .replace("{size_signal}", input.sizeSignal)
    .replace("{vacancy_status}", input.vacancyStatus ?? "확인 필요")
    .replace("{fit_summary}", input.fitSummary ?? "분석 중")
    .replace("{caution_summary}", input.cautionSummary ?? "확인 필요 사항 없음")
    .replace("{curiosity_score}", String(input.curiosityScore ?? 50))
    .replace("{completion_year}", input.completionYear ?? "미확인")
    .replace("{key_features}", input.keyFeatures ?? "추가 정보 없음");

  const result = await callLLM({
    model,
    systemPrompt: SYSTEM_INSTRUCTION,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.8, // Slightly higher for creative persona generation
    maxTokens: 4096,
  });

  const parsed = JSON.parse(result.content);
  const output = IdealBuyerPersonasOutputSchema.parse(parsed);

  return {
    output,
    model,
    promptVersion: PROMPT_ID,
    tokens: result.tokens,
  };
}
