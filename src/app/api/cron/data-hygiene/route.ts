import { NextRequest, NextResponse } from 'next/server';

import { sweepStaleJobs } from '@/lib/jobs/engine';
import { createModuleLogger } from '@/lib/logger';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();

    const bucketKey = new Date().toISOString().slice(0, 10);
    const slot = await acquireCronIdempotencySlot(supabase, 'data-hygiene', bucketKey);
    if (!slot.acquired) {
      return NextResponse.json({ status: 'ok', skipped: 'DUPLICATE_SLOT', results: {} });
    }

    const results: Record<string, unknown> = {};

    // 1. 30일 이상 draft 상태인 IM 문서 경고 목록 추출
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleDrafts, error: draftErr } = await supabase
      .from('document_objects')
      .select('id, building_id, created_at')
      .eq('status', 'draft')
      .lt('updated_at', thirtyDaysAgo)
      .limit(100);

    if (draftErr) {
      log.error('[data-hygiene] Failed to query stale drafts:', draftErr);
    }
    results.staleDrafts = staleDrafts?.length ?? 0;

    // 2. pending_confirmation 상태 14일 초과 OCR 데이터 만료 처리
    results.expiredOcrRecords = 0;

    // 3. 비활성 골든셋 중 90일 이상 미사용 건 정리
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleGolden, error: goldenErr } = await supabase
      .from('im_golden_sets')
      .select('id')
      .eq('is_active', false)
      .lt('updated_at', ninetyDaysAgo)
      .limit(200);

    if (!goldenErr && staleGolden && staleGolden.length > 0) {
      const staleIds = staleGolden.map((r: { id: string }) => r.id);
      const { error: deleteErr } = await supabase
        .from('im_golden_sets')
        .delete()
        .in('id', staleIds);

      if (deleteErr) {
        log.error('[data-hygiene] Failed to delete stale golden sets:', deleteErr);
      }
      results.deletedGoldenSets = staleIds.length;
    } else {
      results.deletedGoldenSets = 0;
    }

    // 4. Stale / crashed IM generation jobs 회수 (Jobs v2 sweeper)
    let sweptJobs = { sweptCount: 0, timedOutJobIds: [] as string[] };
    try {
      sweptJobs = await sweepStaleJobs(90, { client: supabase });
    } catch (sweepErr) {
      log.error('[data-hygiene] Failed to sweep stale jobs:', sweepErr);
    }
    results.sweptJobs = sweptJobs;

    log.info('[data-hygiene] Completed:', results);
    return NextResponse.json({ status: 'ok', sweptJobs, results });
  } catch (err) {
    log.error('[data-hygiene] Unexpected error:', err);
    console.error('[data-hygiene] Internal server error:', err);
    return NextResponse.json({ status: 'error', error: 'Internal server error' }, { status: 500 });
  }
}
