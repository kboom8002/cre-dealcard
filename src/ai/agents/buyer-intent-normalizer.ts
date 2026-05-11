/**
 * BuyerIntentNormalizerAgent
 * Normalizes raw buyer condition memo into structured Buyer Intent Lite.
 *
 * Source: docs/09-ai-agent-contracts.md section 12
 */
import OpenAI from "openai";
import {
  BuyerIntentLiteOutputSchema,
  type BuyerIntentLiteOutput,
} from "@/ai/schemas/buyer-intent";
import {
  BUYER_INTENT_SYSTEM,
  BUYER_INTENT_USER_TEMPLATE,
  BUYER_INTENT_PROMPT_ID,
} from "@/ai/prompts/buyer-intent";

const openai = new OpenAI();

export interface BuyerIntentNormalizerResult {
  intent: BuyerIntentLiteOutput;
  model: string;
  promptVersion: string;
  usage?: { totalTokens?: number };
}

export async function runBuyerIntentNormalizer(
  memo: string,
): Promise<BuyerIntentNormalizerResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";
  const userPrompt = BUYER_INTENT_USER_TEMPLATE.replace("{memo}", memo);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: BUYER_INTENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  const intent = BuyerIntentLiteOutputSchema.parse(JSON.parse(content));

  return {
    intent,
    model,
    promptVersion: BUYER_INTENT_PROMPT_ID,
    usage: { totalTokens: response.usage?.total_tokens },
  };
}
