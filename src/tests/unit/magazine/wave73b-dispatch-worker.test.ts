/**
 * WP-7.3B — 뉴스레터 비동기 발송 워커 하드닝 (P1-1 중복 발송 / P1-2 페이싱·429·시간 예산 / P2-1 에디션 링크 / D2 사전 컷오버)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb, TEST_SCHEMA, consentedSubscriber, DAYTIME, SUB_ID, BROKER_USER_ID } from './send-fake-db';

const providers = vi.hoisted(() => ({
  hasEmailProvider: vi.fn(() => true),
  hasKakaoProvider: vi.fn(() => true),
  sendEmailProvider: vi.fn(async () => ({ ok: true, messageId: 'm-1' } as { ok: boolean; messageId?: string; error?: string })),
  sendKakaoProvider: vi.fn(async () => ({ ok: true, messageId: null } as { ok: boolean; messageId?: string | null; error?: string })),
}));
vi.mock('@/domain/magazine/send-providers', () => providers);

const renderSpy = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock('@/domain/magazine/email-template', () => ({
  renderMagazineEmail: (input: { edition: { title: string; url: string }; unsubscribeUrl: string }) => {
    renderSpy.email(input);
    return {
      subject: `(광고) ${input.edition.title}`,
      html: `<a href="${input.unsubscribeUrl}">수신거부</a>`,
      text: `수신거부: ${input.unsubscribeUrl}`,
      hasUnsubscribeLink: true,
      hasAdLabel: true,
    };
  },
  renderMagazineKakaoText: (input: { edition: { title: string }; unsubscribeUrl: string }) => ({
    text: `(광고) ${input.edition.title}\n수신거부: ${input.unsubscribeUrl}`,
    hasUnsubscribeLink: true,
    hasAdLabel: true,
  }),
}));

import { enqueueMagazineDispatch, processMagazineDispatchQueueBatch } from '@/domain/magazine/distribute-queue';
import { distributeMagazine } from '@/domain/magazine/distribute-magazine';
import { reclaimStaleQueuedDispatches, sendGate, type GateInput } from '@/domain/magazine/send-gate';

type Row = Record<string, unknown>;
const LEDGER = 'magazine_dispatch_logs';
const EDITION_ID = 'eeeeeeee-1111-4111-8111-111111111111';
const NOW_ISO = DAYTIME.toISOString();
const ENV_KEYS = ['MAGAZINE_SEND_ENABLED', 'MAGAZINE_SEND_DRY_RUN', 'MAGAZINE_SEND_ALLOWLIST', 'MAGAZINE_DAILY_CAP', 'APP_BASE_URL', 'UNSUBSCRIBE_SECRET'];

function queueRow(id: string, over: Row = {}): Row {
  return {
    id,
    idempotency_key: `kim-broker:2026-10-06:weekly:${id}:email`,
    edition_id: EDITION_ID,
    broker_id: 'kim-broker',
    broker_user_id: BROKER_USER_ID,
    subscriber_id: SUB_ID,
    channel: 'email',
    kind: 'weekly',
    status: 'pending_worker',
    blocked_reason: null,
    attempt_count: 0,
    // 오래전에 enqueue 된 행 (created_at 이 오래돼도 점유 시각 기준으로 판단해야 한다)
    created_at: new Date(DAYTIME.getTime() - 60 * 60_000).toISOString(),
    updated_at: new Date(DAYTIME.getTime() - 60 * 60_000).toISOString(),
    payload: {
      subscriberId: SUB_ID,
      issueId: EDITION_ID,
      brokerId: 'kim-broker',
      channel: 'email',
      editionKey: 'kim-broker:2026-10-06:weekly',
      editionUrl: `https://www.credeal.net/magazine/kim-broker/2026-10-06?edition=${EDITION_ID}`,
      title: '주간 호',
      headline: '주간 브리핑',
      marketTemp: '보합',
      date: '2026-10-06',
      kakaoTemplateId: 'TPL',
    },
    ...over,
  };
}

function makeDb(ledgerRows: Row[] = []): FakeDb {
  const db = new FakeDb({
    broker_profiles: [{ id: 'bp-1', user_id: BROKER_USER_ID, slug: 'kim-broker', contact_email: 'kim@broker.test' }],
    profiles: [{ id: BROKER_USER_ID, display_name: '김중개', phone: '010-0000-1111' }],
    user_subscriptions: [],
    magazine_subscribers: [consentedSubscriber({ channel: 'email' })],
    activity_events: [],
    magazine_dispatch_logs: ledgerRows,
  });
  db.clock = DAYTIME;
  return db;
}

const ledgerRow = (db: FakeDb, id: string) => db.rows(LEDGER).find((r) => r.id === id)!;

const runWorker = (db: FakeDb, extra: Parameters<typeof processMagazineDispatchQueueBatch>[1] = {}) =>
  processMagazineDispatchQueueBatch(db as never, {
    now: DAYTIME,
    gateDeps: { dryRun: false },
    paceMs: 0,
    rateLimitBaseDelayMs: 0,
    ...extra,
  });

/** 조회 시점 스냅샷(stale)을 돌려주는 래퍼 — 겹친 tick 이 먼저 점유한 상황을 결정적으로 재현 */
function withStaleFetch(db: FakeDb, stale: Row[]): FakeDb {
  const orig = db.from.bind(db);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).from = (table: string) => {
    const q = orig(table);
    if (table !== LEDGER) return q;
    let isWorkerFetch = false;
    let isWrite = false;
    const origUpdate = q.update;
    q.update = (patch: Row) => { isWrite = true; return origUpdate(patch); };
    const origSelect = q.select;
    q.select = (cols?: string, o?: unknown) => {
      if (!isWrite && typeof cols === 'string' && cols.includes('payload')) isWorkerFetch = true;
      return origSelect(cols, o);
    };
    const origThen = q.then;
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      isWorkerFetch
        ? Promise.resolve({ data: stale.map((r) => ({ ...r })), error: null, count: stale.length }).then(resolve, reject)
        : origThen(resolve, reject);
    return q;
  };
  return db;
}

