import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { promptCache } from '@/lib/cache/semantic-prompt-cache';
import { createModuleLogger } from '@/lib/logger';
import { getProductionReadinessWarnings, isAiProviderConfigured } from '@/lib/env';
import { runWithRequestContext } from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

const HEALTH_DB_TIMEOUT_MS = 4_000;
const log = createModuleLogger('api-health');

async function probeDatabaseWithTimeout(timeoutMs: number): Promise<'ok' | 'error'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const supabase = createServiceClient();
    const dbQuery = Promise.resolve(
      supabase.from('building_ssot_lite').select('id').limit(1),
    );
    const timeoutGuard = new Promise<{ error: Error }>((resolve) => {
      timer = setTimeout(() => {
        resolve({ error: new Error(`Health DB check timed out after ${timeoutMs}ms`) });
      }, timeoutMs);
    });

    const { error } = await Promise.race([dbQuery, timeoutGuard]);
    if (error) {
      log.error({ err: error }, 'Health DB check failed');
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error({ err }, 'Health DB client failed');
    return 'error';
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function GET(req?: Request) {
  return runWithRequestContext(
    {
      headers: req?.headers ?? null,
      method: 'GET',
      route: '/api/health',
    },
    async (ctx) => {
      const checks: Record<string, 'ok' | 'error'> = {};

      // DB 연결 확인 (4000ms bounded probe)
      checks.database = await probeDatabaseWithTimeout(HEALTH_DB_TIMEOUT_MS);

      // 캐시 상태
      checks.cache = 'ok'; // LRU cache is in-memory, always available
      const cacheMetrics = promptCache.getMetrics();

      const allOk = Object.values(checks).every((v) => v === 'ok');
      const aiConfigured = isAiProviderConfigured();
      const readinessWarningsCount = getProductionReadinessWarnings().length;

      return NextResponse.json(
        {
          status: allOk ? 'healthy' : 'degraded',
          checks,
          cacheMetrics,
          aiConfigured,
          readinessWarningsCount,
          requestId: ctx.requestId,
          timestamp: new Date().toISOString(),
        },
        {
          status: allOk ? 200 : 503,
          headers: {
            'Cache-Control': 'no-store',
            'X-Request-Id': ctx.requestId,
          },
        },
      );
    },
  );
}
