/**
 * src/domain/magazine/consent-service.ts — 수신 동의 기록·더블 옵트인·재구독 정책 (G-01 / E-05, DC-6a)
 *
 * 원칙
 *  - 광고성 정보 수신 동의(정보통신망법 §50)는 사전 동의 + 본인 확인(확인 링크) 후에만 발송 대상이 된다.
 *    신규/재구독 모두 `confirm_status='pending'`으로 저장하며, sendGate(G-03)가 pending을 차단한다.
 *  - 해지(`status='unsubscribed'`) 구독자는 공개 폼으로 자동 재활성화하지 않는다. 새 동의를 기록하고 pending으로 두며,
 *    **확인 링크를 열었을 때에만** 재활성화한다(`canResubscribe`).
 *  - 이미 확인된(active+confirmed) 구독자의 재신청은 어떤 값도 바꾸지 않는다(제3자의 동의 덮어쓰기·상태 변경 방지,
 *    존재 여부 노출 방지를 위해 응답도 신규 신청과 동일).
 *  - 재구독 upsert는 기존 email/name/interest_profile을 null·빈 값으로 덮지 않고 병합한다(D2-14).
 *  - 마이그레이션(000006) 미적용(42703/42P01/PGRST2xx)이면 가짜 성공 없이 `UNAVAILABLE`로 정직하게 실패한다.
 *  - 로그에는 PII(전화/이메일/이름/토큰)를 남기지 않는다.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createModuleLogger } from '@/lib/logger';
import { redactPiiInText } from '@/lib/magazine/pii';
import { normalizeTagGroups } from '@/lib/magazine/tags';
import {
  getMagazineSendAllowlist,
  isMagazineSendDryRun,
  isMagazineSendEnabled,
} from '@/lib/magazine/send-flags';
import { renderOptInConfirmEmail } from './templates/opt-in-confirm';
import { assertAbsoluteHttpsUrl, getSiteBaseUrl } from './templates/url-guard';
import {
  CONSENT_CHANNEL_WEB,
  CONSENT_VERSION,
  type SubscribeChannel,
  type SubscribeSource,
  type ValidatedSubscribeInput,
} from './subscriber-consent-types';

const log = createModuleLogger('magazine-consent');

/** 도메인 계층: Supabase 직접 의존 없이 최소 인터페이스만 사용 */
export interface ConsentDbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

export const CONFIRM_TOKEN_TTL_DAYS = 7;
export const RECONFIRM_YEARS = 2;
export const RECONFIRM_NOTICE_LEAD_DAYS = 30;

const SUBSCRIBER_COLUMNS =
  'id, broker_id, status, unsubscribed_at, subscriber_name, subscriber_email, subscriber_phone, phone_e164, ' +
  'interest_profile, confirm_status, channel, source, marketing_consent_at';

export interface SubscriberRow {
  id: string;
  broker_id: string;
  status: string;
  unsubscribed_at: string | null;
  subscriber_name: string | null;
  subscriber_email: string | null;
  subscriber_phone: string | null;
  phone_e164: string | null;
  interest_profile: unknown;
  confirm_status: string | null;
  channel: string | null;
  source: string | null;
  marketing_consent_at: string | null;
}

// ───────────────────────── 오류 분류 ─────────────────────────

type DbError = { code?: string; message?: string } | null | undefined;

/** 마이그레이션 미적용(컬럼/테이블/스키마 캐시 없음) 판별 */
export function isSchemaMissingError(err: DbError): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) return true;
  return /column .* does not exist|could not find the .* column|schema cache/i.test(err.message ?? '');
}

function logDbError(where: string, err: DbError): void {
  // 코드와 (PII 마스킹한) 메시지 앞부분만 남긴다
  log.error(`[consent] ${where} 실패`, { code: err?.code, message: redactPiiInText(err?.message ?? '').slice(0, 200) });
}

// ───────────────────────── 토큰·시각 ─────────────────────────

