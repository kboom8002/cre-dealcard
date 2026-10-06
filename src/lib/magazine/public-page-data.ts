/**
 * src/lib/magazine/public-page-data.ts — 공개 매거진 페이지(뷰어/아카이브/구독) 서버측 조회 헬퍼 (I-02, P0-09 T3-08)
 *
 * 서버 컴포넌트 전용 (pii.ts가 node:crypto를 import하므로 클라이언트 컴포넌트에서 import 금지).
 * A2의 `resolveBroker`가 머지되면 `resolvePublicBroker` 호출부를 교체한다 (동일 의미: 형식 분기, `.or()` 보간 금지).
 * 모든 DB 호출은 error를 확인한다. 가짜 기본값 없음.
 */
import { addDays, formatKoreanDate, parseIssueDate, toKstDate, todayKst } from '@/lib/magazine/kst';
import { maskAddress } from '@/lib/magazine/pii';
import { SLUG_RE, isUuid } from '@/lib/magazine/slug';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface PublicBrokerRow {
  user_id: string;
  slug: string | null;
  [k: string]: unknown;
}

/** URL 파라미터가 uuid/slug 형식일 때만 DB에 질의. 그 외 형식은 null (notFound 처리). */
export async function resolvePublicBroker(
  supabase: Db,
  param: string,
  columns: string,
): Promise<PublicBrokerRow | null> {
  let q = supabase.from('broker_profiles').select(columns);
  if (isUuid(param)) q = q.eq('user_id', param);
  else if (SLUG_RE.test(param)) q = q.eq('slug', param);
  else return null;
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`broker lookup failed: ${error.message}`);
  return (data as PublicBrokerRow | null) ?? null;
}

/** uuid로 접근했고 slug가 있으면 slug URL이 정규. 이미 정규이면 null. */
export function canonicalBrokerSlug(param: string, broker: { slug: string | null } | null): string | null {
  if (!broker?.slug) return null;
  if (isUuid(param) && broker.slug !== param) return broker.slug;
  return null;
}

/** 조회 키(과도기: slug 와 user_id 둘 다 사용). */
export function brokerKeys(broker: { user_id: string; slug: string | null }): string[] {
  return Array.from(new Set([broker.slug, broker.user_id].filter((v): v is string => !!v)));
}

export type IssueDateState =
  | { kind: 'invalid' }
  | { kind: 'future' }
  | { kind: 'ok'; date: string };

/** 날짜 파라미터 검증. 형식오류/실존하지 않는 날짜 → invalid, 오늘(KST) 이후 → future. */
export function classifyIssueDate(date: string, now: Date = new Date()): IssueDateState {
  if (!parseIssueDate(date)) return { kind: 'invalid' };
  if (date > todayKst(now)) return { kind: 'future' };
  return { kind: 'ok', date };
}

export type MagazineContent = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NON_PUBLIC_STATUS = new Set(['draft', 'needs_review', 'editing', 'review', 'scheduled', 'archived']);

/**
 * 초안/검수대기 표시 판정(원시 값 기준 — 목록 조회에서는 content 전체를 읽지 않고 이 두 값만 select 한다).
 *  - status 가 비공개 상태이거나, qualityGate.passed === false(검수 전 콘텐츠)이면 비공개.
 */
export function isNonPublicMarker(status: unknown, qualityGatePassed: unknown): boolean {
  if (typeof status === 'string' && NON_PUBLIC_STATUS.has(status)) return true;
  return qualityGatePassed === false || qualityGatePassed === 'false';
}

/** content 가 초안/검수대기로 표시되어 있으면 true — 공개하지 않는다. */
export function isUnpublishedContent(content: MagazineContent): boolean {
  const qg = (content as { generation?: { qualityGate?: { passed?: unknown } | null } }).generation?.qualityGate;
  return isNonPublicMarker((content as { status?: unknown }).status, qg ? qg.passed : undefined);
}

const EDITION_COLUMNS =
  'id, edition_type, edition_label, title, market_temp, cover_keywords, cover_image_url, field_note, theme_title, theme_body_md, theme_asset_types, theme_color, content, published_at';

