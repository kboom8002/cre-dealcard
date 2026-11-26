import { getBrokerSubscriptionTier, type SubscriptionTier } from '@/domain/subscription/tier-gate';
import { hashEmailForSuppression, loadSuppressedEmailHashesForBroker } from '@/lib/legal/email-suppression';
import { addDays, isQuietHoursKst, kstParts, toKstDate, todayKst } from '@/lib/magazine/kst';
import { isMagazineSendDryRun, isMagazineSendEnabled, SEND_DISABLED_MESSAGE } from '@/lib/magazine/send-flags';
import { isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';
import { recordFunnelEvent } from '@/lib/observability/funnel-slo';
import type { DistributeMagazineEditionInput } from './distribute-magazine';
import {
  BATCH_429_BASE_DELAY_MS,
  BATCH_429_MAX_RETRIES,
  BATCH_CONCURRENCY,
  BATCH_PACE_MS,
  buildEditionUrl,
  emptyTally,
  hydrateEditionForOutboundEmail,
  isRateLimitErrorDetail,
  loadActiveSubscribers,
  loadBrokerIdentity,
  mergeHydratedEdition,
  planTargets,
  renderFor,
  resolveBaseUrl,
  segmentMatches,
  SUBSCRIBER_COLUMNS,
  SUBSCRIBER_COLUMNS_PRECUTOVER,
  type BrokerIdentity,
  type HydratedOutboundEdition,
  type RunContext,
  type SubscriberRow,
} from './send-batch';
import {
  buildIdempotencyKey,
  casUpdateLedger,
  checkFlashWeeklyCap,
  DISPATCH_LEDGER_TABLE,
  hashRecipient,
  isMissingLedgerColumn,
  normalizeRecipient,
  reclaimStaleQueuedDispatches,
  sendGate,
  type GateBlockReason,
  type GateChannel,
  type GateDeps,
  type GateKind,
  type GateRendered,
} from './send-gate';
import { KAKAO_TEMPLATE_WEEKLY_ISSUE } from './templates/kakao-template-codes';
import type { MagazineDbClient } from './types';
import { buildUnsubscribeUrl, issueUnsubToken } from './unsub-token';

const log = createModuleLogger('magazine-distribute-queue');
const ENQUEUE_CHUNK_SIZE = 200;
const MAX_DISPATCH_ATTEMPTS = 5;

/** 워커 1 tick 기본 배치. 60s maxDuration 안에서 페이싱(≈2 req/s)으로 소화 가능한 크기 */
export const WORKER_DEFAULT_BATCH_SIZE = 80;
/**
 * 워커는 행을 순차 처리한다. 동기 경로(send-batch: BATCH_CONCURRENCY건 / BATCH_PACE_MS)와 같은 처리율
 * 상한(≈ Resend 2 req/s 플랜)을 지키도록 provider 호출 간 최소 간격을 둔다.
 */
export const WORKER_PACE_MS = Math.ceil(BATCH_PACE_MS * BATCH_CONCURRENCY);
/** cron maxDuration=60s — 45s 이후로는 새 행을 점유하지 않는다(남은 행은 다음 tick) */
export const WORKER_TIME_BUDGET_MS = 45_000;

function isQueueSchemaMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  if (isMissingLedgerColumn(e)) return true;
  // 000003 이전 status CHECK 제약(pending_worker/retryable 미허용)
  return e.code === '23514' && /status/i.test(e.message ?? '');
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export interface EnqueueDispatchResult {
  ok: boolean;
  asyncQueued: boolean;
  /** D2: 대기열 스키마(000003) 미적용 — 호출부는 동기 발송(distributeMagazine)으로 폴백해야 한다 */
  queueUnavailable?: boolean;
  scheduleUnsupported?: boolean;
  blockedReason?: 'SEND_DISABLED' | 'SCHEDULE_UNAVAILABLE' | GateBlockReason;
  message?: string;
  scheduledForIso?: string;
  dryRun: boolean;
  subscriberCount: number;
  total: number;
  queued: number;
  sent: number;
  recorded: number;
  failed: number;
  blocked: Record<string, number>;
  isPaidTier: boolean;
  tier: SubscriptionTier;
}

interface QueuedPayload {
  subscriberId: string;
  issueId: string | null;
  brokerId: string;
  channel: GateChannel;
  editionKey: string;
  editionUrl: string;
  title: string;
  headline: string;
  marketTemp: string;
  date: string;
  cadence?: string;
  kakaoTemplateId: string;
  // 레거시 큐 잔여 행 호환 전용(신규 enqueue는 원문 PII를 payload에 저장하지 않는다)
  sub?: SubscriberRow;
}

export async function enqueueMagazineDispatch(
  supabase: MagazineDbClient,
  brokerId: string,
  edition: DistributeMagazineEditionInput,
  deps: { now?: Date; dryRun?: boolean; scheduledForIso?: string } = {},
): Promise<EnqueueDispatchResult> {
  const dryRun = deps.dryRun ?? isMagazineSendDryRun();
  if (!isMagazineSendEnabled()) {
    return {
      ok: false,
      asyncQueued: false,
      blockedReason: 'SEND_DISABLED',
      message: SEND_DISABLED_MESSAGE,
      dryRun,
      subscriberCount: 0,
      total: 0,
      queued: 0,
      sent: 0,
      recorded: 0,
      failed: 0,
      blocked: {},
      isPaidTier: false,
      tier: 'free',
    };
  }

  const broker = await loadBrokerIdentity(supabase, brokerId);
  if (!broker) throw new Error(`브로커 프로필을 찾을 수 없습니다: ${brokerId}`);

  const brokerKeys = [broker.slug, broker.userId].filter((k): k is string => Boolean(k));
  const rawSubscribers = await loadActiveSubscribers(supabase, brokerKeys);
  const target = edition.target ?? 'all';
  const subscribers = rawSubscribers.filter((s) => segmentMatches(target, s.segment));
  const { tier, isPaid } = await getBrokerSubscriptionTier(supabase, broker.userId ?? '');

  const tally = emptyTally();
  const targets = planTargets(subscribers, { allowKakao: isPaid }, tally);

  const issueDate = edition.date || todayKst(deps.now);
  const rawId = edition.id?.trim() ?? '';
  const rawType = edition.editionType?.trim() ?? '';
  const isUuidEditionId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawId);
  const baseSlot = rawType || (rawId ? 'weekly' : 'issue');
  const slotToken = isUuidEditionId ? `${baseSlot}:${rawId}` : rawType ? `${rawType}${rawId ? `:${rawId}` : ''}` : baseSlot;
  const editionKey = `${broker.slug}:${issueDate}:${slotToken}`;
  const kind: GateKind = rawType === 'special' ? 'flash' : 'weekly';

  if (kind === 'flash') {
    const cap = await checkFlashWeeklyCap(
      supabase,
      { brokerId: broker.slug, editionId: edition.id ?? null },
      { now: deps.now, dryRun },
    );
    if (!cap.ok) {
      return {
        ok: false,
        asyncQueued: false,
        blockedReason: cap.blocked,
        message: '속보 발송은 주 2회까지 가능합니다.',
        dryRun,
        subscriberCount: subscribers.length,
        total: targets.length,
        queued: 0,
        sent: 0,
        recorded: 0,
        failed: 0,
        blocked: { ...tally.blocked, [cap.blocked]: targets.length },
        isPaidTier: isPaid,
        tier,
      };
    }
  }

  const baseUrl = resolveBaseUrl();
  // P2-1: 발송 링크가 이 에디션을 가리키도록 ?edition=<uuid> (+ ?target= 보존)
  const editionUrl = buildEditionUrl(baseUrl, broker.slug, issueDate, { editionId: edition.id, target });
  const nowIso = (deps.now ?? new Date()).toISOString();
  const scheduledForIso = deps.scheduledForIso?.trim() || undefined;

  const issueUuid = edition.id && isUuid(edition.id) ? edition.id : null;
  const rowsToQueue = targets.map((t) => {
    const rawRecipient = t.channel === 'email' ? t.sub.subscriber_email : t.sub.subscriber_phone;
    const recipientHash = hashRecipient(normalizeRecipient(rawRecipient));
    const idempotencyKey = buildIdempotencyKey(editionKey, recipientHash || t.sub.id, t.channel);
    const payload: QueuedPayload = {
      subscriberId: t.sub.id,
      issueId: issueUuid,
      brokerId: broker.slug,
      channel: t.channel,
      editionKey,
      editionUrl,
      title: edition.title,
      headline: edition.headline ?? '',
      marketTemp: edition.market_temp ?? '',
      date: issueDate,
      ...(rawType ? { cadence: rawType } : {}),
      kakaoTemplateId: KAKAO_TEMPLATE_WEEKLY_ISSUE,
    };
    return {
      idempotency_key: idempotencyKey,
      edition_id: issueUuid,
      broker_id: broker.slug,
      broker_user_id: broker.userId && isUuid(broker.userId) ? broker.userId : null,
      subscriber_id: isUuid(t.sub.id) ? t.sub.id : null,
      channel: t.channel,
      kind,
      status: scheduledForIso ? 'retryable' : 'pending_worker',
      ...(scheduledForIso
        ? { next_attempt_at: scheduledForIso, blocked_reason: 'SCHEDULED_0830' }
        : {}),
      attempt_count: 0,
      recipient_hash: recipientHash,
      queued_at: nowIso,
      updated_at: nowIso,
      payload,
    };
  });

  let queued = 0;
  for (let i = 0; i < rowsToQueue.length; i += ENQUEUE_CHUNK_SIZE) {
    const chunk = rowsToQueue.slice(i, i + ENQUEUE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from(DISPATCH_LEDGER_TABLE)
      .upsert(chunk, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('id');
    if (error) {
      if (scheduledForIso && (isMissingLedgerColumn(error) || isQueueSchemaMissing(error))) {
        log.warn('[Queue] scheduled dispatch queue schema unavailable — failing closed', {
          code: (error as { code?: string }).code,
        });
        return {
          ok: false,
          asyncQueued: false,
          queueUnavailable: true,
          scheduleUnsupported: true,
          blockedReason: 'SCHEDULE_UNAVAILABLE',
          message:
            '오전 08:30 예약 발송 대기열 스키마가 준비되지 않아 예약을 등록할 수 없습니다. 잠시 후 다시 시도하거나 즉시 발송을 이용해 주세요.',
          dryRun,
          subscriberCount: subscribers.length,
          total: targets.length,
          queued: 0,
          sent: 0,
          recorded: 0,
          failed: 0,
          blocked: tally.blocked,
          isPaidTier: isPaid,
          tier,
        };
      }
      // D2 사전 컷오버: 000003(payload/attempt_count/queued_at/updated_at·pending_worker 상태) 미적용이면
      // 첫 청크부터 실패한다 → 대기열 불가를 알려 호출부가 기존 동기 발송 경로로 폴백하게 한다.
      if (queued === 0 && i === 0 && isQueueSchemaMissing(error)) {
        log.warn('[Queue] dispatch queue schema unavailable (pre-cutover) — caller should fall back to sync send', {
          code: (error as { code?: string }).code,
        });
        return {
          ok: false,
          asyncQueued: false,
          queueUnavailable: true,
          dryRun,
          subscriberCount: subscribers.length,
          total: targets.length,
          queued: 0,
          sent: 0,
          recorded: 0,
          failed: 0,
          blocked: tally.blocked,
          isPaidTier: isPaid,
          tier,
        };
      }
      throw new Error(`발송 대기열 등록 실패: ${error.message}`);
    }
    queued += Array.isArray(data) ? data.length : chunk.length;
  }

  if (broker.userId && isUuid(broker.userId)) {
    await supabase
      .from('activity_events')
      .insert({
        actor_id: broker.userId,
        actor_role: 'broker',
        event_type: 'magazine_distributed',
        entity_type: 'magazine_editions',
        metadata: {
          broker_id: broker.slug,
          issue_date: issueDate,
          dry_run: dryRun,
          async_queued: true,
          ...(scheduledForIso ? { scheduled_for_iso: scheduledForIso } : {}),
          total: targets.length,
          total_count: targets.length,
          subscriber_count: subscribers.length,
          queued_count: queued,
          sent_count: 0,
          failed_count: 0,
          blocked: tally.blocked,
        },
      })
      .then(() => undefined, () => undefined);
  }

  log.info(`[Queue] Enqueued ${queued}/${targets.length} targets (${subscribers.length} subscribers) for ${broker.slug}`);
  return {
    ok: true,
    asyncQueued: true,
    ...(scheduledForIso ? { scheduledForIso } : {}),
    dryRun,
    subscriberCount: subscribers.length,
    total: targets.length,
    queued,
    sent: 0,
    recorded: 0,
    failed: 0,
    blocked: tally.blocked,
    isPaidTier: isPaid,
    tier,
  };
}

export interface ProcessDispatchWorkerResult {
  reclaimed: number;
  fetched: number;
  sent: number;
  recorded: number;
  blocked: number;
  failed: number;
  /**
   * 이번 tick 에 처리하지 않고 다음 tick 으로 넘긴 행 수 (P1-2):
   * 시간 예산 초과로 점유하지 않은 행 · 다른 tick 이 먼저 점유한 행 · 429 로 재시도 대기(retryable)된 행.
   */
  deferred: number;
}

/** 다음 KST 오전 08:00 시각을 UTC ISO 문자열로 반환 (QUIET_HOURS 보류 재개 시각) */
export function computeNextKst0800Iso(now: Date = new Date()): string {
  const parts = kstParts(now);
  const kstDay = toKstDate(now);
  const targetDay = parts.hour < 8 ? kstDay : addDays(kstDay, 1);
  return new Date(`${targetDay}T08:00:00+09:00`).toISOString();
}

/** 다음 KST 오전 08:30 시각을 UTC ISO 문자열로 반환 (08:30 예약 발송 시각) */
export function computeNextKst0830Iso(now: Date = new Date()): string {
  const parts = kstParts(now);
  const kstDay = toKstDate(now);
  const before0830 = parts.hour < 8 || (parts.hour === 8 && parts.minute < 30);
  const targetDay = before0830 ? kstDay : addDays(kstDay, 1);
  return new Date(`${targetDay}T08:30:00+09:00`).toISOString();
}

export async function processMagazineDispatchQueueBatch(
  supabase: MagazineDbClient,
  opts: {
    batchSize?: number;
    now?: Date;
    gateDeps?: GateDeps & { bypassQuietHours?: boolean };
    /** provider 호출 간 최소 간격(ms). 기본 WORKER_PACE_MS. 테스트는 0 */
    paceMs?: number;
    /** 새 행 점유를 멈추는 경과 시간(ms). 기본 WORKER_TIME_BUDGET_MS */
    timeBudgetMs?: number;
    /** 429 백오프 기본 지연(ms). 기본 BATCH_429_BASE_DELAY_MS */
    rateLimitBaseDelayMs?: number;
    /** 경과 시간 측정용 시계(테스트 주입). 기본 Date.now */
    clock?: () => number;
  } = {},
): Promise<ProcessDispatchWorkerResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const batchSize = Math.max(1, Math.min(200, opts.batchSize ?? WORKER_DEFAULT_BATCH_SIZE));
  const paceMs = Math.max(0, opts.paceMs ?? WORKER_PACE_MS);
  const timeBudgetMs = Math.max(0, opts.timeBudgetMs ?? WORKER_TIME_BUDGET_MS);
  const rateLimitBaseDelayMs = Math.max(0, opts.rateLimitBaseDelayMs ?? BATCH_429_BASE_DELAY_MS);
  const clock = opts.clock ?? (() => Date.now());
  const startedAt = clock();
  const { bypassQuietHours = false, ...sendGateDeps } = opts.gateDeps ?? {};
  const effectiveDryRun = sendGateDeps.dryRun ?? isMagazineSendDryRun();
  const quietHoursActive = !bypassQuietHours && isQuietHoursKst(now);
  const { reclaimed } = await reclaimStaleQueuedDispatches(supabase, { staleMinutes: 15, now });

  let hasBlockedReasonCol = true;
  const COLS_WITH_BLOCKED =
    'id, idempotency_key, edition_id, broker_id, broker_user_id, subscriber_id, channel, kind, status, blocked_reason, attempt_count, updated_at, payload';
  const COLS_BASE =
    'id, idempotency_key, edition_id, broker_id, broker_user_id, subscriber_id, channel, kind, status, attempt_count, updated_at, payload';

  const isBlockedReasonMissingErr = (err: unknown) => {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; message?: string };
    return e.code === '42703' || /blocked_reason/i.test(e.message ?? '');
  };

  interface QueueQueryChain
    extends PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> {
    select: (cols: string) => QueueQueryChain;
    eq: (col: string, val: string) => QueueQueryChain;
    or?: (expr: string) => QueueQueryChain;
    order: (col: string, opts: { ascending: boolean }) => QueueQueryChain;
    limit: (n: number) => QueueQueryChain;
  }

  // 0) Wave 2A: `claim_magazine_dispatch_batch` (FOR UPDATE SKIP LOCKED) 원자적 일괄 점유 우선 시도.
  //    rpc 미구현(단위 테스트 FakeDb)·미적용(PGRST202/42883)·에러 시 기존 조회 + 행별 CAS 경로로 100% 폴백한다.
  let claimedViaRpc = false;
  let fetchErr: { code?: string; message?: string } | null = null;
  const combinedRows: unknown[] = [];

  const rpcClient = supabase as unknown as {
    rpc?: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };

  if (typeof rpcClient.rpc === 'function') {
    try {
      const rpcRes = await rpcClient.rpc('claim_magazine_dispatch_batch', {
        p_limit: batchSize,
        p_now: nowIso,
      });
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        claimedViaRpc = true;
        combinedRows.push(...rpcRes.data);
      } else if (rpcRes.error) {
        log.debug('[Worker] claim_magazine_dispatch_batch unavailable, falling back to CAS query', {
          code: rpcRes.error.code,
          message: rpcRes.error.message,
        });
      }
    } catch (rpcErr) {
      log.debug('[Worker] claim_magazine_dispatch_batch threw, falling back to CAS query', {
        error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
      });
    }
  }

  if (!claimedViaRpc) {
    // 1) pending_worker 우선 디큐 — 야간 보류된 retryable 행이 신규/야간동의 발송을 굶기지 않도록 분리
    const fetchPendingWorker = async (cols: string) =>
      (supabase.from(DISPATCH_LEDGER_TABLE) as unknown as QueueQueryChain)
        .select(cols)
        .eq('status', 'pending_worker')
        .order('created_at', { ascending: true })
        .limit(batchSize);

    let pwRes = await fetchPendingWorker(COLS_WITH_BLOCKED);
    if (pwRes.error && isBlockedReasonMissingErr(pwRes.error)) {
      hasBlockedReasonCol = false;
      pwRes = await fetchPendingWorker(COLS_BASE);
    }

    fetchErr = pwRes.error;
    if (Array.isArray(pwRes.data)) {
      combinedRows.push(...pwRes.data);
    }

    // 2) 남은 배치 여유분만큼 next_attempt_at 이 도래(또는 null)한 retryable 행 조회
    const remainingSlots = batchSize - combinedRows.length;
    if (!fetchErr && remainingSlots > 0) {
      const fetchDueRetryable = async (cols: string, withNextAttemptFilter: boolean) => {
        let q = (supabase.from(DISPATCH_LEDGER_TABLE) as unknown as QueueQueryChain)
          .select(cols)
          .eq('status', 'retryable');
        if (withNextAttemptFilter && typeof q.or === 'function') {
          q = q.or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);
        }
        return q.order('created_at', { ascending: true }).limit(remainingSlots);
      };

      const cols = hasBlockedReasonCol ? COLS_WITH_BLOCKED : COLS_BASE;
      let rRes = await fetchDueRetryable(cols, true);
      if (rRes.error && isBlockedReasonMissingErr(rRes.error)) {
        hasBlockedReasonCol = false;
        rRes = await fetchDueRetryable(COLS_BASE, true);
      }
      if (
        rRes.error &&
        ((rRes.error as { code?: string }).code === '42703' ||
          /next_attempt_at/i.test(rRes.error.message ?? ''))
      ) {
        rRes = await fetchDueRetryable(hasBlockedReasonCol ? COLS_WITH_BLOCKED : COLS_BASE, false);
      }
      if (rRes.error) {
        fetchErr = rRes.error;
      } else if (Array.isArray(rRes.data)) {
        const seenIds = new Set(
          combinedRows
            .map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
            .filter((v): v is string => typeof v === 'string' && v.length > 0),
        );
        for (const item of rRes.data) {
          const itemId =
            item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
          if (typeof itemId === 'string' && itemId.length > 0) {
            if (seenIds.has(itemId)) continue;
            seenIds.add(itemId);
          }
          combinedRows.push(item);
        }
      }
    }
  }

  const pendingRows = combinedRows;

  if (fetchErr && isQueueSchemaMissing(fetchErr)) {
    // D2 사전 컷오버(000003 미적용): 대기열 자체가 없으므로 처리할 행도 없다 — 매 분 500 을 내지 않는다.
    log.warn('[Worker] dispatch queue schema unavailable (pre-cutover) — nothing to process', {
      code: (fetchErr as { code?: string }).code,
    });
    return { reclaimed, fetched: 0, sent: 0, recorded: 0, blocked: 0, failed: 0, deferred: 0 };
  }

  if (fetchErr) {
    throw new Error(`발송 대기열 조회 실패: ${fetchErr.message}`);
  }

  const rows = (Array.isArray(pendingRows) ? pendingRows : []) as Array<{
    id: string;
    idempotency_key: string;
    edition_id: string | null;
    broker_id: string;
    broker_user_id: string | null;
    subscriber_id: string | null;
    channel: GateChannel;
    kind: GateKind;
    status?: string | null;
    blocked_reason?: string | null;
    attempt_count?: number | null;
    updated_at?: string | null;
    payload?: QueuedPayload | null;
  }>;

  const subscriberMap = new Map<string, SubscriberRow>();
  const subIdsToHydrate = Array.from(
    new Set(
      rows
        .map((r) => r.subscriber_id || r.payload?.subscriberId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ),
  );
  if (subIdsToHydrate.length > 0) {
    let subSelectCols = SUBSCRIBER_COLUMNS;
    for (let i = 0; i < subIdsToHydrate.length; i += ENQUEUE_CHUNK_SIZE) {
      const idChunk = subIdsToHydrate.slice(i, i + ENQUEUE_CHUNK_SIZE);
      let { data: subRows, error: subErr } = await supabase
        .from('magazine_subscribers')
        .select(subSelectCols)
        .in('id', idChunk);
      if (
        subErr &&
        subSelectCols === SUBSCRIBER_COLUMNS &&
        (subErr.code === '42703' ||
          subErr.code === 'PGRST204' ||
          /column .* does not exist|could not find the '.*' column|schema cache/i.test(
            subErr.message ?? '',
          ))
      ) {
        subSelectCols = SUBSCRIBER_COLUMNS_PRECUTOVER;
        ({ data: subRows, error: subErr } = await supabase
          .from('magazine_subscribers')
          .select(subSelectCols)
          .in('id', idChunk));
      }
      if (subErr) {
        throw new Error(`발송 대상 구독자 조회 실패: ${subErr.message}`);
      }
      for (const s of (Array.isArray(subRows) ? subRows : []) as SubscriberRow[]) {
        if (s?.id) subscriberMap.set(s.id, s);
      }
    }
  }

  const brokerCache = new Map<string, BrokerIdentity | null>();
  const suppressionCache = new Map<string, Set<string>>();
  const editionHydrationCache = new Map<string, HydratedOutboundEdition>();
  const baseUrl = resolveBaseUrl();
  let sent = 0;
  let recorded = 0;
  let blocked = 0;
  let failed = 0;
  let deferred = 0;
  let lastProviderCallAt: number | null = null;
  let rateLimitStrikes = 0;

  /** 점유(status='queued') 이후의 종결 갱신 — 내 점유가 유지되는 동안에만(status='queued') 반영한다. */
  const settleClaimed = async (rowId: string, patch: Record<string, unknown>) => {
    const effectivePatch: Record<string, unknown> = { ...patch };
    if (!hasBlockedReasonCol) delete effectivePatch.blocked_reason;
    const first = await casUpdateLedger(
      (p) => supabase.from(DISPATCH_LEDGER_TABLE).update(p).eq('id', rowId).eq('status', 'queued'),
      effectivePatch,
      ['next_attempt_at'],
    );
    if (first.error && isMissingLedgerColumn(first.error)) {
      const withoutNext = { ...effectivePatch };
      delete withoutNext.next_attempt_at;
      await casUpdateLedger(
        (p) => supabase.from(DISPATCH_LEDGER_TABLE).update(p).eq('id', rowId).eq('status', 'queued'),
        withoutNext,
        ['blocked_reason'],
      );
    }
  };

  /** RPC 일괄 점유 후 시간 예산·429 조기 중단으로 미처리된 행을 즉시 반환해 15분 고착을 방지한다. */
  const releaseUnprocessedClaimed = async (unprocessed: typeof rows) => {
    if (!claimedViaRpc || unprocessed.length === 0) return;
    const pendingIds = unprocessed
      .filter((r) => (r.attempt_count ?? 0) === 0 && !r.blocked_reason)
      .map((r) => r.id);
    const retryableIds = unprocessed
      .filter((r) => !((r.attempt_count ?? 0) === 0 && !r.blocked_reason))
      .map((r) => r.id);
    if (pendingIds.length > 0) {
      await supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({ status: 'pending_worker', updated_at: nowIso })
        .in('id', pendingIds)
        .eq('status', 'queued');
    }
    if (retryableIds.length > 0) {
      await supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({ status: 'retryable', updated_at: nowIso })
        .in('id', retryableIds)
        .eq('status', 'queued');
    }
  };

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];

    // P1-2 페이싱: provider 호출 간 최소 간격(≈2 req/s) — 동기 경로(send-batch)와 같은 처리율 상한
    if (lastProviderCallAt !== null && paceMs > 0) {
      const waitMs = paceMs - (clock() - lastProviderCallAt);
      if (waitMs > 0) await sleep(waitMs);
    }
    // P1-2 시간 예산: maxDuration(60s) 전에 새 점유를 멈춘다. 남은 행은 상태 그대로 다음 tick 이 처리.
    if (clock() - startedAt >= timeBudgetMs) {
      await releaseUnprocessedClaimed(rows.slice(idx));
      deferred += rows.length - idx;
      log.info('[Worker] time budget reached — deferring remaining rows to next tick', { remaining: rows.length - idx });
      break;
    }

    const prevAttempts =
      typeof row.attempt_count === 'number' && Number.isFinite(row.attempt_count) && row.attempt_count >= 0
        ? row.attempt_count
        : 0;

    // 야간 발송 제한 시간대(21:00~08:00 KST)에는 이미 보류된 행(retryable / QUIET_HOURS)을 재평가하지 않고 건너뛰어
    // 재시도 예산을 소모하지 않는다.
    if (
      quietHoursActive &&
      (row.status === 'retryable' || row.blocked_reason === 'QUIET_HOURS')
    ) {
      if (claimedViaRpc) {
        await settleClaimed(row.id, {
          status: 'retryable',
          error: 'quiet_hours_deferred',
          attempt_count: prevAttempts,
          updated_at: nowIso,
          blocked_reason: 'QUIET_HOURS',
          next_attempt_at: computeNextKst0800Iso(now),
        });
      }
      blocked += 1;
      continue;
    }

    if (prevAttempts >= MAX_DISPATCH_ATTEMPTS) {
      await supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({
          status: 'failed',
          attempt_count: MAX_DISPATCH_ATTEMPTS,
          error: 'max_retry_attempts_exceeded',
          updated_at: nowIso,
        })
        .eq('id', row.id)
        .in('status', claimedViaRpc ? ['queued', 'pending_worker', 'retryable'] : ['pending_worker', 'retryable']);
      failed += 1;
      continue;
    }

    const nextAttemptCount = prevAttempts + 1;

    // P1-1 원자적 점유(CAS): RPC(`claim_magazine_dispatch_batch`)로 이미 점유된 경우에는 중복 왕복을 생략하고,
    // 폴백 경로에서만 행별 CAS 를 수행한다.
    if (!claimedViaRpc) {
      let claimQ = supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({ status: 'queued', attempt_count: nextAttemptCount, updated_at: nowIso })
        .eq('id', row.id);
      claimQ = row.status ? claimQ.eq('status', row.status) : claimQ.in('status', ['pending_worker', 'retryable']);
      if (typeof row.attempt_count === 'number') claimQ = claimQ.eq('attempt_count', row.attempt_count);
      const claim = await claimQ.select('id').maybeSingle();
      if (claim.error) {
        log.warn('[Worker] claim failed — leaving row for next tick', { id: row.id, code: (claim.error as { code?: string }).code });
        deferred += 1;
        continue;
      }
      if (!claim.data) {
        // 다른 tick 이 먼저 점유(또는 상태 변경) — 이 tick 은 손대지 않는다.
        deferred += 1;
        continue;
      }
    }

    if ((row.kind || 'weekly') === 'flash') {
      const cap = await checkFlashWeeklyCap(
        supabase,
        { brokerId: row.broker_id, editionId: row.edition_id },
        { now, dryRun: sendGateDeps.dryRun },
      );
      if (!cap.ok) {
        await settleClaimed(row.id, {
          status: 'blocked',
          blocked_reason: cap.blocked,
          attempt_count: nextAttemptCount,
          updated_at: nowIso,
        });
        blocked += 1;
        continue;
      }
    }

    let broker = brokerCache.get(row.broker_id);
    if (broker === undefined) {
      broker = await loadBrokerIdentity(supabase, row.broker_user_id || row.broker_id);
      brokerCache.set(row.broker_id, broker);
    }
    const hydratedSubId = row.subscriber_id || row.payload?.subscriberId || null;
    const hydratedSub = hydratedSubId ? subscriberMap.get(hydratedSubId) : undefined;
    const sourceSub = hydratedSub ?? row.payload?.sub;

    if (!broker || !row.payload || !sourceSub) {
      await settleClaimed(row.id, {
        status: 'blocked',
        blocked_reason: !broker || !row.payload ? 'MISSING_SENDER' : 'SUBSCRIBER_NOT_FOUND',
        error: !broker || !row.payload ? 'worker payload/broker missing' : 'subscriber record missing or purged',
        attempt_count: nextAttemptCount,
        updated_at: nowIso,
      });
      blocked += 1;
      continue;
    }

    const suppKey = broker.userId || row.broker_user_id || row.broker_id;
    let suppressedHashes = suppressionCache.get(suppKey);
    if (!suppressedHashes) {
      suppressedHashes = await loadSuppressedEmailHashesForBroker(supabase, broker.userId || row.broker_user_id);
      suppressionCache.set(suppKey, suppressedHashes);
    }

    const subSnapshot: SubscriberRow = { ...sourceSub };
    if (row.channel === 'email' && subSnapshot.subscriber_email) {
      const h = hashEmailForSuppression(subSnapshot.subscriber_email);
      if (h && suppressedHashes.has(h)) {
        subSnapshot.suppressed = true;
      }
    }

    let unsubscribeUrl = '';
    try {
      if (!baseUrl) throw new Error('APP_BASE_URL is empty');
      const token = issueUnsubToken({
        subscriberId: subSnapshot.id,
        brokerId: broker.userId ?? broker.slug,
      });
      unsubscribeUrl = buildUnsubscribeUrl(baseUrl, token);
    } catch {
      await settleClaimed(row.id, {
        status: 'blocked',
        blocked_reason: 'MISSING_UNSUB_LINK',
        attempt_count: nextAttemptCount,
        updated_at: nowIso,
      });
      blocked += 1;
      continue;
    }

    let hydratedEdition: HydratedOutboundEdition = {};
    if (row.edition_id && isUuid(row.edition_id)) {
      const cachedHydrated = editionHydrationCache.get(row.edition_id);
      if (cachedHydrated !== undefined) {
        hydratedEdition = cachedHydrated;
      } else {
        hydratedEdition = await hydrateEditionForOutboundEmail(supabase, row.edition_id);
        editionHydrationCache.set(row.edition_id, hydratedEdition);
      }
    }

    const ctx: RunContext = {
      supabase,
      broker,
      kind: row.kind || 'weekly',
      editionKey: row.payload.editionKey,
      editionId: row.edition_id,
      baseUrl,
      edition: mergeHydratedEdition(
        {
          title: row.payload.title,
          headline: row.payload.headline,
          marketTemp: row.payload.marketTemp,
          date: row.payload.date,
          cadence: row.payload.cadence || (row.kind === 'flash' ? 'special' : undefined),
          url: row.payload.editionUrl,
        },
        hydratedEdition,
        { preferHydrated: true },
      ),
      kakaoTemplateId: row.payload.kakaoTemplateId || KAKAO_TEMPLATE_WEEKLY_ISSUE,
    };

    let rendered: GateRendered;
    try {
      rendered = renderFor(ctx, { sub: subSnapshot, channel: row.channel }, unsubscribeUrl);
    } catch {
      await settleClaimed(row.id, {
        status: 'failed',
        attempt_count: nextAttemptCount,
        error: 'render failed in worker',
        updated_at: nowIso,
      });
      failed += 1;
      continue;
    }

    const res = await sendGate(
      {
        subscriber: subSnapshot,
        channel: row.channel,
        editionId: row.edition_id,
        editionKey: row.payload.editionKey,
        idempotencyKey: row.idempotency_key,
        brokerId: row.broker_id,
        brokerUserId: row.broker_user_id,
        kind: row.kind || 'weekly',
        rendered,
      },
      { supabase, now, ...sendGateDeps, claimedDispatchId: row.id },
    );

    // provider 가 실제로 호출된 경우(실발송 성공/실패)만 페이싱 기준 시각을 갱신한다.
    if (!effectiveDryRun && ((res.ok && !res.dryRun) || (!res.ok && (res.failed || res.blocked === 'PROVIDER_FAILED')))) {
      lastProviderCallAt = clock();
    }

    if (res.ok) {
      rateLimitStrikes = 0;
      let okQ = supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({
          status: res.dryRun ? 'dry_run' : 'sent',
          attempt_count: nextAttemptCount,
          updated_at: nowIso,
        })
        .eq('id', row.id);
      if (typeof (okQ as { in?: unknown }).in === 'function') {
        okQ = okQ.in('status', res.dryRun ? ['queued', 'dry_run'] : ['queued', 'sent']);
      } else if (typeof (okQ as { eq?: unknown }).eq === 'function') {
        okQ = okQ.eq('status', 'queued');
      }
      await okQ;
      if (res.dryRun) recorded += 1;
      else sent += 1;
    } else if (res.blocked === 'QUIET_HOURS') {
      // 야간 발송 제한 시간대(21:00~08:00 KST)에는 재시도 횟수(attempt_count)를 차감하지 않고
      // status='retryable'을 유지한다. 08:00 KST 이후 남은 재시도 예산으로 정상 발송된다.
      await settleClaimed(row.id, {
        status: 'retryable',
        error: 'quiet_hours_deferred',
        attempt_count: prevAttempts,
        updated_at: nowIso,
        blocked_reason: 'QUIET_HOURS',
        next_attempt_at: computeNextKst0800Iso(now),
      });
      blocked += 1;
    } else if ((res.failed || res.blocked === 'PROVIDER_FAILED') && isRateLimitErrorDetail(res.detail)) {
      // P1-2: provider 429(rate limit)는 영구 실패가 아니다 — retryable 로 되돌리고 재시도 예산(attempt_count)을
      // 소모하지 않는다. 지수 백오프 후 BATCH_429_MAX_RETRIES 회를 넘겨 연속되면 이 tick 의 점유를 멈춘다.
      await casUpdateLedger(
        (p) =>
          supabase
            .from(DISPATCH_LEDGER_TABLE)
            .update(p)
            .eq('id', row.id)
            .in('status', ['failed', 'queued']),
        {
          status: 'retryable',
          attempt_count: prevAttempts,
          error: 'rate_limited_deferred',
          updated_at: nowIso,
          ...(hasBlockedReasonCol ? { blocked_reason: 'RATE_LIMITED' } : {}),
        },
        ['blocked_reason'],
      );
      deferred += 1;
      rateLimitStrikes += 1;
      if (rateLimitStrikes > BATCH_429_MAX_RETRIES) {
        await releaseUnprocessedClaimed(rows.slice(idx + 1));
        deferred += rows.length - idx - 1;
        log.warn('[Worker] provider rate limit persists — halting this tick', { strikes: rateLimitStrikes });
        break;
      }
      const backoffMs = rateLimitBaseDelayMs * Math.pow(2, rateLimitStrikes - 1);
      if (clock() - startedAt + backoffMs < timeBudgetMs) await sleep(backoffMs);
    } else if (res.failed || res.blocked === 'PROVIDER_FAILED') {
      let failQ = supabase
        .from(DISPATCH_LEDGER_TABLE)
        .update({
          status: nextAttemptCount >= MAX_DISPATCH_ATTEMPTS ? 'failed' : 'retryable',
          attempt_count: nextAttemptCount,
          error: (res.detail ?? 'provider_failed').slice(0, 300),
          updated_at: nowIso,
        })
        .eq('id', row.id);
      if (typeof (failQ as { eq?: unknown }).eq === 'function') {
        failQ = failQ.eq('status', 'queued');
      }
      await failQ;
      failed += 1;
    } else if (res.blocked === 'DUPLICATE') {
      // 점유를 잃음(stale 회수 후 다른 tick 이 재점유) — 그 행은 다른 tick 소유이므로 건드리지 않는다.
      blocked += 1;
    } else {
      await settleClaimed(row.id, {
        status: 'blocked',
        blocked_reason: res.blocked ?? 'BLOCKED',
        attempt_count: nextAttemptCount,
        updated_at: nowIso,
      });
      blocked += 1;
    }
  }

  recordFunnelEvent({
    funnel: 'newsletter_dispatch',
    outcome: failed > 0 ? 'degraded' : 'ok',
    meta: {
      reclaimed,
      fetched: rows.length,
      sent,
      recorded,
      blocked,
      failed,
      deferred,
    },
  });

  return { reclaimed, fetched: rows.length, sent, recorded, blocked, failed, deferred };
}
