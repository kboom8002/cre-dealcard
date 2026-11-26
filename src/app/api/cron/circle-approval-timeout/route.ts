import { NextRequest, NextResponse } from 'next/server';
import { expireStaleApprovals } from '@/domain/team/circle-matching-service';
import { createModuleLogger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  try {
    const expiredCount = await expireStaleApprovals();
    return NextResponse.json({ ok: true, expiredCount });
  } catch (err: unknown) {
    log.error('[circle-approval-timeout] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
