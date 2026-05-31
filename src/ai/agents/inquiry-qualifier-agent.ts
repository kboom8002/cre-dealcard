import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import { redactPII } from "@/domain/guardrails/disclosure-guard";
import {
  INQUIRY_QUALIFIER_SYSTEM,
  INQUIRY_QUALIFIER_USER_TEMPLATE,
} from "@/ai/prompts/inquiry-qualifier";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input / Output ───────────────────────────────────────────────

export interface InquiryQualifierInput {
  space_ssot: Record<string, unknown>;
  leasing_page_summary?: Record<string, unknown>;
  tenant_fit_results?: Record<string, unknown>[];
  inquiry: {
    prospect?: Record<string, unknown>;
    requirement?: Record<string, unknown>;
    question_text?: string;
  };
}

export const InquiryQualifierOutputSchema = z.object({
  fit_estimate: z.string(),
  summary: z.string(),
  budget_fit: z.string(),
  timing_fit: z.string(),
  facility_fit: z.string(),
  key_concerns: z.array(z.string()),
  recommended_next_action: z.string(),
  kakao_reply_draft: z.string(),
  missing_info_to_ask: z.array(z.string()),
});

export type InquiryQualifierOutput = z.infer<typeof InquiryQualifierOutputSchema>;

// ── Agent ────────────────────────────────────────────────────────

export async function runInquiryQualifierAgent(
  input: InquiryQualifierInput,
): Promise<AgentOutputEnvelope<InquiryQualifierOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const userPrompt = INQUIRY_QUALIFIER_USER_TEMPLATE
    .replace("{space_ssot}", JSON.stringify(input.space_ssot, null, 2))
    .replace("{leasing_page_summary}", JSON.stringify(input.leasing_page_summary || {}, null, 2))
    .replace("{tenant_fit_results}", JSON.stringify(input.tenant_fit_results || [], null, 2))
    .replace("{inquiry}", JSON.stringify(input.inquiry, null, 2));

  try {
    const response = await callLLM({
      model,
      systemPrompt: INQUIRY_QUALIFIER_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = InquiryQualifierOutputSchema.parse(JSON.parse(response.content));

    // Safe-language guardrails
    parsed.kakao_reply_draft = rewriteUnsafeText(
      parsed.kakao_reply_draft || "",
    ).safeText;
    parsed.summary = rewriteUnsafeText(parsed.summary || "").safeText;

    // PII guardrails — summary에서 전화번호, 이메일 등 제거
    parsed.summary = redactPII(parsed.summary);

    return createSuccessEnvelope(parsed, {
      confidence: "memo_based_inference",
      boundary_note:
        "문의 분석은 제한된 정보 기반의 예비 판단입니다.",
    });
  } catch (error) {
    return createErrorEnvelope(String(error));
  }
}
