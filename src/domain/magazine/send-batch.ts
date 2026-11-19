/**
 * @module send-batch
 * @description distributeMagazine / distributeSpecialEdition 공용 배치 엔진.
 * 구독자 조회(에러 throw) → 채널 타깃 확장 → 수신거부 링크·렌더 → sendGate 경유 발송 → 정직한 집계.
 * provider는 여기서 직접 호출하지 않는다(전부 sendGate 경유).
 */
import { isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';
import { sanitizeStatutoryField } from '@/lib/legal/broker-statutory-disclosure';
import { hashEmailForSuppression, loadSuppressedEmailHashesForBroker } from '@/lib/legal/email-suppression';
import { maskAddress, redactPiiInText } from '@/lib/magazine/pii';
import type { MagazineDbClient } from './types';
import { renderMagazineEmail, renderMagazineKakaoText, type MagazineEmailInput } from './email-template';
import type { MagazineDealInput } from './templates/types';
import { buildListUnsubscribeHeaders, buildUnsubscribeUrl, issueUnsubToken } from './unsub-token';
import { issueSidToken } from './sid-token';
import {
  sendGate,
  buildIdempotencyKey,
  hashRecipient,
  normalizeRecipient,
  type GateBlockReason,
  type GateChannel,
  type GateDeps,
  type GateKind,
  type GateRendered,
  type GateSubscriber,
} from './send-gate';

const log = createModuleLogger('magazine-send-batch');

export const BATCH_CONCURRENCY = 2;
export const BATCH_PACE_MS = 250;
export const BATCH_429_MAX_RETRIES = 2;
export const BATCH_429_BASE_DELAY_MS = 300;

export interface RunTargetsOptions {
  concurrency?: number;
  paceMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export function isRateLimitErrorDetail(detail: string | null | undefined): boolean {
  if (!detail) return false;
  return /(?:^|\D)429(?:\D|$)|rate[_\s-]*limit|too\s+many\s+requests/i.test(detail);
}

export const SUBSCRIBER_COLUMNS =
  'id, subscriber_phone, subscriber_name, subscriber_email, segment, channel, interest_profile, client_id, status, ' +
  'unsubscribed_at, marketing_consent_at, confirm_status, night_consent, email_delivery_status';

export const SUBSCRIBER_COLUMNS_PRECUTOVER =
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
  /** broker_profiles.office_address (표시 의무 푸터) */
  senderAddress?: string | null;
  /** broker_profiles.contact_email (전자우편 푸터) */
  senderEmail?: string | null;
  /** broker_profiles.office_reg_number (중개사무소 등록번호) */
  officeRegNumber?: string | null;
  /** broker_profiles.representative_name (대표자 성명) */
  representativeName?: string | null;
}

type DbErr = { code?: string; message?: string } | null | undefined;

function errMessage(e: DbErr): string {
  return e?.message ?? 'unknown error';
}

/** 브로커 정체성 조회. select 에러는 삼키지 않고 throw. 프로필이 없으면 null. */
export async function loadBrokerIdentity(supabase: MagazineDbClient, brokerKey: string): Promise<BrokerIdentity | null> {
  // user_id 컬럼은 uuid — slug 문자열을 eq 하면 22P02 이므로 키 형태에 따라 컬럼을 고른다
  let q = supabase
    .from('broker_profiles')
    .select('user_id, slug, contact_email, office_address, office_reg_number, representative_name');
  let res = await (isUuid(brokerKey) ? q.eq('user_id', brokerKey) : q.eq('slug', brokerKey)).maybeSingle();
  if (res.error && (res.error as { code?: string }).code === '42703') {
    q = supabase.from('broker_profiles').select('user_id, slug, contact_email, office_address');
    res = await (isUuid(brokerKey) ? q.eq('user_id', brokerKey) : q.eq('slug', brokerKey)).maybeSingle();
  }
  if (res.error && (res.error as { code?: string }).code === '42703') {
    q = supabase.from('broker_profiles').select('user_id, slug, contact_email');
    res = await (isUuid(brokerKey) ? q.eq('user_id', brokerKey) : q.eq('slug', brokerKey)).maybeSingle();
  }
  const { data: bp, error: bpErr } = res;
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
  const bpRec = bp as Record<string, unknown>;
  const contactEmail = typeof bpRec.contact_email === 'string' ? bpRec.contact_email.trim() || null : null;
  const officeAddress = sanitizeStatutoryField(bpRec.office_address, 'address') ?? null;
  const officeRegNumber = sanitizeStatutoryField(bpRec.office_reg_number, 'regNo') ?? null;
  const representativeName = sanitizeStatutoryField(bpRec.representative_name, 'name') ?? null;
  return {
    slug: (bpRec.slug as string | null) ?? brokerKey,
    userId: (bpRec.user_id as string | null) ?? null,
    senderName,
    senderContact: phone || contactEmail,
    senderAddress: officeAddress,
    senderEmail: contactEmail,
    officeRegNumber,
    representativeName,
  };
}

export interface HydratedOutboundEdition {
  title?: string;
  headline?: string;
  marketTemp?: string;
  cadence?: string;
  fieldNote?: { question?: string; comment?: string } | null;
  deals?: MagazineDealInput[];
  topNews?: Array<{ title?: string; source?: string }>;
}

const LOT_NUMBER_RE = /\b\d{1,5}(?:-\d{1,4})\b(?:\s*번지)?/g;

function sanitizeOutboundProse(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return redactPiiInText(raw.replace(LOT_NUMBER_RE, '')).replace(/\s{2,}/g, ' ').trim();
}

/**
 * 발송 시점 `magazine_editions` 단건 조회 후 공개 안전 본문 섹션(fieldNote, 블라인드 deals, topNews, cadence)을 추출한다.
 * - raw_address / exact_address / jibun_address / road_address / layers 는 절대 읽지 않으며 모든 위치 표기는 maskAddress 로 동 단위 마스킹한다.
 */
export async function hydrateEditionForOutboundEmail(
  supabase: MagazineDbClient,
  editionId: string | null | undefined,
): Promise<HydratedOutboundEdition> {
  if (!editionId || !isUuid(editionId)) return {};
  try {
    const { data, error } = await supabase
      .from('magazine_editions')
      .select('id, edition_type, title, content')
      .eq('id', editionId)
      .maybeSingle();
    if (error || !data || typeof data !== 'object') return {};

    const row = data as Record<string, unknown>;
    const content =
      row.content && typeof row.content === 'object' && !Array.isArray(row.content)
        ? (row.content as Record<string, unknown>)
        : {};

    const rawCadence =
      (typeof content.cadence === 'string' && content.cadence.trim()) ||
      (typeof content.kind === 'string' && content.kind.trim()) ||
      (typeof row.edition_type === 'string' && row.edition_type.trim()) ||
      undefined;

    const rawTitle =
      (typeof row.title === 'string' && row.title.trim()) ||
      (typeof content.title === 'string' && content.title.trim()) ||
      undefined;

    const rawHeadline =
      sanitizeOutboundProse(content.ai_briefing) ||
      sanitizeOutboundProse(content.briefing) ||
      sanitizeOutboundProse(content.headline) ||
      undefined;

    const rawTemp =
      (typeof content.market_temp === 'string' && content.market_temp.trim()) ||
      (typeof content.marketTemp === 'string' && content.marketTemp.trim()) ||
      undefined;

    const rawFn =
      content.field_note && typeof content.field_note === 'object' && !Array.isArray(content.field_note)
        ? (content.field_note as Record<string, unknown>)
        : content.fieldNote && typeof content.fieldNote === 'object' && !Array.isArray(content.fieldNote)
          ? (content.fieldNote as Record<string, unknown>)
          : null;
    const fnQuestion = rawFn ? sanitizeOutboundProse(rawFn.question) : '';
    const fnComment = rawFn ? sanitizeOutboundProse(rawFn.comment) : '';
    const fieldNote = fnQuestion || fnComment ? { question: fnQuestion || undefined, comment: fnComment || undefined } : null;

    const rawDealsSource = Array.isArray(content.featured_deals)
      ? content.featured_deals
      : Array.isArray(content.dealHighlights)
        ? content.dealHighlights
        : Array.isArray(content.teaser_cards)
          ? content.teaser_cards
          : [];
    const deals: MagazineDealInput[] = [];
    for (const item of rawDealsSource.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      const d = item as Record<string, unknown>;
      const blindAreaRaw =
        (typeof d.areaSignal === 'string' && d.areaSignal.trim()) ||
        (typeof d.area_signal === 'string' && d.area_signal.trim()) ||
        (typeof d.address === 'string' && d.address.trim()) ||
        (typeof d.dong === 'string' && d.dong.trim()) ||
        '';
      const maskedAddr = blindAreaRaw ? maskAddress(blindAreaRaw) : '';
      const rawDealTitle =
        (typeof d.title === 'string' && d.title.trim()) ||
        (typeof d.assetType === 'string' && d.assetType.trim()) ||
        (typeof d.asset_type === 'string' && d.asset_type.trim()) ||
        '이번 호 추천 매물';
      const cleanDealTitle = sanitizeOutboundProse(rawDealTitle) || '이번 호 추천 매물';
      const rawPrice = d.priceWon ?? d.price ?? d.sale_price;
      const price =
        typeof rawPrice === 'number' || typeof rawPrice === 'string' ? rawPrice : undefined;
      deals.push({
        title: cleanDealTitle,
        ...(maskedAddr ? { address: maskedAddr } : {}),
        ...(price !== undefined ? { price } : {}),
      });
    }

    const rawNewsSource = Array.isArray(content.unit_issues)
      ? content.unit_issues
      : Array.isArray(content.unitIssues)
        ? content.unitIssues
        : Array.isArray(content.top_news)
          ? content.top_news
          : Array.isArray(content.topNews)
            ? content.topNews
            : Array.isArray(content.news)
              ? content.news
              : [];
    const topNews: Array<{ title?: string; source?: string }> = [];
    for (const item of rawNewsSource.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      const n = item as Record<string, unknown>;
      const newsTitle = typeof n.title === 'string' ? n.title.trim() : '';
      if (!newsTitle) continue;
      const newsSource =
        (typeof n.source === 'string' && n.source.trim()) ||
        (Array.isArray(n.sources) && typeof n.sources[0] === 'string' ? n.sources[0].trim() : '') ||
        undefined;
      topNews.push({ title: newsTitle, ...(newsSource ? { source: newsSource } : {}) });
    }

    return {
      title: rawTitle,
      headline: rawHeadline,
      marketTemp: rawTemp,
      cadence: rawCadence,
      fieldNote,
      ...(deals.length > 0 ? { deals } : {}),
      ...(topNews.length > 0 ? { topNews } : {}),
    };
  } catch {
    return {};
  }
}

export function mergeHydratedEdition(
  edition: MagazineEmailInput['edition'],
  hydrated: HydratedOutboundEdition,
): MagazineEmailInput['edition'] {
  return {
    ...edition,
    title: edition.title || hydrated.title || '',
    headline: edition.headline || hydrated.headline || '',
    marketTemp: edition.marketTemp || hydrated.marketTemp || '',
    cadence: edition.cadence || hydrated.cadence,
    fieldNote: edition.fieldNote ?? hydrated.fieldNote ?? undefined,
    deals: edition.deals && edition.deals.length > 0 ? edition.deals : hydrated.deals,
    topNews: edition.topNews && edition.topNews.length > 0 ? edition.topNews : hydrated.topNews,
  };
}

interface ActiveSubscribersQueryChain
  extends PromiseLike<{ data: unknown; error: DbErr }> {
  select: (cols: string) => ActiveSubscribersQueryChain;
  in: (col: string, vals: string[]) => ActiveSubscribersQueryChain;
  eq: (col: string, val: string) => ActiveSubscribersQueryChain;
  order?: (col: string, opts: { ascending: boolean }) => ActiveSubscribersQueryChain;
  range?: (from: number, to: number) => ActiveSubscribersQueryChain;
}

function isMissingColumnDbError(e: DbErr): boolean {
  if (!e) return false;
  if (e.code === '42703' || e.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the '.*' column|schema cache/i.test(
    e.message ?? '',
  );
}

/** 활성 구독자 조회 (500건 페이지네이션으로 PostgREST 1,000행 상한 우회). 에러는 삼키지 않고 throw. */
export async function loadActiveSubscribers(supabase: MagazineDbClient, brokerKeys: string[]): Promise<SubscriberRow[]> {
  const PAGE_SIZE = 500;
  const allRows: SubscriberRow[] = [];
  let offset = 0;
  let activeCols = SUBSCRIBER_COLUMNS;

  const runPageQuery = async (cols: string) => {
    const table = supabase.from('magazine_subscribers') as unknown as ActiveSubscribersQueryChain;
    let q = table.select(cols).in('broker_id', brokerKeys).eq('status', 'active');
    const supportsRange = typeof q?.range === 'function';
    if (typeof q?.order === 'function') {
      q = q.order('id', { ascending: true });
    }
    if (supportsRange && typeof q.range === 'function') {
      q = q.range(offset, offset + PAGE_SIZE - 1);
    }
    const res = await q;
    return { res, supportsRange };
  };

  while (true) {
    let { res, supportsRange } = await runPageQuery(activeCols);
    if (res.error && activeCols === SUBSCRIBER_COLUMNS && isMissingColumnDbError(res.error)) {
      activeCols = SUBSCRIBER_COLUMNS_PRECUTOVER;
      ({ res, supportsRange } = await runPageQuery(activeCols));
    }

    const { data, error } = res;
    if (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === '42703' || e.code === 'PGRST204') {
        throw new Error(`구독자 조회 실패: 동의 컬럼이 없습니다(마이그레이션 20261004000006 미적용 가능). ${errMessage(e)}`);
      }
      throw new Error(`구독자 조회 실패: ${errMessage(e)}`);
    }

    const page = (data ?? []) as SubscriberRow[];
    allRows.push(...page);
    if (!supportsRange || page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return allRows;
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

/**
 * WP-7.3B P2-1: 이메일/알림톡 링크가 **특정 에디션**을 가리키도록 `?edition=<uuid>`를 붙인다.
 * 같은 날짜에 여러 에디션(주간·속보·정정 재발행)이 있어도 수신자는 발송된 그 호를 본다
 * (publish/route.ts 의 publicUrl 및 공개 뷰어 `findIssueForDate(…, editionId)` 와 같은 규약).
 * uuid 가 아닌 id 는 붙이지 않는다(레거시 호환). 기존 `?target=` 은 보존한다.
 */
export function buildEditionUrl(
  baseUrl: string,
  brokerSlug: string,
  issueDate: string,
  opts: { editionId?: string | null; target?: string | null } = {},
): string {
  const qs = new URLSearchParams();
  if (opts.editionId && isUuid(opts.editionId)) qs.set('edition', opts.editionId);
  if (opts.target && opts.target !== 'all') qs.set('target', opts.target);
  const query = qs.toString();
  return `${baseUrl}/magazine/${brokerSlug}/${issueDate}${query ? `?${query}` : ''}`;
}

export interface PlannedTarget {
  sub: SubscriberRow;
  channel: GateChannel;
}

export interface Tally {
  /** 판정 대상 고유 구독자(사람) 수 */
  subscriberCount: number;
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
    subscriberCount: 0,
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
  const seen = new Set<string>();
  const distinctSubKeys = new Set<string>();
  for (const sub of subs) {
    distinctSubKeys.add(sub.id || `${sub.subscriber_email || ''}|${sub.subscriber_phone || ''}`);
    const ch = sub.channel;
    const wantsEmail = ch === 'email' || ch === 'both';
    const wantsKakao = ch === 'kakao' || ch === 'both';
    if (!wantsEmail && !wantsKakao) {
      tally.total += 1;
      addBlocked(tally, 'CHANNEL_NOT_CONSENTED');
      continue;
    }
    if (wantsEmail) {
      const emailNorm = normalizeRecipient(sub.subscriber_email);
      const emailKey = emailNorm ? `email:${emailNorm}` : `sub:${sub.id}:email`;
      if (!seen.has(emailKey)) {
        seen.add(emailKey);
        out.push({ sub, channel: 'email' });
      }
    }
    if (wantsKakao) {
      if (opts.allowKakao) {
        const phoneNorm = normalizeRecipient(sub.subscriber_phone);
        const phoneKey = phoneNorm ? `kakao:${phoneNorm}` : `sub:${sub.id}:kakao`;
        if (!seen.has(phoneKey)) {
          seen.add(phoneKey);
          out.push({ sub, channel: 'kakao' });
        }
      } else {
        tally.total += 1;
        addBlocked(tally, 'CHANNEL_NOT_AVAILABLE');
      }
    }
  }
  tally.subscriberCount = distinctSubKeys.size;
  return out;
}

export interface RunContext {
  supabase: MagazineDbClient;
  broker: BrokerIdentity;
  kind: GateKind;
  editionKey: string;
  editionId: string | null;
  baseUrl: string;
  edition: MagazineEmailInput['edition'];
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

export function renderFor(ctx: RunContext, t: PlannedTarget, unsubscribeUrl: string): GateRendered {
  const base: MagazineEmailInput = {
    brokerName: ctx.broker.senderName ?? '',
    brokerContact: ctx.broker.senderContact ?? undefined,
    senderAddress: ctx.broker.senderAddress ?? undefined,
    senderEmail: ctx.broker.senderEmail ?? undefined,
    officeRegNumber: ctx.broker.officeRegNumber ?? undefined,
    representativeName: ctx.broker.representativeName ?? undefined,
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

async function runOne(
  ctx: RunContext,
  t: PlannedTarget,
  dailyCap: number | undefined,
  tally: Tally,
  opts?: RunTargetsOptions,
): Promise<void> {
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

  // Key sendGate idempotency on recipient_hash (preventing duplicate sends across slug and user_id rows)
  const contact = t.channel === 'email' ? t.sub.subscriber_email : t.sub.subscriber_phone;
  const normalized = normalizeRecipient(contact);
  const recipientHash = normalized ? hashRecipient(normalized) : '';
  const idempotencyKey = recipientHash
    ? buildIdempotencyKey(ctx.editionKey, recipientHash, t.channel)
    : undefined;

  const maxRetries = opts?.maxRetries ?? BATCH_429_MAX_RETRIES;
  const retryBaseDelayMs = opts?.retryBaseDelayMs ?? BATCH_429_BASE_DELAY_MS;

  let res = await sendGate(
    {
      subscriber: t.sub,
      channel: t.channel,
      editionId: ctx.editionId,
      editionKey: ctx.editionKey,
      idempotencyKey,
      brokerId: ctx.broker.slug,
      brokerUserId: ctx.broker.userId,
      kind: ctx.kind,
      rendered,
      dailyCap,
    },
    { supabase: ctx.supabase, ...ctx.gateDeps },
  );

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (res.ok || !(res.failed || res.blocked === 'PROVIDER_FAILED') || !isRateLimitErrorDetail(res.detail)) {
      break;
    }

    // Reopen transient 429 dispatch ledger row from 'failed' -> 'blocked' so sendGate reclaims it cleanly
    if (idempotencyKey) {
      try {
        await ctx.supabase
          .from('magazine_dispatch_logs')
          .update({ status: 'blocked', blocked_reason: 'RATE_LIMITED_RETRY' })
          .eq('idempotency_key', idempotencyKey)
          .eq('status', 'failed');
      } catch (reclaimErr) {
        log.warn('Failed to reopen dispatch ledger row for 429 retry', {
          error: reclaimErr instanceof Error ? reclaimErr.message : String(reclaimErr),
        });
      }
    }

    const waitMs = retryBaseDelayMs * Math.pow(2, attempt);
    log.warn('Rate-limit (429) detected in send-batch, retrying after backoff', {
      channel: t.channel,
      attempt: attempt + 1,
      waitMs,
    });
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    res = await sendGate(
      {
        subscriber: t.sub,
        channel: t.channel,
        editionId: ctx.editionId,
        editionKey: ctx.editionKey,
        idempotencyKey,
        brokerId: ctx.broker.slug,
        brokerUserId: ctx.broker.userId,
        kind: ctx.kind,
        rendered,
        dailyCap,
      },
      { supabase: ctx.supabase, ...ctx.gateDeps },
    );
  }

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

/** 타깃을 BATCH_CONCURRENCY씩 페이싱 처리하고 집계한다(Resend >2 req/s 플랜 제한 보호). 예외는 failed로 센다. */
export async function runTargets(
  ctx: RunContext,
  targets: PlannedTarget[],
  tally: Tally,
  opts?: RunTargetsOptions,
): Promise<void> {
  // 속보(flash / special)는 당일 추가 배포가 차단되지 않도록 dailyCap을 생략(undefined), 일반 배포는 당일 재발송/정정 허용을 위해 targets.length * 3
  const dailyCap = ctx.kind === 'flash' ? undefined : targets.length * 3;
  const concurrency = Math.max(1, Math.min(4, opts?.concurrency ?? BATCH_CONCURRENCY));
  const paceMs = Math.max(0, opts?.paceMs ?? BATCH_PACE_MS);

  // 발송 직전 억제 목록(email_suppressions) 조회 — global + broker 범위 모두 차단
  const suppressedHashes = await loadSuppressedEmailHashesForBroker(ctx.supabase, ctx.broker.userId);
  const resolvedTargets =
    suppressedHashes.size > 0
      ? targets.map((t) => {
          if (t.channel !== 'email') return t;
          const h = hashEmailForSuppression(t.sub.subscriber_email || '');
          return h && suppressedHashes.has(h) ? { ...t, sub: { ...t.sub, suppressed: true } } : t;
        })
      : targets;

  // 에디션 본문 섹션(fieldNote / 마스킹된 매물 / 주요 뉴스 / 발행주기) 배치당 1회 하이드레이션 (P1-3)
  let effectiveCtx = ctx;
  const needsEditionHydration =
    resolvedTargets.length > 0 &&
    Boolean(ctx.editionId) &&
    !ctx.edition.fieldNote &&
    !(ctx.edition.deals && ctx.edition.deals.length > 0) &&
    !(ctx.edition.topNews && ctx.edition.topNews.length > 0);
  if (needsEditionHydration) {
    const hydrated = await hydrateEditionForOutboundEmail(ctx.supabase, ctx.editionId);
    effectiveCtx = {
      ...ctx,
      edition: mergeHydratedEdition(ctx.edition, hydrated),
    };
  }

  for (let i = 0; i < resolvedTargets.length; i += concurrency) {
    const batch = resolvedTargets.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((t) => runOne(effectiveCtx, t, dailyCap, tally, opts)));
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        log.error('send target threw', { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        tally.failed += 1;
        (batch[idx].channel === 'email' ? tally.email : tally.kakao).failed += 1;
      }
    });
    if (paceMs > 0 && i + concurrency < resolvedTargets.length) {
      await new Promise((resolve) => setTimeout(resolve, paceMs));
    }
  }
}
