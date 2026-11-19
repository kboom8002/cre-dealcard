/**
 * @module send-gate
 * @description 매거진 발송 단일 관문 (G-03). 모든 이메일·알림톡은 `sendGate()`만 통과한다.
 *
 * 검사 순서 (먼저 걸린 사유로 차단):
 *   SEND_DISABLED → NOT_ALLOWLISTED → UNSUBSCRIBED / NO_CONSENT / PENDING_CONFIRM / CHANNEL_NOT_CONSENTED
 *   → QUIET_HOURS → MISSING_AD_LABEL / MISSING_UNSUB_LINK / MISSING_SENDER → NO_PROVIDER(실발송만)
 *   → 멱등 원장 insert(DUPLICATE / LEDGER_UNAVAILABLE) → DAILY_CAP → dry-run 기록 | provider 호출 → 원장 갱신
 *
 * 주의
 *  - `NO_CONSENT`가 `PENDING_CONFIRM`보다 먼저다: 동의 기록이 없는 기존 구독자는 NO_CONSENT로 차단되는 것이 정상(법규).
 *  - 원장 테이블(`magazine_dispatch_logs`, 마이그레이션 20261004000005)이 없으면 **발송하지 않는다**(LEDGER_UNAVAILABLE).
 *  - 공유 `email-service`/`notification-service`는 수정하지 않고 `send-providers`를 통해서만 provider를 호출한다.
 */
import { createHash } from 'crypto';
import {
  getMagazineSendAllowlist,
  isMagazineSendDryRun,
  isMagazineSendEnabled,
  type SendBlockReason,
} from '@/lib/magazine/send-flags';
import { isQuietHoursKst, mondayOfWeek, todayKst } from '@/lib/magazine/kst';
import { isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';
import type { MagazineDbClient } from './types';
import {
  hasEmailProvider,
  hasKakaoProvider,
  sendEmailProvider,
  sendKakaoProvider,
} from './send-providers';

export { hasEmailProvider, hasKakaoProvider };

const log = createModuleLogger('magazine-send-gate');

export const DISPATCH_LEDGER_TABLE = 'magazine_dispatch_logs';

/** send-flags.ts의 SendBlockReason + 반송/신고 억제 + 원장 불가 + provider 실패(실패는 blocked 집계가 아닌 failed로 센다) */
export type GateBlockReason = SendBlockReason | 'SUPPRESSED' | 'LEDGER_UNAVAILABLE' | 'PROVIDER_FAILED';

export type GateChannel = 'email' | 'kakao';
export type GateKind = 'weekly' | 'flash';

export interface GateSubscriber {
  id: string;
  subscriber_phone?: string | null;
  subscriber_email?: string | null;
  subscriber_name?: string | null;
  /** 'email' | 'kakao' | 'both' */
  channel?: string | null;
  status?: string | null;
  unsubscribed_at?: string | null;
  marketing_consent_at?: string | null;
  /** 'pending' | 'confirmed' */
  confirm_status?: string | null;
  night_consent?: boolean | null;
  consent_status?: string | null;
  /** 'ok' | 'bounced' | 'complained' */
  email_delivery_status?: string | null;
  suppressed?: boolean;
}

export interface GateRendered {
  /** 이메일 제목 — `(광고)` 포함 필수 */
  subject?: string;
  /** 이메일: html 본문 / 알림톡: 본문 텍스트 */
  body: string;
  /** 이메일 text/plain 대체 본문 */
  text?: string;
  /** List-Unsubscribe, List-Unsubscribe-Post 등 */
  headers?: Record<string, string>;
  hasUnsubscribeLink: boolean;
  hasAdLabel: boolean;
  senderName?: string | null;
  senderContact?: string | null;
  kakao?: { templateId: string; variables?: Record<string, string> };
}

export interface GateInput {
  subscriber: GateSubscriber;
  channel: GateChannel;
  editionId?: string | null;
  /** 멱등 키 접두: `${brokerSlug}:${issueDate}:${kind}` (속보는 `:${editionId}` 추가) */
  editionKey: string;
  /** 명시적 멱등 키 (예: recipient_hash 기반). 생략 시 ${editionKey}:${sub.id}:${channel} */
  idempotencyKey?: string;
  /** 구독자 broker_id 컬럼 값(slug) */
  brokerId: string;
  brokerUserId?: string | null;
  kind: GateKind;
  rendered: GateRendered;
  /** 브로커 일일 상한(메시지 수). MAGAZINE_DAILY_CAP 환경변수가 있으면 그 값이 우선. 둘 다 없으면 상한 미적용 */
  dailyCap?: number;
}

export type GateResult =
  | { ok: true; dispatchId: string; dryRun: boolean }
  | { ok: false; blocked: GateBlockReason; detail?: string; failed?: boolean };

export interface GateDeps {
  supabase?: MagazineDbClient;
  now?: Date;
  /** 테스트용 override. 기본은 isMagazineSendDryRun() */
  dryRun?: boolean;
  /**
   * WP-7.3B P1-1: 비동기 워커가 이미 CAS(`pending_worker|retryable → queued`, `updated_at`=점유 시각)로
   * 점유한 원장 행 id. 지정되면 insert 대신 `status='queued'` 인 그 행만 CAS로 최종 상태로 전이하며,
   * 점유를 잃었으면(다른 tick 이 재점유) DUPLICATE 로 차단한다.
   */
  claimedDispatchId?: string;
}

interface DbErr {
  code?: string;
  message?: string;
}

function isLedgerMissing(err: DbErr | null | undefined): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''));
}

