/**
 * POST /api/broker/jobs/[id]/cancel (WP-P05-03 / S5)
 * 
 * Cancels a background job.
 * If queued, immediately marks as cancelled.
 * If running, flags cancel_requested so the worker cleanly halts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { cancelJob, getJobStatus } from '@/lib/jobs';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('jobs-cancel');

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const jobId = params.id;
  const userId = guard.user?.id;
  const isAdmin = guard.role === 'admin';

  // 1. Try Jobs v2 engine lookup first
  const job = await getJobStatus(jobId);
  if (job) {
    // P0-SEC & [A5-04]: Fail-Closed when owner_id is null or mismatched (admin exempted)
    if (!isAdmin && (!job.owner_id || job.owner_id !== userId)) {
      log.warn(`[JobsCancel] Unauthorized cancel attempt by ${userId} on job ${jobId}`);
      return NextResponse.json({ ok: false, message: 'Job not found' }, { status: 404 });
    }

    const result = await cancelJob(jobId, userId);
    log.info(`[JobsCancel] Job ${jobId} cancellation result: ${result.status}`);
    return NextResponse.json({ ok: true, jobId, status: result.status });
  }

  // 2. Fallback: ai_runs table lookup
  const supabase = createServiceClient();
  const { data: aiRun } = await supabase
    .from('ai_runs')
    .select('id, user_id, status')
    .eq('id', jobId)
    .maybeSingle();

  if (aiRun) {
    if (!isAdmin && (!aiRun.user_id || aiRun.user_id !== userId)) {
      return NextResponse.json({ ok: false, message: 'Job not found' }, { status: 404 });
    }

    await supabase
      .from('ai_runs')
      .update({
        status: 'cancelled',
        error: 'Cancelled by user',
      })
      .eq('id', jobId);

    return NextResponse.json({ ok: true, jobId, status: 'cancelled' });
  }

  return NextResponse.json({ ok: false, message: 'Job not found' }, { status: 404 });
}
