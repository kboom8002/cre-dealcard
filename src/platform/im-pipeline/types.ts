/**
 * Pipeline Runtime Data Model & Invariant Types
 * @see CREDEAL_IM_MODERNIZATION/08_PHASE_2_RESUMABLE_RUNTIME_AND_HARNESS.md
 * @see CREDEAL_IM_MODERNIZATION/03_TARGET_ARCHITECTURE_AND_BOUNDARIES.md
 */

export type DealRunTrigger = 'initial' | 'correction' | 'regeneration';

export type DealRunStatus =
  | 'accepted'
  | 'running'
  | 'waiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'quarantined';

export interface DealRun {
  id: string;
  dealId: string;
  triggerType: DealRunTrigger;
  idempotencyKey: string;
  status: DealRunStatus;
  createdAt: string;
  updatedAt: string;
}

export type ArtifactType = 'dealcard' | 'mobile' | 'pptx';

export type ArtifactRunStatus =
  | 'accepted'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ArtifactRun {
  id: string;
  dealRunId: string;
  artifactType: ArtifactType;
  status: ArtifactRunStatus;
  createdAt: string;
  updatedAt: string;
}

export type StageRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retry_scheduled';

export interface StageRun {
  id: string;
  artifactRunId: string;
  stage: string;
  attempt: number;
  inputHash: string;
  ruleVersion: string;
  codeVersion: string;
  outputHash?: string;
  status: StageRunStatus;
  errorDetail?: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
}

export interface ArtifactEnvelope<T = Record<string, unknown>> {
  id: string;
  stageRunId: string;
  artifactType: ArtifactType | string;
  schemaVersion: string;
  contentHash: string;
  parentHash?: string;
  payload: T;
  createdAt: string;
}
