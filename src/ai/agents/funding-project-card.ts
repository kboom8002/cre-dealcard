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

export interface FundingProjectCardResult {
  projectData: FundingProjectOutput;
  blindTeaser: FundingBlindTeaserOutput;
  model: string;
}

export async function runFundingProjectCard(
  rawText: string,
): Promise<FundingProjectCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";

  // Step 1: Parse unstructured text into structured project info
  const parseUserPrompt = FUNDING_PROJECT_PARSER_USER.replace("{rawText}", rawText);
  const parseResponse = await callLLM({
    model,
    systemPrompt: FUNDING_PROJECT_PARSER_SYSTEM,
    userPrompt: parseUserPrompt,
    responseFormat: "json_object",
    temperature: 0.2, // lower temp for strict data extraction
  });

  const projectData = FundingProjectOutputSchema.parse(JSON.parse(parseResponse.content));

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

  const blindTeaser = FundingBlindTeaserOutputSchema.parse(JSON.parse(teaserResponse.content));

  return {
    projectData,
    blindTeaser,
    model,
  };
}
