import { NextResponse } from 'next/server';
import { expireHeldSlots } from '@/domain/scheduling/hold-expiry-cron';
import { expireGateRequests } from '@/domain/gate/gate-expiry-cron';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';

// GET /api/cron/hold-expiry - 만료된 Hold 및 열람요청(Gate Request) 자동 회수 Cron
export async function GET(request: Request) {
  const authFailure = verifyCronRequest(request);
  if (authFailure) return authFailure;

  try {
    log.info('[Hold Expiry Cron] Starting slot hold & gate request expiry cleanup job...');

    const supabase = createServiceClient();
    const safeExpireGateRequests = async (): Promise<{
      expiredCount: number;
      success: boolean;
      error?: string;
    }> => {
      try {
        return await expireGateRequests(supabase);
      } catch (e: unknown) {
        return {
          expiredCount: 0,
          success: false,
          error: e instanceof Error ? e.message : 'Gate expiry failed',
        };
      }
    };

    const [result, gateResult] = await Promise.all([
      expireHeldSlots(supabase),
      safeExpireGateRequests(),
    ]);

    if (!result.success) {
      log.error('[Hold Expiry Cron] Process failed:', result.error);
      return NextResponse.json({ error: '실패' }, { status: 500 });
    }

    log.info(
      `[Hold Expiry Cron] Finished. Expired bookings: ${result.expiredCount}, Expired gates: ${gateResult.expiredCount}`,
    );

    return NextResponse.json({
      success: true,
      expired_bookings: result.expiredCount,
      expired_gate_requests: gateResult.expiredCount,
    });
  } catch (err: unknown) {
    log.error('[Hold Expiry Cron] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Cron 실행 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