/** edition 행의 개별 컬럼과 content jsonb를 합친다(content 값이 null/undefined일 때만 컬럼 사용). */
export function mergeEditionContent(row: Record<string, any>): MagazineContent { // eslint-disable-line @typescript-eslint/no-explicit-any
  const content = (row.content && typeof row.content === 'object' ? row.content : {}) as MagazineContent;
  const fromColumns: MagazineContent = {
    id: row.id,
    market_temp: row.market_temp,
    cover_keywords: row.cover_keywords,
    cover_image_url: row.cover_image_url,
    field_note: row.field_note,
    theme_title: row.theme_title,
    theme_body_md: row.theme_body_md,
    theme_asset_types: row.theme_asset_types,
    theme_color: row.theme_color,
    headline: content.headline ?? row.title,
  };
  const merged: MagazineContent = { ...content };
  for (const [k, v] of Object.entries(fromColumns)) {
    if (merged[k] === undefined || merged[k] === null) {
      if (v !== undefined && v !== null) merged[k] = v;
    }
  }
  return merged;
}

/**
 * 정확한 날짜(KST)의 발행본만 반환. 날짜가 다른 최신본으로 폴백하지 않는다(T3-08).
 *  1) magazine_issues(issue_date = date)
 *  2) magazine_editions(status=published, edition_label = date 또는 published_at의 KST 날짜 = date)
 */
export async function findIssueForDate(
  supabase: Db,
  broker: { user_id: string; slug: string | null },
  date: string,
): Promise<MagazineContent | null> {
  const keys = brokerKeys(broker);

  const { data: issues, error: issueErr } = await supabase
    .from('magazine_issues')
    .select('id, content, updated_at')
    .in('broker_id', keys)
    .eq('issue_date', date)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (issueErr) throw new Error(`issue lookup failed: ${issueErr.message}`);
  const issue = Array.isArray(issues) ? issues[0] : null;
  if (issue?.content && typeof issue.content === 'object') {
    const c = issue.content as MagazineContent;
    return c.id ? c : { ...c, id: issue.id };
  }

  const startIso = new Date(`${date}T00:00:00+09:00`).toISOString();
  const endIso = new Date(`${addDays(date, 1)}T00:00:00+09:00`).toISOString();

  const byLabel = await supabase
    .from('magazine_editions')
    .select(EDITION_COLUMNS)
    .in('broker_id', keys)
    .eq('status', 'published')
    .eq('edition_label', date)
    .order('published_at', { ascending: false })
    .limit(1);
  if (byLabel.error) throw new Error(`edition lookup failed: ${byLabel.error.message}`);
  if (byLabel.data?.[0]) return mergeEditionContent(byLabel.data[0]);

  const byPublished = await supabase
    .from('magazine_editions')
    .select(EDITION_COLUMNS)
    .in('broker_id', keys)
    .eq('status', 'published')
    .gte('published_at', startIso)
    .lt('published_at', endIso)
    .order('published_at', { ascending: false })
    .limit(1);
  if (byPublished.error) throw new Error(`edition lookup failed: ${byPublished.error.message}`);
  if (byPublished.data?.[0]) return mergeEditionContent(byPublished.data[0]);

  return null;
}

/**
 * 실제 최신 발행본 날짜(KST, 오늘 이전). 없으면 null — 오늘 날짜로 폴백하지 않는다(T2-CL-2).
 * 아카이브와 같은 통합 목록(`listPublishedEntries`)에서 도출하므로 랜딩 '최신호'와 아카이브 카드가 어긋나지 않는다.
 */
export async function findLatestIssueDate(
  supabase: Db,
  broker: { user_id: string; slug: string | null },
  now: Date = new Date(),
): Promise<string | null> {
  const [latest] = await listPublishedEntries(supabase, broker, 1, now);
  return latest?.date ?? null;
}

/**
 * 공개 노출용 정제: 정확한 지번이 있는 모든 address 필드를 동 단위로 마스킹(M2-02, P0-05).
 * 입력은 변경하지 않고 얕은 복사본을 돌려준다.
 */