/** 확인 토큰 발급: 256-bit 랜덤(base64url). DB에는 해시만 저장한다. */
export function issueConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashConfirmToken(token) };
}

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 상수시간 문자열 비교(길이가 다르면 false). */
export function safeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 수신동의 2년 재확인 도래일(§50⑧): 동의 시각 + 2년 (2/29 → 2/28). */
export function computeReconfirmDue(consentAt: Date | string): Date {
  const d = new Date(consentAt);
  if (Number.isNaN(d.getTime())) throw new Error('computeReconfirmDue: invalid date');
  const out = new Date(d.getTime());
  const month = out.getUTCMonth();
  out.setUTCFullYear(out.getUTCFullYear() + RECONFIRM_YEARS);
  if (out.getUTCMonth() !== month) out.setUTCDate(0); // 윤일 보정
  return out;
}

/** 재확인 통지 대상 여부: 도래일 30일 전부터. */
export function isReconfirmNoticeDue(sub: { reconfirm_due_at?: string | null }, now: Date = new Date()): boolean {
  if (!sub.reconfirm_due_at) return false;
  const due = new Date(sub.reconfirm_due_at).getTime();
  if (Number.isNaN(due)) return false;
  return now.getTime() >= due - RECONFIRM_NOTICE_LEAD_DAYS * 86_400_000;
}

// ───────────────────────── 재구독 정책 ─────────────────────────

/**
 * 구독자를 (재)활성화해도 되는가?
 *  - 해지 이력(`status='unsubscribed'` 또는 `unsubscribed_at`)이 있으면 **본인 확인(confirmed:true) 후에만** true.
 *  - 파기/삭제 상태는 항상 false.
 *  - 해지 이력이 없으면 true.
 */
export function canResubscribe(
  sub: { status?: string | null; unsubscribed_at?: string | null },
  opts: { confirmed?: boolean } = {},
): boolean {
  if (sub.status === 'purged' || sub.status === 'deleted') return false;
  const wasUnsubscribed = sub.status === 'unsubscribed' || !!sub.unsubscribed_at;
  if (!wasUnsubscribed) return true;
  return opts.confirmed === true;
}

function isConfirmedActive(sub: SubscriberRow): boolean {
  return sub.status === 'active' && sub.confirm_status === 'confirmed' && !sub.unsubscribed_at;
}

// ───────────────────────── interest_profile 병합 ─────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 문자열 배열은 합집합, 객체는 재귀 병합, 그 외는 incoming이 비어 있지 않을 때만 덮어쓴다(null/빈 값으로 덮지 않음). */
export function mergeInterest(existing: unknown, incoming: unknown): unknown {
  if (incoming === null || incoming === undefined || incoming === '') return existing;
  if (Array.isArray(incoming)) {
    if (incoming.length === 0) return existing;
    if (Array.isArray(existing)) return Array.from(new Set([...existing, ...incoming]));
    return incoming;
  }
  if (isPlainObject(incoming)) {
    const base: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {};
    for (const [k, v] of Object.entries(incoming)) base[k] = mergeInterest(base[k], v);
    return base;
  }
  return incoming;
}

function buildInterestProfile(
  existing: unknown,
  input: Pick<ValidatedSubscribeInput, 'tags' | 'referrer'> & { origin: SubscribeSource },
): Record<string, unknown> {
  // DC-9 저장 규칙: interest_profile.tags = { regions, assetTypes } (tags.ts). 레거시 평탄 배열은 그룹으로 변환해 병합한다.
  const base: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {};
  if (Array.isArray(base.tags)) base.tags = normalizeTagGroups(base.tags);
  const incoming: Record<string, unknown> = {};
  if (typeof base.origin !== 'string') incoming.origin = input.origin; // 최초 유입 출처는 재구독해도 보존
  const groups = normalizeTagGroups(input.tags);
  if (groups.regions.length || groups.assetTypes.length) incoming.tags = groups;
  if (input.referrer) incoming.referrer = input.referrer;
  const merged = mergeInterest(base, incoming);
  return isPlainObject(merged) ? merged : { ...incoming };
}

