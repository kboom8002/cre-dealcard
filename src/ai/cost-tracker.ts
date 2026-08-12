export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-2.5-flash': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
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
}) {
  const costUsd = calculateCost(params.modelName, params.inputTokens, params.outputTokens);
  
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    await supabase.from('im_generation_cost_log').insert({
      building_id: params.buildingId,
      broker_id: params.brokerId,
      model_name: params.modelName,
      section_type: params.sectionType,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: costUsd,
    });
  } catch (error) {
    console.error('Failed to log generation cost to database:', error);
    // Fallback logger
  }
}
