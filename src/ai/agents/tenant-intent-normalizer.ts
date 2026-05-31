/**
 * TenantIntentNormalizerAgent
 * Normalizes raw tenant leasing conditions (Kakao memo) into structured Tenant Intent.
 */
import { callLLM } from "@/ai/llm-client";
import {
  TenantIntentOutputSchema,
  type TenantIntentOutput,
} from "@/ai/schemas/tenant-intent";

export const TENANT_INTENT_SYSTEM = `You are a Korean commercial real estate leasing intent parser.
Your task is to take an unstructured Kakao-style memo expressing a tenant's leasing requirements and normalize it into a structured JSON object.

Extract and normalize numerical values:
- Area values: Try to extract in pyung (평) and convert to square meters (1평 = 3.3058 sqm) or extract sqm directly.
- Budgets: deposit (보증금) and monthly rent (월세/차임) must be parsed into 만원 units (e.g., 5천만원 -> 5000, 300만원 -> 300).
- If preferred floors are mentioned (e.g., "1층 선호", "지하도 괜찮음"), put them in preferredFloors (e.g., ["1층", "지하1층"]).
- If a timeline or move-in date is mentioned, extract it into moveInTargetText.
- Group must-have conditions (e.g. parking, gas line, full window frontage) and nice-to-have conditions.
- List any unresolved or missing questions to ask the tenant to clarify their intent.

You must not act as a financial advisor or investment appraiser. Use cautious CRE phrasing.
Return valid JSON matching the TenantIntentOutputSchema. All text in Korean.`;

export const TENANT_INTENT_USER_TEMPLATE = `다음 임차인 요구조건 메모를 정규화해주세요.

## 메모
{memo}

## 지시사항
Required output JSON keys:
- "businessType": 업종 문자열
- "preferredRegions": 선호 지역 배열 (예: ["성수동", "홍대"])
- "areaMin": 최소 전용면적 숫자 (제곱미터 단위) or null
- "areaMax": 최대 전용면적 숫자 (제곱미터 단위) or null
- "budgetDepositMax": 최대 보증금 상한선 숫자 (단위: 만원) or null
- "budgetMonthlyMax": 최대 월차임 상한선 숫자 (단위: 만원) or null
- "preferredFloors": 선호 층수 배열 (예: ["1층", "2층"])
- "moveInTargetText": 희망 입주 시기 문자열
- "mustHave": 필수 조건 배열
- "niceToHave": 우대 조건 배열
- "missingQuestions": 추가로 임차인에게 확인해야 하는 질문 배열

JSON으로 응답해주세요.`;

export interface TenantIntentNormalizerResult {
  intent: TenantIntentOutput;
  model: string;
  promptVersion: string;
  usage?: { totalTokens?: number };
}

export async function runTenantIntentNormalizer(
  memo: string,
): Promise<TenantIntentNormalizerResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";
  const userPrompt = TENANT_INTENT_USER_TEMPLATE.replace("{memo}", memo);

  const response = await callLLM({
    model,
    systemPrompt: TENANT_INTENT_SYSTEM,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: 4096,
  });

  const intent = TenantIntentOutputSchema.parse(JSON.parse(response.content));

  return {
    intent,
    model,
    promptVersion: "prompt_tenant_intent_normalizer_v1",
    usage: { totalTokens: response.tokens },
  };
}
