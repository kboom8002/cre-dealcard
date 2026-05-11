/**
 * BrokerDealCardAgent — Chained pipeline:
 * 1. MemoParser → extract structured fields
 * 2. BuildingMiniTruth → create SSoT Lite
 * 3. BlindTeaser → create safe shareable card
 *
 * Source: docs/09-ai-agent-contracts.md sections 7-10
 */
import OpenAI from "openai";
import {
  MemoParserOutputSchema,
  BlindTeaserOutputSchema,
  type MemoParserOutput,
  type BlindTeaserOutput,
} from "@/ai/schemas/broker-deal-card";
import {
  BuildingMiniTruthOutputSchema,
  type BuildingMiniTruthOutput,
} from "@/ai/schemas/building-mini-truth";
import {
  MEMO_PARSER_SYSTEM,
  MEMO_PARSER_USER_TEMPLATE,
  MEMO_PARSER_PROMPT_ID,
  BUILDING_MINI_TRUTH_SYSTEM,
  BUILDING_MINI_TRUTH_USER_TEMPLATE,
  BUILDING_MINI_TRUTH_PROMPT_ID,
  BLIND_TEASER_SYSTEM,
  BLIND_TEASER_USER_TEMPLATE,
  BLIND_TEASER_PROMPT_ID,
} from "@/ai/prompts/broker-deal-card";

const openai = new OpenAI();

export interface BrokerDealCardInput {
  memo: string;
  visibilityPreference?: "blind" | "internal";
}

export interface BrokerDealCardResult {
  parsedMemo: MemoParserOutput;
  buildingTruth: BuildingMiniTruthOutput;
  blindTeaser: BlindTeaserOutput;
  model: string;
  promptVersions: {
    memoParser: string;
    buildingMiniTruth: string;
    blindTeaser: string;
  };
  usage: {
    totalTokens: number;
  };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<{ content: string; tokens: number }> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  console.log("Raw LLM Output:", content);

  return {
    content,
    tokens: response.usage?.total_tokens ?? 0,
  };
}

export async function runBrokerDealCard(
  input: BrokerDealCardInput,
): Promise<BrokerDealCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";
  let totalTokens = 0;

  // Step 1: Parse memo
  const memoPrompt = MEMO_PARSER_USER_TEMPLATE.replace("{memo}", input.memo);
  const memoResult = await callOpenAI(MEMO_PARSER_SYSTEM, memoPrompt, model);
  totalTokens += memoResult.tokens;
  const parsedMemo = MemoParserOutputSchema.parse(JSON.parse(memoResult.content));

  // Step 2: Build Mini Truth
  const truthPrompt = BUILDING_MINI_TRUTH_USER_TEMPLATE.replace(
    "{raw_memo}",
    input.memo,
  ).replace("{parsed_memo}", JSON.stringify(parsedMemo, null, 2));
  const truthResult = await callOpenAI(
    BUILDING_MINI_TRUTH_SYSTEM,
    truthPrompt,
    model,
  );
  totalTokens += truthResult.tokens;
  const buildingTruth = BuildingMiniTruthOutputSchema.parse(
    JSON.parse(truthResult.content),
  );

  // Step 3: Generate Blind Teaser
  const teaserPrompt = BLIND_TEASER_USER_TEMPLATE.replace(
    "{building_truth}",
    JSON.stringify(buildingTruth, null, 2),
  ).replace("{hidden_fields}", buildingTruth.hiddenFields.join(", "));
  const teaserResult = await callOpenAI(
    BLIND_TEASER_SYSTEM,
    teaserPrompt,
    model,
  );
  totalTokens += teaserResult.tokens;
  const blindTeaser = BlindTeaserOutputSchema.parse(
    JSON.parse(teaserResult.content),
  );

  return {
    parsedMemo,
    buildingTruth,
    blindTeaser,
    model,
    promptVersions: {
      memoParser: MEMO_PARSER_PROMPT_ID,
      buildingMiniTruth: BUILDING_MINI_TRUTH_PROMPT_ID,
      blindTeaser: BLIND_TEASER_PROMPT_ID,
    },
    usage: { totalTokens },
  };
}
