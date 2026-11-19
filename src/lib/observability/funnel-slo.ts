import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('funnel-slo');

export type FunnelName =
  | 'deal_creation'
  | 'share_view_to_gate'
  | 'inbox_governance'
  | 'newsletter_dispatch'
  | 'api_availability';

export const CRITICAL_SLO_CODES = new Set<string>([
  'LOOKUP_FAILED',
  'DB_WRITE_FAILED',
  'QUEUE_STALLED',
  'GOVERNANCE_CHECK_UNAVAILABLE',
  'STORAGE_UPLOAD_FAILED',
]);

export interface FunnelEventInput {
  funnel: FunnelName;
  outcome: 'ok' | 'degraded' | 'failed';
  code?: string;
  latencyMs?: number;
  entityId?: string | null;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const KR_PHONE_RE = /(?:\+?82[-\s]?|0)1[0-9][-\s]?\d{3,4}[-\s]?\d{4}/g;
const TOKEN_RE = /(?:slk\.|Bearer\s+)[A-Za-z0-9._-]+/gi;

export function redactFunnelPii(raw: string): string {
  return String(raw || '')
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(KR_PHONE_RE, '[PHONE]')
    .replace(TOKEN_RE, '[TOKEN]');
}

function sanitizeMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = redactFunnelPii(v).slice(0, 300);
    }
  }
  return out;
}

export async function notifySloAlert(alert: {
  funnel: FunnelName;
  code: string;
  message: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const webhookUrl =
    process.env.ERROR_WEBHOOK_URL?.trim() || process.env.SLACK_WEBHOOK_URL?.trim() || '';
  if (!webhookUrl || typeof fetch !== 'function') {
    return false;
  }

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(2500)
        : undefined;
    const payload = {
      service: 'cre-dealcard',
      type: 'funnel_slo_alert',
      funnel: alert.funnel,
      code: redactFunnelPii(alert.code),
      message: redactFunnelPii(alert.message).slice(0, 400),
      entityId: alert.entityId ? redactFunnelPii(alert.entityId).slice(0, 64) : null,
      meta: sanitizeMeta(alert.meta),
      timestamp: new Date().toISOString(),
    };
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function recordFunnelEvent(input: FunnelEventInput): {
  funnel: FunnelName;
  outcome: 'ok' | 'degraded' | 'failed';
  code: string | null;
  sanitizedMeta: Record<string, string | number | boolean | null>;
} {
  const sanitizedCode = input.code ? redactFunnelPii(input.code).slice(0, 80) : null;
  const sanitizedMeta = sanitizeMeta(input.meta);
  const entityId = input.entityId ? redactFunnelPii(input.entityId).slice(0, 64) : null;
  const latencyMs =
    typeof input.latencyMs === 'number' && Number.isFinite(input.latencyMs) && input.latencyMs >= 0
      ? Math.round(input.latencyMs)
      : undefined;

  try {
    const record = {
      event: 'funnel_slo',
      funnel: input.funnel,
      outcome: input.outcome,
      ...(sanitizedCode ? { code: sanitizedCode } : {}),
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      ...(entityId ? { entityId } : {}),
      meta: sanitizedMeta,
      timestamp: new Date().toISOString(),
    };

    if (input.outcome === 'failed') {
      log.error(record, `[funnel-slo] ${input.funnel}:${sanitizedCode || 'FAILED'}`);
    } else if (input.outcome === 'degraded') {
      log.warn(record, `[funnel-slo] ${input.funnel}:${sanitizedCode || 'DEGRADED'}`);
    } else {
      log.info(record, `[funnel-slo] ${input.funnel}:OK`);
    }

    if (input.outcome === 'failed' && sanitizedCode && CRITICAL_SLO_CODES.has(sanitizedCode)) {
      void notifySloAlert({
        funnel: input.funnel,
        code: sanitizedCode,
        message: `Critical SLO failure in ${input.funnel} (${sanitizedCode})`,
        entityId,
        meta: sanitizedMeta,
      }).catch(() => undefined);
    }
  } catch {
    // Telemetry must never break the request path
  }

  return {
    funnel: input.funnel,
    outcome: input.outcome,
    code: sanitizedCode,
    sanitizedMeta,
  };
}
