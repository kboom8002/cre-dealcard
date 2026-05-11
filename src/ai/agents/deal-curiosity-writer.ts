/**
 * DealCuriosityWriterAgent
 *
 * Generates a public "이 건물, 딜 될까?" report from user input.
 * Calls OpenAI with structured JSON output, validates with Zod.
 *
 * Source: docs/09-ai-agent-contracts.md section 11
 */
import OpenAI from "openai";
import {
  DealCuriosityReportSchema,
  type DealCuriosityReport,
} from "@/ai/schemas/deal-curiosity-report";
import {
  SYSTEM_INSTRUCTION,
  USER_PROMPT_TEMPLATE,
  PROMPT_ID,
} from "@/ai/prompts/deal-curiosity-report";

const openai = new OpenAI();

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
    promptTokens?: number;
    completionTokens?: number;
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

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty response");
  }

  // Parse and validate with Zod
  const parsed = JSON.parse(content);
  const report = DealCuriosityReportSchema.parse(parsed);

  return {
    report,
    model,
    promptVersion: PROMPT_ID,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
  };
}
