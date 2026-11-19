import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCronRequest } from '@/lib/security/cron-auth';
import { processMagazineDispatchQueueBatch, WORKER_DEFAULT_BATCH_SIZE } from '@/domain/magazine/distribute-queue';
import type { MagazineDbClient } from '@/domain/magazine/types';
import { createModuleLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createModuleLogger('cron-magazine-dispatch-worker');

async function handleWorker(req: NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  // P1-2: 기본 배치는 60s 안에서 페이싱으로 소화 가능한 크기. 명시 batchSize(최대 200)도 워커의
  // 45s 시간 예산을 넘으면 남은 행을 점유하지 않고 다음 tick 으로 넘긴다.
  const url = new URL(req.url);
  const rawBatch = Number(url.searchParams.get('batchSize') || WORKER_DEFAULT_BATCH_SIZE);
  const batchSize = Number.isFinite(rawBatch) ? Math.max(1, Math.min(200, Math.trunc(rawBatch))) : WORKER_DEFAULT_BATCH_SIZE;

  try {
    const supabase = createServiceClient() as unknown as MagazineDbClient;
    const result = await processMagazineDispatchQueueBatch(supabase, { batchSize });
    log.info('magazine dispatch worker tick completed', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('magazine dispatch worker failed', { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleWorker(req);
}

export async function POST(req: NextRequest) {
  return handleWorker(req);
}
