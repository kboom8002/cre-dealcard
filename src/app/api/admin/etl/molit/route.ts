import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { z } from 'zod/v4';
import { runMolitETL } from '@/domain/prediction/price-prediction';
import { createModuleLogger } from '@/lib/logger';
import { runAfterResponse } from '@/lib/server/after-safe';

const log = createModuleLogger('route');

export const maxDuration = 300;

const BodySchema = z.object({
  months: z.number().min(1).max(36).default(12),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  const months = parsed.success ? parsed.data.months : 12;

  // Run ETL asynchronously inside serverless lifecycle hook
  runAfterResponse('admin-molit-etl', async () => {
    try {
      const r = await runMolitETL(months);
      log.info({ data: r }, '[MOLIT ETL]');
    } catch (e) {
      log.error({ err: e }, '[MOLIT ETL error]');
    }
  });

  return NextResponse.json({ ok: true, message: `MOLIT ETL 시작 (${months}개월)`, note: '백그라운드 실행 중' });
}
