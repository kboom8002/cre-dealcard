import { z } from "zod/v4";
import { callLLM } from "@/ai/llm-client";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  CAMPAIGN_COPY_SYSTEM,
  CAMPAIGN_COPY_USER_TEMPLATE,
} from "@/ai/prompts/campaign-copy";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

// ── Input / Output ───────────────────────────────────────────────

export interface CampaignCopyAgentInput {
  space_summary: Record<string, unknown>;
  leasing_page_info?: Record<string, unknown>;
  tenant_fit_results?: Record<string, unknown>[];
  copy_types: string[];
  target_tenant_types: string[];
  page_url?: string;
}

export const CampaignCopyItemSchema = z.object({
  copy_type: z.string(),
  target_tenant_type: z.string().optional(),
  title: z.string(),
  body: z.string(),
  boundary_note_short: z.string(),
});

export type CampaignCopyItem = z.infer<typeof CampaignCopyItemSchema>;

export const CampaignCopyAgentOutputSchema = z.object({
  copies: z.array(CampaignCopyItemSchema),
});

export type CampaignCopyAgentOutput = z.infer<typeof CampaignCopyAgentOutputSchema>;

// ── Agent ────────────────────────────────────────────────────────

export async function runCampaignCopyAgent(
  input: CampaignCopyAgentInput,
): Promise<AgentOutputEnvelope<CampaignCopyAgentOutput>> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const userPrompt = CAMPAIGN_COPY_USER_TEMPLATE
    .replace("{space_summary}", JSON.stringify(input.space_summary, null, 2))
    .replace("{leasing_page_info}", JSON.stringify(input.leasing_page_info || {}, null, 2))
    .replace("{tenant_fit_results}", JSON.stringify(input.tenant_fit_results || [], null, 2))
    .replace("{copy_types}", JSON.stringify(input.copy_types, null, 2))
    .replace("{target_tenant_types}", JSON.stringify(input.target_tenant_types, null, 2))
    .replace("{page_url}", input.page_url || "(링크 미정)");

  try {
    const response = await callLLM({
      model,
      systemPrompt: CAMPAIGN_COPY_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.3,
      maxTokens: 4096,
    });

    const parsed = CampaignCopyAgentOutputSchema.parse(JSON.parse(response.content));

    // Safe-language guardrails on each copy
    if (parsed.copies) {
      for (const copy of parsed.copies) {
        copy.title = rewriteUnsafeText(copy.title).safeText;
        copy.body = rewriteUnsafeText(copy.body).safeText;
      }
    }

    return createSuccessEnvelope(parsed, {
      confidence: "memo_based_inference",
      boundary_note:
        "제공된 정보는 예비 검토용이며 현장 확인이 필요합니다.",
    });
  } catch (error) {
    return createErrorEnvelope(String(error));
  }
}