function withLedgerSchema(cols: readonly string[], fn: () => Promise<void>): Promise<void> {
  const original = TEST_SCHEMA[LEDGER];
  TEST_SCHEMA[LEDGER] = cols;
  return fn().finally(() => {
    TEST_SCHEMA[LEDGER] = original;
  });
}

/** FakeDb 는 배열 upsert 를 지원하지 않으므로(enqueue 는 청크 배열 upsert) 행 단위 upsert 로 펼친다 */
function withArrayUpsert(db: FakeDb): FakeDb {
  const orig = db.from.bind(db);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).from = (table: string) => {
    const q = orig(table);
    const origUpsert = q.upsert;
    q.upsert = (rows: Row | Row[], opts?: unknown) => {
      if (!Array.isArray(rows)) return origUpsert(rows, opts);
      const chain = {
        select: () => chain,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.all(rows.map((r) => orig(table).upsert(r, opts).select('id') as Promise<{ data: Row[] | null; error: unknown }>))
            .then((results) => {
              const error = results.find((x) => x.error)?.error ?? null;
              return { data: error ? null : results.flatMap((x) => x.data ?? []), error };
            })
            .then(resolve, reject),
      };
      return chain;
    };
    return q;
  };
  return db;
}
/** 20261117000003 미적용(사전 컷오버) 원장 스키마 */
const PRE_CUTOVER_LEDGER_COLS = TEST_SCHEMA[LEDGER].filter(
  (c) => !['payload', 'attempt_count', 'queued_at', 'updated_at'].includes(c),
);

