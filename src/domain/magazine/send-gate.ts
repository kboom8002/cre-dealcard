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

/** send-flags.ts의 SendBlockReason + 원장 불가 + provider 실패(실패는 blocked 집계가 아닌 failed로 센다) */
export type GateBlockReason = SendBlockReason | 'LEDGER_UNAVAILABLE' | 'PROVIDER_FAILED';

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
}

interface DbErr {
  code?: string;
  message?: string;
}

function isLedgerMissing(err: DbErr | null | undefined): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''));
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

function hashRecipient(normalized: string): string {
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

  if (sub.status === 'unsubscribed' || sub.unsubscribed_at) return { blocked: 'UNSUBSCRIBED' };
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
  const key = buildIdempotencyKey(input.editionKey, sub.id, channel);
  const normalized = normalizeRecipient(recipientOf(sub, channel));
  const recipientHash = hashRecipient(normalized);

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
  const ins = await supabase.from(DISPATCH_LEDGER_TABLE).insert(row).select('id').single();
  let dispatchId: string | null = (ins.data as { id?: string } | null)?.id ?? null;

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
    // 이미 존재: blocked(재시도 가능) 또는 dry_run→실발송 승격만 재점유 허용. 그 외는 DUPLICATE
    const existing = await supabase.from(DISPATCH_LEDGER_TABLE).select('id, status').eq('idempotency_key', key).maybeSingle();
    const ex = existing.data as { id: string; status: string } | null;
    const reclaimable = !!ex && (ex.status === 'blocked' || (ex.status === 'dry_run' && !dryRun));
    if (!ex || !reclaimable) return { ok: false, blocked: 'DUPLICATE' };
    const claim = await supabase
      .from(DISPATCH_LEDGER_TABLE)
      .update({ status: row.status, blocked_reason: null, error: null })
      .eq('id', ex.id)
      .eq('status', ex.status)
      .select('id')
      .maybeSingle();
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
