/**
 * BuyerMemoWriterAgent
 * Generates a buyer-facing memo by comparing Building SSoT Lite and Buyer Intent Lite.
 *
 * Source: docs/09-ai-agent-contracts.md section 13
 */
import { callLLM } from "@/ai/llm-client";
import {
  BuyerMemoOutputSchema,
  type BuyerMemoOutput,
} from "@/ai/schemas/buyer-intent";
import {
  BUYER_MEMO_SYSTEM,
  BUYER_MEMO_USER_TEMPLATE,
  BUYER_MEMO_PROMPT_ID,
} from "@/ai/prompts/buyer-intent";

export interface BuyerMemoWriterInput {
  building: {
    areaSignal: string | null;
    assetType: string | null;
    priceBand: string | null;
    currentUseSignal: string | null;
    vacancySignal: string | null;
    fitSummary: string | null;
    cautionSummary: string | null;
  };
  buyerIntent: {
    buyerType: string;
    budgetDisplay: string;
    preferredRegions: string[];
    assetTypes: string[];
    purchasePurpose: string;
    mustHave: string[];
    niceToHave: string[];
    riskTolerance: string;
    financingNote: string | null;
  };
  tone?: "kakao" | "professional" | "brief";
}

export interface BuyerMemoWriterResult {
  memo: BuyerMemoOutput;
  model: string;
  promptVersion: string;
  usage?: { totalTokens?: number };
}

export async function runBuyerMemoWriter(
  input: BuyerMemoWriterInput,
): Promise<BuyerMemoWriterResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const userPrompt = BUYER_MEMO_USER_TEMPLATE
    .replace("{area_signal}", input.building.areaSignal || "미확인")
    .replace("{asset_type}", input.building.assetType || "미확인")
    .replace("{price_band}", input.building.priceBand || "미확인")
    .replace("{current_use}", input.building.currentUseSignal || "미확인")
    .replace("{vacancy}", input.building.vacancySignal || "미확인")
    .replace("{fit_summary}", input.building.fitSummary || "미확인")
    .replace("{caution_summary}", input.building.cautionSummary || "미확인")
    .replace("{buyer_type}", input.buyerIntent.buyerType)
    .replace("{budget_display}", input.buyerIntent.budgetDisplay)
    .replace("{preferred_regions}", input.buyerIntent.preferredRegions.join(", "))
    .replace("{asset_types}", input.buyerIntent.assetTypes.join(", "))
    .replace("{purchase_purpose}", input.buyerIntent.purchasePurpose)
    .replace("{must_have}", input.buyerIntent.mustHave.join(", "))
    .replace("{nice_to_have}", input.buyerIntent.niceToHave.join(", "))
    .replace("{risk_tolerance}", input.buyerIntent.riskTolerance)
    .replace("{financing_note}", input.buyerIntent.financingNote || "없음")
    .replace("{tone}", input.tone || "kakao");

  const response = await callLLM({
    model,
    systemPrompt: BUYER_MEMO_SYSTEM,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: 4096,
  });

  let parsedJson;
  try {
    parsedJson = JSON.parse(response.content);
  } catch (e) {
    console.error("JSON parse failed:", response.content);
    throw e;
  }

  const memo = BuyerMemoOutputSchema.parse(parsedJson);

  return {
    memo,
    model,
    promptVersion: BUYER_MEMO_PROMPT_ID,
    usage: { totalTokens: response.tokens },
  };
}
