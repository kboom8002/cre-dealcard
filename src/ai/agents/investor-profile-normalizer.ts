import { callLLM } from "@/ai/llm-client";
import {
  InvestorProfileOutputSchema,
  type InvestorProfileOutput,
} from "@/ai/schemas/funding-project";

export interface InvestorProfileNormalizerResult {
  profile: InvestorProfileOutput;
  model: string;
}

export async function runInvestorProfileNormalizer(
  rawText: string,
): Promise<InvestorProfileNormalizerResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";

  const systemPrompt = `You are a Korean financial analyst specialized in crowdfunding and STO investor matching.
Extract investor preferences from raw broker notes or client inputs and structure them into valid JSON matching InvestorProfileOutputSchema.

CRITICAL RULES:
- investorType must be general (일반투자자), qualified (소득적격투자자), or professional (전문투자자). If not specified, default to general.
- investmentMin and investmentMax must be in Korean Won (원) or numbers representing won. E.g. "1000만원" -> 10000000.
- maxRiskTolerance must be between 1 and 5.
- niceToHaveCriteria and mustHaveCriteria must contain clear, single-line text items.`;

  const userPrompt = `다음 투자 선호도 및 고객 메모를 바탕으로 구조화된 프로파일을 채워주세요.

## 메모 원문
${rawText}

JSON으로 응답해주세요.`;

  const response = await callLLM({
    model,
    systemPrompt,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.2,
  });

  const profile = InvestorProfileOutputSchema.parse(JSON.parse(response.content));

  return {
    profile,
    model,
  };
}
