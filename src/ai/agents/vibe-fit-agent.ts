/**
 * ai/agents/vibe-fit-agent.ts
 *
 * 공간 분위기 분석 에이전트.
 * VAD(Valence-Arousal-Dominance) 모델을 활용하여 공간의 분위기를
 * 정량화하고, 대상 임차인 유형과의 분위기 정렬도를 평가합니다.
 */

import OpenAI from "openai";
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

export interface VibeFitAgentOutput {
  vibe_summary: string;
  vibe_tags: string[];
  vad: { valence: string; arousal: string; dominance: string };
  tenant_vibe_alignment: Array<{
    tenant_type: string;
    alignment_level: string;
    reason: string;
  }>;
  mixed_signal_risks: string[];
  retrofit_vibe_opportunities: string[];
  missing_evidence: string[];
}

// ── Agent Runner ─────────────────────────────────────────────────

const openai = new OpenAI();

export async function runVibeFitAgent(
  input: VibeFitAgentInput,
): Promise<AgentOutputEnvelope<VibeFitAgentOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: VIBE_FIT_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    const parsed: VibeFitAgentOutput = JSON.parse(content);

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