/** 컬럼 미존재(사전 컷오버: 000003 미적용 시 updated_at 등) — 42703 / PGRST204 */
export function isMissingLedgerColumn(err: DbErr | null | undefined): boolean {
  return (
    !!err &&
    (err.code === '42703' ||
      err.code === 'PGRST204' ||
      /column .* does not exist|could not find the '.*' column/i.test(err.message ?? ''))
  );
}

/**
 * CAS update 를 실행하고, 사전 컷오버 DB 에서 선택 컬럼(`updated_at`, `blocked_reason` 등)이 없어 실패하면
 * 그 컬럼들을 뺀 patch 로 한 번 재시도한다. 첫 시도는 에러로 끝났으므로 재시도는 안전하다.
 */
export async function casUpdateLedger(
  run: (patch: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbErr | null }>,
  patch: Record<string, unknown>,
  optionalKeys: readonly string[] = ['updated_at', 'blocked_reason', 'error'],
): Promise<{ data: unknown; error: DbErr | null }> {
  const first = await run(patch);
  if (!first.error || !isMissingLedgerColumn(first.error)) return first;
  const reduced: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (!optionalKeys.includes(k)) reduced[k] = v;
  return run(reduced);
}

function isUniqueViolation(err: DbErr | null | undefined): boolean {
  return !!err && (err.code === '23505' || /duplicate key/i.test(err.message ?? ''));
}

/** 수신자 정규화 — allowlist 비교용 (이메일 소문자 / 전화 숫자만, +82 → 0) */
export function normalizeRecipient(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('@')) return s;
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function recipientOf(sub: GateSubscriber, channel: GateChannel): string {
  return channel === 'email' ? (sub.subscriber_email ?? '') : (sub.subscriber_phone ?? '');
}