export function maskPublicAddresses(data: MagazineContent): MagazineContent {
  const maskList = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map((item) =>
          item && typeof item === 'object' && typeof (item as { address?: unknown }).address === 'string'
            ? { ...(item as object), address: maskAddress((item as { address: string }).address) }
            : item,
        )
      : v;
  const out: MagazineContent = { ...data };
  for (const key of ['dealHighlights', 'featured_deals', 'auctionPicks', 'recentTransactions'] as const) {
    if (key in out) out[key] = maskList(out[key]);
  }
  return out;
}

/** 서버에서 계산한 날짜 표시(hydration 불일치 제거, T3-40). */
export function buildDateDisplay(date: string): { dateLabel: string } {
  return { dateLabel: formatKoreanDate(date) };
}

// ─────────────────────────────────────────────────────────────
// 아카이브 (E-03 T2-16: published magazine_editions 기반, 독자에게 조회수 비노출)
// ─────────────────────────────────────────────────────────────

export interface ArchiveEntry {
  id: string;
  /** 뷰어 URL 의 날짜(KST, YYYY-MM-DD) */
  date: string;
  label: string;
  title: string | null;
  marketTemp: string | null;
  keywords: string[];
}

/**
 * editions 행 → 아카이브 항목. 날짜는 edition_label 이 실존하는 날짜면 그것(뷰어가 label 로 먼저 매칭),
 * 아니면 발행 시각(없으면 생성 시각)의 KST 날짜. 같은 날짜는 최신 1건만, 오늘(KST) 이후 날짜는 제외, 최신순.
 */
export function buildArchiveEntries(
  rows: ReadonlyArray<Record<string, unknown>>,
  now: Date = new Date(),
): ArchiveEntry[] {
  const today = todayKst(now);
  const byDate = new Map<string, { entry: ArchiveEntry; stamp: string }>();
  for (const r of rows) {
    if (!r || typeof r.id !== 'string') continue;
    const label = typeof r.edition_label === 'string' ? r.edition_label : '';
    const stampRaw = (r.published_at ?? r.created_at) as string | null | undefined;
    const stamp = typeof stampRaw === 'string' ? stampRaw : '';
    let date: string | null = null;
    if (parseIssueDate(label)) date = label;
    else if (stamp) {
      const d = new Date(stamp);
      if (!Number.isNaN(d.getTime())) date = toKstDate(d);
    }
    if (!date || date > today) continue;
    const existing = byDate.get(date);
    if (existing && existing.stamp >= stamp) continue;
    byDate.set(date, {
      stamp,
      entry: {
        id: r.id,
        date,
        label,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null,
        marketTemp: typeof r.market_temp === 'string' && r.market_temp ? r.market_temp : null,
        keywords: Array.isArray(r.cover_keywords)
          ? (r.cover_keywords as unknown[]).filter((k): k is string => typeof k === 'string' && !!k).slice(0, 3)
          : [],
      },
    });
  }
  return Array.from(byDate.values())
    .map((v) => v.entry)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 발행(published)된 에디션 목록. 조회수 컬럼은 select 하지 않는다. DB 오류는 throw. */
export async function listPublishedEditions(
  supabase: Db,
  broker: { user_id: string; slug: string | null },
  limit = 50,
  now: Date = new Date(),
): Promise<ArchiveEntry[]> {
  const { data, error } = await supabase
    .from('magazine_editions')
    .select('id, edition_type, edition_label, title, market_temp, cover_keywords, published_at, created_at')
    .in('broker_id', brokerKeys(broker))
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit * 2);
  if (error) throw new Error(`archive edition lookup failed: ${error.message}`);
  return buildArchiveEntries((data ?? []) as Array<Record<string, unknown>>, now).slice(0, limit);
}

/**
 * 레거시 `magazine_issues` 행(목록용 최소 컬럼) → 아카이브 항목.
 * 초안/검수대기 표시(status · qualityGate.passed=false)·미래 날짜·잘못된 날짜는 제외, 같은 날짜는 최신 갱신 1건.
 */
