import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface CronSupabaseLike {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        limit: (count: number) => PromiseLike<{
          data?: Array<{ id?: string }> | null;
          error?: { code?: string; message?: string } | null;
        }>;
      };
    };
    insert: (values: Record<string, unknown>) => PromiseLike<{
      error?: { code?: string; message?: string } | null;
    }>;
  };
}

function sha256Digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function extractCandidateSecret(req: Request | NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  const customHeader = req.headers.get('x-cron-secret');
  if (customHeader && customHeader.trim().length > 0) {
    return customHeader.trim();
  }
  return null;
}

/**
 * Verifies CRON_SECRET on incoming cron requests using SHA-256 + timingSafeEqual
 * so secret length is never leaked via timing side channels.
 *
 * Returns `null` when authorized, or a fail-closed `NextResponse` (`503` when
 * `CRON_SECRET` is missing in production, `401` otherwise).
 */
export function verifyCronRequest(req: Request | NextRequest): NextResponse | null {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? '';
  if (!configuredSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const candidateSecret = extractCandidateSecret(req);
  if (!candidateSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const expectedDigest = sha256Digest(configuredSecret);
  const actualDigest = sha256Digest(candidateSecret);

  if (!timingSafeEqual(expectedDigest, actualDigest)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Acquires a best-effort idempotency slot in `magazine_cron_runs` for `(jobKey, bucketKey)`.
 * Gracefully returns `{ acquired: true }` if `magazine_cron_runs` is unavailable in unit test mocks
 * or pre-migration environments so cron jobs never fail due to missing telemetry tables.
 */
export async function acquireCronIdempotencySlot(
  supabase: unknown,
  jobKey: string,
  bucketKey: string,
): Promise<{ acquired: boolean }> {
  const slotRunId = `cron_slot:${jobKey}:${bucketKey}`;

  try {
    if (!supabase || typeof (supabase as { from?: unknown }).from !== 'function') {
      return { acquired: true };
    }
    const client = supabase as CronSupabaseLike;

    const selectQuery = client
      .from('magazine_cron_runs')
      .select('id')
      .eq('run_id', slotRunId)
      .limit(1);

    const { data: existing, error: selectErr } = await selectQuery;
    if (selectErr) {
      return { acquired: true };
    }
    if (Array.isArray(existing) && existing.length > 0) {
      return { acquired: false };
    }

    const { error: insertErr } = await client.from('magazine_cron_runs').insert({
      run_id: slotRunId,
      kind: jobKey,
      status: 'ok',
      reason: 'IDEMPOTENCY_SLOT',
      duration_ms: 0,
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { acquired: false };
      }
      return { acquired: true };
    }

    return { acquired: true };
  } catch {
    return { acquired: true };
  }
}
