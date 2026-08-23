// src/ai/cost-tracker.ts
// Phase 1: 모델 요금표 갱신 + 타겟 테이블 im_generation_metrics로 변경

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-4o 계열
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  // OpenAI GPT-5.6 계열
  'gpt-5.6-terra': { input: 3.0 / 1_000_000, output: 12.0 / 1_000_000 },
  'gpt-5.6-sol': { input: 5.0 / 1_000_000, output: 20.0 / 1_000_000 },
  'gpt-5.6-luna': { input: 1.0 / 1_000_000, output: 4.0 / 1_000_000 },
  // Google Gemini 계열
  'gemini-2.5-flash': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
  // Anthropic Claude 계열
  'claude-sonnet-4-5': { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  'claude-opus-4': { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export async function logGenerationCost(params: {
  buildingId: string;
  brokerId: string;
  modelName: string;
  sectionType?: string;
  inputTokens: number;
  outputTokens: number;
  jobId?: string;
}) {
  const costUsd = calculateCost(params.modelName, params.inputTokens, params.outputTokens);

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    // Phase 1: im_generation_cost_log → im_generation_metrics 변경
    await supabase.from('im_generation_metrics').insert({
      job_id: params.jobId ?? null,
      building_id: params.buildingId,
      section_type: params.sectionType ?? 'unknown',
      model_name: params.modelName,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: costUsd,
      outcome: 'completed',
    });
  } catch (error) {
    console.error('[cost-tracker] Failed to log generation cost:', error);
  }
}