// ───────────────────────── 조회 ─────────────────────────

function phoneVariants(domestic: string): string[] {
  // 과거 공개 폼은 하이픈 포함 원문을 저장했다 → 변형까지 조회해 중복을 막는다
  const out = new Set<string>([domestic, `+82${domestic.slice(1)}`]);
  if (domestic.length === 11) out.add(`${domestic.slice(0, 3)}-${domestic.slice(3, 7)}-${domestic.slice(7)}`);
  if (domestic.length === 10) out.add(`${domestic.slice(0, 3)}-${domestic.slice(3, 6)}-${domestic.slice(6)}`);
  return Array.from(out);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type FindResult = { ok: true; row: SubscriberRow | null } | { ok: false; code: 'UNAVAILABLE' | 'DB_ERROR' };

async function findByPhone(db: ConsentDbClient, slug: string, domestic: string, e164: string): Promise<FindResult> {
  const byE164 = await db.from('magazine_subscribers').select(SUBSCRIBER_COLUMNS).eq('broker_id', slug).eq('phone_e164', e164).limit(1);
  if (byE164.error) return mapFindError('findByPhoneE164', byE164.error);
  if (byE164.data?.length) return { ok: true, row: byE164.data[0] as SubscriberRow };
  const legacy = await db
    .from('magazine_subscribers')
    .select(SUBSCRIBER_COLUMNS)
    .eq('broker_id', slug)
    .in('subscriber_phone', phoneVariants(domestic))
    .limit(1);
  if (legacy.error) return mapFindError('findByPhoneLegacy', legacy.error);
  return { ok: true, row: (legacy.data?.[0] as SubscriberRow | undefined) ?? null };
}

async function findByEmail(db: ConsentDbClient, slug: string, email: string): Promise<FindResult> {
  // lower(email) partial unique 기준 → 대소문자 무시 매칭(LIKE 와일드카드 이스케이프)
  const r = await db
    .from('magazine_subscribers')
    .select(SUBSCRIBER_COLUMNS)
    .eq('broker_id', slug)
    .ilike('subscriber_email', escapeLike(email))
    .limit(1);
  if (r.error) return mapFindError('findByEmail', r.error);
  return { ok: true, row: (r.data?.[0] as SubscriberRow | undefined) ?? null };
}

function mapFindError(where: string, err: DbError): { ok: false; code: 'UNAVAILABLE' | 'DB_ERROR' } {
  logDbError(where, err);
  return { ok: false, code: isSchemaMissingError(err) ? 'UNAVAILABLE' : 'DB_ERROR' };
}

// ───────────────────────── recordOptIn ─────────────────────────

export interface RecordOptInParams {
  /** magazine_subscribers.broker_id에 저장되는 slug */
  brokerSlug: string;
  /** 브로커 user_id(uuid) — 있으면 broker_user_id 저장 */
  brokerUserId?: string | null;
  input: ValidatedSubscribeInput;
  /** hashIp() 결과(원문 IP 저장 금지) */
  ipHash: string | null;
  now?: Date;
}

export type RecordOptInOutcome = 'created' | 'updated' | 'resubscribe_pending' | 'already_confirmed';

/**
 * pending(확인 전) 상태가 풀리지 않는 사유.
 *  - NO_EMAIL_CONFIRM_CHANNEL: 이메일 주소가 없거나 카카오 전용 신청이라 확인 링크를 보낼 채널이 없다.
 *    알림톡 확인 템플릿(승인 필요)이 생기기 전까지 이 구독자는 pending으로 남고 발송 게이트(PENDING_CONFIRM)가 막는다.
 *    → 소유자 화면(E2)은 이 사유를 보고 "확인 채널 없음 — 이메일 확보 또는 수동 확인 필요"를 정직하게 안내한다.
 */
export type PendingReason = 'NO_EMAIL_CONFIRM_CHANNEL';

/** 신청 입력만으로 판단(공개 응답이 기존 구독 여부를 드러내지 않도록 저장된 행은 보지 않는다). */
export function pendingReasonForInput(input: { email?: string | null; channel: SubscribeChannel }): PendingReason | null {
  return input.email && (input.channel === 'email' || input.channel === 'both') ? null : 'NO_EMAIL_CONFIRM_CHANNEL';
}

/** 저장된 구독자 행 기준(소유자 UI용): confirmed면 null, pending이면 확인 채널 유무로 사유 도출. */
export function derivePendingReason(sub: {
  confirm_status?: string | null;
  subscriber_email?: string | null;
  channel?: string | null;
}): PendingReason | null {
  if (sub.confirm_status !== 'pending') return null;
  const emailChannel = sub.channel === 'email' || sub.channel === 'both';
  return sub.subscriber_email && emailChannel ? null : 'NO_EMAIL_CONFIRM_CHANNEL';
}

export type RecordOptInResult =
  | {
      ok: true;
      outcome: RecordOptInOutcome;
      subscriberId: string;
      /** 공개 응답에 쓰는 상태. 존재 여부 노출 방지를 위해 already_confirmed도 'pending'으로 통일한다. */
      status: 'pending';
      /** 확인 링크를 보낼 때 쓰는 평문 토큰(저장 금지). already_confirmed면 null. */
      confirmToken: string | null;
      /** 이번 신청으로는 확인 메시지를 보낼 수 없는 사유(없으면 null). already_confirmed면 null. */
      pendingReason: PendingReason | null;
    }
  | { ok: false; code: 'UNAVAILABLE' | 'DB_ERROR' };

/**
 * 동의를 기록하고 구독자를 pending으로 upsert한다.
 * 호출 전제: 입력은 validateSubscribeInput을 통과했고(동의 3종 true), broker는 resolveBroker로 확인됨.
 */
export async function recordOptIn(db: ConsentDbClient, p: RecordOptInParams): Promise<RecordOptInResult> {
  const now = p.now ?? new Date();
  const nowIso = now.toISOString();
  const { input } = p;

  for (let attempt = 0; attempt < 2; attempt++) {
    // 1) 기존 행 조회: 전화(E.164·레거시 변형) 우선, 다음 이메일(소문자)
    let phoneRow: SubscriberRow | null = null;
    let emailRow: SubscriberRow | null = null;
    if (input.phone && input.phoneE164) {
      const r = await findByPhone(db, p.brokerSlug, input.phone, input.phoneE164);
      if (!r.ok) return r;
      phoneRow = r.row;
    }
    if (input.email) {
      const r = await findByEmail(db, p.brokerSlug, input.email);
      if (!r.ok) return r;
      emailRow = r.row;
    }
    const target = phoneRow ?? emailRow;
    // 전화·이메일이 서로 다른 행을 가리키면 이메일 unique 충돌을 피하려고 이메일은 갱신하지 않는다
    const emailOwnedByOther = !!(phoneRow && emailRow && phoneRow.id !== emailRow.id);
    const phoneOwnedByOther = !!(emailRow && phoneRow && emailRow.id !== phoneRow.id);

    // 2) 이미 확인된 활성 구독자: 아무것도 바꾸지 않는다
    if (target && isConfirmedActive(target)) {
      return { ok: true, outcome: 'already_confirmed', subscriberId: target.id, status: 'pending', confirmToken: null, pendingReason: null };
    }

    const { token, hash } = issueConfirmToken();
    const consentFields = {
      privacy_consent_at: nowIso,
      marketing_consent_at: nowIso,
      consent_version: CONSENT_VERSION,
      consent_channel: CONSENT_CHANNEL_WEB,
      night_consent: input.consent.night,
      consent_ip_hash: p.ipHash,
      age_confirmed: input.consent.age14,
      reconfirm_due_at: computeReconfirmDue(now).toISOString(),
      confirm_status: 'pending' as const,
      confirm_token_hash: hash,
    };

    if (target) {
      // 3a) 갱신 — COALESCE 병합(새 값이 있을 때만 교체, 없으면 기존 유지)
      const patch: Record<string, unknown> = {
        subscriber_name: input.name ?? target.subscriber_name ?? null,
        subscriber_email: emailOwnedByOther ? target.subscriber_email : (input.email ?? target.subscriber_email ?? null),
        subscriber_phone: phoneOwnedByOther ? target.subscriber_phone : (input.phone ?? target.subscriber_phone ?? null),
        phone_e164: phoneOwnedByOther ? target.phone_e164 : (input.phoneE164 ?? target.phone_e164 ?? null),
        channel: input.channel,
        interest_profile: buildInterestProfile(target.interest_profile, { ...input, origin: input.source }),
        ...consentFields,
      };
      if (p.brokerUserId) patch.broker_user_id = p.brokerUserId;
      // status / unsubscribed_at / source는 의도적으로 건드리지 않는다:
      //  - 해지자는 unsubscribed 유지, 확인 링크(confirmOptIn)에서만 재활성화
      const { error } = await db.from('magazine_subscribers').update(patch).eq('id', target.id).eq('broker_id', p.brokerSlug);
      if (error) {
        logDbError('update', error);
        return { ok: false, code: isSchemaMissingError(error) ? 'UNAVAILABLE' : 'DB_ERROR' };
      }
      const wasUnsub = target.status === 'unsubscribed' || !!target.unsubscribed_at;
      return {
        ok: true,
        outcome: wasUnsub ? 'resubscribe_pending' : 'updated',
        subscriberId: target.id,
        status: 'pending',
        confirmToken: token,
        pendingReason: pendingReasonForInput(input),
      };
    }

    // 3b) 신규
    const baseRow: Record<string, unknown> = {
      broker_id: p.brokerSlug,
      subscriber_name: input.name,
      subscriber_phone: input.phone,
      phone_e164: input.phoneE164,
      subscriber_email: input.email,
      channel: input.channel,
      source: input.source,
      status: 'active', // 발송 대상 여부는 confirm_status(pending)가 결정 — sendGate가 PENDING_CONFIRM으로 차단
      subscribed_at: nowIso,
      interest_profile: buildInterestProfile({}, { ...input, origin: input.source }),
      ...consentFields,
    };
    if (p.brokerUserId) baseRow.broker_user_id = p.brokerUserId;

    let ins = await db.from('magazine_subscribers').insert(baseRow).select('id').single();
    if (ins.error?.code === '23514' && input.source !== 'magazine') {
      // source CHECK에 'qr_card' 등이 아직 없는 DB: 출처는 interest_profile.origin에 보존하고 'magazine'으로 저장
      log.warn('[consent] source CHECK 미확장 DB → source=magazine 폴백(origin은 interest_profile에 보존)');
      ins = await db.from('magazine_subscribers').insert({ ...baseRow, source: 'magazine' }).select('id').single();
    }
    if (ins.error) {
      if (ins.error.code === '23505' && attempt === 0) continue; // 동시 가입 경합 → 재조회 후 갱신 경로
      logDbError('insert', ins.error);
      return { ok: false, code: isSchemaMissingError(ins.error) ? 'UNAVAILABLE' : 'DB_ERROR' };
    }
    return {
      ok: true,
      outcome: 'created',
      subscriberId: ins.data.id as string,
      status: 'pending',
      confirmToken: token,
      pendingReason: pendingReasonForInput(input),
    };
  }
  return { ok: false, code: 'DB_ERROR' };
}

// ───────────────────────── confirmOptIn ─────────────────────────

export type ConfirmOptInResult =
  | { ok: true; subscriberId: string; reactivated: boolean; alreadyConfirmed: boolean }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'UNAVAILABLE' | 'ERROR' };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * 확인 처리(POST 전용 — GET은 확인 버튼 페이지만 렌더, 메일 스캐너 prefetch로 소비되지 않게):
 * 토큰 해시 비교(timingSafeEqual) → 만료(동의 시각 + 7일) 확인 → confirmed.
 * 해지 이력이 있는 구독자는 이 시점에만 active로 되돌린다(canResubscribe confirmed:true).
 *
 * 멱등: 확인 후에도 토큰 해시는 TTL 동안 유지된다. 같은 토큰 재요청(더블클릭/재시도)은
 *  - 이미 confirmed + 활성 구독이면 상태 변경 없이 ok(alreadyConfirmed:true),
 *  - confirmed 이후 해지된 구독자라면 INVALID(오래된 링크로 재활성화 금지).
 * 새 신청(recordOptIn)은 새 토큰 해시로 교체하므로 이전 링크는 무효가 된다.
 */
