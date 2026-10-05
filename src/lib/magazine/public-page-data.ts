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

/** 실제 최신 발행본 날짜(KST, 오늘 이전). 없으면 null — 오늘 날짜로 폴백하지 않는다(T2-CL-2). */
export async function findLatestIssueDate(
  supabase: Db,
  broker: { user_id: string; slug: string | null },
  now: Date = new Date(),
): Promise<string | null> {
  const keys = brokerKeys(broker);
  const today = todayKst(now);
  const candidates: string[] = [];

  const { data: issues, error: issueErr } = await supabase
    .from('magazine_issues')
    .select('issue_date')
    .in('broker_id', keys)
    .lte('issue_date', today)
    .order('issue_date', { ascending: false })
    .limit(1);
  if (issueErr) throw new Error(`latest issue lookup failed: ${issueErr.message}`);
  if (issues?.[0]?.issue_date) candidates.push(String(issues[0].issue_date).slice(0, 10));

  const { data: eds, error: edErr } = await supabase
    .from('magazine_editions')
    .select('published_at')
    .in('broker_id', keys)
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', now.toISOString())
    .order('published_at', { ascending: false })
    .limit(1);
  if (edErr) throw new Error(`latest edition lookup failed: ${edErr.message}`);
  if (eds?.[0]?.published_at) candidates.push(toKstDate(new Date(eds[0].published_at)));

  if (candidates.length === 0) return null;
  return candidates.sort().reverse()[0];
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
