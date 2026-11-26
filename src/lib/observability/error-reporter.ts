import * as loggerModule from '@/lib/logger';
import { createModuleLogger, redactPiiDeep, redactStringPii } from '@/lib/logger';

function safeGetRequestId(): string | null {
  try {
    if (
      'getRegisteredRequestContext' in loggerModule &&
      typeof loggerModule.getRegisteredRequestContext === 'function'
    ) {
      return loggerModule.getRegisteredRequestContext()?.requestId ?? null;
    }
  } catch {
    // Ignore partial Vitest module mocks of @/lib/logger
  }
  return null;
}

const log = createModuleLogger('error-reporter');

export interface ErrorReportContext {
  boundary?: string;
  digest?: string;
  url?: string;
}

function sanitizeUrlForTelemetry(rawUrl?: string | null): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    const pathnameOnly = trimmed.split(/[?#]/)[0] || '/';
    return redactStringPii(pathnameOnly).slice(0, 512);
  }

  try {
    const parsed = new URL(trimmed);
    return redactStringPii(`${parsed.origin}${parsed.pathname}`).slice(0, 512);
  } catch {
    const stripped = trimmed.split(/[?#]/)[0] || '';
    return stripped ? redactStringPii(stripped).slice(0, 512) : null;
  }
}

function sanitizeDigest(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  return cleaned.length > 0 ? cleaned : null;
}

function extractErrorDetails(
  error: unknown,
  fallbackDigest?: string,
): { name: string; message: string; digest: string | null; stack: string | null } {
  try {
    if (error instanceof Error) {
      const errWithDigest = error as Error & { digest?: unknown };
      const stack =
        error instanceof Error && typeof error.stack === 'string'
          ? redactStringPii(error.stack).slice(0, 4000)
          : null;
      return {
        name: redactStringPii(error.name || 'Error'),
        message: redactStringPii(error.message || 'Unhandled error'),
        digest: sanitizeDigest(errWithDigest.digest) ?? sanitizeDigest(fallbackDigest),
        stack,
      };
    }
    if (typeof error === 'string') {
      return {
        name: 'Error',
        message: redactStringPii(error || 'Unhandled error'),
        digest: sanitizeDigest(fallbackDigest),
        stack: null,
      };
    }
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      const name =
        typeof rec.name === 'string' && rec.name.trim()
          ? redactStringPii(rec.name.trim())
          : 'Error';
      const message =
        typeof rec.message === 'string' && rec.message.trim()
          ? redactStringPii(rec.message.trim())
          : 'Unhandled object error';
      return {
        name,
        message,
        digest: sanitizeDigest(rec.digest) ?? sanitizeDigest(fallbackDigest),
        stack: null,
      };
    }
    return {
      name: 'UnknownError',
      message: 'UNKNOWN_ERROR',
      digest: sanitizeDigest(fallbackDigest),
      stack: null,
    };
  } catch {
    return {
      name: 'UnknownError',
      message: 'UNREADABLE_ERROR',
      digest: sanitizeDigest(fallbackDigest),
      stack: null,
    };
  }
}

function fnv1aHashHex4(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  const folded = ((unsigned >>> 16) ^ (unsigned & 0xffff)) & 0xffff;
  return folded.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates a deterministic, support-friendly `ERR-XXXX` reference code
 * (appending `-<digest>` when Next.js provides an error digest).
 */
export function generateErrorReferenceCode(error?: unknown): string {
  try {
    const details = extractErrorDetails(error);
    const seed = `${details.name}:${details.message}`;
    const shortCode = fnv1aHashHex4(seed);
    if (details.digest) {
      return `ERR-${shortCode}-${details.digest}`;
    }
    return `ERR-${shortCode}`;
  } catch {
    return 'ERR-0000';
  }
}

/**
 * P1-1 (WP-7.3A): `activity_events` schema contract for system error telemetry.
 *  - `entity_id` is `uuid` (nullable) — 00001_mvp_schema.sql. The `ERR-XXXX` reference
 *    code is NOT a uuid, so it lives in `metadata.ref_code` and `entity_id` is null.
 *  - `source_app` CHECK (00005) only allows null or 'js-building-ssot-mvp' /
 *    'js-full-im-studio' / 'js-space-ai-page'. We omit it (→ NULL) so the row is valid
 *    even on databases where the column/constraint differs.
 *  - The previous `ai_anomalies` insert was removed: no migration creates that table,
 *    so every report produced a guaranteed PostgREST 404 (PGRST205).
 */
export interface SystemErrorActivityRow {
  actor_id: null;
  actor_role: 'system';
  event_type: 'system_error';
  entity_type: 'system';
  entity_id: null;
  metadata: {
    ref_code: string;
    boundary: string;
    digest: string | null;
    url: string | null;
    error_name: string;
  };
}

export function buildSystemErrorActivityRow(input: {
  refCode: string;
  boundary: string;
  digest: string | null;
  url: string | null;
  errorName: string;
}): SystemErrorActivityRow {
  return {
    actor_id: null,
    actor_role: 'system',
    event_type: 'system_error',
    entity_type: 'system',
    entity_id: null,
    metadata: {
      ref_code: input.refCode,
      boundary: input.boundary,
      digest: input.digest,
      url: input.url,
      error_name: input.errorName,
    },
  };
}

export interface SystemErrorLogRow {
  ref_code: string;
  request_id: string | null;
  boundary: string;
  digest: string | null;
  url: string | null;
  error_name: string;
  error_message: string | null;
  error_stack: string | null;
  metadata: Record<string, unknown>;
}

export function buildSystemErrorLogRow(input: {
  refCode: string;
  requestId?: string | null;
  boundary: string;
  digest: string | null;
  url: string | null;
  errorName: string;
  errorMessage?: string | null;
  errorStack?: string | null;
  metadata?: Record<string, unknown>;
}): SystemErrorLogRow {
  return {
    ref_code: input.refCode,
    request_id: input.requestId ? redactStringPii(input.requestId).slice(0, 128) : null,
    boundary: redactStringPii(input.boundary),
    digest: input.digest,
    url: input.url,
    error_name: redactStringPii(input.errorName),
    error_message: input.errorMessage ? redactStringPii(input.errorMessage).slice(0, 500) : null,
    error_stack: input.errorStack ? redactStringPii(input.errorStack).slice(0, 4000) : null,
    metadata: (redactPiiDeep(input.metadata ?? {}) as Record<string, unknown>) ?? {},
  };
}

/**
 * Browser → `/api/public/events` payload. `entityId` is intentionally omitted (the
 * reference code is not a uuid); the route stores the code in metadata.
 */
export function buildClientErrorTelemetryPayload(input: {
  refCode: string;
  boundary: string;
  digest: string | null;
  path: string;
}): {
  type: 'activity_event';
  eventType: 'client_error_reported';
  entityType: 'system';
  metadata: Record<string, unknown>;
} {
  return {
    type: 'activity_event',
    eventType: 'client_error_reported',
    entityType: 'system',
    metadata: {
      client_error_ref: input.refCode,
      boundary: input.boundary,
      digest: input.digest,
      path: input.path,
    },
  };
}

interface LooseSupabaseTable {
  insert: (payload: Record<string, unknown>) => PromiseLike<unknown>;
}

interface LooseSupabaseClient {
  from: (table: string) => LooseSupabaseTable;
}

/**
 * Reports client or server errors safely without ever throwing or leaking
 * stack traces / internal messages to UI surfaces.
 */
export async function reportClientOrServerError(
  error: unknown,
  context?: ErrorReportContext,
): Promise<string> {
  const details = extractErrorDetails(error, context?.digest);
  const refInput =
    details.digest && !(error && typeof error === 'object' && 'digest' in error)
      ? { name: details.name, message: details.message, digest: details.digest }
      : error;
  const refCode = generateErrorReferenceCode(refInput);
  const boundary = redactStringPii(context?.boundary?.trim() || 'unhandled');
  const safeUrl = sanitizeUrlForTelemetry(context?.url);

  try {
    if (typeof window === 'undefined') {
      const requestId = safeGetRequestId();
      const sanitizedMessage = redactStringPii(details.message).slice(0, 500);
      const structuredRecord = {
        event: 'system_error',
        refCode,
        requestId,
        boundary,
        digest: details.digest,
        url: safeUrl,
        errorName: details.name,
        errorMessage: sanitizedMessage,
        errorStack: details.stack,
        timestamp: new Date().toISOString(),
      };

      try {
        log.error(structuredRecord, `[error-reporter] ${refCode}`);
      } catch {
        // Ignore logger transport issues
      }
      try {
        console.error(JSON.stringify(structuredRecord));
      } catch {
        // Ignore console failures
      }

      const webhookUrl =
        process.env.ERROR_WEBHOOK_URL?.trim() || process.env.SLACK_WEBHOOK_URL?.trim() || '';
      if (webhookUrl && typeof fetch === 'function') {
        try {
          const timeoutSignal =
            typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.timeout(2500)
              : undefined;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: redactStringPii(
                `[CRE DealCard] 시스템 오류 감지 (${refCode}) — boundary=${boundary}`,
              ),
              refCode,
              requestId,
              boundary,
              digest: details.digest,
              url: safeUrl,
            }),
            signal: timeoutSignal,
          });
        } catch {
          // Non-blocking webhook alert
        }
      }

      try {
        const { createServiceClient } = await import('@/lib/supabase/service');
        const supabase = createServiceClient() as unknown as LooseSupabaseClient | null;
        if (supabase && typeof supabase.from === 'function') {
          try {
            const logRow = buildSystemErrorLogRow({
              refCode,
              requestId,
              boundary,
              digest: details.digest,
              url: safeUrl,
              errorName: details.name,
              errorMessage: sanitizedMessage,
              errorStack: details.stack,
            });
            const result = (await supabase
              .from('system_error_logs')
              .insert(logRow as unknown as Record<string, unknown>)) as
              | { error?: { code?: string; message?: string } | null }
              | null
              | undefined;

            const errorCode = result?.error?.code;
            if (errorCode === 'PGRST205' || errorCode === '42P01') {
              const fallbackRow = buildSystemErrorActivityRow({
                refCode,
                boundary,
                digest: details.digest,
                url: safeUrl,
                errorName: details.name,
              });
              const fallbackResult = (await supabase
                .from('activity_events')
                .insert(fallbackRow as unknown as Record<string, unknown>)) as
                | { error?: { code?: string; message?: string } | null }
                | null
                | undefined;
              if (fallbackResult && fallbackResult.error) {
                try {
                  log.warn(
                    { refCode, code: fallbackResult.error.code ?? null },
                    '[error-reporter] activity_events fallback insert rejected',
                  );
                } catch {
                  // Ignore logger transport issues
                }
              }
            } else if (result && result.error) {
              try {
                log.warn(
                  { refCode, code: result.error.code ?? null },
                  '[error-reporter] system_error_logs insert rejected',
                );
              } catch {
                // Ignore logger transport issues
              }
            }
          } catch {
            // Best-effort DB telemetry
          }
        }
      } catch {
        // Service client unavailable in minimal/mocked environments
      }
    } else {
      const currentPath =
        safeUrl ??
        sanitizeUrlForTelemetry(
          typeof window.location?.pathname === 'string' ? window.location.pathname : '/',
        ) ??
        '/';

      try {
        console.error('[error-reporter]', {
          refCode,
          boundary,
          digest: details.digest,
          path: currentPath,
        });
      } catch {
        // Ignore console errors
      }

      const telemetryBody = JSON.stringify(
        buildClientErrorTelemetryPayload({
          refCode,
          boundary,
          digest: details.digest,
          path: currentPath,
        }),
      );

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([telemetryBody], { type: 'application/json' });
          navigator.sendBeacon('/api/public/events', blob);
        } else if (typeof fetch === 'function') {
          const timeoutSignal =
            typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.timeout(2500)
              : undefined;
          void fetch('/api/public/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: telemetryBody,
            keepalive: true,
            signal: timeoutSignal,
          }).catch(() => undefined);
        }
      } catch {
        // Non-blocking browser telemetry
      }
    }
  } catch {
    // Guarantee never-throw contract
  }

  return refCode;
}
