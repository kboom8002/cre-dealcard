/**
 * 7-State Gate Evaluation Model & Severity Framework
 * @see CREDEAL_IM_MODERNIZATION/07_PHASE_1_SAFETY_CONTAINMENT.md
 * @see CREDEAL_IM_MODERNIZATION/15_CROSS_CUTTING_GATE_APPROVAL_TEST.md
 */

export type GateResultStatus =
  | 'PASS'
  | 'FAIL'
  | 'WARN'
  | 'NOT_APPLICABLE'
  | 'NOT_RUN'
  | 'INDETERMINATE'
  | 'SYSTEM_ERROR';

export type GateSeverity = 'BLOCKER' | 'ERROR' | 'WARNING' | 'INFO';

export interface GateResultV2 {
  gateId: string;
  version: string;
  status: GateResultStatus;
  severity: GateSeverity;
  observed: unknown;
  expected: unknown;
  reason: string;
  applicabilityReason?: string;
  observerVersion: string;
  targetArtifactHash?: string;
  executedAt: string;
  durationMs: number;
}

/**
 * Checks if a gate result blocks external publication.
 * Absolute Invariant #6: In blocker or error level checks, NOT_RUN, INDETERMINATE,
 * and SYSTEM_ERROR are treated as BLOCKING, never converted to pass.
 */
export function isGateBlockingPublish(result: GateResultV2): boolean {
  if (result.severity !== 'BLOCKER' && result.severity !== 'ERROR') {
    return false;
  }
  return (
    result.status === 'FAIL' ||
    result.status === 'NOT_RUN' ||
    result.status === 'INDETERMINATE' ||
    result.status === 'SYSTEM_ERROR'
  );
}
