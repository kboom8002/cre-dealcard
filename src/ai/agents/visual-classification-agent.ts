/**
 * VisualClassificationAgent
 * 공간 사진 자산을 분류하고, 촬영 범위·품질·태그·임차 적합성 등을 추론합니다.
 * 이미지 기반 예비 분류이며, 실제 시설 상태는 현장 확인이 필요합니다.
 */
import OpenAI from "openai";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  VISUAL_CLASSIFICATION_SYSTEM,
  VISUAL_CLASSIFICATION_USER_TEMPLATE,
  VISUAL_CLASSIFICATION_PROMPT_ID,
} from "@/ai/prompts/visual-classification";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

const openai = new OpenAI();

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

export interface ClassifiedAsset {
  visual_asset_id: string;
  capture_scope: string;
  capture_subject: string;
  quality: {
    quality_score: number;
    blur: string;
    brightness: string;
    recommended_use: string;
  };
  tags: string[];
  facility_tags: string[];
  risk_tags: string[];
  vibe_tags: string[];
  tenant_relevance: string[];
  answers_questions: string[];
  visibility_recommendation: string;
  confidence: string;
  needs_review: boolean;
}

export interface VisualClassificationOutput {
  classified_assets: ClassifiedAsset[];
  global_missing_shot_requests: Array<{
    field: string;
    reason: string;
    priority: string;
  }>;
}

// ── Agent ────────────────────────────────────────────────────────

export async function runVisualClassificationAgent(
  input: VisualClassificationInput,
): Promise<AgentOutputEnvelope<VisualClassificationOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  // 사진 목록을 JSON으로 직렬화하여 프롬프트에 삽입
  const userPrompt = VISUAL_CLASSIFICATION_USER_TEMPLATE
    .replace("{space_context}", JSON.stringify(input.space_context, null, 2))
    .replace("{photo_list}", JSON.stringify(input.visual_assets, null, 2));

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: VISUAL_CLASSIFICATION_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    const parsed: VisualClassificationOutput = JSON.parse(content);

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
