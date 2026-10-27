/**
 * Jobs v2 Types (WP-P05-03 / §5.3)
 */

export type JobStatus =
  | 'queued'
  | 'running'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type JobStage =
  | 'queued'
  | 'building_facts'
  | 'rentroll_analysis'
  | 'drafting_sections'
  | 'quality_gates'
  | 'rendering'
  | 'completed';

export type JobErrorClass =
  | 'intended_block'
  | 'input_missing'
  | 'system_error'
  | 'user_cancelled';

export interface JobRecord {
  id: string;
  building_id?: string;
  owner_id?: string;
  idempotency_key?: string;
  status: JobStatus;
  stage: string;
  progress: number; // 0..100
  attempt: number;
  max_attempts: number;
  cancel_requested: boolean;
  heartbeat_at?: string;
  started_at?: string;
  deadline_at?: string;
  completed_at?: string;
  error?: string | null;
  error_class?: JobErrorClass | null;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  cost_usd?: number;
  llm_calls?: number;
  tokens?: number;
  created_at: string;
  updated_at?: string;
}

export interface EnqueueJobParams {
  buildingId: string;
  ownerId?: string;
  inputPayload: Record<string, unknown>;
  idempotencyKey?: string;
  deadlineSeconds?: number;
}
