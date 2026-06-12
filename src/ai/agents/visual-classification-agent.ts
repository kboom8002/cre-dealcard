import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  VISUAL_CLASSIFICATION_SYSTEM,
  VISUAL_CLASSIFICATION_USER_TEMPLATE,
} from "@/ai/prompts/visual-classification";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input ────────────────────────────────────────────────────────

export interface VisualClassificationInput {
  space_context: {
    space_id: string;
    target_tenant_types?: string[];
    known_facts?: Record<string, unknown>;
  };
  visual_assets: Array<{
    visual_asset_id: string;
    image_url: string;
  }>;
}

// ── Output ───────────────────────────────────────────────────────

export const ClassifiedAssetSchema = z.object({
  visual_asset_id: z.string(),
  capture_scope: z.string(),
  capture_subject: z.string(),
  quality: z.object({
    quality_score: z.number(),
    blur: z.string(),
    brightness: z.string(),
    recommended_use: z.string(),
  }),
  tags: z.array(z.string()),
  facility_tags: z.array(z.string()),
  risk_tags: z.array(z.string()),
  vibe_tags: z.array(z.string()),
  tenant_relevance: z.array(z.string()),
  answers_questions: z.array(z.string()),
  visibility_recommendation: z.string(),
  confidence: z.string(),
  needs_review: z.boolean(),
});

export type ClassifiedAsset = z.infer<typeof ClassifiedAssetSchema>;

export const VisualClassificationOutputSchema = z.object({
  classified_assets: z.array(ClassifiedAssetSchema),
  global_missing_shot_requests: z.array(
    z.object({
      field: z.string(),
      reason: z.string(),
      priority: z.string(),
    })
  ),
});

export type VisualClassificationOutput = z.infer<typeof VisualClassificationOutputSchema>;

// ── Agent ────────────────────────────────────────────────────────

export async function runVisualClassificationAgent(
  input: VisualClassificationInput,
): Promise<AgentOutputEnvelope<VisualClassificationOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";

  // 사진 목록을 JSON으로 직렬화하여 프롬프트에 삽입
  const userPrompt = VISUAL_CLASSIFICATION_USER_TEMPLATE
    .replace("{space_context}", JSON.stringify(input.space_context, null, 2))
    .replace("{photo_list}", JSON.stringify(input.visual_assets, null, 2));

  try {
    const response = await callLLM({
      model,
      systemPrompt: VISUAL_CLASSIFICATION_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = VisualClassificationOutputSchema.parse(JSON.parse(response.content));

    // answers_questions 텍스트에 safe-language 가드레일 적용
    const guardedAssets = parsed.classified_assets.map((asset) => ({
      ...asset,
      answers_questions: asset.answers_questions.map(
        (q) => rewriteUnsafeText(q).safeText,
      ),
    }));

    const guardedOutput: VisualClassificationOutput = {
      classified_assets: guardedAssets,
      global_missing_shot_requests: parsed.global_missing_shot_requests,
    };

    return createSuccessEnvelope(guardedOutput, {
      confidence: "photo_based_inference",
      boundary_note:
        "사진 분류는 이미지 기반 예비 분류이며 실제 시설 상태는 현장 확인이 필요합니다.",
    });
  } catch (error) {
    return createErrorEnvelope(String(error));
  }
}
