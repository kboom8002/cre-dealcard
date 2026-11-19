import crypto from 'node:crypto';
import { isRealProductionRuntime } from '@/lib/env';
import { createModuleLogger } from '@/lib/logger';
import { isUuid } from '@/lib/magazine/slug';

const log = createModuleLogger('email-suppression');

export type SuppressionReason = 'unsubscribe' | 'hard_bounce' | 'complaint';
export type SuppressionScope = 'global' | 'broker';

export function normalizeSuppressionEmail(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase();
}

export function hashEmailForSuppression(email: string): string {
  const normalized = normalizeSuppressionEmail(email);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function isMissingSuppressionTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code || '');
  const msg = String((err as { message?: unknown }).message || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /does not exist|could not find the table/i.test(msg)
  );
}

function isMissingSuppressionColumn(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code || '');
  const msg = String((err as { message?: unknown }).message || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist|could not find the '.*' column|schema cache/i.test(msg)
  );
}

/** Reason returned by `isEmailSuppressed` when the suppression lookup itself failed (fail closed). */
export const SUPPRESSION_LOOKUP_FAILED = 'lookup_failed';

/**
 * Pre-cutover condition for the read path: the table is missing (same detection as the write path)
 * or PostgREST returned an empty-body error (no code and no message) for the absent relation.
 */
function isPreCutoverSuppressionLookupError(err: unknown): boolean {
  if (isMissingSuppressionTable(err)) return true;
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '').trim();
  const msg = String((err as { message?: unknown }).message ?? '').trim();
  return !code && !msg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

