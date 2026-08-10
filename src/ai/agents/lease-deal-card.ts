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
import { getModel } from "../model-selector";
import { safeParseAIResponse } from "@/ai/utils/ai-response-parser";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

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
  const model = getModel("sol");
  let totalTokens = 0;

  // Step 1: Parse lease memo
  const memoPrompt = LEASE_MEMO_PARSER_USER_TEMPLATE.replace("{memo}", input.memo);
  const memoResult = await callOpenAI(LEASE_MEMO_PARSER_SYSTEM, memoPrompt, model);
  totalTokens += memoResult.tokens;
  const memoParseResult = safeParseAIResponse(memoResult.content, LeaseMemoParserOutputSchema);
  if (!memoParseResult.success) {
    throw new Error(`[lease-deal-card] Step1 파싱 실패: ${memoParseResult.error}`);
  }
  const parsedMemo = memoParseResult.data;

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
  const truthParseResult = safeParseAIResponse(truthResult.content, LeaseMiniTruthOutputSchema);
  if (!truthParseResult.success) {
    throw new Error(`[lease-deal-card] Step2 파싱 실패: ${truthParseResult.error}`);
  }
  const leaseTruth = truthParseResult.data;

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
  const teaserParseResult = safeParseAIResponse(teaserResult.content, LeaseBlindTeaserOutputSchema);
  if (!teaserParseResult.success) {
    throw new Error(`[lease-deal-card] Step3 파싱 실패: ${teaserParseResult.error}`);
  }
  const blindTeaser = teaserParseResult.data;

  // ── 법적 가드레일 ──
  const guardedTeaser = { ...blindTeaser };
  if (guardedTeaser.title) {
    guardedTeaser.title = rewriteUnsafeText(guardedTeaser.title).safeText;
  }
  if (guardedTeaser.shortSummary) {
    guardedTeaser.shortSummary = rewriteUnsafeText(guardedTeaser.shortSummary).safeText;
  }
  if (guardedTeaser.hiddenInfoNotice) {
    guardedTeaser.hiddenInfoNotice = guardedTeaser.hiddenInfoNotice.map(
      (item) => rewriteUnsafeText(item).safeText
    );
  }
  if (guardedTeaser.kakaoText) {
    guardedTeaser.kakaoText = rewriteUnsafeText(guardedTeaser.kakaoText).safeText;
  }
  if (guardedTeaser.dealPoints) {
    guardedTeaser.dealPoints = guardedTeaser.dealPoints.map(
      (p) => rewriteUnsafeText(p).safeText
    );
  }

  return {
    parsedMemo,
    leaseTruth,
    blindTeaser: guardedTeaser,
    model,
    promptVersions: {
      memoParser: LEASE_MEMO_PARSER_PROMPT_ID,
      leaseMiniTruth: LEASE_MINI_TRUTH_PROMPT_ID,
      blindTeaser: LEASE_BLIND_TEASER_PROMPT_ID,
    },
    usage: { totalTokens },
  };
}
