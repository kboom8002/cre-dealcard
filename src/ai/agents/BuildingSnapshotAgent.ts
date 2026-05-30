import OpenAI from "openai";
import { SnapshotDraftSchema, type SnapshotDraft } from "@/ai/schemas/snapshot-schema";
import { SNAPSHOT_AGENT_PROMPT_ID, SNAPSHOT_AGENT_SYSTEM, SNAPSHOT_AGENT_USER_TEMPLATE } from "@/ai/prompts/snapshot-agent";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

const openai = new OpenAI();

export interface BuildingSnapshotInput {
  building: any;
  leaseSummary?: any;
  availableEvidenceLayers?: string[];
}

export interface BuildingSnapshotResult {
  snapshot: SnapshotDraft;
  model: string;
  promptVersion: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export async function runBuildingSnapshotAgent(
  input: BuildingSnapshotInput,
): Promise<BuildingSnapshotResult> {
  const userPrompt = SNAPSHOT_AGENT_USER_TEMPLATE
    .replace("{building_data}", JSON.stringify(input.building, null, 2))
    .replace("{lease_data}", JSON.stringify(input.leaseSummary || {}, null, 2))
    .replace("{evidence_layers}", JSON.stringify(input.availableEvidenceLayers || [], null, 2));

  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SNAPSHOT_AGENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty response");
  }

  const parsed = JSON.parse(content);
  const snapshot = SnapshotDraftSchema.parse(parsed);

  // Apply safe-language guardrails to public-facing text
  const guarded: SnapshotDraft = {
    ...snapshot,
    headline: rewriteUnsafeText(snapshot.headline).safeText,
    deal_thesis: rewriteUnsafeText(snapshot.deal_thesis).safeText,
    risk_summary: rewriteUnsafeText(snapshot.risk_summary).safeText,
  };

  return {
    snapshot: guarded,
    model,
    promptVersion: SNAPSHOT_AGENT_PROMPT_ID,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
  };
}
