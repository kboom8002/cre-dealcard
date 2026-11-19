import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';
import {
  getMagazineSendAllowlist,
  isMagazineSendDryRun,
  isMagazineSendEnabled,
} from '@/lib/magazine/send-flags';
import { isQuietHoursKst, toKstDate, todayKst } from '@/lib/magazine/kst';
import { isRateLimitErrorDetail, resolveBaseUrl } from '@/domain/magazine/send-batch';
import { hashRecipient, normalizeRecipient } from '@/domain/magazine/send-gate';
import { buildListUnsubscribeHeaders, buildUnsubscribeUrl, issueUnsubToken } from '@/domain/magazine/unsub-token';
import { isEmailSuppressed } from '@/lib/legal/email-suppression';
import { sanitizeStatutoryField } from '@/lib/legal/broker-statutory-disclosure';
import { isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createModuleLogger('cron-consent-reconfirm-2yr');
const TWENTY_THREE_MONTHS_MS = 23 * 30 * 86_400_000;
const PAGE_SIZE = 200;
const DEFAULT_PROD_PACE_MS = 550;
const DEFAULT_TIME_BUDGET_MS = 45_000;
const BLOCKED_DELIVERY_STATUSES = new Set(['bounced', 'complained']);

export const PRECUTOVER_SELECT_COLUMNS =
  'id, broker_id, broker_user_id, subscriber_email, subscriber_name, marketing_consent_at, confirm_status, status, unsubscribed_at';
const BASE_SELECT_COLUMNS =
  'id, broker_id, broker_user_id, subscriber_email, subscriber_name, marketing_consent_at, reconfirm_notified_at, confirm_status, status, unsubscribed_at, consent_status';
const EXTENDED_SELECT_COLUMNS =
  'id, broker_id, broker_user_id, subscriber_email, subscriber_name, marketing_consent_at, reconfirm_notified_at, confirm_status, status, unsubscribed_at, consent_status, email_delivery_status';

type ReconfirmSelectTier = 'extended' | 'base' | 'precutover';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined, column?: string): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') {
    if (!column) return true;
    const msg = err.message ?? '';
    return !msg || new RegExp(column, 'i').test(msg) || /column|schema cache/i.test(msg);
  }
  const msg = err.message ?? '';
  if (!column) return /does not exist|could not find|schema cache/i.test(msg);
  return new RegExp(column, 'i').test(msg) && /does not exist|could not find|schema cache/i.test(msg);
}

export function resolveReconfirmPaceMs(): number {
  const raw = process.env.RECONFIRM_PACE_MS;
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    return 0;
  }
  return DEFAULT_PROD_PACE_MS;
}

