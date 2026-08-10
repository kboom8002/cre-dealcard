/**
 * BuyerIntentNormalizerAgent
 * Normalizes raw buyer condition memo into structured Buyer Intent Lite.
 *
 * Source: docs/09-ai-agent-contracts.md section 12
 */
import { callLLM } from "@/ai/llm-client";
import {
  BuyerIntentLiteOutputSchema,
  type BuyerIntentLiteOutput,
} from "@/ai/schemas/buyer-intent";
import {
  BUYER_INTENT_SYSTEM,
  BUYER_INTENT_USER_TEMPLATE,
  BUYER_INTENT_PROMPT_ID,
} from "@/ai/prompts/buyer-intent";
import { getModel } from "../model-selector";

import { safeParseAIResponse } from "@/ai/utils/ai-response-parser";

export interface BuyerIntentNormalizerResult {
  intent: BuyerIntentLiteOutput;
  model: string;
  promptVersion: string;
  usage?: { totalTokens?: number };
}

export async function runBuyerIntentNormalizer(
  memo: string,
): Promise<BuyerIntentNormalizerResult> {
  const model = getModel("luna");
  const userPrompt = BUYER_INTENT_USER_TEMPLATE.replace("{memo}", memo);

  const response = await callLLM({
    model,
    systemPrompt: BUYER_INTENT_SYSTEM,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.2,
    maxTokens: 4096,
  });

  const parsed = safeParseAIResponse(response.content, BuyerIntentLiteOutputSchema);
  if (!parsed.success) {
    throw new Error(`[buyer-intent-normalizer] 파싱 실패: ${parsed.error}`);
  }

  return {
    intent: parsed.data,
    model,
    promptVersion: BUYER_INTENT_PROMPT_ID,
    usage: { totalTokens: response.tokens },
  };
}
