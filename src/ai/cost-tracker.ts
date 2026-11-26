// src/ai/cost-tracker.ts
// Phase 1: 모델 요금표 갱신 + 타겟 테이블 im_generation_metrics로 변경

import { isRealProductionRuntime } from '@/lib/env';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('cost-tracker');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNullableUuid(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-4o 계열
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  // OpenAI GPT-5.6 계열
  'gpt-5.6-terra': { input: 3.0 / 1_000_000, output: 12.0 / 1_000_000 },
  'gpt-6.1-terra': { input: 3.0 / 1_000_000, output: 12.0 / 1_000_000 },
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

export function resolveSplitTokenCounts(usage: {
  tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}): { inputTokens: number; outputTokens: number } {
  if (
    typeof usage.promptTokens === 'number' &&
    Number.isFinite(usage.promptTokens) &&
    typeof usage.completionTokens === 'number' &&
    Number.isFinite(usage.completionTokens)
  ) {
    return {
      inputTokens: Math.max(0, Math.round(usage.promptTokens)),
      outputTokens: Math.max(0, Math.round(usage.completionTokens)),
    };
  }
  const total =
    typeof usage.tokens === 'number' && Number.isFinite(usage.tokens)
      ? Math.max(0, usage.tokens)
      : 0;
  return {
    inputTokens: Math.round(total * 0.8),
    outputTokens: Math.round(total * 0.2),
  };
}

export async function logGenerationCost(params: {
  buildingId?: string | null;
  brokerId?: string;
  modelName: string;
  sectionType?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  jobId?: string | null;
}) {
  const costUsd = calculateCost(params.modelName, params.inputTokens, params.outputTokens);

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    // Phase 1: im_generation_cost_log → im_generation_metrics 변경
    const { error } = await supabase.from('im_generation_metrics').insert({
      job_id: toNullableUuid(params.jobId),
      building_id: toNullableUuid(params.buildingId),
      section_type: params.sectionType ?? 'unknown',
      model_name: params.modelName,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      ...(typeof params.latencyMs === 'number' && Number.isFinite(params.latencyMs)
        ? { latency_ms: Math.max(0, Math.round(params.latencyMs)) }
        : {}),
      cost_usd: costUsd,
      outcome: 'completed',
    });
    if (error) {
      log.error({ error }, '[cost-tracker] Failed to insert generation cost into im_generation_metrics');
    }
  } catch (error) {
    log.error({ error }, '[cost-tracker] Failed to log generation cost');
  }
}

export function trackLLMCallCostNonBlocking(params: {
  model: string;
  tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  sectionType?: string;
  buildingId?: string | null;
  jobId?: string | null;
  isMock?: boolean;
  isFromCache?: boolean;
}): void {
  if (params.isMock || params.isFromCache) return;
  const shouldLog =
    process.env.ENABLE_LLM_COST_LOG === '1' ||
    (isRealProductionRuntime() && process.env.VITEST !== 'true');
  if (!shouldLog) return;

  const { inputTokens, outputTokens } = resolveSplitTokenCounts(params);
  if (inputTokens === 0 && outputTokens === 0) return;

  void logGenerationCost({
    buildingId: params.buildingId ?? null,
    brokerId: 'system',
    modelName: params.model,
    sectionType: params.sectionType ?? 'llm_call',
    inputTokens,
    outputTokens,
    latencyMs: params.latencyMs,
    jobId: params.jobId ?? null,
  }).catch((error) => {
    log.warn({ error }, '[cost-tracker] Non-blocking cost log failed');
  });
}
