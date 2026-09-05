import type { MobileIMSection } from './types';
import { recordGenerationMetric, type GenerationOutcome } from './telemetry';

export type SectionWithTelemetry = MobileIMSection & {
  _latencyMs?: number;
  _inputTokens?: number;
  _outputTokens?: number;
};

export interface RecordSectionTelemetryParams {
  buildingId: string | number;
  sectionType: string;
  stageName: string;
  section?: MobileIMSection;
  outcome?: GenerationOutcome;
}

/**
 * Records generation metric for a single section asynchronously (fire-and-forget).
 * Catches and logs any recording errors to prevent breaking the main pipeline.
 */
export function recordSectionTelemetry(params: RecordSectionTelemetryParams): void {
  const { buildingId, sectionType, stageName, section, outcome = 'completed' } = params;
  const sec = (section || {}) as SectionWithTelemetry;

  recordGenerationMetric({
    buildingId: String(buildingId),
    sectionType,
    stageName,
    latencyMs: sec._latencyMs ?? 0,
    inputTokens: sec._inputTokens ?? 0,
    outputTokens: sec._outputTokens ?? 0,
    outcome,
  }).catch((err: unknown) => {
    console.warn(`[writer-telemetry] Failed to record metric for ${sectionType}:`, err);
  });
}
