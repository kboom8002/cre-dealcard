import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('error-reporter');

export interface ErrorReportContext {
  boundary?: string;
  digest?: string;
  url?: string;
}

function sanitizeDigest(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  return cleaned.length > 0 ? cleaned : null;
}

function extractErrorDetails(
  error: unknown,
  fallbackDigest?: string,
): { name: string; message: string; digest: string | null } {
  try {
    if (error instanceof Error) {
      const errWithDigest = error as Error & { digest?: unknown };
      return {
        name: error.name || 'Error',
        message: error.message || 'Unhandled error',
        digest: sanitizeDigest(errWithDigest.digest) ?? sanitizeDigest(fallbackDigest),
      };
    }
    if (typeof error === 'string') {
      return {
        name: 'Error',
        message: error || 'Unhandled error',
        digest: sanitizeDigest(fallbackDigest),
      };
    }
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : 'Error';
      const message =
        typeof rec.message === 'string' && rec.message.trim()
          ? rec.message.trim()
          : 'Unhandled object error';
      return {
        name,
        message,
        digest: sanitizeDigest(rec.digest) ?? sanitizeDigest(fallbackDigest),
      };
    }
    return {
      name: 'UnknownError',
      message: 'UNKNOWN_ERROR',
      digest: sanitizeDigest(fallbackDigest),
    };
  } catch {
    return {
      name: 'UnknownError',
      message: 'UNREADABLE_ERROR',
      digest: sanitizeDigest(fallbackDigest),
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
  const boundary = context?.boundary?.trim() || 'unhandled';

  try {
    if (typeof window === 'undefined') {
      const safeUrl = context?.url?.slice(0, 512) ?? null;
      const structuredRecord = {
        event: 'system_error',
        refCode,
        boundary,
        digest: details.digest,
        url: safeUrl,
        errorName: details.name,
        errorMessage: details.message.slice(0, 500),
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
              text: `[CRE DealCard] 시스템 오류 감지 (${refCode}) — boundary=${boundary}`,
              refCode,
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
            await supabase.from('activity_events').insert({
              actor_id: null,
              actor_role: 'system',
              event_type: 'system_error',
              entity_type: 'building',
              entity_id: refCode,
              source_app: 'dealcard',
              metadata: {
                ref_code: refCode,
                boundary,
                digest: details.digest,
                url: safeUrl,
                error_name: details.name,
              },
            });
          } catch {
            // Best-effort DB telemetry
          }

          try {
            const anomalyTable = 'ai_anomalies';
            await supabase.from(anomalyTable).insert({
              anomaly_type: 'system_error',
              severity: 'error',
              reference_code: refCode,
              boundary,
              metadata: {
                digest: details.digest,
                url: safeUrl,
                error_name: details.name,
              },
            });
          } catch {
            // Best-effort anomaly log if table exists
          }
        }
      } catch {
        // Service client unavailable in minimal/mocked environments
      }
    } else {
      const currentPath =
        context?.url?.slice(0, 256) ||
        (typeof window.location?.pathname === 'string' ? window.location.pathname : '/');

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

      const telemetryBody = JSON.stringify({
        type: 'activity_event',
        eventType: 'im_viewed',
        entityType: 'building',
        entityId: refCode,
        metadata: {
          client_error_ref: refCode,
          boundary,
          digest: details.digest,
          path: currentPath,
        },
      });

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
