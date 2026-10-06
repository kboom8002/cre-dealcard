/**
 * OG/스토리/카드 이미지 데이터 모델 (C-04, M2-09, M2-25, S2-15, S2-24, T3-18)
 *
 * 서버 전용(pii.ts 가 node:crypto 를 import). 원칙
 *  - 가짜 브로커/수치 폴백 금지: 데이터가 없으면 `null` → 호출부가 중립 브랜드 이미지를 그린다.
 *  - 공개 이미지는 공개 뷰어와 같은 소스만 본다(정확한 날짜의 발행본). draft 렌더 금지.
 *    TODO(B3a): `src/lib/magazine/get-published-issue.ts` 가 머지되면 `loadImageModel` 의 조회부만 교체.
 *  - `.or()` 문자열 보간·HTTP 자기호출 없음(내부 fetch 제거 → 크롤러가 LLM 생성을 유발하지 않음).
 *  - 주소는 `maskAddress`(동 단위)로만 노출.
 */
import { MARKET_TEMP_CONFIG, type MarketTemperature } from '@/domain/magazine/types';
import { formatKoreanDate, parseIssueDate, todayKst } from '@/lib/magazine/kst';
import { maskAddress } from '@/lib/magazine/pii';
import { stripSyntheticScore } from '@/lib/magazine/strip-synthetic-score';
import { isPlausibleBrokerParam } from '@/lib/magazine/slug';
import {
  findIssueForDate,
  resolvePublicBroker,
  type MagazineContent,
} from '@/lib/magazine/public-page-data';

export type ImageFormat = 'og' | 'story' | 'card';

/** 이미지 실측 회귀 보호 — 크기 변경 금지 */
export const IMAGE_SIZES: Record<ImageFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  card: { width: 1080, height: 1080 },
};

/** 발행본 이미지: 마스킹/수정 반영이 CDN 에 1년 고정되지 않도록 (함정 #14) */
export const IMAGE_CACHE_CONTROL =
  'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
/** 중립 이미지(미발행·조회 실패): 곧 발행될 수 있으므로 짧게 */
export const NEUTRAL_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';
/** 파라미터 오류·조회 오류: 캐시 금지 */
export const NO_STORE_CACHE_CONTROL = 'no-store';

/** format 쿼리 검증: 값이 없으면 fallback, 허용 외 값이면 null */
export function parseImageFormat(
  raw: string | null | undefined,
  fallback: ImageFormat,
): ImageFormat | null {
  if (raw === null || raw === undefined || raw === '') return fallback;
  return raw === 'og' || raw === 'story' || raw === 'card' ? raw : null;
}

export type ParamCheck =
  | { ok: true; brokerId: string; date: string }
  | { ok: false; reason: 'broker' | 'date' };

/** brokerId/date 검증. date 가 없으면 오늘(KST). 미래 날짜는 허용하지 않는다. */
export function validateImageParams(
  brokerId: string | null | undefined,
  date: string | null | undefined,
  now: Date = new Date(),
): ParamCheck {
  if (!isPlausibleBrokerParam(brokerId ?? '')) return { ok: false, reason: 'broker' };
  const d = date && date.length > 0 ? date : todayKst(now);
  if (!parseIssueDate(d) || d > todayKst(now)) return { ok: false, reason: 'date' };
  return { ok: true, brokerId: brokerId as string, date: d };
}

export interface ImageDeal {
  title: string;
  /** maskAddress 적용 완료(동 단위) */
  address: string;
}

export interface ImageStat {
  label: string;
  value: string;
  accent: string;
}

export interface ImageModel {
  date: string;
  /** '2026.10.05' */
  dateLabel: string;
  /** '2026년 10월 5일 (월)' */
  dateKorean: string;
  headline: string;
  marketTemp: MarketTemperature | null;
  keywords: string[];
  themeTitle: string | null;
  briefing: string | null;
  brokerName: string | null;
  company: string | null;
  phone: string | null;
  regions: string[];
  stats: ImageStat[];
  deals: ImageDeal[];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function strArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => str(x))
    .filter((x): x is string => !!x)
    .slice(0, max);
}

/** 알려진 가짜 수치(62/100 등)가 박힌 과거 발행본의 지표는 이미지에 싣지 않는다 (M2-03, P0-05). */
export function isSuspectStatValue(value: string): boolean {
  return /62\s*\/\s*100/.test(value);
}

