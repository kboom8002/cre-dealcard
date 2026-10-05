/**
 * @module send-batch
 * @description distributeMagazine / distributeSpecialEdition 공용 배치 엔진.
 * 구독자 조회(에러 throw) → 채널 타깃 확장 → 수신거부 링크·렌더 → sendGate 경유 발송 → 정직한 집계.
 * provider는 여기서 직접 호출하지 않는다(전부 sendGate 경유).
 */
import { isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';
import type { MagazineDbClient } from './types';
import { renderMagazineEmail, renderMagazineKakaoText } from './email-template';
import { buildListUnsubscribeHeaders, buildUnsubscribeUrl, issueUnsubToken } from './unsub-token';
import { issueSidToken } from './sid-token';
import {
  sendGate,
  type GateBlockReason,
  type GateChannel,
  type GateDeps,
  type GateKind,
  type GateRendered,
  type GateSubscriber,
} from './send-gate';

const log = createModuleLogger('magazine-send-batch');

export const BATCH_CONCURRENCY = 5;

export const SUBSCRIBER_COLUMNS =
  'id, subscriber_phone, subscriber_name, subscriber_email, segment, channel, interest_profile, client_id, status, ' +
  'unsubscribed_at, marketing_consent_at, confirm_status, night_consent';

export interface SubscriberRow extends GateSubscriber {
  segment?: string | null;
  interest_profile?: { tags?: { regions?: string[]; assetTypes?: string[] } } | Record<string, unknown> | null;
  client_id?: string | null;
}

export type TargetSegment = 'all' | 'buyer' | 'seller';

export interface BrokerIdentity {
  slug: string;
  userId: string | null;
  /** profiles.display_name — 없으면 null (발송 차단: MISSING_SENDER) */
  senderName: string | null;
  /** profiles.phone → broker_profiles.contact_email */
  senderContact: string | null;
}

type DbErr = { code?: string; message?: string } | null | undefined;

function errMessage(e: DbErr): string {
  return e?.message ?? 'unknown error';
}

/** 브로커 정체성 조회. select 에러는 삼키지 않고 throw. 프로필이 없으면 null. */
export async function loadBrokerIdentity(supabase: MagazineDbClient, brokerKey: string): Promise<BrokerIdentity | null> {
  // user_id 컬럼은 uuid — slug 문자열을 eq 하면 22P02 이므로 키 형태에 따라 컬럼을 고른다
  const q = supabase.from('broker_profiles').select('user_id, slug, contact_email');
  const { data: bp, error: bpErr } = await (isUuid(brokerKey) ? q.eq('user_id', brokerKey) : q.eq('slug', brokerKey)).maybeSingle();
  if (bpErr) throw new Error(`브로커 프로필 조회 실패: ${errMessage(bpErr)}`);
  if (!bp) return null;

  let senderName: string | null = null;
  let phone: string | null = null;
  if (bp.user_id) {
    const { data: pf, error: pfErr } = await supabase.from('profiles').select('display_name, phone').eq('id', bp.user_id).maybeSingle();
    if (pfErr) throw new Error(`발신자 프로필 조회 실패: ${errMessage(pfErr)}`);
    senderName = (pf?.display_name as string | null)?.trim() || null;
    phone = (pf?.phone as string | null)?.trim() || null;
  }
  const contactEmail = (bp.contact_email as string | null)?.trim() || null;
  return {
    slug: (bp.slug as string | null) ?? brokerKey,
    userId: (bp.user_id as string | null) ?? null,
    senderName,
    senderContact: phone || contactEmail,
  };
}

/** 활성 구독자 조회. 에러는 삼키지 않고 throw (T2-02b). */
export async function loadActiveSubscribers(supabase: MagazineDbClient, brokerKeys: string[]): Promise<SubscriberRow[]> {
  const { data, error } = await supabase
    .from('magazine_subscribers')
    .select(SUBSCRIBER_COLUMNS)
    .in('broker_id', brokerKeys)
    .eq('status', 'active');
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '42703') {
      throw new Error(`구독자 조회 실패: 동의 컬럼이 없습니다(마이그레이션 20261004000006 미적용 가능). ${errMessage(e)}`);
    }
    throw new Error(`구독자 조회 실패: ${errMessage(e)}`);
  }
  return (data ?? []) as SubscriberRow[];
}

