/**
 * ai/agents/leasing-page-writer-agent.ts
 *
 * 리싱 페이지 작성 에이전트.
 * 공간 SSoT, 임차인 적합성, 분위기 분석, 사진 앨범 데이터를 바탕으로
 * 공개 리싱 페이지 콘텐츠를 자동 생성합니다.
 */

import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  LEASING_PAGE_WRITER_SYSTEM,
  LEASING_PAGE_WRITER_USER_TEMPLATE,
  LEASING_PAGE_WRITER_PROMPT_ID,
} from "@/ai/prompts/leasing-page-writer";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input / Output 타입 ──────────────────────────────────────────

export interface LeasingPageWriterInput {
  space_ssot: Record<string, unknown>;
  tenant_fit_results?: Record<string, unknown>[];
  vibe_fit_result?: Record<string, unknown>;
  visual_albums?: Record<string, unknown>[];
}

export const LeasingPageWriterOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  answer_hero: z.string(),
  sections: z.array(
    z.object({
      section_type: z.string(),
      title: z.string(),
      sort_order: z.number(),
      markdown: z.string(),
      content_json: z.record(z.string(), z.unknown()).optional(),
      linked_album_ids: z.array(z.string()).optional(),
      linked_visual_asset_ids: z.array(z.string()).optional(),
      visibility: z.string().optional(),
    })
  ),
  seo: z.object({
    meta_title: z.string(),
    meta_description: z.string(),
    noindex: z.boolean().optional(),
  }),
  boundary_note: z.string(),
});

export type LeasingPageWriterOutput = z.infer<typeof LeasingPageWriterOutputSchema>;

// ── Agent Runner ─────────────────────────────────────────────────

export async function runLeasingPageWriterAgent(
  input: LeasingPageWriterInput,
): Promise<AgentOutputEnvelope<LeasingPageWriterOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";

  // 프롬프트 조립 – 선택 필드는 빈 값 표기
  const userPrompt = LEASING_PAGE_WRITER_USER_TEMPLATE
    .replace("{space_ssot}", JSON.stringify(input.space_ssot, null, 2))
    .replace(
      "{tenant_fit_results}",
      input.tenant_fit_results
        ? JSON.stringify(input.tenant_fit_results, null, 2)
        : "임차인 적합성 결과 없음",
    )
    .replace(
      "{vibe_fit_result}",
      input.vibe_fit_result
        ? JSON.stringify(input.vibe_fit_result, null, 2)
        : "분위기 분석 결과 없음",
    )
    .replace(
      "{visual_albums}",
      input.visual_albums
        ? JSON.stringify(input.visual_albums, null, 2)
        : "사진 앨범 없음",
    );

  try {
    const response = await callLLM({
      model,
      systemPrompt: LEASING_PAGE_WRITER_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = LeasingPageWriterOutputSchema.parse(JSON.parse(response.content));

    // ── Guardrail: answer_hero 안전 언어 치환 ──
    const warnings: string[] = [];

    const heroRewrite = rewriteUnsafeText(parsed.answer_hero);
    parsed.answer_hero = heroRewrite.safeText;
    if (heroRewrite.hadViolations) {
      warnings.push(
        `answer_hero guardrail rewrites: ${heroRewrite.violations.join(", ")}`,
      );
    }

    // ── Guardrail: 각 section의 markdown 안전 언어 치환 ──
    for (const section of parsed.sections) {
      const sectionRewrite = rewriteUnsafeText(section.markdown);
      section.markdown = sectionRewrite.safeText;
      if (sectionRewrite.hadViolations) {
        warnings.push(
          `section[${section.section_type}] guardrail rewrites: ${sectionRewrite.violations.join(", ")}`,
        );
      }
    }

    return createSuccessEnvelope(parsed, {
      confidence: "memo_based_inference",
      boundary_note:
        "현재 입력자료와 사진 기준 예비 판단이며 현장 확인 및 전문가 검토 후 달라질 수 있습니다.",
      warnings,
    });
  } catch (error) {
    return createErrorEnvelope<LeasingPageWriterOutput>(
      `[${LEASING_PAGE_WRITER_PROMPT_ID}] ${String(error)}`,
    );
  }
}
