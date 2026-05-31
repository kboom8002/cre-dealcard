/**
 * LeaseBrokerDealCardAgent — Chained pipeline for leasing:
 * 1. LeaseMemoParser → extract structured fields
 * 2. LeaseMiniTruth → create Lease SSoT Lite
 * 3. LeaseBlindTeaser → create safe shareable leasing card
 */
import { callLLM } from "@/ai/llm-client";
import {
  LeaseMemoParserOutputSchema,
  LeaseMiniTruthOutputSchema,
  LeaseBlindTeaserOutputSchema,
  type LeaseMemoParserOutput,
  type LeaseMiniTruthOutput,
  type LeaseBlindTeaserOutput,
} from "@/ai/schemas/lease-deal-card";
import {
  LEASE_MEMO_PARSER_SYSTEM,
  LEASE_MEMO_PARSER_USER_TEMPLATE,
  LEASE_MEMO_PARSER_PROMPT_ID,
  LEASE_MINI_TRUTH_SYSTEM,
  LEASE_MINI_TRUTH_USER_TEMPLATE,
  LEASE_MINI_TRUTH_PROMPT_ID,
  LEASE_BLIND_TEASER_SYSTEM,
  LEASE_BLIND_TEASER_USER_TEMPLATE,
  LEASE_BLIND_TEASER_PROMPT_ID,
} from "@/ai/prompts/lease-deal-card";

export interface LeaseBrokerDealCardInput {
  memo: string;
}

export interface LeaseBrokerDealCardResult {
  parsedMemo: LeaseMemoParserOutput;
  leaseTruth: LeaseMiniTruthOutput;
  blindTeaser: LeaseBlindTeaserOutput;
  model: string;
  promptVersions: {
    memoParser: string;
    leaseMiniTruth: string;
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
  const result = await callLLM({
    model,
    systemPrompt,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: 4096,
  });

  return {
    content: result.content,
    tokens: result.tokens,
  };
}

export async function runLeaseBrokerDealCard(
  input: LeaseBrokerDealCardInput,
): Promise<LeaseBrokerDealCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";
  let totalTokens = 0;

  // Step 1: Parse lease memo
  const memoPrompt = LEASE_MEMO_PARSER_USER_TEMPLATE.replace("{memo}", input.memo);
  const memoResult = await callOpenAI(LEASE_MEMO_PARSER_SYSTEM, memoPrompt, model);
  totalTokens += memoResult.tokens;
  const parsedMemo = LeaseMemoParserOutputSchema.parse(JSON.parse(memoResult.content));

  // Step 2: Build Lease Mini Truth (SSoT Lite)
  const truthPrompt = LEASE_MINI_TRUTH_USER_TEMPLATE.replace(
    "{raw_memo}",
    input.memo,
  ).replace("{parsed_memo}", JSON.stringify(parsedMemo, null, 2));
  const truthResult = await callOpenAI(
    LEASE_MINI_TRUTH_SYSTEM,
    truthPrompt,
    model,
  );
  totalTokens += truthResult.tokens;
  const leaseTruth = LeaseMiniTruthOutputSchema.parse(
    JSON.parse(truthResult.content),
  );

  // Step 3: Generate Blind Lease Teaser
  const teaserPrompt = LEASE_BLIND_TEASER_USER_TEMPLATE.replace(
    "{lease_truth}",
    JSON.stringify(leaseTruth, null, 2),
  ).replace("{hidden_fields}", leaseTruth.hiddenFields.join(", "));
  const teaserResult = await callOpenAI(
    LEASE_BLIND_TEASER_SYSTEM,
    teaserPrompt,
    model,
  );
  totalTokens += teaserResult.tokens;
  const blindTeaser = LeaseBlindTeaserOutputSchema.parse(
    JSON.parse(teaserResult.content),
  );

  return {
    parsedMemo,
    leaseTruth,
    blindTeaser,
    model,
    promptVersions: {
      memoParser: LEASE_MEMO_PARSER_PROMPT_ID,
      leaseMiniTruth: LEASE_MINI_TRUTH_PROMPT_ID,
      blindTeaser: LEASE_BLIND_TEASER_PROMPT_ID,
    },
    usage: { totalTokens },
  };
}
