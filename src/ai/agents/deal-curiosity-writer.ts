/**
 * DealCuriosityWriterAgent
 *
 * Generates a public "이 건물, 딜 될까?" report from user input.
 * Calls OpenAI with structured JSON output, validates with Zod.
 *
 * Source: docs/09-ai-agent-contracts.md section 11
 */
import { callLLM } from "@/ai/llm-client";
import {
  DealCuriosityReportSchema,
  type DealCuriosityReport,
} from "@/ai/schemas/deal-curiosity-report";
import {
  SYSTEM_INSTRUCTION,
  USER_PROMPT_TEMPLATE,
  PROMPT_ID,
} from "@/ai/prompts/deal-curiosity-report";

export interface DealCuriosityWriterInput {
  rawInput: string;
  inputType: "address" | "manual_text";
  userPurpose: string;
}

export interface DealCuriosityWriterResult {
  report: DealCuriosityReport;
  model: string;
  promptVersion: string;
  usage?: {
    totalTokens?: number;
  };
}

export async function runDealCuriosityWriter(
  input: DealCuriosityWriterInput,
): Promise<DealCuriosityWriterResult> {
  const userPrompt = USER_PROMPT_TEMPLATE.replace("{raw_input}", input.rawInput)
    .replace("{input_type}", input.inputType)
    .replace("{user_purpose}", input.userPurpose);

  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const response = await callLLM({
    model,
    systemPrompt: SYSTEM_INSTRUCTION,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: 4096,
  });

  // Parse and validate with Zod
  const parsed = JSON.parse(response.content);
  const report = DealCuriosityReportSchema.parse(parsed);

  return {
    report,
    model,
    promptVersion: PROMPT_ID,
    usage: {
      totalTokens: response.tokens,
    },
  };
}
