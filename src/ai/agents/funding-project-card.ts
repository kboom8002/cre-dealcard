import OpenAI from "openai";
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

const openai = new OpenAI();

export interface FundingProjectCardResult {
  projectData: FundingProjectOutput;
  blindTeaser: FundingBlindTeaserOutput;
  model: string;
}

export async function runFundingProjectCard(
  rawText: string,
): Promise<FundingProjectCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";

  // Step 1: Parse unstructured text into structured project info
  const parseUserPrompt = FUNDING_PROJECT_PARSER_USER.replace("{rawText}", rawText);
  const parseResponse = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: FUNDING_PROJECT_PARSER_SYSTEM },
      { role: "user", content: parseUserPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2, // lower temp for strict data extraction
  });

  const parseContent = parseResponse.choices[0]?.message?.content;
  if (!parseContent) throw new Error("AI failed to parse project memo");

  const projectData = FundingProjectOutputSchema.parse(JSON.parse(parseContent));

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

  const teaserResponse = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: FUNDING_BLIND_TEASER_SYSTEM },
      { role: "user", content: teaserUserPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7, // slightly higher temp for engaging writing
  });

  const teaserContent = teaserResponse.choices[0]?.message?.content;
  if (!teaserContent) throw new Error("AI failed to generate blind teaser");

  const blindTeaser = FundingBlindTeaserOutputSchema.parse(JSON.parse(teaserContent));

  return {
    projectData,
    blindTeaser,
    model,
  };
}