function cleanBriefing(raw: string | null): string | null {
  if (!raw) return null;
  // '62/100' 같은 합성 점수 토큰은 줄 길이 필터 전에 제거한다 (뷰어와 같은 공용 규칙).
  const text = stripSyntheticScore(raw)
    .replace(/[#*`_~>]/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** 필드 라벨이 값 자리에 그대로 들어온 경우(예: '매각가')는 매물명/주소가 아니다. */
const PLACEHOLDER_DEAL_TEXT = new Set([
  '매각가',
  '매매가',
  '가격',
  '주소',
  '소재지',
  '제목',
  '이름',
  '매물',
  '미정',
]);

/**
 * 매물 행 정규화: 제목·주소가 같으면(공백 무시) 한 번만, 라벨만 있는 값은 버린다.
 * 제목이 없으면 title 은 '' — 주소로 채워 '양평동 · 양평동' 이 되는 중복을 막는다.
 */
export function normalizeDeal(rawTitle: string | null, rawAddress: string): ImageDeal | null {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const real = (s: string | null) => (s && !PLACEHOLDER_DEAL_TEXT.has(norm(s)) ? s : '');
  const address = real(rawAddress);
  let title = real(rawTitle);
  if (title && address && norm(title) === norm(address)) title = '';
  if (!title && !address) return null;
  return { title, address };
}

export function toDateLabel(date: string): string {
  return date.replace(/-/g, '.');
}

export interface BrokerImageInfo {
  display_name?: string | null;
  company?: string | null;
  phone?: string | null;
  specialty_regions?: string[] | null;
}

/** 순수 변환: 발행본 content + 브로커 정보 → 렌더 모델 (폴백 값 없음) */
export function buildImageModel(
  content: MagazineContent,
  broker: BrokerImageInfo | null,
  date: string,
): ImageModel | null {
  const headline = str(content.headline) ?? str(content.title);
  if (!headline) return null; // 제목이 없는 발행본은 이미지로 만들 수 없다

  const rawTemp = str(content.market_temp) ?? str(content.marketTemp);
  const marketTemp =
    rawTemp && Object.prototype.hasOwnProperty.call(MARKET_TEMP_CONFIG, rawTemp)
      ? (rawTemp as MarketTemperature)
      : null;

  const rawStats: unknown[] = Array.isArray(content.keyStats) ? content.keyStats : [];
  const stats: ImageStat[] = [];
  for (const s of rawStats) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const label = str(o.label);
    const value = str(o.value);
    if (!label || !value || isSuspectStatValue(value)) continue;
    stats.push({ label, value, accent: str(o.accent) ?? 'indigo' });
    if (stats.length >= 3) break;
  }

  const dealSource: unknown[] = Array.isArray(content.dealHighlights)
    ? content.dealHighlights
    : Array.isArray(content.featured_deals)
      ? content.featured_deals
      : [];
  const deals: ImageDeal[] = [];
  for (const d of dealSource) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const deal = normalizeDeal(str(o.title) ?? str(o.name), maskAddress(o.address));
    if (!deal) continue;
    deals.push(deal);
    if (deals.length >= 3) break;
  }

  const briefing = cleanBriefing(
    str(content.ai_briefing) ?? str(content.briefing) ?? str(content.theme_body_md),
  );

  return {
    date,
    dateLabel: toDateLabel(date),
    dateKorean: formatKoreanDate(date),
    headline,
    marketTemp,
    keywords: strArray(content.cover_keywords ?? content.coverKeywords, 4),
    themeTitle: str(content.theme_title) ?? str(content.themeTitle),
    briefing,
    brokerName: str(broker?.display_name),
    company: str(broker?.company),
    phone: str(broker?.phone),
    regions: strArray(broker?.specialty_regions, 3),
    stats,
    deals,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * 공개 뷰어와 동일한 소스(정확한 날짜의 발행본)에서 이미지 모델을 만든다.
 * - 브로커/발행본이 없으면 null (→ 중립 이미지).
 * - DB 오류는 throw (→ 호출부가 no-store 중립 이미지 + 로그).
 */
export async function loadImageModel(
  supabase: Db,
  brokerParam: string,
  date: string,
): Promise<ImageModel | null> {
  const broker = await resolvePublicBroker(supabase, brokerParam, 'user_id, slug, specialty_regions');
  if (!broker) return null;

  const content = await findIssueForDate(supabase, broker, date);
  if (!content) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, company, phone')
    .eq('id', broker.user_id)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);

  return buildImageModel(
    content,
    {
      display_name: profile?.display_name ?? null,
      company: profile?.company ?? null,
      phone: profile?.phone ?? null,
      specialty_regions: (broker.specialty_regions as string[] | null) ?? null,
    },
    date,
  );
}