export async function confirmOptIn(
  db: ConsentDbClient,
  params: { token: string | null | undefined; brokerSlug: string | null | undefined; now?: Date },
): Promise<ConfirmOptInResult> {
  const { token, brokerSlug } = params;
  if (!token || !brokerSlug || !TOKEN_SHAPE.test(token) || brokerSlug.length > 80) return { ok: false, reason: 'INVALID' };
  const now = params.now ?? new Date();
  const hash = hashConfirmToken(token);

  const { data, error } = await db
    .from('magazine_subscribers')
    .select('id, status, unsubscribed_at, confirm_status, confirm_token_hash, marketing_consent_at')
    .eq('broker_id', brokerSlug)
    .eq('confirm_token_hash', hash)
    .limit(1);
  if (error) {
    logDbError('confirm select', error);
    return { ok: false, reason: isSchemaMissingError(error) ? 'UNAVAILABLE' : 'ERROR' };
  }
  const row = data?.[0] as
    | {
        id: string;
        status: string;
        unsubscribed_at: string | null;
        confirm_status?: string | null;
        confirm_token_hash: string | null;
        marketing_consent_at: string | null;
      }
    | undefined;
  if (!row || !row.confirm_token_hash || !safeEqualStrings(row.confirm_token_hash, hash)) return { ok: false, reason: 'INVALID' };

  const issuedAt = row.marketing_consent_at ? new Date(row.marketing_consent_at).getTime() : NaN;
  const within = !Number.isNaN(issuedAt) && now.getTime() - issuedAt <= CONFIRM_TOKEN_TTL_DAYS * 86_400_000;

  // 멱등 경로: 이미 확인된 토큰 — 상태를 바꾸지 않는다
  if (row.confirm_status === 'confirmed') {
    const active = row.status === 'active' && !row.unsubscribed_at;
    if (within && active) return { ok: true, subscriberId: row.id, reactivated: false, alreadyConfirmed: true };
    return { ok: false, reason: 'INVALID' };
  }

  if (!within) return { ok: false, reason: 'EXPIRED' };

  const reactivate = (row.status === 'unsubscribed' || !!row.unsubscribed_at) && canResubscribe(row, { confirmed: true });
  const patch: Record<string, unknown> = { confirm_status: 'confirmed' };
  if (reactivate) {
    patch.status = 'active';
    patch.unsubscribed_at = null;
  }
  const upd = await db
    .from('magazine_subscribers')
    .update(patch)
    .eq('id', row.id)
    .eq('broker_id', brokerSlug)
    .eq('confirm_token_hash', hash)
    .eq('confirm_status', 'pending') // 동시 클릭 경합 방지(한쪽만 상태 전이)
    .select('id');
  if (upd.error) {
    logDbError('confirm update', upd.error);
    return { ok: false, reason: isSchemaMissingError(upd.error) ? 'UNAVAILABLE' : 'ERROR' };
  }
  if (!upd.data?.length) {
    // 동시 요청이 먼저 전이시킨 경우: 사용자가 같은 링크를 다시 열면 멱등 경로(alreadyConfirmed)로 ok가 된다
    return { ok: false, reason: 'INVALID' };
  }
  return { ok: true, subscriberId: row.id, reactivated: reactivate, alreadyConfirmed: false };
}