async function upsertEmailSuppressionRow(
  supabase: DbClient,
  params: {
    emailHash: string;
    brokerId?: string | null;
    scope?: SuppressionScope;
    reason: SuppressionReason;
    source?: string;
  }
): Promise<{ ok: boolean; emailHash: string; recordedToTable: boolean; error?: string }> {
  const cleanHash = String(params.emailHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
    return { ok: false, emailHash: cleanHash, recordedToTable: false, error: 'INVALID_HASH' };
  }

  const brokerUuid = params.brokerId && isUuid(params.brokerId) ? params.brokerId : null;
  const scope: SuppressionScope = params.scope || (brokerUuid ? 'broker' : 'global');
  if (scope === 'broker' && !brokerUuid) {
    log.warn('recordEmailSuppression rejected broker-scoped call without valid UUID', {
      brokerId: params.brokerId ?? null,
    });
    return { ok: false, emailHash: cleanHash, recordedToTable: false, error: 'INVALID_BROKER_UUID' };
  }

  let recordedToTable = false;

  try {
    let existingQ = supabase
      .from('email_suppressions')
      .select('id')
      .eq('email_hash', cleanHash)
      .eq('scope', scope);
    if (scope === 'broker' && brokerUuid) {
      existingQ = existingQ.eq('broker_id', brokerUuid);
    }
    const existingRes =
      typeof existingQ.maybeSingle === 'function' ? await existingQ.maybeSingle() : await existingQ;
    const hasRow = Array.isArray(existingRes?.data)
      ? existingRes.data.length > 0
      : Boolean(existingRes?.data?.id);

    if (!existingRes?.error && !hasRow) {
      const { error: insErr } = await supabase.from('email_suppressions').insert({
        email_hash: cleanHash,
        broker_id: scope === 'broker' ? brokerUuid : null,
        scope,
        reason: params.reason,
        source: params.source || 'unsubscribe_link',
      });
      if (insErr) {
        if (insErr.code === '23505') {
          recordedToTable = true;
        } else if (!isMissingSuppressionTable(insErr)) {
          log.error('email_suppressions insert failed', {
            code: insErr.code,
            error: insErr.message,
            scope,
          });
          if (isRealProductionRuntime() || process.env.REQUIRE_EMAIL_SUPPRESSIONS_TABLE === '1') {
            throw new Error(insErr.message || 'Failed inserting email_suppressions');
          }
          return {
            ok: false,
            emailHash: cleanHash,
            recordedToTable: false,
            error: insErr.message || 'INSERT_FAILED',
          };
        }
      } else {
        recordedToTable = true;
      }
    } else if (!existingRes?.error && hasRow) {
      recordedToTable = true;
    } else if (existingRes?.error && !isMissingSuppressionTable(existingRes.error)) {
      log.error('email_suppressions lookup failed', {
        code: existingRes.error.code,
        error: existingRes.error.message,
        scope,
      });
      if (isRealProductionRuntime() || process.env.REQUIRE_EMAIL_SUPPRESSIONS_TABLE === '1') {
        throw new Error(existingRes.error.message || 'Failed checking email_suppressions');
      }
      return {
        ok: false,
        emailHash: cleanHash,
        recordedToTable: false,
        error: existingRes.error.message || 'LOOKUP_FAILED',
      };
    }
  } catch (err) {
    if (isRealProductionRuntime() || process.env.REQUIRE_EMAIL_SUPPRESSIONS_TABLE === '1') throw err;
    log.error('email_suppressions write threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      emailHash: cleanHash,
      recordedToTable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Always audit to activity_events so pre-cutover DBs retain durable compliance trace
  if (brokerUuid) {
    try {
      await supabase.from('activity_events').insert({
        actor_id: brokerUuid,
        actor_role: 'system',
        event_type: 'email_suppression_recorded',
        entity_type: 'email',
        entity_id: brokerUuid,
        metadata: {
          email_hash: cleanHash,
          scope,
          reason: params.reason,
          source: params.source || 'unsubscribe_link',
        },
      });
    } catch {
      // non-blocking compliance audit fallback
    }
  }

  return { ok: true, emailHash: cleanHash, recordedToTable };
}

/**
 * Records a durable suppression entry in `public.email_suppressions` and synchronizes
 * `magazine_subscribers` + `broker_clients` when `brokerId` is scoped.
 * Never swallows real production write errors when REQUIRE_EMAIL_SUPPRESSIONS_TABLE=1.
 */
export async function recordEmailSuppression(
  supabase: DbClient | null | undefined,
  params: {
    email: string;
    brokerId?: string | null;
    scope?: SuppressionScope;
    reason: SuppressionReason;
    source?: string;
  }
): Promise<{ ok: boolean; emailHash: string; recordedToTable: boolean; error?: string }> {
  const cleanEmail = normalizeSuppressionEmail(params.email);
  const emailHash = hashEmailForSuppression(cleanEmail);
  if (!cleanEmail || !emailHash || !supabase || typeof supabase.from !== 'function') {
    return { ok: false, emailHash, recordedToTable: false, error: 'INVALID_INPUT' };
  }
  return upsertEmailSuppressionRow(supabase, {
    emailHash,
    brokerId: params.brokerId,
    scope: params.scope,
    reason: params.reason,
    source: params.source,
  });
}

/**
 * Records a durable suppression entry using a precomputed SHA-256 hex `email_hash`
 * (used when anonymizing Inbox recipient opt-out tokens like `emh_<sha256>`).
 */
export async function recordEmailSuppressionByHash(
  supabase: DbClient | null | undefined,
  params: {
    emailHash: string;
    brokerId?: string | null;
    scope?: SuppressionScope;
    reason: SuppressionReason;
    source?: string;
  }
): Promise<{ ok: boolean; emailHash: string; recordedToTable: boolean; error?: string }> {
  const cleanHash = String(params.emailHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanHash) || !supabase || typeof supabase.from !== 'function') {
    return { ok: false, emailHash: cleanHash, recordedToTable: false, error: 'INVALID_INPUT' };
  }
  return upsertEmailSuppressionRow(supabase, {
    emailHash: cleanHash,
    brokerId: params.brokerId,
    scope: params.scope,
    reason: params.reason,
    source: params.source,
  });
}

/**
 * Clears ONLY a broker-scoped voluntary unsubscribe (`scope='broker' AND reason='unsubscribe'`)
 * after verified double opt-in self-resubscription (`confirmOptIn`). Never removes `hard_bounce`,
 * `complaint`, or `global` suppressions. Also restores matching CRM `broker_clients` status/tags.
 */
export async function clearBrokerUnsubscribeSuppression(
  supabase: DbClient | null | undefined,
  params: { email: string; brokerId: string }
): Promise<{ ok: boolean; clearedTable: boolean }> {
  const cleanEmail = normalizeSuppressionEmail(params.email);
  const emailHash = hashEmailForSuppression(cleanEmail);
  const brokerUuid = isUuid(params.brokerId) ? params.brokerId.trim() : '';
  if (!cleanEmail || !emailHash || !brokerUuid || !supabase || typeof supabase.from !== 'function') {
    return { ok: false, clearedTable: false };
  }

  let clearedTable = false;
  try {
    const delRes = await supabase
      .from('email_suppressions')
      .delete()
      .eq('email_hash', emailHash)
      .eq('broker_id', brokerUuid)
      .eq('scope', 'broker')
      .eq('reason', 'unsubscribe');
    if (delRes?.error) {
      if (!isMissingSuppressionTable(delRes.error)) {
        log.warn('clearBrokerUnsubscribeSuppression delete failed', {
          code: delRes.error.code,
          error: delRes.error.message,
        });
      }
    } else {
      clearedTable = true;
    }
  } catch {
    // non-blocking pre-cutover fallback
  }

  try {
    const { data: cliRows } = await supabase
      .from('broker_clients')
      .select('id, tags')
      .eq('broker_id', brokerUuid)
      .eq('email', cleanEmail);
    for (const cli of Array.isArray(cliRows) ? cliRows : []) {
      const prevTags = Array.isArray(cli?.tags) ? cli.tags.map(String) : [];
      const cleaned = prevTags.filter((t: string) => !/수신거부|해지|unsub/i.test(t));
      const nextTags = Array.from(new Set([...cleaned, '뉴스레터구독', '수신동의']));
      const upd = await supabase
        .from('broker_clients')
        .update({ tags: nextTags, consent_status: 'confirmed', unsubscribed_at: null })
        .eq('id', cli.id)
        .eq('broker_id', brokerUuid);
      if (upd?.error && (upd.error.code === '42703' || upd.error.code === 'PGRST204')) {
        await supabase
          .from('broker_clients')
          .update({ tags: nextTags })
          .eq('id', cli.id)
          .eq('broker_id', brokerUuid);
      }
    }
  } catch {
    // non-blocking CRM sync
  }

  return { ok: true, clearedTable };
}

/**
 * Checks `email_suppressions` (global OR broker-scoped), `magazine_subscribers`, and `broker_clients`
 * immediately before sending any email.
 */
export async function isEmailSuppressed(
  supabase: DbClient | null | undefined,
  params: {
    email: string;
    brokerId?: string | null;
    brokerKeys?: string[];
  }
): Promise<{ suppressed: boolean; reason?: string }> {
  const cleanEmail = normalizeSuppressionEmail(params.email);
  const emailHash = hashEmailForSuppression(cleanEmail);
  if (!cleanEmail || !emailHash || !supabase || typeof supabase.from !== 'function') {
    return { suppressed: false };
  }

  const brokerUuid = params.brokerId && isUuid(params.brokerId) ? params.brokerId : null;

  // WP-7.3E P1-5: fail closed on unexpected lookup errors. Only the known pre-cutover
  // missing-table condition (42P01 / PGRST205 / "does not exist" / PostgREST empty-body error)
  // falls through to the legacy per-row unsubscribe checks below — live DB does not yet have
  // `email_suppressions`, and blocking every send there is not acceptable (D2).
  try {
    const res = await supabase
      .from('email_suppressions')
      .select('scope, broker_id, reason')
      .eq('email_hash', emailHash);
    if (res?.error) {
      if (!isPreCutoverSuppressionLookupError(res.error)) {
        log.error('email_suppressions pre-send lookup failed; blocking send (fail closed)', {
          code: (res.error as { code?: unknown }).code ?? null,
          error: (res.error as { message?: unknown }).message ?? null,
        });
        return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
      }
    } else if (Array.isArray(res?.data)) {
      for (const row of res.data) {
        if (row?.scope === 'global') {
          return { suppressed: true, reason: String(row.reason || 'unsubscribe') };
        }
        if (row?.scope === 'broker' && brokerUuid && row?.broker_id === brokerUuid) {
          return { suppressed: true, reason: String(row.reason || 'unsubscribe') };
        }
      }
    }
  } catch (err) {
    if (!isPreCutoverSuppressionLookupError(err)) {
      log.error('email_suppressions pre-send lookup threw; blocking send (fail closed)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
    }
  }

  const keyPool = Array.from(
    new Set([...(params.brokerKeys || []), ...(params.brokerId ? [params.brokerId] : [])].filter(Boolean)),
  );

  // Legacy magazine_subscribers check (global bounces/complaints + broker-scoped unsubscribes)
  try {
    let subRes = await supabase
      .from('magazine_subscribers')
      .select('broker_id, status, unsubscribed_at, email_delivery_status, consent_status')
      .eq('subscriber_email', cleanEmail);
    if (subRes?.error && isMissingSuppressionColumn(subRes.error)) {
      subRes = await supabase
        .from('magazine_subscribers')
        .select('broker_id, status, unsubscribed_at')
        .eq('subscriber_email', cleanEmail);
    }
    if (subRes?.error) {
      if (!isPreCutoverSuppressionLookupError(subRes.error)) {
        log.error('magazine_subscribers fallback suppression lookup failed; blocking send (fail closed)', {
          code: (subRes.error as { code?: unknown }).code ?? null,
          error: (subRes.error as { message?: unknown }).message ?? null,
        });
        return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
      }
    } else {
      for (const s of Array.isArray(subRes?.data) ? subRes.data : []) {
        if (s?.email_delivery_status === 'complained' || s?.email_delivery_status === 'bounced') {
          return {
            suppressed: true,
            reason: s.email_delivery_status === 'complained' ? 'complaint' : 'hard_bounce',
          };
        }
        if (keyPool.length > 0) {
          if (s?.broker_id && !keyPool.includes(String(s.broker_id))) continue;
          if (
            s?.status === 'unsubscribed' ||
            Boolean(s?.unsubscribed_at) ||
            s?.consent_status === 'unsubscribed'
          ) {
            return { suppressed: true, reason: 'unsubscribe' };
          }
        }
      }
    }
  } catch (err) {
    if (!isPreCutoverSuppressionLookupError(err)) {
      log.error('magazine_subscribers fallback suppression lookup threw; blocking send (fail closed)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
    }
  }

  if (brokerUuid) {
    try {
      let cliRes = await supabase
        .from('broker_clients')
        .select('consent_status, unsubscribed_at, tags')
        .eq('broker_id', brokerUuid)
        .eq('email', cleanEmail);
      if (cliRes?.error && isMissingSuppressionColumn(cliRes.error)) {
        cliRes = await supabase
          .from('broker_clients')
          .select('tags')
          .eq('broker_id', brokerUuid)
          .eq('email', cleanEmail);
      }
      if (cliRes?.error) {
        if (!isPreCutoverSuppressionLookupError(cliRes.error)) {
          log.error('broker_clients fallback suppression lookup failed; blocking send (fail closed)', {
            code: (cliRes.error as { code?: unknown }).code ?? null,
            error: (cliRes.error as { message?: unknown }).message ?? null,
          });
          return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
        }
      } else {
        for (const c of Array.isArray(cliRes?.data) ? cliRes.data : []) {
          const tags = Array.isArray(c?.tags) ? c.tags.map(String) : [];
          if (
            c?.consent_status === 'unsubscribed' ||
            Boolean(c?.unsubscribed_at) ||
            tags.some((t: string) => /수신거부|해지|unsub/i.test(t))
          ) {
            return { suppressed: true, reason: 'unsubscribe' };
          }
        }
      }
    } catch (err) {
      if (!isPreCutoverSuppressionLookupError(err)) {
        log.error('broker_clients fallback suppression lookup threw; blocking send (fail closed)', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED };
      }
    }
  }

  return { suppressed: false };
}

/**
 * Bulk-loads all suppressed email hashes relevant to a broker (global + broker-scoped)
 * for high-throughput batch dispatches.
 * Fails closed by throwing `Error('SUPPRESSION_LOOKUP_FAILED: ...')` on any non-pre-cutover DB failure.
 */
export async function loadSuppressedEmailHashesForBroker(
  supabase: DbClient | null | undefined,
  brokerUuid: string | null | undefined
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || typeof supabase.from !== 'function') return out;

  // Never fall back to an unscoped query when an invalid non-empty broker UUID is provided.
  const hasBrokerArg = typeof brokerUuid === 'string' && brokerUuid.trim().length > 0;
  if (hasBrokerArg && !isUuid(brokerUuid)) {
    log.warn('loadSuppressedEmailHashesForBroker rejected invalid broker UUID', {
      brokerUuid,
    });
    return out;
  }

  const validBrokerUuid = hasBrokerArg ? brokerUuid.trim() : null;
  const BATCH_SIZE = 1000;
  let offset = 0;
  let fellBackToPreCutover = false;

  try {
    while (true) {
      let q = supabase.from('email_suppressions').select('email_hash, scope, broker_id');
      if (validBrokerUuid) {
        if (typeof q.or === 'function') {
          q = q.or(`scope.eq.global,broker_id.eq.${validBrokerUuid}`);
        } else if (typeof q.eq === 'function') {
          q = q.eq('broker_id', validBrokerUuid);
        } else {
          break;
        }
      } else if (typeof q.eq === 'function') {
        q = q.eq('scope', 'global');
      } else {
        break;
      }

      if (typeof q.order === 'function') {
        q = q.order('id', { ascending: true });
      }
      const supportsRange = typeof q.range === 'function';
      if (supportsRange) {
        q = q.range(offset, offset + BATCH_SIZE - 1);
      }

      const res = await q;
      if (res?.error) {
        if (isPreCutoverSuppressionLookupError(res.error) || isMissingSuppressionColumn(res.error)) {
          fellBackToPreCutover = true;
          break;
        }
        const detail = String(
          (res.error as { message?: unknown }).message ||
            (res.error as { code?: unknown }).code ||
            'unknown error',
        );
        log.error('loadSuppressedEmailHashesForBroker query failed; throwing (fail closed)', {
          code: (res.error as { code?: unknown }).code ?? null,
          error: detail,
        });
        throw new Error(`SUPPRESSION_LOOKUP_FAILED: ${detail}`);
      }

      const page = Array.isArray(res?.data) ? res.data : [];
      for (const row of page) {
        if (row?.email_hash) out.add(String(row.email_hash));
      }

      if (!supportsRange || page.length < BATCH_SIZE) {
        break;
      }
      offset += BATCH_SIZE;
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SUPPRESSION_LOOKUP_FAILED:')) {
      throw err;
    }
    if (isPreCutoverSuppressionLookupError(err) || isMissingSuppressionColumn(err)) {
      fellBackToPreCutover = true;
    } else {
      const detail = err instanceof Error ? err.message : String(err);
      log.error('loadSuppressedEmailHashesForBroker threw; rethrowing (fail closed)', {
        error: detail,
      });
      throw new Error(`SUPPRESSION_LOOKUP_FAILED: ${detail}`);
    }
  }

  if (!fellBackToPreCutover) {
    return out;
  }

  // Pre-cutover fallback when `email_suppressions` does not exist yet (42P01 / PGRST205):
  // 1) Collect hashes from `magazine_subscribers` (unsubscribed OR bounced/complained)
  let brokerSlug: string | null = null;
  if (validBrokerUuid) {
    try {
      let bpQ = supabase.from('broker_profiles').select('slug');
      if (typeof bpQ?.eq === 'function') {
        bpQ = bpQ.eq('user_id', validBrokerUuid);
        const bpRes = typeof bpQ.maybeSingle === 'function' ? await bpQ.maybeSingle() : await bpQ;
        const bpData = Array.isArray(bpRes?.data) ? bpRes.data[0] : bpRes?.data;
        if (bpData && typeof bpData.slug === 'string' && bpData.slug.trim()) {
          brokerSlug = bpData.slug.trim();
        }
      }
    } catch {
      // optional slug lookup for pre-cutover subscriber scoping
    }
  }

  const runSubscriberFallback = async (includeExtendedCols: boolean) => {
    const cols = includeExtendedCols
      ? 'subscriber_email, broker_id, broker_user_id, status, unsubscribed_at, email_delivery_status, consent_status'
      : 'subscriber_email, broker_id, broker_user_id, status, unsubscribed_at';
    const orExpr = includeExtendedCols
      ? 'status.eq.unsubscribed,unsubscribed_at.not.is.null,email_delivery_status.in.(bounced,complained)'
      : 'status.eq.unsubscribed,unsubscribed_at.not.is.null';
    let q = supabase.from('magazine_subscribers').select(cols);
    if (typeof q?.or === 'function') {
      q = q.or(orExpr);
    }
    return q;
  };

  try {
    let subRes = await runSubscriberFallback(true);
    if (subRes?.error && isMissingSuppressionColumn(subRes.error)) {
      subRes = await runSubscriberFallback(false);
    }
    if (subRes?.error) {
      if (!isPreCutoverSuppressionLookupError(subRes.error)) {
        const detail = String(
          (subRes.error as { message?: unknown }).message ||
            (subRes.error as { code?: unknown }).code ||
            'subscriber fallback error',
        );
        throw new Error(`SUPPRESSION_LOOKUP_FAILED: ${detail}`);
      }
    } else {
      for (const s of Array.isArray(subRes?.data) ? subRes.data : []) {
        const email = normalizeSuppressionEmail(s?.subscriber_email);
        if (!email) continue;
        const hash = hashEmailForSuppression(email);
        if (!hash) continue;

        const isBounceOrComplaint =
          s?.email_delivery_status === 'bounced' || s?.email_delivery_status === 'complained';
        if (isBounceOrComplaint) {
          out.add(hash);
          continue;
        }

        const isUnsub =
          s?.status === 'unsubscribed' ||
          Boolean(s?.unsubscribed_at) ||
          s?.consent_status === 'unsubscribed';
        if (!isUnsub) continue;

        if (!validBrokerUuid) continue;
        const rowBrokerUuid = typeof s?.broker_user_id === 'string' ? s.broker_user_id.trim() : '';
        const rowBrokerId = typeof s?.broker_id === 'string' ? s.broker_id.trim() : '';
        const matchesBroker =
          rowBrokerUuid === validBrokerUuid ||
          rowBrokerId === validBrokerUuid ||
          (brokerSlug !== null && rowBrokerId === brokerSlug) ||
          (!rowBrokerUuid && (!rowBrokerId || brokerSlug === null));
        if (matchesBroker) {
          out.add(hash);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SUPPRESSION_LOOKUP_FAILED:')) {
      throw err;
    }
    if (!isPreCutoverSuppressionLookupError(err)) {
      throw new Error(
        `SUPPRESSION_LOOKUP_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2) Collect hashes from `broker_clients` for the broker
  if (validBrokerUuid) {
    try {
      let cliQ = supabase
        .from('broker_clients')
        .select('email, consent_status, unsubscribed_at, tags');
      if (typeof cliQ?.eq === 'function') {
        cliQ = cliQ.eq('broker_id', validBrokerUuid);
      }
      let cliRes = await cliQ;
      if (cliRes?.error && isMissingSuppressionColumn(cliRes.error)) {
        let fallbackCliQ = supabase.from('broker_clients').select('email, tags');
        if (typeof fallbackCliQ?.eq === 'function') {
          fallbackCliQ = fallbackCliQ.eq('broker_id', validBrokerUuid);
        }
        cliRes = await fallbackCliQ;
      }
      if (cliRes?.error) {
        if (!isPreCutoverSuppressionLookupError(cliRes.error)) {
          const detail = String(
            (cliRes.error as { message?: unknown }).message ||
              (cliRes.error as { code?: unknown }).code ||
              'broker_clients fallback error',
          );
          throw new Error(`SUPPRESSION_LOOKUP_FAILED: ${detail}`);
        }
      } else {
        for (const c of Array.isArray(cliRes?.data) ? cliRes.data : []) {
          const email = normalizeSuppressionEmail(c?.email);
          if (!email) continue;
          const tags = Array.isArray(c?.tags) ? c.tags.map(String) : [];
          if (
            Boolean(c?.unsubscribed_at) ||
            c?.consent_status === 'unsubscribed' ||
            tags.some((t: string) => /수신거부|해지|unsub/i.test(t))
          ) {
            const hash = hashEmailForSuppression(email);
            if (hash) out.add(hash);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('SUPPRESSION_LOOKUP_FAILED:')) {
        throw err;
      }
      if (!isPreCutoverSuppressionLookupError(err)) {
        throw new Error(
          `SUPPRESSION_LOOKUP_FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return out;
}
