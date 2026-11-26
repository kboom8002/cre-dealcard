import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { detectPromptInjection, sanitizeMemo } from "@/ai/sanitizer/memo-sanitizer";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import { redactPII } from "@/domain/guardrails/disclosure-guard";
import {
  INQUIRY_QUALIFIER_SYSTEM,
  INQUIRY_QUALIFIER_USER_TEMPLATE,
} from "@/ai/prompts/inquiry-qualifier";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";
import { getModel } from "../model-selector";

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

// ── Untrusted Inquiry Sanitizer ──────────────────────────────────

function sanitizeInquiryValue(
  value: unknown,
  depth = 0,
): { value: unknown; injectionDetected: boolean } {
  if (value === null || value === undefined) {
    return { value, injectionDetected: false };
  }
  if (typeof value === "string") {
    if (detectPromptInjection(value)) {
      return { value: "", injectionDetected: true };
    }
    const sanitized = sanitizeMemo(value);
    if (sanitized.injectionDetected) {
      return { value: "", injectionDetected: true };
    }
    return { value: sanitized.sanitizedText, injectionDetected: false };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { value, injectionDetected: false };
  }
  if (depth >= 4) {
    return { value: undefined, injectionDetected: false };
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, 50)) {
      const res = sanitizeInquiryValue(item, depth + 1);
      if (res.injectionDetected) {
        return { value: [], injectionDetected: true };
      }
      if (res.value !== undefined) {
        out.push(res.value);
      }
    }
    return { value: out, injectionDetected: false };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entryVal] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (detectPromptInjection(key)) {
        return { value: {}, injectionDetected: true };
      }
      const res = sanitizeInquiryValue(entryVal, depth + 1);
      if (res.injectionDetected) {
        return { value: {}, injectionDetected: true };
      }
      if (res.value !== undefined) {
        out[key] = res.value;
      }
    }
    return { value: out, injectionDetected: false };
  }
  return { value: undefined, injectionDetected: false };
}

// ── Agent ────────────────────────────────────────────────────────

export async function runInquiryQualifierAgent(
  input: InquiryQualifierInput,
): Promise<AgentOutputEnvelope<InquiryQualifierOutput>> {
  const model = getModel("luna");

  const questionCheck = sanitizeInquiryValue(input.inquiry?.question_text);
  const prospectCheck = sanitizeInquiryValue(input.inquiry?.prospect);
  const requirementCheck = sanitizeInquiryValue(input.inquiry?.requirement);

  if (
    questionCheck.injectionDetected ||
    prospectCheck.injectionDetected ||
    requirementCheck.injectionDetected
  ) {
    return createErrorEnvelope("Prompt injection detected in inquiry input");
  }

  const sanitizedInquiry = {
    ...(prospectCheck.value !== undefined ? { prospect: prospectCheck.value } : {}),
    ...(requirementCheck.value !== undefined ? { requirement: requirementCheck.value } : {}),
    ...(questionCheck.value !== undefined ? { question_text: questionCheck.value } : {}),
  };

  const userPrompt = INQUIRY_QUALIFIER_USER_TEMPLATE
    .replace("{space_ssot}", () => JSON.stringify(input.space_ssot, null, 2))
    .replace("{leasing_page_summary}", () => JSON.stringify(input.leasing_page_summary || {}, null, 2))
    .replace("{tenant_fit_results}", () => JSON.stringify(input.tenant_fit_results || [], null, 2))
    .replace("{inquiry}", () => JSON.stringify(sanitizedInquiry, null, 2));

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

    // PII guardrails — summary 및 kakao_reply_draft에서 전화번호, 이메일, 주민번호 등 제거
    parsed.summary = redactPII(parsed.summary);
    parsed.kakao_reply_draft = redactPII(parsed.kakao_reply_draft);

    return createSuccessEnvelope(parsed, {
      confidence: "memo_based_inference",
      boundary_note:
        "문의 분석은 제한된 정보 기반의 예비 판단입니다.",
    });
  } catch (error) {
    return createErrorEnvelope(String(error));
  }
}
