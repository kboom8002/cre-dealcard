/**
 * Jobs v2 Execution Engine (WP-P05-03)
 * 
 * Provides:
 * - Deterministic idempotency checking on enqueue
 * - Atomic job claim
 * - Heartbeat tracking
 * - Safe cancellation
 * - Sweeper for crashed/stale workers
 */
import { createServiceClient } from '@/lib/supabase/service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { JobRecord, EnqueueJobParams } from './types';
import { computeIdempotencyHash } from './idempotency';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('jobs-v2');

const ACTIVE_STATUSES = ['queued', 'running', 'processing'];

/**
 * Enqueues a job with deterministic idempotency.
 * If an active job already exists with the same idempotency key, returns the existing job.
 */
export async function enqueueJob(
  params: EnqueueJobParams,
  options?: { client?: SupabaseClient }
): Promise<{ job: JobRecord; isExisting: boolean }> {
  const supabase = options?.client ?? createServiceClient();

  const idempotencyKey =
    params.idempotencyKey ||
    computeIdempotencyHash({
      ownerId: params.ownerId,
      buildingId: params.buildingId,
      input: params.inputPayload,
    });

  // 1. Check if an active job already exists
  const { data: existing, error: checkError } = await supabase
    .from('im_generation_jobs')
    .select('*')
    .eq('building_id', params.buildingId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // If the active job has matching idempotency key, return it without creating duplicate!
    if (existing.idempotency_key === idempotencyKey || !existing.idempotency_key) {
      log.info(`[JobsV2] Idempotent hit: returning existing active job ${existing.id}`);
      return { job: existing as JobRecord, isExisting: true };
    }
  }

  // 2. Insert new job
  const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const deadlineSeconds = params.deadlineSeconds ?? 300;
  const deadlineAt = new Date(Date.now() + deadlineSeconds * 1000).toISOString();

  const newJob: Partial<JobRecord> = {
    id: jobId,
    building_id: params.buildingId,
    owner_id: params.ownerId,
    idempotency_key: idempotencyKey,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    attempt: 0,
    max_attempts: 2,
    cancel_requested: false,
    started_at: undefined,
    deadline_at: deadlineAt,
    input_payload: params.inputPayload,
    created_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await supabase
    .from('im_generation_jobs')
    .insert([newJob])
    .select()
    .single();

  if (insertError) {
    // If partial unique index conflict occurred, fetch the existing conflict row
    if (insertError.code === '23505') {
      const { data: conflictRow } = await supabase
        .from('im_generation_jobs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .in('status', ACTIVE_STATUSES)
        .maybeSingle();
      if (conflictRow) {
        return { job: conflictRow as JobRecord, isExisting: true };
      }
    }
    log.error('[JobsV2] Enqueue insert failed:', insertError);
    throw new Error(`Failed to enqueue job: ${insertError.message}`);
  }

  return { job: inserted as JobRecord, isExisting: false };
}

/**
 * Claims a queued job atomically for a worker.
 */
export async function claimJob(
  jobId: string,
  workerId: string,
  options?: { client?: SupabaseClient }
): Promise<boolean> {
  const supabase = options?.client ?? createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('im_generation_jobs')
    .update({
      status: 'running',
      started_at: now,
      heartbeat_at: now,
      attempt: 1,
    })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select();

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

/**
 * Updates stage, progress, and heartbeat timestamp.
 */
export async function heartbeatJob(
  jobId: string,
  params: { stage?: string; progress?: number },
  options?: { client?: SupabaseClient }
): Promise<boolean> {
  const supabase = options?.client ?? createServiceClient();
  const updates: Record<string, any> = {
    heartbeat_at: new Date().toISOString(),
  };
  if (params.stage !== undefined) updates.stage = params.stage;
  if (params.progress !== undefined) updates.progress = params.progress;

  const { data, error } = await supabase
    .from('im_generation_jobs')
    .update(updates)
    .eq('id', jobId)
    .select('id, cancel_requested');

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

/**
 * Checks if cancellation was requested for a job.
 */
export async function isCancelRequested(
  jobId: string,
  options?: { client?: SupabaseClient }
): Promise<boolean> {
  const supabase = options?.client ?? createServiceClient();
  const { data } = await supabase
    .from('im_generation_jobs')
    .select('cancel_requested, status')
    .eq('id', jobId)
    .maybeSingle();

  if (!data) return false;
  return Boolean(data.cancel_requested) || data.status === 'cancelled';
}

/**
 * Cancels a job. If currently queued, immediately sets to cancelled.
 * If running, flags cancel_requested = true for the worker to cleanly halt.
 */
export async function cancelJob(
  jobId: string,
  actorId?: string,
  options?: { client?: SupabaseClient }
): Promise<{ ok: boolean; status: string }> {
  const supabase = options?.client ?? createServiceClient();

  const { data: job } = await supabase
    .from('im_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) {
    return { ok: false, status: 'not_found' };
  }

  // If already finished
  if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(job.status)) {
    return { ok: true, status: job.status };
  }

  // If queued, cancel immediately
  if (job.status === 'queued') {
    await supabase
      .from('im_generation_jobs')
      .update({
        status: 'cancelled',
        error_class: 'user_cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return { ok: true, status: 'cancelled' };
  }

  // If running or processing, flag cancel_requested
  await supabase
    .from('im_generation_jobs')
    .update({
      cancel_requested: true,
    })
    .eq('id', jobId);

  return { ok: true, status: 'cancel_requested' };
}

/**
 * Sweeper: Identifies stale jobs (no heartbeat > 90s or deadline passed).
 * Marks them timed_out or retries if attempt < max_attempts.
 */
export async function sweepStaleJobs(
  staleSeconds: number = 90,
  options?: { client?: SupabaseClient }
): Promise<{ sweptCount: number; timedOutJobIds: string[] }> {
  const supabase = options?.client ?? createServiceClient();
  const thresholdIso = new Date(Date.now() - staleSeconds * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Find active jobs where heartbeat_at is older than threshold OR deadline_at < now
  const { data: staleJobs, error } = await supabase
    .from('im_generation_jobs')
    .select('id, status, attempt, max_attempts, heartbeat_at, deadline_at')
    .in('status', ['running', 'processing']);

  if (error || !staleJobs || staleJobs.length === 0) {
    return { sweptCount: 0, timedOutJobIds: [] };
  }

  const timedOutJobIds: string[] = [];

  for (const job of staleJobs) {
    const isHeartbeatStale = job.heartbeat_at && job.heartbeat_at < thresholdIso;
    const isDeadlinePassed = job.deadline_at && job.deadline_at < nowIso;

    if (isHeartbeatStale || isDeadlinePassed) {
      timedOutJobIds.push(job.id);
      const canRetry = (job.attempt || 1) < (job.max_attempts || 2);

      if (canRetry) {
        log.warn(`[JobsV2] Sweeping stale job ${job.id}: retrying (attempt ${job.attempt + 1})`);
        await supabase
          .from('im_generation_jobs')
          .update({
            status: 'queued',
            attempt: (job.attempt || 1) + 1,
            heartbeat_at: nowIso,
          })
          .eq('id', job.id);
      } else {
        log.warn(`[JobsV2] Sweeping stale job ${job.id}: marking timed_out`);
        await supabase
          .from('im_generation_jobs')
          .update({
            status: 'timed_out',
            error_class: 'system_error',
            error: 'Job heartbeat timed out or exceeded deadline',
            completed_at: nowIso,
          })
          .eq('id', job.id);
      }
    }
  }

  return { sweptCount: timedOutJobIds.length, timedOutJobIds };
}

/**
 * Unified job status retrieval.
 */
export async function getJobStatus(
  jobId: string,
  options?: { client?: SupabaseClient }
): Promise<JobRecord | null> {
  const supabase = options?.client ?? createServiceClient();
  const { data } = await supabase
    .from('im_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  return (data as JobRecord) || null;
}
