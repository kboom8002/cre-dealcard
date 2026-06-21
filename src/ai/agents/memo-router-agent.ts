import { z } from "zod";
import { callLLM } from "@/ai/llm-client";
import { MEMO_ROUTER_SYSTEM, MEMO_ROUTER_USER_TEMPLATE } from "@/ai/prompts/memo-router";

export const MemoRouterOutputSchema = z.object({
  type: z.enum(["new_deal", "update_building", "buyer_condition", "general_note", "schedule_event"]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  extracted_data: z.object({
    target_region: z.string().optional(),
    target_budget: z.string().optional()
  }).optional()
});

export type MemoRouterOutput = z.infer<typeof MemoRouterOutputSchema>;

export async function routeMemo(memoText: string): Promise<MemoRouterOutput> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";
  const userPrompt = MEMO_ROUTER_USER_TEMPLATE.replace("{memo_text}", memoText);

  try {
    const response = await callLLM({
      model,
      systemPrompt: MEMO_ROUTER_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.1, // Low temperature for consistent classification
      maxTokens: 500,
    });

    const parsed = JSON.parse(response.content);
    return MemoRouterOutputSchema.parse(parsed);
  } catch (error) {
    console.error("Memo routing failed:", error);
    // Fallback to general note if AI fails
    return {
      type: "general_note",
      confidence: 0,
      summary: memoText.slice(0, 50) + "...",
    };
  }
}
