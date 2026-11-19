/**
 * Wave 3 (WP 3-A ~ WP 3-E) Scale, Async Queue, Stale Recovery & Monthly Stats RPC Suite
 * Backed by real PGlite PostgreSQL + SQL RPC (no mocked Supabase tables).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  authUser: null as { id: string; email: string; role?: string } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, role: h.authUser.role || 'broker', error: null }
      : {
          user: null,
          error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        },
}));

vi.mock('@/lib/external/bok-ecos-api', () => ({
  fetchBokMonthlyLoanRates: vi.fn(async () => []),
}));

vi.mock('@/lib/external/real-transaction-api', () => ({
  fetchMonthlyWholeBuildingTransactions: vi.fn(async () => []),
}));

import { POST as distributePOST } from '@/app/api/broker/magazine/distribute/route';
import { GET as analyticsGET } from '@/app/api/broker/magazine/analytics/route';
import { POST as dispatchWorkerPOST } from '@/app/api/cron/magazine-dispatch-worker/route';
import { GET as monthlyStatsGET } from '@/app/api/broker/magazine/monthly-stats/route';
import { loadActiveSubscribers } from '@/domain/magazine/send-batch';
import { processMagazineDispatchQueueBatch } from '@/domain/magazine/distribute-queue';
import { reclaimStaleQueuedDispatches, sendGate } from '@/domain/magazine/send-gate';
import { buildReferenceChartByType } from '@/domain/magazine/monthly-stats-hydration';
import { recordEmailSuppression } from '@/lib/legal/email-suppression';
import { formatDistributeOutcomeBanner } from '@/app/(broker)/broker/magazine-editor/_components/distribute-result-helper';
import type { MagazineDbClient } from '@/domain/magazine/types';

const BROKER_W3 = 'aaaaaaaa-1111-4111-8111-111111111301';
const EDITION_W3 = 'bbbbbbbb-2222-4222-8222-222222222301';
const DAYTIME_UTC = new Date('2026-11-17T05:00:00Z'); // 14:00 KST (outside quiet hours)

describe('Wave 3 Scale, Async Dispatch Queue & Monthly Stats RPC (Real PGlite SQL)', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  async function execSql<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const res = await harness.execSqlAs({ role: 'service_role' }, sql, params);
    return res.rows as T[];
  }

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_W3,
      email: 'wave3@credeal.test',
      displayName: '김대량',
      company: '테헤란빌딩공인중개사사무소',
      phone: '02-555-3000',
      slug: 'wave3-broker',
      registrationNo: '11680-2026-00333',
      officeAddress: '서울특별시 강남구 테헤란로 300',
    });

    await execSql(
      `INSERT INTO public.magazine_editions (id, broker_id, broker_user_id, edition_type, issue_date, title, status)
       VALUES ($1, 'wave3-broker', $2, 'weekly', '2026-11-17', '대량 발송 검증호', 'published')`,
      [EDITION_W3, BROKER_W3],
    );
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'wave3-unsub-secret-32-chars-minimum-key';
    process.env.CRON_SECRET = 'wave3-cron-secret-32-chars-minimum-key';
    process.env.APP_BASE_URL = 'https://www.credeal.net';
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    process.env.MAGAZINE_SEND_DRY_RUN = 'true';
    delete process.env.MAGAZINE_SEND_ALLOWLIST;
    h.authUser = { id: BROKER_W3, email: 'wave3@credeal.test', role: 'broker' };
  });

  it('WP 3-A & 3-B: paginates 2,500 subscribers past 1,000 cap, drains worker queue with 0 duplicates/drops, and updates analytics totalCount', async () => {
    // Seed 2,500 confirmed active email/both subscribers (free tier -> 2,500 email targets)
    await execSql(
      `INSERT INTO public.magazine_subscribers
         (broker_id, broker_user_id, subscriber_email, subscriber_name, channel, status, confirm_status, marketing_consent_at, segment)
       SELECT
         'wave3-broker',
         $1,
         'sub' || gs || '@wave3.test',
         '구독자' || gs,
         'both',
         'active',
         'confirmed',
         now(),
         'buyer'
       FROM generate_series(1, 2500) AS gs`,
      [BROKER_W3],
    );

    // Suppress subscriber #1 so we also verify worker transitions blocked rows out of pending_worker forever
    await recordEmailSuppression(h.serviceClient as never, {
      brokerId: BROKER_W3,
      email: 'sub1@wave3.test',
      reason: 'unsubscribe',
      source: 'test_seed',
    });

    const loaded = await loadActiveSubscribers(
      h.serviceClient as unknown as MagazineDbClient,
      ['wave3-broker', BROKER_W3],
    );
    expect(loaded).toHaveLength(2500);

    const distReq = new NextRequest('https://www.credeal.net/api/broker/magazine/distribute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        editionId: EDITION_W3,
        editionType: 'weekly',
        title: '대량 발송 테스트 2500',
        date: '2026-11-17',
        target: 'all',
      }),
    });
    const distRes = await distributePOST(distReq);
    expect(distRes.status).toBe(200);
    const distBody = await distRes.json();
    expect(distBody.asyncQueued).toBe(true);
    expect(distBody.subscriberCount).toBe(2500);
    expect(distBody.total).toBe(2500);
    expect(distBody.queued).toBe(2500);

    // Analytics route must read totalCount === 2500
    const analyticsReq = new NextRequest('https://www.credeal.net/api/broker/magazine/analytics');
    const analyticsRes = await analyticsGET(analyticsReq);
    expect(analyticsRes.status).toBe(200);
    const analyticsBody = await analyticsRes.json();
    expect(analyticsBody.lastDistribution?.totalCount).toBe(2500);

    // Invoke HTTP cron worker once under fake daytime timer to verify auth + HTTP route
    let cronRecorded = 0;
    let cronBlocked = 0;
    vi.useFakeTimers();
    vi.setSystemTime(DAYTIME_UTC);
    try {
      const cronReq = new NextRequest(
        'https://www.credeal.net/api/cron/magazine-dispatch-worker?batchSize=200',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        },
      );
      const cronRes = await dispatchWorkerPOST(cronReq);
      expect(cronRes.status).toBe(200);
      const cronJson = await cronRes.json();
      expect(cronJson.ok).toBe(true);
      expect(cronJson.fetched).toBe(200);
      cronRecorded = cronJson.recorded ?? 0;
      cronBlocked = cronJson.blocked ?? 0;
    } finally {
      vi.useRealTimers();
    }

    // Drain remaining 2,300 rows in batches of 200
    let iterations = 0;
    let totalRecorded = 0;
    let totalBlocked = 0;
    while (iterations < 20) {
      iterations += 1;
      const batchRes = await processMagazineDispatchQueueBatch(
        h.serviceClient as unknown as MagazineDbClient,
        { batchSize: 200, now: DAYTIME_UTC },
      );
      totalRecorded += batchRes.recorded;
      totalBlocked += batchRes.blocked;
      if (batchRes.fetched === 0) break;
    }

    expect(iterations).toBe(13); // 12 more non-empty batches (2,300 rows) + 1 final empty batch check
    expect(cronBlocked + totalBlocked).toBeGreaterThanOrEqual(1);

    const statusRows = await execSql<{ status: string; cnt: string }>(
      `SELECT status, count(*)::text AS cnt
       FROM public.magazine_dispatch_logs
       WHERE broker_id = 'wave3-broker'
       GROUP BY status`,
    );
    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.cnt)]));
    expect(byStatus.pending_worker ?? 0).toBe(0);
    expect(byStatus.dry_run).toBe(2499);
    // Suppressed row updated to 'blocked' cleanly + sendGate recordBlocked entry
    expect(byStatus.blocked).toBeGreaterThanOrEqual(1);
    expect(cronRecorded + totalRecorded).toBe(2499);
  }, 60_000);

  it('WP 3-C: reclaims stale queued (>15m) dispatches back to retryable keeping idempotency_key', async () => {
    await execSql(`DELETE FROM public.magazine_dispatch_logs WHERE broker_id = 'wave3-broker'`);
    const staleKey = 'stale-recover-key-20261117';
    const subId = 'cccccccc-3333-4333-8333-333333333301';
    const staleCreatedAt = new Date(DAYTIME_UTC.getTime() - 25 * 60_000).toISOString();

    await execSql(
      `INSERT INTO public.magazine_dispatch_logs
         (idempotency_key, edition_id, broker_id, broker_user_id, subscriber_id, channel, kind, status, created_at, payload)
       VALUES ($1, $2, 'wave3-broker', $3, $4, 'email', 'weekly', 'queued', $5, $6::jsonb)`,
      [
        staleKey,
        EDITION_W3,
        BROKER_W3,
        subId,
        staleCreatedAt,
        JSON.stringify({
          editionKey: 'wave3-broker:2026-11-17:stale-test',
          editionUrl: 'https://www.credeal.net/magazine/wave3-broker/2026-11-17',
          title: '복구 테스트호',
          headline: '고착 복구',
          marketTemp: '보합',
          date: '2026-11-17',
          kakaoTemplateId: 'TPL_DEFAULT',
          sub: {
            id: subId,
            broker_id: 'wave3-broker',
            subscriber_phone: '010-9000-0001',
            subscriber_email: 'stale-recover@wave3.test',
            subscriber_name: '고착복구자',
            channel: 'email',
            status: 'active',
            confirm_status: 'confirmed',
            marketing_consent_at: '2026-11-01T00:00:00Z',
            night_consent: false,
          },
        }),
      ],
    );

    // WP-7.3B P1-1: stale reclaim checks claim time (`updated_at`), NOT enqueue time (`created_at`),
    // so a freshly claimed row whose `created_at` is 25m old must NOT be reclaimed in-flight.
    const freshClaimCheck = await reclaimStaleQueuedDispatches(
      h.serviceClient as unknown as MagazineDbClient,
      { staleMinutes: 15, now: DAYTIME_UTC },
    );
    expect(freshClaimCheck.reclaimed).toBe(0);

    // Once `updated_at` (claim time) exceeds 15m, reclaim flips it back to `retryable`.
    await execSql(
      `UPDATE public.magazine_dispatch_logs SET updated_at = $1 WHERE idempotency_key = $2`,
      [staleCreatedAt, staleKey],
    );

    const { reclaimed } = await reclaimStaleQueuedDispatches(
      h.serviceClient as unknown as MagazineDbClient,
      { staleMinutes: 15, now: DAYTIME_UTC },
    );
    expect(reclaimed).toBe(1);

    const afterReclaim = await execSql<{ status: string; idempotency_key: string }>(
      `SELECT status, idempotency_key FROM public.magazine_dispatch_logs WHERE idempotency_key = $1`,
      [staleKey],
    );
    expect(afterReclaim[0]).toEqual({ status: 'retryable', idempotency_key: staleKey });

    const workerRes = await processMagazineDispatchQueueBatch(
      h.serviceClient as unknown as MagazineDbClient,
      { batchSize: 10, now: DAYTIME_UTC },
    );
    expect(workerRes.recorded).toBe(1);

    const afterWorker = await execSql<{ status: string; idempotency_key: string }>(
      `SELECT status, idempotency_key FROM public.magazine_dispatch_logs WHERE idempotency_key = $1`,
      [staleKey],
    );
    expect(afterWorker[0]).toEqual({ status: 'dry_run', idempotency_key: staleKey });

    // Re-running with same idempotencyKey stays idempotent (DUPLICATE blocked)
    const dupRes = await sendGate(
      {
        subscriber: {
          id: subId,
          subscriber_phone: '010-9000-0001',
          subscriber_email: 'stale-recover@wave3.test',
          subscriber_name: '고착복구자',
          channel: 'email',
          status: 'active',
          confirm_status: 'confirmed',
          marketing_consent_at: '2026-11-01T00:00:00Z',
        },
        channel: 'email',
        editionId: EDITION_W3,
        editionKey: 'wave3-broker:2026-11-17:stale-test',
        idempotencyKey: staleKey,
        brokerId: 'wave3-broker',
        brokerUserId: BROKER_W3,
        kind: 'weekly',
        rendered: {
          subject: '(광고) 테스트',
          body: '<p>(광고)</p>',
          text: '(광고)',
          hasAdLabel: true,
          hasUnsubscribeLink: true,
          senderName: '테헤란빌딩공인중개사사무소',
          senderContact: '02-555-3000',
        },
      },
      { supabase: h.serviceClient as unknown as MagazineDbClient, now: DAYTIME_UTC, dryRun: true },
    );
    expect(dupRes).toEqual({ ok: false, blocked: 'DUPLICATE' });
  });

  it('WP 3-E: get_monthly_regional_tx_stats isolates region across 10k noise rows, suppresses <3 medians, marks empty months, supports land_area & honest fallback types', async () => {
    // 1. Seed 10,000 non-GBD rows (마포구)
    await execSql(
      `INSERT INTO public.external_transactions
         (address, district, dong, transaction_price, building_area, land_area, usage_type, transaction_date)
       SELECT
         '서울특별시 마포구 양화로 ' || gs,
         '마포구',
         '서교동',
         9000000000,
         330.58,
         200.0,
         '일반',
         date '2026-11-05'
       FROM generate_series(1, 10000) AS gs`,
    );

    // 2. Seed excluded GBD noise ('집합' and cancelled cdeal_type='O')
    await execSql(
      `INSERT INTO public.external_transactions
         (address, district, dong, transaction_price, building_area, usage_type, transaction_date, raw_data)
       VALUES
         ('서울특별시 강남구 테헤란로 10', '강남구', '역삼동', 50000000000, 330.58, '집합', '2026-10-10', '{}'::jsonb),
         ('서울특별시 강남구 테헤란로 11', '강남구', '역삼동', 80000000000, 330.58, '일반', '2026-07-10', '{"cdeal_type":"O"}'::jsonb)`,
    );

    // 3. Seed GBD whole-building target transactions across 2026-06..2026-11:
    //    2026-06 -> 0건 ("표본 없음")
    //    2026-07 -> 2건 (<3 -> median suppressed / "표본 부족")
    //    2026-08..2026-11 -> 3건 each (100평 @ 100억/110억/150억 -> median 11,000만)
    await execSql(
      `INSERT INTO public.external_transactions
         (address, district, dong, transaction_price, building_area, usage_type, transaction_date, raw_data)
       VALUES
         ('서울 강남구 역삼동 701', '강남구', '역삼동', 10000000000, 330.58, '일반', '2026-07-05', '{}'::jsonb),
         ('서울 강남구 논현동 702', '강남구', '논현동', 12000000000, 330.58, '일반', '2026-07-15', '{}'::jsonb),
         ('서울 강남구 역삼동 801', '강남구', '역삼동', 10000000000, 330.58, '일반', '2026-08-05', '{}'::jsonb),
         ('서울 강남구 논현동 802', '강남구', '논현동', 11000000000, 330.58, '일반', '2026-08-15', '{}'::jsonb),
         ('서울 서초구 서초동 803', '서초구', '서초동', 15000000000, 330.58, '일반', '2026-08-25', '{}'::jsonb),
         ('서울 강남구 청담동 111', '강남구', '청담동', 10000000000, 330.58, '일반', '2026-11-02', '{}'::jsonb),
         ('서울 서초구 반포동 112', '서초구', '반포동', 11000000000, 330.58, '일반', '2026-11-10', '{}'::jsonb),
         ('서울 강남구 신사동 113', '강남구', '신사동', 20000000000, 330.58, '일반', '2026-11-16', '{}'::jsonb)`,
    );

    const req = new NextRequest(
      'https://www.credeal.net/api/broker/magazine/monthly-stats?region=gbd&ym=2026-11',
    );
    const res = await monthlyStatsGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.liveDbAvailable).toBe(true);

    const txChart = body.charts[0];
    expect(txChart.chartType).toBe('molit_tx_price_trend');
    expect(txChart.sourceMode).toBe('public_db');
    expect(txChart.series).toHaveLength(6);

    const m6 = txChart.series.find((s: { label: string }) => s.label === '6월');
    const m7 = txChart.series.find((s: { label: string }) => s.label === '7월');
    const m11 = txChart.series.find((s: { label: string }) => s.label === '11월');
    expect(m6).toMatchObject({ label: '6월', primaryValue: 0, displayPrimary: '표본 없음' });
    expect(m6.secondaryValue).toBeUndefined();

    expect(m7).toMatchObject({
      label: '7월',
      primaryValue: 2,
      displayPrimary: '2건',
      displaySecondary: '표본 부족',
    });
    expect(m7.secondaryValue).toBeUndefined();

    expect(m11).toMatchObject({
      label: '11월',
      primaryValue: 3,
      secondaryValue: 11000,
      displayPrimary: '3건',
      displaySecondary: '11,000만',
    });

    // 4. land_area-only fallback for seongsu ('성동구')
    await execSql(
      `INSERT INTO public.external_transactions
         (address, district, dong, transaction_price, building_area, land_area, usage_type, transaction_date)
       VALUES
         ('서울 성동구 성수동 1', '성동구', '성수동1가', 7000000000, NULL, 330.58, '일반', '2026-11-03'),
         ('서울 성동구 성수동 2', '성동구', '성수동2가', 8000000000, 0, 330.58, '일반', '2026-11-09'),
         ('서울 광진구 자양동 3', '광진구', '자양동', 12000000000, NULL, 330.58, '일반', '2026-11-14')`,
    );

    const landReq = new NextRequest(
      'https://www.credeal.net/api/broker/magazine/monthly-stats?region=seongsu&ym=2026-11',
    );
    const landRes = await monthlyStatsGET(landReq);
    const landBody = await landRes.json();
    expect(landBody.charts[0].title).toContain('대지 평당가');
    const seongsu11 = landBody.charts[0].series.find((s: { label: string }) => s.label === '11월');
    expect(seongsu11.secondaryValue).toBe(8000);

    // 5. Honest reference fallback never spoofs 'molit_tx_price_trend' and labels BOK fallback as '참고치'
    const refFinancing = buildReferenceChartByType('gbd', 'molit_tx_price_trend');
    expect(refFinancing.chartType).toBe('reference_cost_financing');
    const refBok = buildReferenceChartByType('gbd', 'bok_loan_rate_cap_spread');
    expect(refBok.title).toContain('참고치');
    expect(refBok.series[0].displaySecondary).toContain('참고치');
  }, 60_000);

  it('WP 3-D: formatDistributeOutcomeBanner classifies 422 object error, asyncQueued, dryRun & blocked', () => {
    const err422 = formatDistributeOutcomeBanner(
      {
        ok: false,
        error: { code: 'STATUTORY_DISCLOSURE_INCOMPLETE', message: '중개사무소 개설등록번호를 입력해 주세요.' },
        missingLabels: ['개설등록번호'],
      },
      422,
    );
    expect(err422.tone).toBe('error');
    expect(err422.message).toBe('중개사무소 개설등록번호를 입력해 주세요.');

    const queued = formatDistributeOutcomeBanner(
      { asyncQueued: true, queued: 2500, dryRun: true, sent: 0, recorded: 0, failed: 0, blocked: {} },
      200,
    );
    expect(queued.tone).toBe('success');
    expect(queued.queued).toBe(2500);
    expect(queued.message).toContain('2,500');

    const blockedQuiet = formatDistributeOutcomeBanner(
      { sent: 0, recorded: 0, failed: 0, blocked: { QUIET_HOURS: 15 }, result: { blocked: { QUIET_HOURS: 15 } } },
      200,
    );
    expect(blockedQuiet.tone).toBe('warning');
    expect(blockedQuiet.blockedTotal).toBe(15);
    expect(blockedQuiet.blockedReasons[0].code).toBe('QUIET_HOURS');
  });
});
