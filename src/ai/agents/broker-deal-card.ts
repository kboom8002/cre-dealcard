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

/** AI 응답에서 ```json ... ``` 코드블록을 제거하여 순수 JSON 문자열 추출 */
function extractJsonString(raw: string): string {
  let s = raw.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  return s;
}

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
  let parsedMemo: MemoParserOutput;
  try {
    parsedMemo = MemoParserOutputSchema.parse(JSON.parse(extractJsonString(restoredMemoContent)));
  } catch (parseErr) {
    console.error("[broker-deal-card] MemoParser output parse failed:", parseErr, "\nRaw:", restoredMemoContent.slice(0, 500));
    throw new Error("AI가 메모를 분석하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

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
  let buildingTruth: BuildingMiniTruthOutput;
  try {
    buildingTruth = BuildingMiniTruthOutputSchema.parse(
      JSON.parse(extractJsonString(restoredTruthContent)),
    );
  } catch (parseErr) {
    console.error("[broker-deal-card] BuildingMiniTruth output parse failed:", parseErr, "\nRaw:", restoredTruthContent.slice(0, 500));
    throw new Error("AI가 건물 정보를 구성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

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
  let blindTeaser: BlindTeaserOutput;
  const cleanedJson = extractJsonString(restoredTeaserContent);
  let parsedObj: Record<string, unknown>;
  try {
    parsedObj = JSON.parse(cleanedJson);
  } catch (jsonErr) {
    console.error("[broker-deal-card] BlindTeaser JSON.parse failed. Raw (first 800 chars):", restoredTeaserContent.slice(0, 800));
    throw new Error("AI 응답이 유효한 JSON이 아닙니다. 잠시 후 다시 시도해주세요.");
  }
  
  const zodResult = BlindTeaserOutputSchema.safeParse(parsedObj);
  if (zodResult.success) {
    blindTeaser = zodResult.data;
  } else {
    console.error("[broker-deal-card] BlindTeaser Zod validation failed:", JSON.stringify(zodResult.error.issues, null, 2), "\nParsed keys:", Object.keys(parsedObj));
    // Zod 실패 시, 가능한 필드를 수동으로 채워서 복구 시도
    blindTeaser = {
      title: String(parsedObj.title || "블라인드 딜카드"),
      shortSummary: String(parsedObj.shortSummary || parsedObj.short_summary || ""),
      dealPoints: Array.isArray(parsedObj.dealPoints || parsedObj.deal_points)
        ? (parsedObj.dealPoints || parsedObj.deal_points) as string[]
        : ["투자 매력 포인트"],
      cautionPoints: Array.isArray(parsedObj.cautionPoints || parsedObj.caution_points)
        ? (parsedObj.cautionPoints || parsedObj.caution_points) as string[]
        : ["실사 확인 필요"],
      hiddenInfoNotice: Array.isArray(parsedObj.hiddenInfoNotice || parsedObj.hidden_info_notice)
        ? (parsedObj.hiddenInfoNotice || parsedObj.hidden_info_notice) as string[]
        : [],
      gateMessage: String(parsedObj.gateMessage || parsedObj.gate_message || ""),
      kakaoText: String(parsedObj.kakaoText || parsedObj.kakao_text || ""),
      boundaryNote: String(parsedObj.boundaryNote || parsedObj.boundary_note || ""),
    };
  }

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

