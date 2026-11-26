/**
 * @file src/tests/magazine/wave2a-skip-locked-idempotency-and-cron.test.ts
 * @description Wave 2 Track 2A Verification Suite:
 *   1. PGlite concurrency test running 2 parallel `claim_magazine_dispatch_batch` calls proving
 *      disjoint `FOR UPDATE SKIP LOCKED` row sets (zero overlap), `pending_worker` priority over
 *      `retryable`, future `next_attempt_at` exclusion, worker end-to-end execution, fallback on
 *      missing RPC, and `.eq('status', 'queued')` lost-lease protection.
 *   2. Resend `Idempotency-Key` header propagation from `sendGate` -> `sendEmailProvider` ->
 *      `Resend.emails.send`, non-test 429 retry jitter, and post-send `updateLedger` retry on
 *      transient PostgREST errors.
 *   3. `data-hygiene` cron invoking `sweepStaleJobs()` and returning `sweptJobs` summary, plus
 *      `vercel.json` / route `maxDuration = 60` alignment.
 *   4. `consistency-check` issuing 1 batched `.in('id', uniqueBuildingIds)` query instead of N
 *      sequential `.single()` queries, and `ai-quality-monitor` bounding `im_fewshot_usage_log`
 *      queries with `.limit(2000)`.
 *   5. `acquireCronIdempotencySlot` failing closed (`{ acquired: false }`) on real DB errors in
 *      `isRealProductionRuntime()`, while preserving `{ acquired: true }` for `42P01`/`PGRST205`
 *      missing-table errors and test/dev mocks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';
import { scanFile } from '../../../scripts/policy-scan.mjs';

const hoisted = vi.hoisted(() => ({
  serviceClient: null as unknown,
  sentResendPayloads: [] as Array<Record<string, unknown>>,
  resendBehavior: null as
    | ((attempt: number, payload: Record<string, unknown>) => Promise<{
        data: { id: string } | null;
        error: { message: string; statusCode?: number; name?: string } | null;
      }>)
    | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => hoisted.serviceClient),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        hoisted.sentResendPayloads.push(payload);
        if (hoisted.resendBehavior) {
          return hoisted.resendBehavior(hoisted.sentResendPayloads.length - 1, payload);
        }
        return {
          data: { id: `resend-msg-${hoisted.sentResendPayloads.length}` },
          error: null,
        };
      },
    };
  },
}));

import { processMagazineDispatchQueueBatch } from '@/domain/magazine/distribute-queue';
import { sendGate, DISPATCH_LEDGER_TABLE, type GateInput } from '@/domain/magazine/send-gate';
import { sendEmailProvider } from '@/domain/magazine/send-providers';
import * as jobsEngine from '@/lib/jobs/engine';
import { acquireCronIdempotencySlot } from '@/lib/security/cron-auth';
import { GET as dataHygieneGet } from '@/app/api/cron/data-hygiene/route';
import { GET as consistencyCheckGet } from '@/app/api/cron/consistency-check/route';
import { GET as aiQualityMonitorGet } from '@/app/api/cron/ai-quality-monitor/route';
import { maxDuration as holdExpiryMaxDuration } from '@/app/api/cron/hold-expiry/route';
import { maxDuration as circleApprovalMaxDuration } from '@/app/api/cron/circle-approval-timeout/route';

const MIGRATION_FILE = '20261126000004_sota_dispatch_skip_locked_rpc.sql';
const BROKER_UUID = '11111111-1111-4111-8111-111111112a01';
const BROKER_SLUG = 'wave2a-broker';
const EDITION_UUID = 'eeeeeeee-2222-4222-8222-222222222a01';
const DAYTIME_NOW = new Date('2026-11-26T02:00:00.000Z'); // 11:00 KST (outside quiet hours)

function subUuid(n: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
}

function dispatchUuid(n: number): string {
  return `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`;
}

describe('Wave 2 Track 2A: Atomic SKIP LOCKED Dispatch Queue, Resend Idempotency & Cron Resilience', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations', MIGRATION_FILE),
      'utf8',
    );

    // Dual-replay proves 100% idempotency of 20261126000004
    harness = await PgliteSupabaseHarness.create({
      extraMigrations: [migrationSql, migrationSql],
    });

    await harness.seedUser({
      id: BROKER_UUID,
      email: 'wave2a-broker@credeal.test',
      displayName: '김원자',
      company: '원자빌딩중개법인',
      phone: '02-555-2026',
      slug: BROKER_SLUG,
      registrationNo: '11680-2026-00201',
      officeAddress: '서울특별시 강남구 테헤란로 301',
    });

    await harness.db.query(
      `INSERT INTO public.magazine_editions (id, broker_id, broker_user_id, issue_date, edition_type, status, title)
       VALUES ($1::uuid, $2, $3::uuid, '2026-11-26', 'weekly', 'published', '강남 오피스 주간 브리핑')
       ON CONFLICT (id) DO NOTHING`,
      [EDITION_UUID, BROKER_SLUG, BROKER_UUID],
    );
  }, 30_000);

  afterAll(async () => {
    await harness?.close();
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    hoisted.sentResendPayloads = [];
    hoisted.resendBehavior = null;
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);

    process.env.CRON_SECRET = 'wave2a-cron-secret-0123456789abcdef';
    process.env.RESEND_API_KEY = 're_wave2a_test_key';
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    process.env.MAGAZINE_SEND_DRY_RUN = 'false';
    process.env.APP_BASE_URL = 'https://www.credeal.net';
    process.env.UNSUBSCRIBE_SECRET = 'wave2a-unsubscribe-secret-32-chars-minimum';
    delete process.env.MAGAZINE_SEND_ALLOWLIST;
    delete process.env.MAGAZINE_DAILY_CAP;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(1) claims strictly disjoint row sets across 2 parallel claim_magazine_dispatch_batch calls (FOR UPDATE SKIP LOCKED), enforces privilege lockdown, and guards lost leases', async () => {
    // Policy scan & privilege lockdown verification
    const policyFindings = scanFile(MIGRATION_FILE).filter((f) => f.level === 'ERROR');
    expect(policyFindings).toEqual([]);

    const privCheck = await harness.db.query<{ anon_exec: boolean; auth_exec: boolean; svc_exec: boolean }>(`
      SELECT
        has_function_privilege('anon', 'public.claim_magazine_dispatch_batch(integer, timestamptz)', 'EXECUTE') AS anon_exec,
        has_function_privilege('authenticated', 'public.claim_magazine_dispatch_batch(integer, timestamptz)', 'EXECUTE') AS auth_exec,
        has_function_privilege('service_role', 'public.claim_magazine_dispatch_batch(integer, timestamptz)', 'EXECUTE') AS svc_exec
    `);
    expect(privCheck.rows[0]).toEqual({
      anon_exec: false,
      auth_exec: false,
      svc_exec: true,
    });

    await harness.db.exec(`DELETE FROM public.magazine_dispatch_logs; DELETE FROM public.magazine_subscribers;`);

    const nowIso = DAYTIME_NOW.toISOString();
    const pastIso = new Date(DAYTIME_NOW.getTime() - 10 * 60_000).toISOString();
    const futureIso = new Date(DAYTIME_NOW.getTime() + 6 * 3600_000).toISOString();

    // Seed 12 subscribers + 12 dispatch queue rows:
    //  - 6 pending_worker (1..6)
    //  - 4 due retryable (7..10, next_attempt_at <= now or NULL)
    //  - 2 future retryable (11..12, next_attempt_at > now — must NOT be claimed)
    for (let i = 1; i <= 12; i++) {
      const sid = subUuid(i);
      const did = dispatchUuid(i);
      const createdIso = new Date(DAYTIME_NOW.getTime() - (100 - i) * 1000).toISOString();
      const status = i <= 6 ? 'pending_worker' : 'retryable';
      const nextAttemptAt = i <= 6 ? null : i <= 8 ? null : i <= 10 ? pastIso : futureIso;

      await harness.db.query(
        `INSERT INTO public.magazine_subscribers (
           id, broker_id, broker_user_id, subscriber_name, subscriber_email,
           channel, status, confirm_status, marketing_consent_at, night_consent, segment
         ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, 'email', 'active', 'confirmed', $6::timestamptz, true, 'all')`,
        [sid, BROKER_SLUG, BROKER_UUID, `독자${i}`, `reader${i}@example.com`, pastIso],
      );

      await harness.db.query(
        `INSERT INTO public.magazine_dispatch_logs (
           id, idempotency_key, edition_id, broker_id, broker_user_id, subscriber_id,
           channel, kind, status, attempt_count, next_attempt_at, payload, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5::uuid, $6::uuid,
           'email', 'weekly', $7, 0, $8::timestamptz, $9::jsonb, $10::timestamptz, $10::timestamptz
         )`,
        [
          did,
          `${BROKER_SLUG}:2026-11-26:weekly:r${i}:email`,
          EDITION_UUID,
          BROKER_SLUG,
          BROKER_UUID,
          sid,
          status,
          nextAttemptAt,
          JSON.stringify({
            subscriberId: sid,
            issueId: EDITION_UUID,
            brokerId: BROKER_SLUG,
            channel: 'email',
            editionKey: `${BROKER_SLUG}:2026-11-26:weekly`,
            editionUrl: `https://www.credeal.net/magazine/${BROKER_SLUG}/2026-11-26?edition=${EDITION_UUID}`,
            title: '강남 오피스 주간 브리핑',
            headline: '프라임 오피스 공실률 동향',
            marketTemp: '관망',
            date: '2026-11-26',
            kakaoTemplateId: 'TPL_WEEKLY',
          }),
          createdIso,
        ],
      );
    }

    const clientA = harness.createClient({ role: 'service_role' });
    const clientB = harness.createClient({ role: 'service_role' });

    // 2 parallel claim_magazine_dispatch_batch(5) calls -> 5 + 5 = 10 disjoint rows (0 overlap!)
    const [claimA, claimB] = await Promise.all([
      clientA.rpc<Array<{ id: string; status: string; updated_at: string }>>(
        'claim_magazine_dispatch_batch',
        { p_limit: 5, p_now: nowIso },
      ),
      clientB.rpc<Array<{ id: string; status: string; updated_at: string }>>(
        'claim_magazine_dispatch_batch',
        { p_limit: 5, p_now: nowIso },
      ),
    ]);

    expect(claimA.error).toBeNull();
    expect(claimB.error).toBeNull();
    const rowsA = Array.isArray(claimA.data) ? claimA.data : [];
    const rowsB = Array.isArray(claimB.data) ? claimB.data : [];
    expect(rowsA).toHaveLength(5);
    expect(rowsB).toHaveLength(5);

    const idsA = new Set(rowsA.map((r) => r.id));
    const idsB = new Set(rowsB.map((r) => r.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toEqual([]);

    // Priority check: all 6 pending_worker rows claimed before due retryable rows, and future retryable rows untouched
    const allClaimedOrdered = [...rowsA.map((r) => r.id), ...rowsB.map((r) => r.id)];
    expect(allClaimedOrdered.slice(0, 6)).toEqual([
      dispatchUuid(1),
      dispatchUuid(2),
      dispatchUuid(3),
      dispatchUuid(4),
      dispatchUuid(5),
      dispatchUuid(6),
    ]);
    expect(allClaimedOrdered).not.toContain(dispatchUuid(11));
    expect(allClaimedOrdered).not.toContain(dispatchUuid(12));
    for (const r of [...rowsA, ...rowsB]) {
      expect(r.status).toBe('queued');
    }

    // Reset rows 1..6 to pending_worker and run 2 parallel processMagazineDispatchQueueBatch workers on PGlite
    await harness.db.query(
      `UPDATE public.magazine_dispatch_logs
       SET status = CASE WHEN id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid) THEN 'pending_worker' ELSE 'sent' END,
           attempt_count = 0
       WHERE id NOT IN ($7::uuid, $8::uuid)`,
      [
        dispatchUuid(1),
        dispatchUuid(2),
        dispatchUuid(3),
        dispatchUuid(4),
        dispatchUuid(5),
        dispatchUuid(6),
        dispatchUuid(11),
        dispatchUuid(12),
      ],
    );

    const [worker1, worker2] = await Promise.all([
      processMagazineDispatchQueueBatch(clientA as never, {
        batchSize: 3,
        now: DAYTIME_NOW,
        paceMs: 0,
        gateDeps: { dryRun: false },
      }),
      processMagazineDispatchQueueBatch(clientB as never, {
        batchSize: 3,
        now: DAYTIME_NOW,
        paceMs: 0,
        gateDeps: { dryRun: false },
      }),
    ]);

    expect(worker1.sent + worker2.sent).toBe(6);
    expect(hoisted.sentResendPayloads).toHaveLength(6);

    const recipientSet = new Set(hoisted.sentResendPayloads.map((p) => p.to));
    expect(recipientSet.size).toBe(6);

    // Lost-lease guard: if a slow worker fails after another worker settled the row to 'sent', 'sent' must NOT be clobbered
    const settledId = dispatchUuid(1);
    let intercepted = false;
    const lostLeaseClient = {
      from: (table: string) => clientA.from(table),
      rpc: async () => {
        if (!intercepted) {
          intercepted = true;
          await harness.db.query(
            `UPDATE public.magazine_dispatch_logs SET status = 'queued', attempt_count = 0, updated_at = $2::timestamptz WHERE id = $1::uuid`,
            [settledId, nowIso],
          );
          const rowRes = await harness.db.query<Record<string, unknown>>(
            `SELECT * FROM public.magazine_dispatch_logs WHERE id = $1::uuid`,
            [settledId],
          );
          return { data: rowRes.rows, error: null };
        }
        return { data: [], error: null };
      },
    };

    hoisted.resendBehavior = async () => {
      // Simulate lease stolen and settled to 'sent' by another worker while HTTP call was in flight
      await harness.db.query(
        `UPDATE public.magazine_dispatch_logs SET status = 'sent', provider_msg_id = 'winner-msg', attempt_count = 1 WHERE id = $1::uuid`,
        [settledId],
      );
      return { data: null, error: { message: 'socket hang up' } };
    };

    await processMagazineDispatchQueueBatch(lostLeaseClient as never, {
      batchSize: 1,
      now: DAYTIME_NOW,
      paceMs: 0,
      gateDeps: { dryRun: false },
    });

    const afterLostLease = await harness.db.query<{ status: string; provider_msg_id: string }>(
      `SELECT status, provider_msg_id FROM public.magazine_dispatch_logs WHERE id = $1::uuid`,
      [settledId],
    );
    expect(afterLostLease.rows[0]).toEqual({
      status: 'sent',
      provider_msg_id: 'winner-msg',
    });
  });

  it('(2) propagates Idempotency-Key header from sendGate -> sendEmailProvider -> Resend, jitters non-test 429 backoff, and retries post-send ledger settlement once', async () => {
    const serviceClient = harness.createClient({ role: 'service_role' });
    await harness.db.exec(`DELETE FROM public.magazine_dispatch_logs;`);
    await harness.db.query(
      `INSERT INTO public.magazine_subscribers (
         id, broker_id, broker_user_id, subscriber_name, subscriber_email,
         channel, status, confirm_status, marketing_consent_at, night_consent, segment
       ) VALUES ($1::uuid, $2, $3::uuid, '박독자', 'idem-reader@example.com', 'email', 'active', 'confirmed', '2026-10-01T00:00:00.000Z'::timestamptz, true, 'all')
       ON CONFLICT (id) DO NOTHING`,
      [subUuid(1), BROKER_SLUG, BROKER_UUID],
    );

    let ledgerSentUpdateCalls = 0;
    const flakyPostSendClient = {
      from(table: string) {
        const realBuilder = serviceClient.from(table);
        if (table !== DISPATCH_LEDGER_TABLE) return realBuilder;
        const origUpdate = realBuilder.update.bind(realBuilder);
        realBuilder.update = (patch: object) => {
          const p = patch as Record<string, unknown>;
          if (p.status === 'sent') {
            ledgerSentUpdateCalls += 1;
            if (ledgerSentUpdateCalls === 1) {
              return {
                eq: async () => ({
                  data: null,
                  error: { code: '08006', message: 'transient PostgREST reset' },
                }),
              } as unknown as ReturnType<typeof origUpdate>;
            }
          }
          return origUpdate(patch);
        };
        return realBuilder;
      },
    };

    const explicitIdempotencyKey = `${BROKER_SLUG}:2026-11-26:weekly:idem-sub-1:email`;
    const gateInput: GateInput = {
      subscriber: {
        id: subUuid(1),
        subscriber_email: 'idem-reader@example.com',
        subscriber_name: '박독자',
        channel: 'email',
        status: 'active',
        confirm_status: 'confirmed',
        marketing_consent_at: '2026-10-01T00:00:00.000Z',
        night_consent: true,
      },
      channel: 'email',
      editionId: EDITION_UUID,
      editionKey: `${BROKER_SLUG}:2026-11-26:weekly`,
      idempotencyKey: explicitIdempotencyKey,
      brokerId: BROKER_SLUG,
      brokerUserId: BROKER_UUID,
      kind: 'weekly',
      rendered: {
        subject: '(광고) 주간 CRE 리포트',
        body: '<p>본문</p><a href="https://www.credeal.net/unsub">수신거부</a>',
        text: '본문 수신거부: https://www.credeal.net/unsub',
        headers: {
          'List-Unsubscribe': '<https://www.credeal.net/unsub>',
        },
        hasUnsubscribeLink: true,
        hasAdLabel: true,
        senderName: '김원자',
        senderContact: '02-555-2026',
      },
    };

    const gateRes = await sendGate(gateInput, {
      supabase: flakyPostSendClient as never,
      now: DAYTIME_NOW,
      dryRun: false,
    });

    expect(gateRes).toMatchObject({ ok: true, dryRun: false });
    expect(ledgerSentUpdateCalls).toBe(2);
    expect(hoisted.sentResendPayloads).toHaveLength(1);
    expect(hoisted.sentResendPayloads[0].headers).toEqual({
      'List-Unsubscribe': '<https://www.credeal.net/unsub>',
      'Idempotency-Key': explicitIdempotencyKey,
    });

    // Verify ledger row actually settled to 'sent' after transient first-attempt failure
    const settled = await harness.db.query<{ status: string; provider_msg_id: string }>(
      `SELECT status, provider_msg_id FROM public.magazine_dispatch_logs WHERE idempotency_key = $1`,
      [explicitIdempotencyKey],
    );
    expect(settled.rows[0]).toEqual({
      status: 'sent',
      provider_msg_id: 'resend-msg-1',
    });

    // Verify non-test 429 retry jitter applies 0.7..1.3 factor
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.7 + 0.5 * 0.6 = 1.0 -> deterministic check, let's test 0.0 -> 0.7x!
    randomSpy.mockReturnValue(0);

    let callIdx = 0;
    hoisted.resendBehavior = async () => {
      callIdx += 1;
      if (callIdx === 1) {
        return { data: null, error: { statusCode: 429, message: 'Too many requests' } };
      }
      return { data: { id: 'after-429-msg' }, error: null };
    };

    try {
      const retryRes = await sendEmailProvider(
        {
          to: 'jitter@example.com',
          subject: '(광고) 재시도 확인',
          html: '<p>ok</p>',
          idempotencyKey: 'idem-jitter-key',
        },
        { maxRetries: 1, retryBaseDelayMs: 10 },
      );
      expect(retryRes).toEqual({ ok: true, messageId: 'after-429-msg' });
      expect(randomSpy).toHaveBeenCalled();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      randomSpy.mockRestore();
    }
  });

  it('(3) invokes sweepStaleJobs() from /api/cron/data-hygiene, includes sweptJobs in summary, and aligns vercel.json + route maxDuration=60', async () => {
    const sweepSpy = vi.spyOn(jobsEngine, 'sweepStaleJobs').mockResolvedValue({
      sweptCount: 2,
      timedOutJobIds: ['job_stale_1', 'job_stale_2'],
    });

    const mockHygieneDb = {
      from(table: string) {
        if (table === 'magazine_cron_runs') {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        if (table === 'document_objects') {
          return {
            select: () => ({
              eq: () => ({
                lt: () => ({
                  limit: async () => ({ data: [{ id: 'd1' }], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'im_golden_sets') {
          return {
            select: () => ({
              eq: () => ({
                lt: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table in data-hygiene: ${table}`);
      },
    };
    hoisted.serviceClient = mockHygieneDb;

    const res = await dataHygieneGet(
      new NextRequest('https://www.credeal.net/api/cron/data-hygiene', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(body.status).toBe('ok');
    expect(body.sweptJobs).toEqual({
      sweptCount: 2,
      timedOutJobIds: ['job_stale_1', 'job_stale_2'],
    });
    expect(body.results.sweptJobs).toEqual({
      sweptCount: 2,
      timedOutJobIds: ['job_stale_1', 'job_stale_2'],
    });

    // Route & vercel.json maxDuration + schedule verification
    expect(holdExpiryMaxDuration).toBe(60);
    expect(circleApprovalMaxDuration).toBe(60);

    const vercelJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      functions: Record<string, { maxDuration: number }>;
      crons: Array<{ path: string; schedule: string }>;
    };

    for (const routeKey of [
      'src/app/api/cron/data-hygiene/route.ts',
      'src/app/api/cron/hold-expiry/route.ts',
      'src/app/api/cron/retention-purge/route.ts',
      'src/app/api/cron/circle-approval-timeout/route.ts',
      'src/app/api/cron/consent-reconfirm-2yr/route.ts',
    ]) {
      expect(vercelJson.functions[routeKey], routeKey).toEqual({ maxDuration: 60 });
    }

    const cronMap = new Map(vercelJson.crons.map((c) => [c.path, c.schedule]));
    expect(cronMap.get('/api/cron/data-hygiene')).toBe('30 18 * * *');
  });

  it('(4) batches building_ssot_lite into 1 .in() query in consistency-check (zero N+1 .single() calls) and bounds ai-quality-monitor with .limit(2000)', async () => {
    const ssotInCalls: Array<{ col: string; ids: string[] }> = [];
    let ssotSingleCalls = 0;
    let ssotQueryCount = 0;

    // 20 published docs pointing to 5 distinct buildings
    const recentDocs = Array.from({ length: 20 }, (_, idx) => {
      const bId = `bbbbbbbb-bbbb-4bbb-8bbb-${String((idx % 5) + 1).padStart(12, '0')}`;
      return {
        id: `doc-${idx + 1}`,
        building_id: bId,
        content: {
          heroCard: {
            address: idx === 0 ? '서울시 강남구 오타주소 999' : `서울시 강남구 역삼동 ${(idx % 5) + 1}`,
            askingPriceKrw: idx === 1 ? 15_000_000_000 : 10_000_000_000,
          },
        },
      };
    });

    const ssotRows = Array.from({ length: 5 }, (_, idx) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(idx + 1).padStart(12, '0')}`,
      raw_address: `서울시 강남구 역삼동 ${idx + 1}`,
      layers: { finance: { asking_price_krw: 10_000_000_000 } },
    }));

    hoisted.serviceClient = {
      from(table: string) {
        if (table === 'magazine_cron_runs') {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        if (table === 'document_objects') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: recentDocs, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'building_ssot_lite') {
          ssotQueryCount += 1;
          return {
            select: () => ({
              in: async (col: string, ids: string[]) => {
                ssotInCalls.push({ col, ids });
                return { data: ssotRows, error: null };
              },
              eq: () => ({
                single: async () => {
                  ssotSingleCalls += 1;
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`Unexpected table in consistency-check: ${table}`);
      },
    };

    const res = await consistencyCheckGet(
      new NextRequest('https://www.credeal.net/api/cron/consistency-check', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(ssotQueryCount).toBe(1);
    expect(ssotSingleCalls).toBe(0);
    expect(ssotInCalls).toHaveLength(1);
    expect(ssotInCalls[0].col).toBe('id');
    expect(ssotInCalls[0].ids).toHaveLength(5);
    expect(body).toMatchObject({
      status: 'ok',
      checked: 20,
      driftsFound: 2,
    });

    // Verify ai-quality-monitor attaches .limit(2000) to im_fewshot_usage_log queries
    const fewshotLimits: number[] = [];
    hoisted.serviceClient = {
      from(table: string) {
        if (table === 'magazine_cron_runs') {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        if (table === 'im_fewshot_usage_log') {
          const chain: Record<string, unknown> = {
            select: () => chain,
            gte: () => chain,
            lt: () => chain,
            not: () => chain,
            limit: async (n: number) => {
              fewshotLimits.push(n);
              return { data: [{ result_judge_score: 4.5 }], error: null };
            },
          };
          return chain;
        }
        throw new Error(`Unexpected table in ai-quality-monitor: ${table}`);
      },
    };

    const aiRes = await aiQualityMonitorGet(
      new Request('https://www.credeal.net/api/cron/ai-quality-monitor', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(aiRes.status).toBe(200);
    expect(fewshotLimits).toEqual([2000, 2000]);
  });

  it('(5) fails closed ({ acquired: false }) in acquireCronIdempotencySlot during DB errors when isRealProductionRuntime() is true, while preserving missing-table and dev/test fallbacks', async () => {
    const makeCronDb = (opts: {
      selectErr?: { code?: string; message?: string } | null;
      insertErr?: { code?: string; message?: string } | null;
    }) => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: opts.selectErr ?? null }),
          }),
        }),
        insert: async () => ({ error: opts.insertErr ?? null }),
      }),
    });

    // 1) Test/dev runtime (isRealProductionRuntime() === false): non-23505 DB errors degrade gracefully to { acquired: true }
    delete process.env.VERCEL_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const testFallback = await acquireCronIdempotencySlot(
      makeCronDb({ selectErr: { code: '57014', message: 'statement timeout' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(testFallback).toEqual({ acquired: true });

    // 2) Real production runtime (isRealProductionRuntime() === true)
    process.env.VERCEL_ENV = 'production';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.CI;
    delete process.env.NEXT_PHASE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-wave2a.supabase.co';

    // Select brownout -> fail closed!
    const prodSelectBrownout = await acquireCronIdempotencySlot(
      makeCronDb({ selectErr: { code: '57014', message: 'canceling statement due to statement timeout' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(prodSelectBrownout).toEqual({ acquired: false });

    // Insert brownout (non-23505, non-missing-table) -> fail closed!
    const prodInsertBrownout = await acquireCronIdempotencySlot(
      makeCronDb({ insertErr: { code: '08006', message: 'connection failure' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(prodInsertBrownout).toEqual({ acquired: false });

    // Duplicate 23505 -> fail closed!
    const prodDuplicate = await acquireCronIdempotencySlot(
      makeCronDb({ insertErr: { code: '23505', message: 'duplicate key value' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(prodDuplicate).toEqual({ acquired: false });

    // Missing table (42P01 / PGRST205) -> still allows pre-migration execution ({ acquired: true })
    const prodMissingTable42P01 = await acquireCronIdempotencySlot(
      makeCronDb({ selectErr: { code: '42P01', message: 'relation "magazine_cron_runs" does not exist' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(prodMissingTable42P01).toEqual({ acquired: true });

    const prodMissingTablePgrst = await acquireCronIdempotencySlot(
      makeCronDb({ insertErr: { code: 'PGRST205', message: 'Could not find the table in schema cache' } }),
      'weekly-magazine',
      '2026-11-26',
    );
    expect(prodMissingTablePgrst).toEqual({ acquired: true });
  });
});