// ───────────────────────── 확인 메시지 발송 ─────────────────────────

export type OptInSendSkipReason =
  | 'SEND_DISABLED'
  | 'DRY_RUN'
  | 'NOT_ALLOWLISTED'
  | 'CHANNEL_NOT_AVAILABLE'
  | 'NO_PROVIDER'
  | 'INVALID_URL'
  | 'FAILED';

export type SendOptInResult = { sent: true } | { sent: false; reason: OptInSendSkipReason };

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOptInDeps {
  /** 기본: Resend 직접 호출(키 없으면 NO_PROVIDER). 테스트에서는 mock 주입. */
  sendEmail?: (msg: EmailMessage) => Promise<{ ok: boolean; noProvider?: boolean }>;
}

/** 확인 링크 URL 생성: /api/public/magazine/confirm?t=...&b=... (절대 https URL 검증 포함) */
export function buildConfirmUrl(token: string, brokerSlug: string, baseUrl: string = getSiteBaseUrl()): string {
  const url = `${baseUrl}/api/public/magazine/confirm?t=${encodeURIComponent(token)}&b=${encodeURIComponent(brokerSlug)}`;
  return assertAbsoluteHttpsUrl(url, 'confirmUrl');
}

async function defaultSendEmail(msg: EmailMessage): Promise<{ ok: boolean; noProvider?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, noProvider: true };
  const { Resend } = await import('resend');
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || 'CRE Magazine <magazine@credeal.net>';
  const { error } = await resend.emails.send({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  if (error) {
    log.error('[consent] 확인 메일 발송 실패', { name: (error as { name?: string }).name });
    return { ok: false };
  }
  return { ok: true };
}

/**
 * 구독 확인 메시지 발송.
 *  - MAGAZINE_SEND_ENABLED=true **그리고** dry-run 해제일 때만 실제 발송. 아니면 보내지 않고 사유 반환(구독자는 pending 유지).
 *  - allowlist(canary)가 설정된 경우 목록 밖 수신자에게는 보내지 않는다.
 *  - 이메일 채널만 지원. 카카오 전용 구독은 알림톡 확인 템플릿 승인 전까지 CHANNEL_NOT_AVAILABLE.
 */
export async function sendOptInConfirmation(
  params: {
    channel: SubscribeChannel;
    email?: string | null;
    brokerSlug: string;
    brokerName?: string | null;
    brokerContact?: string | null;
    subscriberName?: string | null;
    token: string;
  },
  deps: SendOptInDeps = {},
): Promise<SendOptInResult> {
  if (!isMagazineSendEnabled()) return { sent: false, reason: 'SEND_DISABLED' };
  if (isMagazineSendDryRun()) return { sent: false, reason: 'DRY_RUN' };
  if (!params.email || (params.channel !== 'email' && params.channel !== 'both')) {
    return { sent: false, reason: 'CHANNEL_NOT_AVAILABLE' };
  }
  const allow = getMagazineSendAllowlist();
  if (allow.size > 0 && !allow.has(params.email.toLowerCase())) return { sent: false, reason: 'NOT_ALLOWLISTED' };

  let rendered;
  try {
    const confirmUrl = buildConfirmUrl(params.token, params.brokerSlug);
    rendered = renderOptInConfirmEmail({
      brokerName: params.brokerName,
      brokerContact: params.brokerContact,
      subscriberName: params.subscriberName,
      confirmUrl,
      ttlDays: CONFIRM_TOKEN_TTL_DAYS,
    });
  } catch (err) {
    log.error('[consent] 확인 메일 렌더 실패', { message: redactPiiInText(err instanceof Error ? err.message : '').slice(0, 200) });
    return { sent: false, reason: 'INVALID_URL' };
  }

  try {
    const r = await (deps.sendEmail ?? defaultSendEmail)({ to: params.email, ...rendered });
    if (r.noProvider) return { sent: false, reason: 'NO_PROVIDER' };
    return r.ok ? { sent: true } : { sent: false, reason: 'FAILED' };
  } catch (err) {
    log.error('[consent] 확인 메일 발송 예외', { message: redactPiiInText(err instanceof Error ? err.message : '').slice(0, 200) });
    return { sent: false, reason: 'FAILED' };
  }
}
