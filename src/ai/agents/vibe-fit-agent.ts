/**
 * ai/agents/vibe-fit-agent.ts
 *
 * 공간 분위기 분석 에이전트.
 * VAD(Valence-Arousal-Dominance) 모델을 활용하여 공간의 분위기를
 * 정량화하고, 대상 임차인 유형과의 분위기 정렬도를 평가합니다.
 */

import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  VIBE_FIT_SYSTEM,
  VIBE_FIT_USER_TEMPLATE,
  VIBE_FIT_PROMPT_ID,
} from "@/ai/prompts/vibe-fit";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input / Output 타입 ──────────────────────────────────────────

export interface VibeFitAgentInput {
  space_ssot: Record<string, unknown>;
  visual_summary?: Record<string, unknown>;
  target_tenant_types: string[];
}

export const VibeFitAgentOutputSchema = z.object({
  vibe_summary: z.string(),
  vibe_tags: z.array(z.string()),
  vad: z.object({
    valence: z.string(),
    arousal: z.string(),
    dominance: z.string(),
  }),
  tenant_vibe_alignment: z.array(
    z.object({
      tenant_type: z.string(),
      alignment_level: z.string(),
      reason: z.string(),
    })
  ),
  mixed_signal_risks: z.array(z.string()),
  retrofit_vibe_opportunities: z.array(z.string()),
  missing_evidence: z.array(z.string()),
});

export type VibeFitAgentOutput = z.infer<typeof VibeFitAgentOutputSchema>;

// ── Agent Runner ─────────────────────────────────────────────────

export async function runVibeFitAgent(
  input: VibeFitAgentInput,
): Promise<AgentOutputEnvelope<VibeFitAgentOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";

  // 프롬프트 조립
  const userPrompt = VIBE_FIT_USER_TEMPLATE
    .replace("{space_ssot}", JSON.stringify(input.space_ssot, null, 2))
    .replace(
      "{visual_summary}",
      input.visual_summary
        ? JSON.stringify(input.visual_summary, null, 2)
        : "사진 분류 결과 없음",
    )
    .replace(
      "{target_tenant_types}",
      JSON.stringify(input.target_tenant_types, null, 2),
    );

  try {
    const response = await callLLM({
      model,
      systemPrompt: VIBE_FIT_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = VibeFitAgentOutputSchema.parse(JSON.parse(response.content));

    // ── Guardrail: vibe_summary 안전 언어 치환 ──
    const rewritten = rewriteUnsafeText(parsed.vibe_summary);
    parsed.vibe_summary = rewritten.safeText;

    // 위반 사항이 있으면 경고 목록에 추가
    const warnings: string[] = [];
    if (rewritten.hadViolations) {
      warnings.push(
        `vibe_summary guardrail rewrites: ${rewritten.violations.join(", ")}`,
      );
    }

    return createSuccessEnvelope(parsed, {
      confidence: "photo_based_inference",
      boundary_note: "분위기 평가는 사진 기준의 예비 해석입니다.",
      warnings,
    });
  } catch (error) {
    return createErrorEnvelope<VibeFitAgentOutput>(
      `[${VIBE_FIT_PROMPT_ID}] ${String(error)}`,
    );
  }
}
