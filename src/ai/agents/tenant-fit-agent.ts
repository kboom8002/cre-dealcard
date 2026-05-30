/**
 * TenantFitAgent
 * 공간 SSoT와 시각 요약 데이터를 기반으로 대상 업종별 적합도를 평가합니다.
 * 실제 임차 가능성은 법규 및 현장 확인 후 달라집니다.
 */
import OpenAI from "openai";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  TENANT_FIT_SYSTEM,
  TENANT_FIT_USER_TEMPLATE,
  TENANT_FIT_PROMPT_ID,
} from "@/ai/prompts/tenant-fit";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

const openai = new OpenAI();

// ── Input ────────────────────────────────────────────────────────

export interface TenantFitAgentInput {
  space_ssot: Record<string, unknown>;
  visual_summary?: Record<string, unknown>;
  target_tenant_types: string[];
}

// ── Output ───────────────────────────────────────────────────────

export interface TenantFitResult {
  target_tenant_type: string;
  fit_level: string;
  fit_score: number;
  strengths: string[];
  check_needed: string[];
  weaker_points: string[];
  required_facility_checks: string[];
  legal_or_permit_checks: string[];
  safe_summary: string;
  boundary_note: string;
}

export interface TenantFitAgentOutput {
  tenant_fit_results: TenantFitResult[];
}

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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: TENANT_FIT_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    const parsed: TenantFitAgentOutput = JSON.parse(content);

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
