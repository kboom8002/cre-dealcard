import { callLLM } from "@/ai/llm-client";
import {
  FundingProjectOutputSchema,
  FundingBlindTeaserOutputSchema,
  type FundingProjectOutput,
  type FundingBlindTeaserOutput,
} from "@/ai/schemas/funding-project";
import {
  FUNDING_PROJECT_PARSER_SYSTEM,
  FUNDING_PROJECT_PARSER_USER,
  FUNDING_BLIND_TEASER_SYSTEM,
  FUNDING_BLIND_TEASER_USER,
} from "@/ai/prompts/funding-project";
import { getModel } from "../model-selector";
import { safeParseAIResponse } from "@/ai/utils/ai-response-parser";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

export interface FundingProjectCardResult {
  projectData: FundingProjectOutput;
  blindTeaser: FundingBlindTeaserOutput;
  model: string;
}

export async function runFundingProjectCard(
  rawText: string,
): Promise<FundingProjectCardResult> {
  const model = getModel("terra");

  // Step 1: Parse unstructured text into structured project info
  const parseUserPrompt = FUNDING_PROJECT_PARSER_USER.replace("{rawText}", rawText);
  const parseResponse = await callLLM({
    model,
    systemPrompt: FUNDING_PROJECT_PARSER_SYSTEM,
    userPrompt: parseUserPrompt,
    responseFormat: "json_object",
    temperature: 0.2, // lower temp for strict data extraction
  });

  const parseResult = safeParseAIResponse(parseResponse.content, FundingProjectOutputSchema);
  if (!parseResult.success) {
    throw new Error(`[funding-card] Step1 파싱 실패: ${parseResult.error}`);
  }
  const projectData = parseResult.data;

  // Step 2: Compose blind teaser using parsed info
  const teaserUserPrompt = FUNDING_BLIND_TEASER_USER
    .replace("{projectName}", projectData.projectName)
    .replace("{assetType}", projectData.assetType)
    .replace("{targetAmount}", String(projectData.targetAmount))
    .replace("{minInvestment}", String(projectData.minInvestment))
    .replace("{expectedReturnPct}", String(projectData.expectedReturnPct))
    .replace("{investmentPeriodMonths}", String(projectData.investmentPeriodMonths))
    .replace("{riskLevel}", String(projectData.riskLevel))
    .replace("{tokenType}", projectData.tokenType)
    .replace("{descriptionMemo}", projectData.descriptionMemo || "");

  const teaserResponse = await callLLM({
    model,
    systemPrompt: FUNDING_BLIND_TEASER_SYSTEM,
    userPrompt: teaserUserPrompt,
    responseFormat: "json_object",
    temperature: 0.7, // slightly higher temp for engaging writing
  });

  const teaserResult = safeParseAIResponse(teaserResponse.content, FundingBlindTeaserOutputSchema);
  if (!teaserResult.success) {
    throw new Error(`[funding-card] Step2 파싱 실패: ${teaserResult.error}`);
  }
  const blindTeaser = teaserResult.data;

  // ── 법적 가드레일 (자본시장법 준수) ──
  const guardedTeaser = { ...blindTeaser };
  if (guardedTeaser.title) {
    guardedTeaser.title = rewriteUnsafeText(guardedTeaser.title).safeText;
  }
  if (guardedTeaser.shortSummary) {
    guardedTeaser.shortSummary = rewriteUnsafeText(guardedTeaser.shortSummary).safeText;
  }
  if (guardedTeaser.forbiddenWordsNotice) {
    guardedTeaser.forbiddenWordsNotice = rewriteUnsafeText(guardedTeaser.forbiddenWordsNotice).safeText;
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
    projectData,
    blindTeaser: guardedTeaser,
    model,
  };
}