/**
 * DC-9 타깃 세그먼트. 기존 데이터의 segment 기본값 'investor'는 매수 성향(buyer)으로 취급한다.
 * 알 수 없는 segment 값은 'all' 대상에서만 포함된다.
 */
export function segmentMatches(target: TargetSegment | undefined, segment: string | null | undefined): boolean {
  if (!target || target === 'all') return true;
  if (target === 'seller') return segment === 'seller';
  return segment === 'buyer' || segment === 'investor';
}

export function resolveBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

export interface PlannedTarget {
  sub: SubscriberRow;
  channel: GateChannel;
}

export interface Tally {
  total: number;
  /** 실제 provider 발송 성공(dry-run은 0) */
  sent: number;
  failed: number;
  /** dry-run으로 원장에 기록된 건수 */
  recorded: number;
  blocked: Record<string, number>;
  email: { sent: number; failed: number; recorded: number };
  kakao: { sent: number; failed: number; recorded: number };
}

export function emptyTally(): Tally {
  return {
    total: 0,
    sent: 0,
    failed: 0,
    recorded: 0,
    blocked: {},
    email: { sent: 0, failed: 0, recorded: 0 },
    kakao: { sent: 0, failed: 0, recorded: 0 },
  };
}

export function addBlocked(t: Tally, reason: GateBlockReason | string, n = 1): void {
  t.blocked[reason] = (t.blocked[reason] ?? 0) + n;
}

/**
 * 구독자 → (구독자, 채널) 타깃 확장.
 * - 채널 설정이 없거나 인식 불가인 구독자는 CHANNEL_NOT_CONSENTED 1건으로 집계
 * - 카카오는 유료 티어만(allowKakao=false면 CHANNEL_NOT_AVAILABLE)
 */
export function planTargets(subs: SubscriberRow[], opts: { allowKakao: boolean }, tally: Tally): PlannedTarget[] {
  const out: PlannedTarget[] = [];
  for (const sub of subs) {
    const ch = sub.channel;
    const wantsEmail = ch === 'email' || ch === 'both';
    const wantsKakao = ch === 'kakao' || ch === 'both';
    if (!wantsEmail && !wantsKakao) {
      tally.total += 1;
      addBlocked(tally, 'CHANNEL_NOT_CONSENTED');
      continue;
    }
    if (wantsEmail) out.push({ sub, channel: 'email' });
    if (wantsKakao) {
      if (opts.allowKakao) out.push({ sub, channel: 'kakao' });
      else {
        tally.total += 1;
        addBlocked(tally, 'CHANNEL_NOT_AVAILABLE');
      }
    }
  }
  return out;
}

export interface RunContext {
  supabase: MagazineDbClient;
  broker: BrokerIdentity;
  kind: GateKind;
  editionKey: string;
  editionId: string | null;
  baseUrl: string;
  edition: { title: string; headline: string; marketTemp: string; date: string; url: string };
  kakaoTemplateId: string;
  gateDeps?: GateDeps;
}

/**
 * 구독자 개인 링크에 `sid`(서명 토큰)를 병합한다. 기존 쿼리(`?target=` 등)는 보존.
 * MAGAZINE_SID_SECRET이 없거나 발급이 실패하면 sid 없이 익명 링크를 그대로 돌려준다(정직한 degrade).
 */
export function appendSid(url: string, subscriberId: string, brokerKey: string): string {
  try {
    const sid = issueSidToken({ subscriberId, brokerKey });
    const u = new URL(url);
    u.searchParams.set('sid', sid);
    return u.toString();
  } catch {
    return url;
  }
}

