// src/domain/building/mobile-im/telemetry.ts
// Phase 1: IM 생성 파이프라인 텔레메트리 모듈
//
// classifyOutcome — 생성 결과 4분할 분류
// withStage       — 파이프라인 단계별 latency 래퍼
// recordGenerationMetric — im_generation_metrics 테이블 기록
// recordEditEvent — im_edit_events 테이블 기록

import { createServiceClient } from '@/lib/supabase/service';

// ─── 결과 분류 ──────────────────────────────────────────────────
export type GenerationOutcome =
  | 'completed'       // 정상 생성 완료
  | 'intended_block'  // 품질 미달 등 의도된 차단
  | 'input_missing'   // 필수값 누락
  | 'system_error';   // 미분류 런타임 에러

/**
 * 에러 객체를 4분할 결과로 분류합니다.
 * 에러가 없으면 'completed'를 반환합니다.
 */
export function classifyOutcome(error?: unknown): GenerationOutcome {
  if (!error) return 'completed';

  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  // 1. 입력 누락 (서버 게이트에서 reject)
  if (
    name === 'InputRequiredError' ||
    msg.includes('필수') ||
    msg.includes('입력이 필요') ||
    msg.includes('부족합니다') ||
    msg.includes('minimum') ||
    /매각.*희망가|월.*임대료|대지.*면적/.test(msg)
  ) {
    return 'input_missing';
  }

  // 2. 의도된 차단 (품질 게이트, 등급 제한)
  if (
    name === 'GateBlockedError' ||
    name === 'QualityGateError' ||
    msg.includes('Grade D') ||
    msg.includes('Publish gates blocked') ||
    msg.includes('A등급') ||
    msg.includes('데이터 등급')
  ) {
    return 'intended_block';
  }

  // 3. 기타 → 시스템 에러
  return 'system_error';
}

// ─── 스테이지 측정 래퍼 ──────────────────────────────────────────

export interface StageResult<T> {
  result: T;
  latencyMs: number;
  stageName: string;
}

/**
 * 파이프라인 단계를 감싸 latency(ms)를 측정합니다.
 */
export async function withStage<T>(
  stageName: string,
  fn: () => Promise<T>,
): Promise<StageResult<T>> {
  const start = performance.now();
  try {
    const result = await fn();
    return {
      result,
      latencyMs: Math.round(performance.now() - start),
      stageName,
    };
  } catch (err) {
    // 에러 시에도 latency 기록 후 재throw
    const latencyMs = Math.round(performance.now() - start);
    console.warn(`[telemetry] Stage "${stageName}" failed after ${latencyMs}ms`);
    throw err;
  }
}

// ─── DB 기록 ─────────────────────────────────────────────────────

export interface GenerationMetricInput {
  jobId?: string;
  buildingId?: string;
  sectionType: string;
  stageName?: string;
  parallelGroup?: number;
  usedFastMode?: boolean;
  usedFallback?: boolean;
  judgeScore?: number;
  publishBlocked?: boolean;
  blockReasons?: string[];
  confidence?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  modelName?: string;
  costUsd?: number;
  outcome?: GenerationOutcome;
  errorMessage?: string;
}

/**
 * im_generation_metrics 테이블에 섹션 단위 계측을 기록합니다.
 * 실패해도 생성 파이프라인을 중단하지 않습니다.
 */
export async function recordGenerationMetric(input: GenerationMetricInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('im_generation_metrics').insert({
      job_id: input.jobId ?? null,
      building_id: input.buildingId ?? null,
      section_type: input.sectionType,
      stage_name: input.stageName ?? null,
      parallel_group: input.parallelGroup ?? null,
      used_fast_mode: input.usedFastMode ?? false,
      used_fallback: input.usedFallback ?? false,
      judge_score: input.judgeScore ?? null,
      publish_blocked: input.publishBlocked ?? false,
      block_reasons: input.blockReasons ?? null,
      confidence: input.confidence ?? null,
      latency_ms: input.latencyMs ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      model_name: input.modelName ?? null,
      cost_usd: input.costUsd ?? null,
      outcome: input.outcome ?? 'completed',
      error_message: input.errorMessage ?? null,
    });
  } catch (err) {
    console.error('[telemetry] Failed to record generation metric:', err);
  }
}

export interface EditEventInput {
  jobId?: string;
  buildingId?: string;
  sectionType: string;
  beforeMd: string;
  afterMd: string;
  editedBy?: string;
}

/**
 * im_edit_events 테이블에 브로커 편집 이벤트를 기록합니다.
 */
export async function recordEditEvent(input: EditEventInput): Promise<void> {
  try {
    const editDistance = computeEditDistance(input.beforeMd, input.afterMd);
    const supabase = createServiceClient();
    await supabase.from('im_edit_events').insert({
      job_id: input.jobId ?? null,
      building_id: input.buildingId ?? null,
      section_type: input.sectionType,
      before_md: input.beforeMd.slice(0, 5000),
      after_md: input.afterMd.slice(0, 5000),
      edit_distance: editDistance,
      edited_by: input.editedBy ?? null,
    });
  } catch (err) {
    console.error('[telemetry] Failed to record edit event:', err);
  }
}

/**
 * im_public_api_log에 외부 API 호출 결과를 기록합니다.
 */
export async function recordPublicApiCall(params: {
  jobId?: string;
  buildingId?: string;
  provider: string;
  endpoint: string;
  ok: boolean;
  httpStatus?: number;
  latencyMs?: number;
  errorMsg?: string;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('im_public_api_log').insert({
      job_id: params.jobId ?? null,
      building_id: params.buildingId ?? null,
      provider: params.provider,
      endpoint: params.endpoint,
      ok: params.ok,
      http_status: params.httpStatus ?? null,
      latency_ms: params.latencyMs ?? null,
      error_msg: params.errorMsg ?? null,
    });
  } catch (err) {
    console.error('[telemetry] Failed to record public API call:', err);
  }
}

// ─── 유틸 ────────────────────────────────────────────────────────

/**
 * 간이 편집 거리 계산 (문자 단위 diff 길이).
 * 정밀한 Levenshtein이 아닌 실용적 근사입니다.
 */
function computeEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  // 간이: 길이 차이 + 문자 단위 불일치 수
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  let diff = Math.abs(a.length - b.length);
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}
