/**
 * BrokerDealCardAgent — Chained pipeline:
 * 1. MemoParser → extract structured fields
 * 2. BuildingMiniTruth → create SSoT Lite
 * 3. BlindTeaser → create safe shareable card
 *
 * Source: docs/09-ai-agent-contracts.md sections 7-10
 */
import { callLLM } from "@/ai/llm-client";
import { sanitizeMemo, desanitizeOutput } from "@/ai/sanitizer/memo-sanitizer";
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
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

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

export async function runBrokerDealCard(
  input: BrokerDealCardInput,
): Promise<BrokerDealCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";
  let totalTokens = 0;

  // Apply PII Sanitization
  const sanitizationMap = sanitizeMemo(input.memo);
  const { sanitizedText } = sanitizationMap;

  // Step 1: Parse memo using sanitized input
  const memoPrompt = MEMO_PARSER_USER_TEMPLATE.replace("{memo}", sanitizedText);
  const memoResult = await callOpenAI(MEMO_PARSER_SYSTEM, memoPrompt, model);
  totalTokens += memoResult.tokens;
  
  // Desanitize response before Zod parsing
  const restoredMemoContent = desanitizeOutput(memoResult.content, sanitizationMap);
  const parsedMemo = MemoParserOutputSchema.parse(JSON.parse(restoredMemoContent));

  // Step 2: Build Mini Truth using sanitized raw memo
  const truthPrompt = BUILDING_MINI_TRUTH_USER_TEMPLATE.replace(
    "{raw_memo}",
    sanitizedText,
  ).replace("{parsed_memo}", JSON.stringify(parsedMemo, null, 2));
  const truthResult = await callOpenAI(
    BUILDING_MINI_TRUTH_SYSTEM,
    truthPrompt,
    model,
  );
  totalTokens += truthResult.tokens;
  
  // Desanitize response before Zod parsing
  const restoredTruthContent = desanitizeOutput(truthResult.content, sanitizationMap);
  const buildingTruth = BuildingMiniTruthOutputSchema.parse(
    JSON.parse(restoredTruthContent),
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
  
  // Desanitize teaser output to restore any placeholders
  const restoredTeaserContent = desanitizeOutput(teaserResult.content, sanitizationMap);
  const blindTeaser = BlindTeaserOutputSchema.parse(
    JSON.parse(restoredTeaserContent),
  );

  // Apply safe-language guardrails to public-facing text
  const guardedTeaser = { ...blindTeaser };
  if (guardedTeaser.title) {
    guardedTeaser.title = rewriteUnsafeText(guardedTeaser.title).safeText;
  }
  if (guardedTeaser.shortSummary) {
    guardedTeaser.shortSummary = rewriteUnsafeText(guardedTeaser.shortSummary).safeText;
  }

  return {
    parsedMemo,
    buildingTruth,
    blindTeaser: guardedTeaser,
    model,
    promptVersions: {
      memoParser: MEMO_PARSER_PROMPT_ID,
      buildingMiniTruth: BUILDING_MINI_TRUTH_PROMPT_ID,
      blindTeaser: BLIND_TEASER_PROMPT_ID,
    },
    usage: { totalTokens },
  };
}