export function resolveReconfirmTimeBudgetMs(): number {
  const raw = process.env.RECONFIRM_TIME_BUDGET_MS;
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return DEFAULT_TIME_BUDGET_MS;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function sanitizeReconfirmErrorReason(rawErr: unknown): string {
  let rawText = '';
  if (rawErr && typeof rawErr === 'object') {
    const rec = rawErr as { statusCode?: unknown; name?: unknown; message?: unknown; code?: unknown };
    const parts = [
      typeof rec.statusCode === 'number' ? String(rec.statusCode) : '',
      typeof rec.name === 'string' ? rec.name : '',
      typeof rec.code === 'string' ? rec.code : '',
      typeof rec.message === 'string' ? rec.message : '',
    ].filter(Boolean);
    rawText = parts.join(' ') || 'provider_send_error';
  } else if (typeof rawErr === 'string') {
    rawText = rawErr;
  } else {
    rawText = String(rawErr ?? 'provider_send_error');
  }
  return rawText
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function isResendRateLimitFailure(rawErr: unknown, sanitizedReason: string): boolean {
  if (rawErr && typeof rawErr === 'object') {
    const rec = rawErr as { statusCode?: unknown; name?: unknown; code?: unknown };
    if (rec.statusCode === 429 || rec.code === 429 || rec.code === '429') return true;
    if (typeof rec.name === 'string' && /rate[_\s-]*limit/i.test(rec.name)) return true;
  }
  return isRateLimitErrorDetail(sanitizedReason);
}

export interface ReconfirmSenderIdentity {
  companyName?: string | null;
  senderName?: string | null;
  officeAddress?: string | null;
}

export function buildReconfirmEmail(params: {
  subscriberName?: string | null;
  consentedDate: string;
  unsubscribeUrl: string;
  companyName?: string | null;
  senderName?: string | null;
  officeAddress?: string | null;
}): { subject: string; text: string } {
  const company = params.companyName?.trim() || '';
  const sender = params.senderName?.trim() || '';
  const address = params.officeAddress?.trim() || '';
  const senderDisplay =
    company && sender && company !== sender
      ? `${company} (${sender})`
      : company || sender || 'CRE 매거진';

  const subject = `[안내] ${senderDisplay} 광고성 정보 수신동의 2년 주기 재확인 안내`;
  const greeting = `안녕하세요${params.subscriberName?.trim() ? `, ${params.subscriberName.trim()}님` : ''}.`;
  const consentPhrase = params.consentedDate ? `${params.consentedDate}에 동의하신 ` : '';
  const lines = [
    greeting,
    '',
    `정보통신망법 제50조 제8항에 따라 ${senderDisplay}에서 ${consentPhrase}광고성 정보 수신 여부에 대한 2년 주기 확인 안내를 드립니다.`,
    '계속 수신을 원하시면 별도 조치가 필요 없으며, 수신을 중단하시려면 아래 수신거부 링크를 이용해 주시기 바랍니다.',
    '',
    `전송자의 명칭: ${senderDisplay}`,
    ...(address ? [`소재지: ${address}`] : []),
    `수신거부: ${params.unsubscribeUrl}`,
  ];
  return { subject, text: lines.join('\n') };
}

interface SubscriberReconfirmRow {
  id: string;
  broker_id?: string | null;
  broker_user_id?: string | null;
  subscriber_email?: string | null;
  subscriber_name?: string | null;
  marketing_consent_at?: string | null;
  reconfirm_notified_at?: string | null;
  confirm_status?: string | null;
  status?: string | null;
  unsubscribed_at?: string | null;
  consent_status?: string | null;
  email_delivery_status?: string | null;
}

interface SubscribersQueryResult {
  data: SubscriberReconfirmRow[] | null;
  error: { code?: string; message?: string } | null;
}

interface SubscribersQueryChain extends PromiseLike<SubscribersQueryResult> {
  select: (cols: string) => SubscribersQueryChain;
  eq: (col: string, val: string) => SubscribersQueryChain;
  lt: (col: string, val: string) => SubscribersQueryChain;
  or?: (filter: string) => SubscribersQueryChain;
  order?: (col: string, opts: { ascending: boolean }) => SubscribersQueryChain;
  range?: (from: number, to: number) => SubscribersQueryChain;
  limit?: (count: number) => SubscribersQueryChain;
}

interface LookupRowsResult {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message?: string } | null;
}

interface LookupQueryChain extends PromiseLike<LookupRowsResult> {
  select: (cols: string) => LookupQueryChain;
  in: (col: string, vals: string[]) => LookupQueryChain;
}

async function querySubscribersPage(
  supabase: ReturnType<typeof createServiceClient>,
  cutoffIso: string,
  offset: number,
  tier: ReconfirmSelectTier,
) {
  const selectCols =
    tier === 'extended'
      ? EXTENDED_SELECT_COLUMNS
      : tier === 'base'
        ? BASE_SELECT_COLUMNS
        : PRECUTOVER_SELECT_COLUMNS;
  const includeDeliveryColumn = tier === 'extended';
  const fromFn = supabase.from as unknown as (table: string) => SubscribersQueryChain;
  let query = fromFn('magazine_subscribers')
    .select(selectCols)
    .eq('status', 'active')
    .eq('confirm_status', 'confirmed')
    .lt('marketing_consent_at', cutoffIso);

  if (includeDeliveryColumn && typeof query.or === 'function') {
    query = query.or('email_delivery_status.is.null,and(email_delivery_status.neq.bounced,email_delivery_status.neq.complained)');
  }
  if (typeof query.order === 'function') {
    query = query.order('id', { ascending: true });
  }
  const supportsRange = typeof query.range === 'function';
  if (typeof query.range === 'function') {
    query = query.range(offset, offset + PAGE_SIZE - 1);
  } else if (typeof query.limit === 'function') {
    query = query.limit(PAGE_SIZE);
  }
  const res = await query;
  return { res, supportsRange };
}

async function fetchSubscribersPageWithFallback(
  supabase: ReturnType<typeof createServiceClient>,
  cutoffIso: string,
  offset: number,
  initialTier: ReconfirmSelectTier,
): Promise<{
  res: SubscribersQueryResult;
  supportsRange: boolean;
  resolvedTier: ReconfirmSelectTier;
}> {
  let tier: ReconfirmSelectTier = initialTier;
  let { res, supportsRange } = await querySubscribersPage(supabase, cutoffIso, offset, tier);

  if (res.error && tier === 'extended' && isMissingColumnError(res.error)) {
    tier = 'base';
    ({ res, supportsRange } = await querySubscribersPage(supabase, cutoffIso, offset, tier));
  }
  if (res.error && tier === 'base' && isMissingColumnError(res.error)) {
    tier = 'precutover';
    ({ res, supportsRange } = await querySubscribersPage(supabase, cutoffIso, offset, tier));
  }

  return { res, supportsRange, resolvedTier: tier };
}

async function batchLoadBrokerIdentities(
  supabase: ReturnType<typeof createServiceClient>,
  rows: SubscriberReconfirmRow[],
): Promise<Map<string, ReconfirmSenderIdentity>> {
  const map = new Map<string, ReconfirmSenderIdentity>();
  const uuids = new Set<string>();
  const slugs = new Set<string>();

  for (const r of rows) {
    if (r.broker_user_id && isUuid(r.broker_user_id)) uuids.add(String(r.broker_user_id));
    if (r.broker_id) {
      const bId = String(r.broker_id).trim();
      if (isUuid(bId)) uuids.add(bId);
      else if (bId) slugs.add(bId);
    }
  }
  if (uuids.size === 0 && slugs.size === 0) return map;

  const fromFn = supabase.from as unknown as (table: string) => LookupQueryChain;
  const bpRows: Array<Record<string, unknown>> = [];

  const fetchBpBy = async (col: 'user_id' | 'slug', vals: string[]) => {
    if (vals.length === 0) return;
    try {
      let res = await fromFn('broker_profiles')
        .select('user_id, slug, representative_name, office_address')
        .in(col, vals);
      if (res?.error && isMissingColumnError(res.error)) {
        res = await fromFn('broker_profiles')
          .select('user_id, slug')
          .in(col, vals);
      }
      if (Array.isArray(res?.data)) bpRows.push(...res.data);
    } catch {
      // non-blocking lookup fallback
    }
  };

  await fetchBpBy('user_id', Array.from(uuids));
  await fetchBpBy('slug', Array.from(slugs));

  for (const bp of bpRows) {
    if (typeof bp.user_id === 'string' && isUuid(bp.user_id)) {
      uuids.add(bp.user_id);
    }
  }

  const profileById = new Map<string, Record<string, unknown>>();
  if (uuids.size > 0) {
    try {
      const pfRes = await fromFn('profiles')
        .select('id, display_name, company')
        .in('id', Array.from(uuids));
      for (const pf of Array.isArray(pfRes?.data) ? pfRes.data : []) {
        if (typeof pf.id === 'string') profileById.set(pf.id, pf);
      }
    } catch {
      // non-blocking profile fallback
    }
  }

  for (const bp of bpRows) {
    const uid = typeof bp.user_id === 'string' ? bp.user_id : '';
    const slug = typeof bp.slug === 'string' ? bp.slug.trim() : '';
    const pf = uid ? profileById.get(uid) : undefined;
    const identity: ReconfirmSenderIdentity = {
      companyName: sanitizeStatutoryField(pf?.company, 'officeName') ?? null,
      senderName:
        sanitizeStatutoryField(pf?.display_name, 'name') ||
        sanitizeStatutoryField(bp.representative_name, 'name') ||
        null,
      officeAddress: sanitizeStatutoryField(bp.office_address, 'address') ?? null,
    };
    if (uid) map.set(uid, identity);
    if (slug) map.set(slug, identity);
  }

  for (const [uid, pf] of profileById.entries()) {
    if (!map.has(uid)) {
      map.set(uid, {
        companyName: sanitizeStatutoryField(pf.company, 'officeName') ?? null,
        senderName: sanitizeStatutoryField(pf.display_name, 'name') ?? null,
        officeAddress: null,
      });
    }
  }

  return map;
}

async function updateDispatchFailure(
  supabase: ReturnType<typeof createServiceClient>,
  dispatchKey: string,
  status: 'retryable' | 'failed',
  sanitizedReason: string,
) {
  try {
    const fullPatch: Record<string, unknown> = {
      status,
      error: sanitizedReason,
      error_reason: sanitizedReason,
      ...(status === 'retryable' ? { blocked_reason: 'RATE_LIMITED' } : {}),
    };
    const res = await supabase
      .from('magazine_dispatch_logs')
      .update(fullPatch)
      .eq('idempotency_key', dispatchKey);
    if (res?.error && isMissingColumnError(res.error, 'error_reason')) {
      await supabase
        .from('magazine_dispatch_logs')
        .update({ status, error: sanitizedReason })
        .eq('idempotency_key', dispatchKey);
    }
  } catch {
    // non-blocking ledger cleanup
  }
}

async function handleConsentReconfirm2Yr(req: NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  const startedAtMs = Date.now();
  const now = new Date(startedAtMs);
  const kstDate = todayKst(now);
  const bucketKey = `reconfirm-2yr:${kstDate}`;
  const sendEnabled = isMagazineSendEnabled();
  const dryRun = isMagazineSendDryRun();
  const quietHours = isQuietHoursKst(now);

  // KST 야간(21:00~08:00)에는 라이브 발송을 중단하고 일일 멱등 슬롯도 소진하지 않는다(주간 재실행 허용)
  if (sendEnabled && !dryRun && quietHours) {
    return NextResponse.json({
      ok: true,
      skipped: 'QUIET_HOURS_KST',
      quietHours: true,
      bucketKey,
    });
  }

  const supabase = createServiceClient();
  const cutoffIso = new Date(now.getTime() - TWENTY_THREE_MONTHS_MS).toISOString();
  const nowIso = now.toISOString();
  const allowlist = getMagazineSendAllowlist();
  const baseUrl = resolveBaseUrl() || process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://credeal.net';
  const paceMs = resolveReconfirmPaceMs();
  const timeBudgetMs = resolveReconfirmTimeBudgetMs();

  let scanned = 0;
  let notified = 0;
  let simulated = 0;
  let failed = 0;
  let retryable = 0;
  let deferredRemaining = 0;
  let skippedAllowlist = 0;
  let skippedSuppressed = 0;
  let skippedDeliveryStatus = 0;
  let skippedDuplicate = 0;
  let selectTier: ReconfirmSelectTier = 'extended';
  let budgetReached = false;
  let hasPriorLiveCall = false;
  const seenRecipientHashes = new Set<string>();

  try {
    // Probe page 0 BEFORE acquiring the daily cron idempotency slot so a transient
    // DB failure never burns today's cron slot.
    const initialProbe = await fetchSubscribersPageWithFallback(
      supabase,
      cutoffIso,
      0,
      selectTier,
    );
    selectTier = initialProbe.resolvedTier;
    if (initialProbe.res.error) {
      log.warn('reconfirm initial page probe failed', {
        code: initialProbe.res.error.code,
        message: initialProbe.res.error.message,
      });
      return NextResponse.json(
        { ok: false, error: initialProbe.res.error.message },
        { status: 500 },
      );
    }

    const slot = await acquireCronIdempotencySlot(supabase, 'consent-reconfirm-2yr', bucketKey);
    if (!slot.acquired) {
      return NextResponse.json({ ok: true, skipped: 'IDEMPOTENCY_SLOT_ALREADY_ACQUIRED', bucketKey });
    }

    let offset = 0;

    while (true) {
      if (offset > 0 && Date.now() - startedAtMs > timeBudgetMs) {
        budgetReached = true;
        break;
      }

      let res: SubscribersQueryResult;
      let supportsRange: boolean;
      if (offset === 0) {
        res = initialProbe.res;
        supportsRange = initialProbe.supportsRange;
      } else {
        const fetched = await fetchSubscribersPageWithFallback(
          supabase,
          cutoffIso,
          offset,
          selectTier,
        );
        res = fetched.res;
        supportsRange = fetched.supportsRange;
        selectTier = fetched.resolvedTier;
      }

      const { data: rows, error } = res;
      if (error) {
        log.warn('reconfirm query failed', { code: error.code, message: error.message });
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const page = Array.isArray(rows) ? rows : [];
      const dueRows = page.filter((r) => {
        if (!r || r.unsubscribed_at || r.consent_status === 'unsubscribed') return false;
        const deliveryStatus = typeof r.email_delivery_status === 'string' ? r.email_delivery_status.toLowerCase() : '';
        if (BLOCKED_DELIVERY_STATUSES.has(deliveryStatus)) {
          skippedDeliveryStatus += 1;
          return false;
        }
        if (!r.reconfirm_notified_at) return true;
        return String(r.reconfirm_notified_at) < cutoffIso;
      });

      scanned += dueRows.length;
      const brokerIdentityMap = await batchLoadBrokerIdentities(supabase, dueRows);

      for (let idx = 0; idx < dueRows.length; idx++) {
        if (Date.now() - startedAtMs > timeBudgetMs) {
          deferredRemaining += dueRows.length - idx;
          budgetReached = true;
          break;
        }

        const sub = dueRows[idx];
        const email = String(sub.subscriber_email || '').trim().toLowerCase();
        if (!email) continue;
        if (allowlist.size > 0 && !allowlist.has(email)) {
          skippedAllowlist += 1;
          continue;
        }

        const brokerUuid = isUuid(sub.broker_user_id)
          ? String(sub.broker_user_id)
          : isUuid(sub.broker_id)
            ? String(sub.broker_id)
            : undefined;
        const suppression = await isEmailSuppressed(supabase, {
          email,
          brokerId: brokerUuid,
          brokerKeys: [sub.broker_user_id, sub.broker_id].filter(Boolean).map(String),
        });
        if (suppression.suppressed) {
          skippedSuppressed += 1;
          continue;
        }

        const normalizedRecipient = normalizeRecipient(email);
        const recipientHash = normalizedRecipient ? hashRecipient(normalizedRecipient) : '';
        if (recipientHash && seenRecipientHashes.has(recipientHash)) {
          skippedDuplicate += 1;
          continue;
        }
        const dispatchKey = `reconfirm-2yr:${kstDate}:${recipientHash || String(sub.id)}:email`;

        const brokerIdentity =
          (sub.broker_user_id ? brokerIdentityMap.get(String(sub.broker_user_id)) : undefined) ??
          (sub.broker_id ? brokerIdentityMap.get(String(sub.broker_id)) : undefined) ??
          {};

        // D4: live emails only dispatch when MAGAZINE_SEND_ENABLED=true, dry-run is disabled, and outside KST quiet hours.
        const wouldLiveSend = sendEnabled && !dryRun && !quietHours && Boolean(process.env.RESEND_API_KEY);
        if (wouldLiveSend) {
          let dispatchLogged = false;
          try {
            const existing = await supabase
              .from('magazine_dispatch_logs')
              .select('id, status')
              .eq('idempotency_key', dispatchKey)
              .limit(1);
            if (!existing?.error && Array.isArray(existing?.data) && existing.data.length > 0) {
              const prevRow = existing.data[0];
              const prevStatus = String(prevRow?.status || '');
              if (prevStatus === 'sent' || prevStatus === 'queued') {
                skippedDuplicate += 1;
                continue;
              }
              await supabase
                .from('magazine_dispatch_logs')
                .update({ status: 'queued', error: null })
                .eq('idempotency_key', dispatchKey);
              dispatchLogged = true;
            } else {
              const insLog = await supabase.from('magazine_dispatch_logs').insert({
                idempotency_key: dispatchKey,
                edition_id: null,
                broker_id: String(sub.broker_id || sub.broker_user_id || 'unknown'),
                broker_user_id: isUuid(sub.broker_user_id) ? sub.broker_user_id : null,
                subscriber_id: isUuid(sub.id) ? sub.id : null,
                channel: 'email',
                kind: 'weekly',
                status: 'queued',
                recipient_hash: recipientHash || null,
              });
              if (insLog?.error?.code === '23505') {
                skippedDuplicate += 1;
                continue;
              }
              if (!insLog?.error) {
                dispatchLogged = true;
              }
            }
          } catch {
            // Pre-cutover / mock environment without magazine_dispatch_logs: local seenRecipientHashes still deduplicates
          }

          let unsubscribeUrl = '';
          try {
            const token = issueUnsubToken({
              subscriberId: String(sub.id),
              brokerId: String(sub.broker_user_id || sub.broker_id),
            });
            unsubscribeUrl = buildUnsubscribeUrl(baseUrl, token);
          } catch (tokErr) {
            log.warn('reconfirm unsubscribe token issue failed — skipping live send', {
              error: tokErr instanceof Error ? tokErr.message : String(tokErr),
            });
            failed += 1;
            if (dispatchLogged) {
              await updateDispatchFailure(supabase, dispatchKey, 'failed', 'UNSUB_TOKEN_ISSUE_FAILED');
            }
            continue;
          }

          if (hasPriorLiveCall && paceMs > 0) {
            await sleep(paceMs);
          }
          hasPriorLiveCall = true;

          try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            const from = process.env.EMAIL_FROM || 'CRE 매거진 <magazine@credeal.net>';
            const consentDt = sub.marketing_consent_at ? new Date(String(sub.marketing_consent_at)) : null;
            const consentedDate =
              consentDt && !Number.isNaN(consentDt.getTime()) ? toKstDate(consentDt) : '';
            const renderedEmail = buildReconfirmEmail({
              subscriberName: sub.subscriber_name,
              consentedDate,
              unsubscribeUrl,
              companyName: brokerIdentity.companyName,
              senderName: brokerIdentity.senderName,
              officeAddress: brokerIdentity.officeAddress,
            });

            const sentRes = (await resend.emails.send({
              from,
              to: email,
              subject: renderedEmail.subject,
              text: renderedEmail.text,
              headers: buildListUnsubscribeHeaders(unsubscribeUrl),
            })) as { data?: { id?: string } | null; id?: string; error?: unknown } | null;

            if (sentRes?.error) {
              const sanitizedReason = sanitizeReconfirmErrorReason(sentRes.error);
              const isRateLimit = isResendRateLimitFailure(sentRes.error, sanitizedReason);
              const failStatus: 'retryable' | 'failed' = isRateLimit ? 'retryable' : 'failed';
              if (isRateLimit) retryable += 1;
              else failed += 1;
              log.warn('reconfirm email returned Resend error', {
                status: failStatus,
                errorReason: sanitizedReason,
              });
              if (dispatchLogged) {
                await updateDispatchFailure(supabase, dispatchKey, failStatus, sanitizedReason);
              }
              continue;
            }

            notified += 1;
            if (recipientHash) seenRecipientHashes.add(recipientHash);
            if (dispatchLogged) {
              try {
                const msgId = sentRes?.data?.id ?? sentRes?.id ?? null;
                await supabase
                  .from('magazine_dispatch_logs')
                  .update({ status: 'sent', provider_msg_id: msgId })
                  .eq('idempotency_key', dispatchKey);
              } catch {
                // non-blocking status update
              }
            }
          } catch (err) {
            const sanitizedReason = sanitizeReconfirmErrorReason(err);
            const isRateLimit = isResendRateLimitFailure(err, sanitizedReason);
            const failStatus: 'retryable' | 'failed' = isRateLimit ? 'retryable' : 'failed';
            if (isRateLimit) retryable += 1;
            else failed += 1;
            log.warn('reconfirm email send threw', {
              status: failStatus,
              errorReason: sanitizedReason,
            });
            if (dispatchLogged) {
              await updateDispatchFailure(supabase, dispatchKey, failStatus, sanitizedReason);
            }
            continue;
          }

          // Only persist reconfirm_notified_at after an actual live send succeeds (never in dry-run or error)
          try {
            await supabase
              .from('magazine_subscribers')
              .update({ reconfirm_notified_at: nowIso })
              .eq('id', sub.id);
          } catch {
            // Fallback if migration column not yet present pre-cutover
          }
        } else {
          if (recipientHash) seenRecipientHashes.add(recipientHash);
          simulated += 1;
        }

        if (sub.broker_user_id) {
          try {
            await supabase.from('activity_events').insert({
              actor_id: sub.broker_user_id,
              actor_role: 'system',
              event_type: 'consent_reconfirm_notified',
              entity_type: 'subscriber',
              entity_id: sub.id,
              metadata: {
                dry_run: !wouldLiveSend,
                consented_at: sub.marketing_consent_at,
                notified_at: nowIso,
              },
            });
          } catch {
            // non-blocking compliance log
          }
        }
      }

      if (budgetReached || !supportsRange || page.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      notified,
      simulated,
      failed,
      retryable,
      deferredRemaining,
      skippedAllowlist,
      skippedSuppressed,
      skippedDeliveryStatus,
      skippedDuplicate,
      dryRun: dryRun || !sendEnabled,
      quietHours,
      ranAt: nowIso,
    });
  } catch (err) {
    log.error('consent-reconfirm-2yr failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleConsentReconfirm2Yr(req);
}

export async function POST(req: NextRequest) {
  return handleConsentReconfirm2Yr(req);
}