function renderFor(ctx: RunContext, t: PlannedTarget, unsubscribeUrl: string): GateRendered {
  const base = {
    brokerName: ctx.broker.senderName ?? '',
    brokerContact: ctx.broker.senderContact ?? undefined,
    subscriberName: t.sub.subscriber_name ?? undefined,
    edition: { ...ctx.edition, url: appendSid(ctx.edition.url, t.sub.id, ctx.broker.slug) },
    unsubscribeUrl,
    isAd: true as const,
  };

  if (t.channel === 'email') {
    const r = renderMagazineEmail(base);
    return {
      subject: r.subject,
      body: r.html,
      text: r.text,
      headers: buildListUnsubscribeHeaders(unsubscribeUrl) as Record<string, string>,
      hasUnsubscribeLink: r.hasUnsubscribeLink,
      hasAdLabel: r.hasAdLabel,
      senderName: ctx.broker.senderName,
      senderContact: ctx.broker.senderContact,
    };
  }
  const k = renderMagazineKakaoText(base);
  return {
    body: k.text,
    hasUnsubscribeLink: k.hasUnsubscribeLink,
    hasAdLabel: k.hasAdLabel,
    senderName: ctx.broker.senderName,
    senderContact: ctx.broker.senderContact,
    kakao: { templateId: ctx.kakaoTemplateId, variables: {} },
  };
}

async function runOne(ctx: RunContext, t: PlannedTarget, dailyCap: number, tally: Tally): Promise<void> {
  tally.total += 1;
  const bucket = t.channel === 'email' ? tally.email : tally.kakao;

  // 발신자 정보가 없으면 렌더·원장 없이 차단(가짜 발신자명 금지)
  if (!ctx.broker.senderName?.trim() || !ctx.broker.senderContact?.trim()) {
    addBlocked(tally, 'MISSING_SENDER');
    return;
  }
  // 해지 링크: APP_BASE_URL·UNSUBSCRIBE_SECRET이 없으면 발송 불가
  let unsubscribeUrl: string;
  try {
    if (!ctx.baseUrl) throw new Error('APP_BASE_URL is empty');
    const token = issueUnsubToken({ subscriberId: t.sub.id, brokerId: ctx.broker.userId ?? ctx.broker.slug });
    unsubscribeUrl = buildUnsubscribeUrl(ctx.baseUrl, token);
  } catch (e) {
    log.warn('unsubscribe link unavailable', { error: e instanceof Error ? e.message : String(e) });
    addBlocked(tally, 'MISSING_UNSUB_LINK');
    return;
  }

  let rendered: GateRendered;
  try {
    rendered = renderFor(ctx, t, unsubscribeUrl);
  } catch (e) {
    log.error('magazine render failed', { channel: t.channel, error: e instanceof Error ? e.message : String(e) });
    tally.failed += 1;
    bucket.failed += 1;
    return;
  }

  const res = await sendGate(
    {
      subscriber: t.sub,
      channel: t.channel,
      editionId: ctx.editionId,
      editionKey: ctx.editionKey,
      brokerId: ctx.broker.slug,
      brokerUserId: ctx.broker.userId,
      kind: ctx.kind,
      rendered,
      dailyCap,
    },
    { supabase: ctx.supabase, ...ctx.gateDeps },
  );

  if (res.ok) {
    if (res.dryRun) {
      tally.recorded += 1;
      bucket.recorded += 1;
    } else {
      tally.sent += 1;
      bucket.sent += 1;
    }
    return;
  }
  if (res.failed || res.blocked === 'PROVIDER_FAILED') {
    tally.failed += 1;
    bucket.failed += 1;
    return;
  }
  addBlocked(tally, res.blocked);
}

/** 타깃을 BATCH_CONCURRENCY씩 병렬 처리하고 집계한다. 예외는 failed로 센다(삼키지 않고 로그). */
export async function runTargets(ctx: RunContext, targets: PlannedTarget[], tally: Tally): Promise<void> {
  const dailyCap = targets.length;
  for (let i = 0; i < targets.length; i += BATCH_CONCURRENCY) {
    const batch = targets.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((t) => runOne(ctx, t, dailyCap, tally)));
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        log.error('send target threw', { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        tally.failed += 1;
        (batch[idx].channel === 'email' ? tally.email : tally.kakao).failed += 1;
      }
    });
  }
}