beforeEach(() => {
  vi.clearAllMocks();
  providers.hasEmailProvider.mockReturnValue(true);
  providers.sendEmailProvider.mockResolvedValue({ ok: true, messageId: 'm-1' });
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MAGAZINE_SEND_ENABLED = 'true';
  process.env.MAGAZINE_SEND_DRY_RUN = 'false';
  process.env.APP_BASE_URL = 'https://www.credeal.net';
  process.env.UNSUBSCRIBE_SECRET = 'wave73b-unsub-secret-32-characters-min';
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('P1-1: stale 회수는 점유 시각(updated_at) 기준 + 워커 원자적 점유(CAS)', () => {
  it('created_at 이 오래돼도 15분 이내에 점유된 in-flight 행은 회수하지 않고, 점유 후 15분 넘게 고착된 행만 회수한다', async () => {
    const db = makeDb([
      queueRow('inflight', { status: 'queued', updated_at: new Date(DAYTIME.getTime() - 2 * 60_000).toISOString() }),
      queueRow('stuck', { status: 'queued', updated_at: new Date(DAYTIME.getTime() - 20 * 60_000).toISOString() }),
    ]);
    const { reclaimed } = await reclaimStaleQueuedDispatches(db as never, { staleMinutes: 15, now: DAYTIME });
    expect(reclaimed).toBe(1);
    expect(ledgerRow(db, 'inflight').status).toBe('queued');
    expect(ledgerRow(db, 'stuck').status).toBe('retryable');
    expect(ledgerRow(db, 'stuck').idempotency_key).toBe('kim-broker:2026-10-06:weekly:stuck:email');
  });

  it('워커 점유는 status=queued + updated_at=점유 시각을 기록 → 발송 중 다음 tick 의 stale 회수에 걸리지 않는다', async () => {
    const db = makeDb([queueRow('q-1')]);
    const duringSend: Array<{ status: unknown; updated_at: unknown; reclaimed: number }> = [];
    providers.sendEmailProvider.mockImplementation(async () => {
      const r = ledgerRow(db, 'q-1');
      // 같은 시각에 겹친 다음 tick(+5분)이 stale 회수를 돌려도 in-flight 행은 그대로여야 한다
      const { reclaimed } = await reclaimStaleQueuedDispatches(db as never, {
        staleMinutes: 15,
        now: new Date(DAYTIME.getTime() + 5 * 60_000),
      });
      duringSend.push({ status: r.status, updated_at: r.updated_at, reclaimed });
      return { ok: true, messageId: 'm-1' };
    });

    const res = await runWorker(db);
    expect(res.sent).toBe(1);
    expect(duringSend).toEqual([{ status: 'queued', updated_at: NOW_ISO, reclaimed: 0 }]);
    expect(ledgerRow(db, 'q-1')).toMatchObject({ status: 'sent', attempt_count: 1 });
  });

  it('겹친 tick 이 먼저 점유한 행(조회 스냅샷은 pending_worker)은 CAS 에서 져서 발송하지 않는다', async () => {
    const snapshot = queueRow('q-1');
    const claimedByOther = { ...snapshot, status: 'queued', attempt_count: 1, updated_at: NOW_ISO };
    const db = withStaleFetch(makeDb([claimedByOther]), [snapshot]);

    const res = await runWorker(db);
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(res).toMatchObject({ fetched: 1, sent: 0, failed: 0, deferred: 1 });
    expect(ledgerRow(db, 'q-1')).toMatchObject({ status: 'queued', attempt_count: 1, updated_at: NOW_ISO });
  });

  it('같은 행에 대한 두 tick 동시 실행 → provider 호출은 정확히 1회', async () => {
    const db = makeDb([queueRow('q-1')]);
    const [a, b] = await Promise.all([runWorker(db), runWorker(db)]);
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1);
    expect(ledgerRow(db, 'q-1').status).toBe('sent');
  });

  it('sendGate(claimedDispatchId): 점유(status=queued)를 잃은 행은 DUPLICATE 로 차단, provider 미호출', async () => {
    const db = makeDb([queueRow('q-1', { status: 'retryable' })]);
    const input: GateInput = {
      subscriber: consentedSubscriber({ channel: 'email' }),
      channel: 'email',
      editionId: EDITION_ID,
      editionKey: 'kim-broker:2026-10-06:weekly',
      idempotencyKey: 'kim-broker:2026-10-06:weekly:q-1:email',
      brokerId: 'kim-broker',
      brokerUserId: BROKER_USER_ID,
      kind: 'weekly',
      rendered: {
        subject: '(광고) 주간',
        body: '<p>본문</p>',
        hasUnsubscribeLink: true,
        hasAdLabel: true,
        senderName: '김중개',
        senderContact: '010-0000-1111',
      },
    };
    const res = await sendGate(input, { supabase: db as never, now: DAYTIME, dryRun: false, claimedDispatchId: 'q-1' });
    expect(res).toMatchObject({ ok: false, blocked: 'DUPLICATE' });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(ledgerRow(db, 'q-1').status).toBe('retryable');
  });
});

describe('P1-2: 워커 페이싱 · 429 재시도 대기 · 45s 시간 예산', () => {
  it('429(rate limit)는 failed 가 아니라 retryable 로 되돌리고 attempt_count 를 소모하지 않으며, 연속되면 tick 을 멈춘다', async () => {
    providers.sendEmailProvider.mockResolvedValue({ ok: false, error: 'Too many requests. rate_limit_exceeded' });
    const db = makeDb([queueRow('q-1'), queueRow('q-2'), queueRow('q-3'), queueRow('q-4')]);

    const res = await runWorker(db);
    // BATCH_429_MAX_RETRIES(2) 를 넘는 3번째 연속 429 에서 중단 → 4번째 행은 점유하지 않음
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(3);
    expect(res).toMatchObject({ fetched: 4, sent: 0, failed: 0, deferred: 4 });
    for (const id of ['q-1', 'q-2', 'q-3']) {
      expect(ledgerRow(db, id)).toMatchObject({
        status: 'retryable',
        attempt_count: 0,
        blocked_reason: 'RATE_LIMITED',
        error: 'rate_limited_deferred',
      });
    }
    expect(ledgerRow(db, 'q-4')).toMatchObject({ status: 'pending_worker', attempt_count: 0 });

    // 다음 tick 에서 provider 가 회복되면 재시도 예산 그대로 정상 발송
    providers.sendEmailProvider.mockResolvedValue({ ok: true, messageId: 'm-2' });
    const next = await runWorker(db);
    expect(next.sent).toBe(4);
    expect(ledgerRow(db, 'q-1')).toMatchObject({ status: 'sent', attempt_count: 1 });
  });

  it('일반 provider 실패는 기존대로 attempt_count 를 소모하는 retryable (429 와 구분)', async () => {
    providers.sendEmailProvider.mockResolvedValue({ ok: false, error: 'invalid_to_address' });
    const db = makeDb([queueRow('q-1')]);
    const res = await runWorker(db);
    expect(res).toMatchObject({ failed: 1, deferred: 0 });
    expect(ledgerRow(db, 'q-1')).toMatchObject({ status: 'retryable', attempt_count: 1, error: 'invalid_to_address' });
  });

  it('시간 예산(기본 45s)을 넘기면 새 행을 점유하지 않고 남은 행은 다음 tick 으로 넘긴다', async () => {
    let t = 0;
    providers.sendEmailProvider.mockImplementation(async () => {
      t += 30_000; // provider 1건이 30초 걸리는 상황
      return { ok: true, messageId: 'm-slow' };
    });
    const db = makeDb([queueRow('q-1'), queueRow('q-2'), queueRow('q-3'), queueRow('q-4')]);
    const res = await runWorker(db, { clock: () => t });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ fetched: 4, sent: 2, deferred: 2 });
    expect(ledgerRow(db, 'q-3')).toMatchObject({ status: 'pending_worker', attempt_count: 0 });
    expect(ledgerRow(db, 'q-4')).toMatchObject({ status: 'pending_worker', attempt_count: 0 });
  });

  it('실발송은 provider 호출 간 paceMs 간격을 둔다 (동기 경로와 같은 처리율 상한)', async () => {
    const db = makeDb([queueRow('q-1'), queueRow('q-2'), queueRow('q-3')]);
    const started = Date.now();
    const res = await runWorker(db, { paceMs: 40, clock: () => 0 });
    const elapsed = Date.now() - started;
    expect(res.sent).toBe(3);
    expect(elapsed).toBeGreaterThanOrEqual(75); // 3건 → 간격 2회 × 40ms
  });

  it('dry-run 은 provider 를 호출하지 않으므로 페이싱 대기가 없다', async () => {
    const db = makeDb([queueRow('q-1'), queueRow('q-2')]);
    const started = Date.now();
    const res = await processMagazineDispatchQueueBatch(db as never, {
      now: DAYTIME,
      gateDeps: { dryRun: true },
      paceMs: 10_000,
    });
    expect(res.recorded).toBe(2);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('P2-1: 발송 링크는 ?edition=<uuid> 로 그 호를 가리킨다', () => {
  it('enqueue payload.editionUrl 과 동기 경로 렌더 URL 모두 edition 파라미터 포함 (+target 보존)', async () => {
    const db = withArrayUpsert(makeDb());
    const q = await enqueueMagazineDispatch(
      db as never,
      'kim-broker',
      { id: EDITION_ID, editionType: 'weekly', title: '주간 호', date: '2026-10-06', target: 'buyer' },
      { now: DAYTIME, dryRun: true },
    );
    expect(q.ok).toBe(true);
    const payload = db.rows(LEDGER)[0].payload as { editionUrl: string };
    const u = new URL(payload.editionUrl);
    expect(u.pathname).toBe('/magazine/kim-broker/2026-10-06');
    expect(u.searchParams.get('edition')).toBe(EDITION_ID);
    expect(u.searchParams.get('target')).toBe('buyer');

    const db2 = makeDb();
    await distributeMagazine(db2 as never, 'kim-broker', { id: EDITION_ID, title: '주간 호', date: '2026-10-06' }, { now: DAYTIME, dryRun: true });
    const rendered = renderSpy.email.mock.calls[0][0] as { edition: { url: string } };
    expect(new URL(rendered.edition.url).searchParams.get('edition')).toBe(EDITION_ID);
  });
});

describe('D2 사전 컷오버(000003 미적용) 폴백', () => {
  it('워커: 대기열 컬럼이 없으면 500 대신 처리 0건으로 끝난다', async () => {
    await withLedgerSchema(PRE_CUTOVER_LEDGER_COLS, async () => {
      const db = makeDb();
      const res = await runWorker(db);
      expect(res).toEqual({ reclaimed: 0, fetched: 0, sent: 0, recorded: 0, blocked: 0, failed: 0, deferred: 0 });
    });
  });

  it('enqueue: 대기열 스키마가 없으면 throw 대신 queueUnavailable 로 알려 동기 경로 폴백을 가능하게 한다', async () => {
    await withLedgerSchema(PRE_CUTOVER_LEDGER_COLS, async () => {
      const db = withArrayUpsert(makeDb());
      const q = await enqueueMagazineDispatch(db as never, 'kim-broker', { id: EDITION_ID, title: '주간', date: '2026-10-06' }, { now: DAYTIME, dryRun: true });
      expect(q).toMatchObject({ ok: false, asyncQueued: false, queueUnavailable: true, queued: 0 });
    });
  });

  it('sendGate 재점유: updated_at 컬럼이 없어도(사전 컷오버) blocked 행 재점유가 동작한다', async () => {
    await withLedgerSchema(PRE_CUTOVER_LEDGER_COLS, async () => {
      const db = makeDb([
        {
          id: 'old-1',
          idempotency_key: 'kim-broker:2026-10-06:weekly:legacy:email',
          broker_id: 'kim-broker',
          channel: 'email',
          kind: 'weekly',
          status: 'blocked',
          blocked_reason: 'QUIET_HOURS',
          created_at: NOW_ISO,
        },
      ]);
      const res = await sendGate(
        {
          subscriber: consentedSubscriber({ channel: 'email' }),
          channel: 'email',
          editionKey: 'kim-broker:2026-10-06:weekly',
          idempotencyKey: 'kim-broker:2026-10-06:weekly:legacy:email',
          brokerId: 'kim-broker',
          kind: 'weekly',
          rendered: {
            subject: '(광고) 주간',
            body: '<p>본문</p>',
            hasUnsubscribeLink: true,
            hasAdLabel: true,
            senderName: '김중개',
            senderContact: '010-0000-1111',
          },
        },
        { supabase: db as never, now: DAYTIME, dryRun: false },
      );
      expect(res).toMatchObject({ ok: true, dispatchId: 'old-1', dryRun: false });
      expect(ledgerRow(db, 'old-1').status).toBe('sent');
      const { reclaimed } = await reclaimStaleQueuedDispatches(db as never, { now: DAYTIME });
      expect(reclaimed).toBe(0);
    });
  });
});