export function buildLegacyIssueEntries(
  rows: ReadonlyArray<Record<string, unknown>>,
  now: Date = new Date(),
): ArchiveEntry[] {
  const today = todayKst(now);
  const byDate = new Map<string, { entry: ArchiveEntry; stamp: string }>();
  for (const r of rows) {
    if (!r || typeof r.id !== 'string') continue;
    const date = typeof r.issue_date === 'string' ? r.issue_date.slice(0, 10) : '';
    if (!parseIssueDate(date) || date > today) continue;
    if (isNonPublicMarker(r.status, r.qg_passed)) continue;
    const stamp = typeof r.updated_at === 'string' ? r.updated_at : '';
    const existing = byDate.get(date);
    if (existing && existing.stamp >= stamp) continue;
    byDate.set(date, {
      stamp,
      entry: {
        id: r.id,
        date,
        label: date,
        title: typeof r.headline === 'string' && r.headline.trim() ? r.headline.trim() : null,
        marketTemp: typeof r.market_temp === 'string' && r.market_temp ? r.market_temp : null,
        keywords: Array.isArray(r.cover_keywords)
          ? (r.cover_keywords as unknown[]).filter((k): k is string => typeof k === 'string' && !!k).slice(0, 3)
          : [],
      },
    });
  }
  return Array.from(byDate.values()).map((v) => v.entry);
}

/**
 * 발행된 에디션 항목 + 에디션이 없는 날짜의 레거시 발행본(날짜 중복 제거: 같은 날짜면 에디션 우선) → 최신순.
 * 뷰어(`findIssueForDate`)·구독 랜딩(`findLatestIssueDate`)·아카이브가 모두 이 규칙을 쓴다 (계획서 E-01 '읽기 호환').
 */
export function mergeArchiveEntries(
  editionEntries: ReadonlyArray<ArchiveEntry>,
  legacyEntries: ReadonlyArray<ArchiveEntry>,
): ArchiveEntry[] {
  const byDate = new Map<string, ArchiveEntry>();
  for (const e of legacyEntries) byDate.set(e.date, e);
  for (const e of editionEntries) byDate.set(e.date, e); // 에디션이 레거시를 덮어쓴다
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * 독자 공개 발행본 목록 = published editions + 에디션 없는 레거시 published issues (draft/needs_review 제외).
 * 조회수 컬럼은 select 하지 않는다. DB 오류는 삼키지 않고 throw.
 */
export async function listPublishedEntries(
  supabase: Db,
  broker: { user_id: string; slug: string | null },
  limit = 50,
  now: Date = new Date(),
): Promise<ArchiveEntry[]> {
  const editionEntries = await listPublishedEditions(supabase, broker, limit, now);

  const { data, error } = await supabase
    .from('magazine_issues')
    .select(
      'id, issue_date, updated_at, headline:content->>headline, market_temp:content->>market_temp, cover_keywords:content->cover_keywords, status:content->>status, qg_passed:content->generation->qualityGate->>passed',
    )
    .in('broker_id', brokerKeys(broker))
    .lte('issue_date', todayKst(now))
    .order('issue_date', { ascending: false })
    .limit(Math.max(limit * 2, 20));
  if (error) throw new Error(`archive issue lookup failed: ${error.message}`);
  const legacyEntries = buildLegacyIssueEntries((data ?? []) as Array<Record<string, unknown>>, now);

  return mergeArchiveEntries(editionEntries, legacyEntries).slice(0, limit);
}

/**
 * 공개 중개사 표시명 단일 규칙 — 구독 페이지·뷰어 헤더·카카오 공유 제목·해지 페이지·QR 인쇄 문구가 모두 같은 이름을 쓴다.
 * `broker_profiles.name` 우선, 없으면 `profiles.display_name`(구독 페이지와 동일). 발행 스냅샷(`data.broker.name`)은 쓰지 않는다.
 */
export function publicBrokerDisplayName(
  brokerProfileName: unknown,
  profileDisplayName: unknown,
): string | null {
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return pick(brokerProfileName) ?? pick(profileDisplayName);
}

/** 공개 이름 조회 — broker_profiles.name 이 있으면 추가 조회 없이, 없을 때만 profiles.display_name 을 읽는다. DB 오류는 throw. */
export async function resolvePublicDisplayName(
  supabase: Db,
  broker: { user_id: string; name?: unknown },
): Promise<string | null> {
  const direct = publicBrokerDisplayName(broker.name, null);
  if (direct) return direct;
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', broker.user_id).maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  return publicBrokerDisplayName(null, (data as { display_name?: unknown } | null)?.display_name);
}
