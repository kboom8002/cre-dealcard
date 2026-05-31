import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  TENANT_FIT_SYSTEM,
  TENANT_FIT_USER_TEMPLATE,
} from "@/ai/prompts/tenant-fit";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input ────────────────────────────────────────────────────────

export interface TenantFitAgentInput {
  space_ssot: Record<string, unknown>;
  visual_summary?: Record<string, unknown>;
  target_tenant_types: string[];
}

// ── Output ───────────────────────────────────────────────────────

export const TenantFitResultSchema = z.object({
  target_tenant_type: z.string(),
  fit_level: z.string(),
  fit_score: z.number(),
  strengths: z.array(z.string()),
  check_needed: z.array(z.string()),
  weaker_points: z.array(z.string()).optional().default([]),
  required_facility_checks: z.array(z.string()).optional().default([]),
  legal_or_permit_checks: z.array(z.string()).optional().default([]),
  safe_summary: z.string(),
  boundary_note: z.string(),
});

export type TenantFitResult = z.infer<typeof TenantFitResultSchema>;

export const TenantFitAgentOutputSchema = z.object({
  tenant_fit_results: z.array(TenantFitResultSchema),
});

export type TenantFitAgentOutput = z.infer<typeof TenantFitAgentOutputSchema>;

// ── Agent ────────────────────────────────────────────────────────

export async function runTenantFitAgent(
  input: TenantFitAgentInput,
): Promise<AgentOutputEnvelope<TenantFitAgentOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  // 프롬프트 템플릿에 입력 데이터 삽입
  const userPrompt = TENANT_FIT_USER_TEMPLATE
    .replace("{space_ssot}", JSON.stringify(input.space_ssot, null, 2))
    .replace(
      "{visual_summary}",
      JSON.stringify(input.visual_summary ?? {}, null, 2),
    )
    .replace(
      "{target_tenant_types}",
      JSON.stringify(input.target_tenant_types, null, 2),
    );

  try {
    const response = await callLLM({
      model,
      systemPrompt: TENANT_FIT_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = TenantFitAgentOutputSchema.parse(JSON.parse(response.content));

    // safe_summary에 safe-language 가드레일 적용
    const guardedResults = parsed.tenant_fit_results.map((result) => ({
      ...result,
      safe_summary: rewriteUnsafeText(result.safe_summary).safeText,
    }));

    const guardedOutput: TenantFitAgentOutput = {
      tenant_fit_results: guardedResults,
    };

    return createSuccessEnvelope(guardedOutput, {
      confidence: "memo_based_inference",
      boundary_note:
        "실제 임차 가능성은 법규 및 현장 확인 후 달라집니다.",
    });
  } catch (error) {
    return createErrorEnvelope(String(error));
  }
}
