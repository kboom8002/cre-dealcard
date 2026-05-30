/**
 * ai/agents/campaign-copy-agent.ts
 *
 * CampaignCopyAgent — 채널별 마케팅 카피 생성.
 * KakaoTalk, Naver, SMS, Instagram 등 채널 맞춤 톤.
 */

import OpenAI from "openai";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";
import {
  CAMPAIGN_COPY_SYSTEM,
  CAMPAIGN_COPY_USER_TEMPLATE,
  CAMPAIGN_COPY_PROMPT_ID,
} from "@/ai/prompts/campaign-copy";
import type { AgentOutputEnvelope } from "@/ai/envelope";
import { createSuccessEnvelope, createErrorEnvelope } from "@/ai/envelope";

const openai = new OpenAI();

// ── Input / Output ───────────────────────────────────────────────

export interface CampaignCopyAgentInput {
  space_summary: Record<string, unknown>;
  leasing_page_info?: Record<string, unknown>;
  tenant_fit_results?: Record<string, unknown>[];
  copy_types: string[];
  target_tenant_types: string[];
  page_url?: string;
}

export interface CampaignCopyItem {
  copy_type: string;
  target_tenant_type?: string;
  title: string;
  body: string;
  boundary_note_short: string;
}

export interface CampaignCopyAgentOutput {
  copies: CampaignCopyItem[];
}

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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: CAMPAIGN_COPY_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty response");

    const parsed = JSON.parse(content) as CampaignCopyAgentOutput;

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
