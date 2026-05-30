/**
 * ai/agents/inquiry-qualifier-agent.ts
 *
 * InquiryQualifierAgent — 문의 분석 및 카카오톡 답변 초안 생성.
 * PII 가드레일 + Safe language 가드레일 적용.
 */

import OpenAI from "openai";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import { redactPII } from "@/domain/guardrails/disclosure-guard";
import {
  INQUIRY_QUALIFIER_SYSTEM,
  INQUIRY_QUALIFIER_USER_TEMPLATE,
  INQUIRY_QUALIFIER_PROMPT_ID,
} from "@/ai/prompts/inquiry-qualifier";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

const openai = new OpenAI();

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

export interface InquiryQualifierOutput {
  fit_estimate: string;
  summary: string;
  budget_fit: string;
  timing_fit: string;
  facility_fit: string;
  key_concerns: string[];
  recommended_next_action: string;
  kakao_reply_draft: string;
  missing_info_to_ask: string[];
}

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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: INQUIRY_QUALIFIER_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    const parsed = JSON.parse(content) as InquiryQualifierOutput;

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
