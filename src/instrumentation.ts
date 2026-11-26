import type { Instrumentation } from 'next';
import { createModuleLogger } from '@/lib/logger';
import { reportClientOrServerError } from '@/lib/observability/error-reporter';

const log = createModuleLogger('instrumentation');

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@/lib/observability/request-context');
    const {
      getProductionReadinessWarnings,
      isAiProviderConfigured,
      isRealProductionRuntime,
    } = await import('@/lib/env');

    const warnings = getProductionReadinessWarnings();
    const realProd = isRealProductionRuntime();

    log.info(
      {
        runtime: 'nodejs',
        productionRuntime: realProd,
        aiConfigured: isAiProviderConfigured(),
        readinessWarningsCount: warnings.length,
      },
      'Server instrumentation initialized',
    );

    if (realProd && warnings.length > 0) {
      log.warn(
        { readinessWarningsCount: warnings.length },
        'Production readiness warnings present at startup',
      );
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const digest =
    error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string'
      ? error.digest
      : undefined;

  if (digest && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))) {
    return;
  }

  const boundary = `next-${context?.routeType || 'server'}:${context?.routePath || request?.path || '/'}`;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { getRequestContext, runWithRequestContext } = await import(
        '@/lib/observability/request-context'
      );
      if (!getRequestContext()) {
        const headerAdapter = {
          get(name: string): string | null {
            const lower = name.toLowerCase();
            const raw = request?.headers?.[lower] ?? request?.headers?.[name];
            if (Array.isArray(raw)) return raw[0] ?? null;
            return typeof raw === 'string' ? raw : null;
          },
        };
        await runWithRequestContext(
          {
            headers: headerAdapter,
            method: request?.method,
            route: context?.routePath || request?.path,
          },
          () =>
            reportClientOrServerError(error, {
              boundary,
              digest,
              url: request?.path,
            }),
        );
        return;
      }
    } catch {
      // Fall back to direct error reporting if AsyncLocalStorage setup fails
    }
  }

  await reportClientOrServerError(error, {
    boundary,
    digest,
    url: request?.path,
  });
};