export function hashRecipient(input: string): string {
  const normalized = normalizeRecipient(input);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function buildIdempotencyKey(editionKey: string, subscriberId: string, channel: GateChannel): string {
  return `${editionKey}:${subscriberId}:${channel}`;
}

function resolveDailyCap(input: GateInput): number | null {
  const envRaw = process.env.MAGAZINE_DAILY_CAP;
  if (envRaw) {
    const n = Number.parseInt(envRaw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return typeof input.dailyCap === 'number' && Number.isFinite(input.dailyCap) ? input.dailyCap : null;
}

function kstDayStartIso(now: Date): string {
  return `${todayKst(now)}T00:00:00+09:00`;
}

/** 순수 검사(DB 미사용). 통과하면 null */
export function evaluateGate(input: GateInput, now: Date, dryRun: boolean): { blocked: GateBlockReason; detail?: string } | null {
  const { subscriber: sub, channel, rendered } = input;

  if (!isMagazineSendEnabled()) return { blocked: 'SEND_DISABLED' };

  const recipient = recipientOf(sub, channel);
  const allowlist = getMagazineSendAllowlist();
  if (allowlist.size > 0 && !allowlist.has(normalizeRecipient(recipient))) {
    return { blocked: 'NOT_ALLOWLISTED' };
  }

  if (
    sub.status === 'unsubscribed' ||
    sub.unsubscribed_at ||
    sub.consent_status === 'unsubscribed'
  ) {
    return { blocked: 'UNSUBSCRIBED' };
  }
  const deliveryStatus =
    typeof sub.email_delivery_status === 'string'
      ? sub.email_delivery_status.trim().toLowerCase()
      : '';
  if (deliveryStatus === 'bounced' || deliveryStatus === 'complained') {
    return { blocked: 'SUPPRESSED', detail: `email_delivery_status=${deliveryStatus}` };
  }
  if (sub.suppressed) {
    return { blocked: 'UNSUBSCRIBED' };
  }
  if (!sub.marketing_consent_at) return { blocked: 'NO_CONSENT' };
  if (sub.confirm_status !== 'confirmed') return { blocked: 'PENDING_CONFIRM' };
  const ch = sub.channel;
  if (!(ch === 'both' || ch === channel)) return { blocked: 'CHANNEL_NOT_CONSENTED', detail: `subscriber.channel=${ch ?? 'null'}` };
  if (!recipient.trim()) return { blocked: 'CHANNEL_NOT_CONSENTED', detail: 'NO_CONTACT' };

  if (isQuietHoursKst(now) && sub.night_consent !== true) return { blocked: 'QUIET_HOURS' };

  const adVisible = channel === 'email' ? (rendered.subject ?? '').includes('(광고)') : rendered.body.includes('(광고)');
  if (!rendered.hasAdLabel || !adVisible) return { blocked: 'MISSING_AD_LABEL' };
  if (!rendered.hasUnsubscribeLink) return { blocked: 'MISSING_UNSUB_LINK' };
  if (!rendered.senderName?.trim() || !rendered.senderContact?.trim()) return { blocked: 'MISSING_SENDER' };

  if (!dryRun) {
    const hasProvider = channel === 'email' ? hasEmailProvider() : hasKakaoProvider();
    if (!hasProvider) return { blocked: 'NO_PROVIDER', detail: channel };
  }
  return null;
}

/** 사유 분포 점검(G-07 dry-run)을 위해 게이트 차단도 원장에 남긴다. 실패해도 판정에는 영향 없음. */
const UNRECORDED_REASONS: ReadonlySet<GateBlockReason> = new Set<GateBlockReason>([
  'SEND_DISABLED',
  'NOT_ALLOWLISTED',
  'LEDGER_UNAVAILABLE',
]);

async function recordBlocked(
  supabase: MagazineDbClient,
  input: GateInput,
  key: string,
  reason: GateBlockReason,
  recipientHash: string,
): Promise<void> {
  if (UNRECORDED_REASONS.has(reason)) return;
  try {
    const { error } = await supabase.from(DISPATCH_LEDGER_TABLE).upsert(
      {
        idempotency_key: `${key}:blocked:${reason}`,
        edition_id: input.editionId ?? null,
        broker_id: input.brokerId,
        broker_user_id: input.brokerUserId && isUuid(input.brokerUserId) ? input.brokerUserId : null,
        subscriber_id: isUuid(input.subscriber.id) ? input.subscriber.id : null,
        channel: input.channel,
        kind: input.kind,
        status: 'blocked',
        blocked_reason: reason,
        recipient_hash: recipientHash,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );
    if (error && !isLedgerMissing(error)) log.warn('blocked ledger record failed', { reason, error: error.message });
  } catch (e) {
    log.warn('blocked ledger record threw', { reason, error: e instanceof Error ? e.message : String(e) });
  }
}

async function updateLedger(
  supabase: MagazineDbClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from(DISPATCH_LEDGER_TABLE).update(patch).eq('id', id);
    if (error) log.error('ledger update failed', { id, error: error.message });
  } catch (e) {
    log.error('ledger update threw', { id, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function sendGate(input: GateInput, deps: GateDeps = {}): Promise<GateResult> {
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? isMagazineSendDryRun();
  const { subscriber: sub, channel } = input;

  // 1~6. 순수 검사
  const verdict = evaluateGate(input, now, dryRun);
  const normalized = normalizeRecipient(recipientOf(sub, channel));
  const recipientHash = hashRecipient(normalized);
  const key = input.idempotencyKey ?? buildIdempotencyKey(input.editionKey, sub.id, channel);

  if (verdict) {
    if (verdict.blocked === 'SEND_DISABLED') return { ok: false, ...verdict };
    const supabaseForBlock = deps.supabase ?? (await getServiceClient());
    await recordBlocked(supabaseForBlock, input, key, verdict.blocked, recipientHash);
    return { ok: false, ...verdict };
  }

  const supabase = deps.supabase ?? (await getServiceClient());

  // 7. 멱등 원장 insert
  const row = {
    idempotency_key: key,
    edition_id: input.editionId ?? null,
    broker_id: input.brokerId,
    broker_user_id: input.brokerUserId && isUuid(input.brokerUserId) ? input.brokerUserId : null,
    subscriber_id: isUuid(sub.id) ? sub.id : null,
    channel,
    kind: input.kind,
    status: dryRun ? 'dry_run' : 'queued',
    recipient_hash: recipientHash,
  };
  const claimIso = now.toISOString();
  let dispatchId: string | null = null;

  if (deps.claimedDispatchId) {
    // 7-W. 워커가 이미 CAS로 점유(status='queued')한 행: 그 점유가 아직 내 것일 때만 진행한다.
    const claimedId = deps.claimedDispatchId;
    const confirm = await casUpdateLedger(
      (patch) =>
        supabase
          .from(DISPATCH_LEDGER_TABLE)
          .update(patch)
          .eq('id', claimedId)
          .eq('status', 'queued')
          .select('id')
          .maybeSingle(),
      { status: row.status, blocked_reason: null, error: null, updated_at: claimIso },
    );
    if (confirm.error) {
      if (isLedgerMissing(confirm.error)) {
        return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: confirm.error.message };
      }
      log.error('worker claim confirm failed', { error: confirm.error.message, code: confirm.error.code });
      return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: confirm.error.message };
    }
    if (!confirm.data) return { ok: false, blocked: 'DUPLICATE', detail: 'worker claim lost' };
    dispatchId = claimedId;
  }

  const ins = dispatchId
    ? { data: { id: dispatchId }, error: null }
    : await supabase.from(DISPATCH_LEDGER_TABLE).insert(row).select('id').single();
  if (!dispatchId) dispatchId = (ins.data as { id?: string } | null)?.id ?? null;

  if (ins.error) {
    const err = ins.error as DbErr;
    if (isLedgerMissing(err)) {
      log.error('dispatch ledger unavailable — blocking send (migration 20261004000005 not applied?)', { error: err.message });
      return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: err.message };
    }
    if (!isUniqueViolation(err)) {
      log.error('dispatch ledger insert failed', { error: err.message, code: err.code });
      return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: err.message };
    }
    // 이미 존재: blocked/retryable/pending_worker(재시도 가능) 또는 dry_run→실발송 승격만 재점유 허용. 그 외는 DUPLICATE
    const existing = await supabase.from(DISPATCH_LEDGER_TABLE).select('id, status').eq('idempotency_key', key).maybeSingle();
    const ex = existing.data as { id: string; status: string } | null;
    const reclaimable =
      !!ex &&
      (ex.status === 'blocked' ||
        ex.status === 'retryable' ||
        ex.status === 'pending_worker' ||
        (ex.status === 'dry_run' && !dryRun));
    if (!ex || !reclaimable) return { ok: false, blocked: 'DUPLICATE' };
    // P1-1: 재점유 시각을 updated_at 에 기록 → stale 회수는 enqueue 시각(created_at)이 아니라 점유 시각 기준.
    // 사전 컷오버(000003 미적용, updated_at 없음)에서는 updated_at 없이 재시도한다.
    const claim = await casUpdateLedger(
      (patch) =>
        supabase
          .from(DISPATCH_LEDGER_TABLE)
          .update(patch)
          .eq('id', ex.id)
          .eq('status', ex.status)
          .select('id')
          .maybeSingle(),
      { status: row.status, blocked_reason: null, error: null, updated_at: claimIso },
      ['updated_at'],
    );
    if (claim.error || !claim.data) return { ok: false, blocked: 'DUPLICATE' };
    dispatchId = ex.id;
  }
  if (!dispatchId) return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: 'ledger insert returned no id' };

  // 8. 브로커 일일 상한 (원장 count — 자신의 행 포함)
  const cap = resolveDailyCap(input);
  if (cap !== null) {
    const statuses = dryRun ? ['dry_run'] : ['queued', 'sent'];
    const { count, error: capErr } = await supabase
      .from(DISPATCH_LEDGER_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('broker_id', input.brokerId)
      .eq('kind', input.kind)
      .in('status', statuses)
      .gte('created_at', kstDayStartIso(now));
    if (capErr) {
      await updateLedger(supabase, dispatchId, { status: 'blocked', blocked_reason: 'LEDGER_UNAVAILABLE', error: capErr.message });
      return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: capErr.message };
    }
    if ((count ?? 0) > cap) {
      await updateLedger(supabase, dispatchId, { status: 'blocked', blocked_reason: 'DAILY_CAP' });
      return { ok: false, blocked: 'DAILY_CAP', detail: `cap=${cap}` };
    }
  }

  // 9. dry-run: 원장 기록만, provider 미호출
  if (dryRun) return { ok: true, dispatchId, dryRun: true };

  // 10. 실발송
  const { rendered } = input;
  const result =
    channel === 'email'
      ? await sendEmailProvider({
          to: sub.subscriber_email as string,
          subject: rendered.subject ?? '',
          html: rendered.body,
          text: rendered.text,
          headers: rendered.headers,
          fromName: rendered.senderName,
        })
      : await sendKakaoProvider({
          phone: sub.subscriber_phone as string,
          templateId: rendered.kakao?.templateId ?? '',
          variables: rendered.kakao?.variables ?? {},
          text: rendered.body,
        });

  if (!result.ok) {
    await updateLedger(supabase, dispatchId, { status: 'failed', error: (result.error ?? 'unknown').slice(0, 300) });
    return { ok: false, blocked: 'PROVIDER_FAILED', detail: result.error, failed: true };
  }
  await updateLedger(supabase, dispatchId, { status: 'sent', provider_msg_id: result.messageId ?? null, error: null });
  return { ok: true, dispatchId, dryRun: false };
}

/**
 * 15분 이상 `queued`(점유·발송 중) 상태에 고착된 발송 작업을 재시도 가능한 `retryable` 상태로 되돌린다 (WP 3-C).
 * 멱등 키(`idempotency_key`)는 그대로 유지하므로 이미 완료된 건은 절대 중복 발송되지 않는다.
 *
 * WP-7.3B P1-1: 고착 판정은 **점유 시각(`updated_at`)** 기준이다. 이전에는 enqueue 시각(`created_at`)을 써서
 * 오래전에 대기열에 들어간 행이 방금 점유되어 발송 중이어도 즉시 retryable 로 뒤집혀 중복 발송될 수 있었다.
 * 점유(워커 CAS·sendGate 재점유·신규 insert)는 모두 `updated_at` 을 점유 시각으로 기록한다.
 * 사전 컷오버(updated_at 컬럼 없음)에서는 회수하지 않는다(0 반환) — 기존과 동일하게 안전 측.
 */
export async function reclaimStaleQueuedDispatches(
  supabase: MagazineDbClient,
  opts?: { staleMinutes?: number; now?: Date },
): Promise<{ reclaimed: number }> {
  const now = opts?.now ?? new Date();
  const staleMinutes = Math.max(1, opts?.staleMinutes ?? 15);
  const cutoffIso = new Date(now.getTime() - staleMinutes * 60_000).toISOString();

  try {
    const { data, error } = await supabase
      .from(DISPATCH_LEDGER_TABLE)
      .update({ status: 'retryable', updated_at: now.toISOString(), error: 'reclaimed_after_stale_timeout' })
      .eq('status', 'queued')
      .lte('updated_at', cutoffIso)
      .select('id');
    if (error) {
      log.warn('reclaimStaleQueuedDispatches failed', { error: error.message });
      return { reclaimed: 0 };
    }
    return { reclaimed: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    log.warn('reclaimStaleQueuedDispatches threw', { error: e instanceof Error ? e.message : String(e) });
    return { reclaimed: 0 };
  }
}

/** 속보 주간 상한(기본 2회): 이번 주(KST 월요일~) 다른 속보 에디션 수를 원장으로 센다. */
export async function checkFlashWeeklyCap(
  supabase: MagazineDbClient,
  params: { brokerId: string; editionId: string | null | undefined; limit?: number },
  deps: { now?: Date; dryRun?: boolean } = {},
): Promise<{ ok: true } | { ok: false; blocked: GateBlockReason; detail: string }> {
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? isMagazineSendDryRun();
  const limit = params.limit ?? 2;
  const weekStart = `${mondayOfWeek(todayKst(now))}T00:00:00+09:00`;
  const { data, error } = await supabase
    .from(DISPATCH_LEDGER_TABLE)
    .select('edition_id')
    .eq('broker_id', params.brokerId)
    .eq('kind', 'flash')
    .in('status', dryRun ? ['dry_run'] : ['queued', 'sent'])
    .gte('created_at', weekStart)
    .limit(5000);
  if (error) return { ok: false, blocked: 'LEDGER_UNAVAILABLE', detail: (error as DbErr).message ?? 'ledger query failed' };
  const others = new Set<string>();
  for (const r of (data ?? []) as Array<{ edition_id: string | null }>) {
    if (r.edition_id && r.edition_id !== params.editionId) others.add(r.edition_id);
  }
  if (others.size >= limit) return { ok: false, blocked: 'DAILY_CAP', detail: `FLASH_WEEKLY_CAP(${limit})` };
  return { ok: true };
}

async function getServiceClient(): Promise<MagazineDbClient> {
  const { createServiceClient } = await import('@/lib/supabase/service');
  return createServiceClient() as unknown as MagazineDbClient;
}
