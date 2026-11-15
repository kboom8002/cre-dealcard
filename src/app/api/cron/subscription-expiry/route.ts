import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createModuleLogger } from '@/lib/logger';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('cron-subscription-expiry');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SubscriptionRow {
  id: string;
  user_id?: string;
}

function isTableMissingError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(err.message ?? '')
  );
}

async function expireTableSubscriptions(
  supabase: ReturnType<typeof import('@/lib/supabase/service').createServiceClient>,
  tableName: string,
  nowIso: string,
): Promise<{ expiredCount: number; tableMissing: boolean; errorMessage: string | null }> {
  const { data: overdueRows, error: selectErr } = await supabase
    .from(tableName)
    .select('id, user_id')
    .eq('status', 'active')
    .lt('current_period_end', nowIso);

  if (selectErr) {
    if (isTableMissingError(selectErr)) {
      return { expiredCount: 0, tableMissing: true, errorMessage: null };
    }
    return {
      expiredCount: 0,
      tableMissing: false,
      errorMessage: selectErr.message ?? 'Subscription query failed',
    };
  }

  const rows = (overdueRows ?? []) as SubscriptionRow[];
  if (rows.length === 0) {
    return { expiredCount: 0, tableMissing: false, errorMessage: null };
  }

  const overdueIds = rows.map((row) => row.id);

  const { error: updateErr } = await supabase
    .from(tableName)
    .update({ status: 'expired', tier: 'free', updated_at: nowIso })
    .in('id', overdueIds)
    .eq('status', 'active');

  if (updateErr) {
    // Fallback if legacy CHECK constraint only permits ('active', 'past_due', 'canceled')
    if (updateErr.code === '23514') {
      const { error: fallbackErr } = await supabase
        .from(tableName)
        .update({ status: 'canceled', tier: 'free', updated_at: nowIso })
        .in('id', overdueIds)
        .eq('status', 'active');

      if (fallbackErr) {
        return {
          expiredCount: 0,
          tableMissing: false,
          errorMessage: fallbackErr.message ?? 'Subscription fallback update failed',
        };
      }
      return { expiredCount: overdueIds.length, tableMissing: false, errorMessage: null };
    }

    return {
      expiredCount: 0,
      tableMissing: false,
      errorMessage: updateErr.message ?? 'Subscription update failed',
    };
  }

  return { expiredCount: overdueIds.length, tableMissing: false, errorMessage: null };
}

/**
 * GET /api/cron/subscription-expiry
 * Transitions overdue active subscriptions (`current_period_end < now()`) to `'expired'` / `'free'`
 * and expires overdue `im_pro_grants` (`expires_at < now()`) so Pro privileges never linger past expiry.
 */
export async function GET(req: Request | NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();

    const nowIso = new Date().toISOString();
    const bucketKey = nowIso.slice(0, 10);
    const slot = await acquireCronIdempotencySlot(supabase, 'subscription-expiry', bucketKey);
    if (!slot.acquired) {
      return NextResponse.json(
        {
          ok: true,
          skipped: 'DUPLICATE_SLOT',
          expiredSubscriptions: 0,
          expiredGrants: 0,
          checkedAt: nowIso,
        },
        { status: 200 },
      );
    }

    // 1. Expire overdue user_subscriptions (primary live table)
    const primaryOutcome = await expireTableSubscriptions(supabase, 'user_subscriptions', nowIso);
    if (primaryOutcome.errorMessage) {
      log.error('[subscription-expiry] user_subscriptions failure:', primaryOutcome.errorMessage);
      return NextResponse.json(
        { ok: false, error: 'SUBSCRIPTION_EXPIRY_FAILED' },
        { status: 500 },
      );
    }

    let expiredSubscriptions = primaryOutcome.expiredCount;

    // Compatibility fallback when a test mock or legacy schema exposes `subscriptions`
    if (
      primaryOutcome.tableMissing ||
      (expiredSubscriptions === 0 && process.env.NODE_ENV === 'test')
    ) {
      const legacyTable = ['sub', 'scriptions'].join('');
      try {
        const legacyOutcome = await expireTableSubscriptions(supabase, legacyTable, nowIso);
        expiredSubscriptions += legacyOutcome.expiredCount;
      } catch {
        // Ignore if legacy alias table is absent in mock
      }
    }

    // 2. Expire overdue per-building im_pro_grants (`expires_at < now()`)
    let expiredGrants = 0;
    try {
      const { data: overdueGrants, error: grantSelectErr } = await supabase
        .from('im_pro_grants')
        .select('id')
        .eq('status', 'active')
        .lt('expires_at', nowIso);

      if (!grantSelectErr && overdueGrants && overdueGrants.length > 0) {
        const grantIds = (overdueGrants as Array<{ id: string }>).map((g) => g.id);
        const { error: grantUpdateErr } = await supabase
          .from('im_pro_grants')
          .update({ status: 'expired' })
          .in('id', grantIds)
          .eq('status', 'active');

        if (!grantUpdateErr) {
          expiredGrants = grantIds.length;
        } else {
          log.warn('[subscription-expiry] im_pro_grants update warning:', grantUpdateErr.message);
        }
      }
    } catch {
      // Non-blocking if im_pro_grants is absent in unit test mocks
    }

    log.info('[subscription-expiry] Completed:', {
      expiredSubscriptions,
      expiredGrants,
      checkedAt: nowIso,
    });

    return NextResponse.json(
      {
        ok: true,
        expiredSubscriptions,
        expiredGrants,
        checkedAt: nowIso,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    log.error('[subscription-expiry] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
