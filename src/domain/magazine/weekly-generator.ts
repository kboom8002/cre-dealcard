/**
 * Weekly Magazine Generator
 *
 * 브로커별 주간 매거진을 자동 생성합니다. (C-01 데이터 소스 정상화 + C-02 LLM 안전)
 *
 * 원칙 (감사 2026-10-04 반영)
 *  - 실제 DB 컬럼만 조회한다(없는 컬럼 13개 교정, 무필터 maybeSingle 제거, 지역키 정규화). 모든 조회는 error 를 확인하고
 *    실패/빈 소스는 "가용성 false"로 기록한 뒤 해당 섹션을 **생략**한다. 가짜 대체값(심리 50/62, 더미 키워드, 폴백 문구) 금지.
 *  - 날짜·주차는 `@/lib/magazine/kst` 만 사용(KST). 주차 라벨은 `isoWeekLabel` 하나.
 *  - LLM 은 `callMagazineJson`(allowMock:false, zod 검증)으로만 호출. Mock/실패 시 예외 → 저장하지 않는다.
 *  - 품질 게이트는 fail-closed. 불합격은 `needs_review` 로 저장하되 CHECK 미적용 등 저장 실패는 삼키지 않고 던진다(함정 #11).
 *  - GET 이 아닌 이 생성기만 편집 초안을 만든다. 공개 테이블(magazine_issues)에는 **쓰지 않는다**(draft 비공개, D2-06).
 */

import { z } from 'zod';
import {
  type MarketTemperature,
  type MagazineEdition,
  type EditionStatus,
  type MagazineDbClient,
  type EditionContentV1,
  type EditionQualityGateSummary,
  EDITION_STATUS_DRAFT,
  EDITION_STATUS_NEEDS_REVIEW,
  EditionSaveError,
  MARKET_TEMP_CONFIG,
} from './types';
import { runMagazineQualityGate } from './quality-gate';
import { generateMagazineTeaserCards } from './magazine-teaser-cards';
import { summarizeMonthlyTransactions } from '@/domain/external/monthly-transaction-summary';
import { generateSharedTaxClinic } from './tax-clinic-generator';
import { callMagazineJson, cleanNewsSummary, sanitizeReaderText, zReaderText } from '@/lib/magazine/llm-guard';
import { decodeEntities } from '@/lib/magazine/escape';
import { addDays, isoWeekLabel, parseIssueDate, previousMonthKst, todayKst, toKstDate } from '@/lib/magazine/kst';
import { maskAddress } from '@/lib/magazine/pii';
import { SLUG_RE, isUuid } from '@/lib/magazine/slug';
import {
  PULSE_REGION_LABELS_KO,
  deriveRegionKeywords,
  normalizePulseRegion,
  pickPulseRegion,
  pulsePeriodLabelCandidates,
  type PulseRegionCode,
} from '@/lib/magazine/period-label';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('weekly-generator');

// ── 상수 ───────────────────────────────────────────────────────────

/** 뉴스는 최근 N일(created_at)만 사용 — 오래된 기사를 "이번 주 뉴스"로 보이지 않게 한다 (M2-17). */
export const NEWS_WINDOW_DAYS = 7;
/** 실거래는 최근 N일(transaction_date)만 사용. */
export const TX_WINDOW_DAYS = 90;
/** 심리지수 기준일이 이보다 오래되면 섹션 생략. */
export const SENTIMENT_MAX_AGE_DAYS = 21;
/** UI 브랜드 기본 테마 색 (데이터 아님) */
export const DEFAULT_THEME_COLOR = '#6366f1';

// ── 타입 정의 ──────────────────────────────────────────────────────

interface BrokerContext {
  profile: {
    id: string;
    display_name: string | null;
    company: string | null;
    phone: string | null;
    photo_url: string | null;
    tagline: string | null;
  };
  broker: {
    user_id: string;
    slug: string | null;
    specialty_regions: string[];
    specialty_assets: string[];
    bio: string | null;
    total_deal_count_self: number | null;
    deal_size_range: string | null;
    magazine_cover_image: string | null;
  };
  activeDealCount: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sentiment: string | null;
  importance_score: number | null;
  topic: string | null;
  created_at?: string | null;
}

export interface DealItem {
  id: string;
  address: string;
  area_signal: string | null;
  asset_type: string | null;
  price: string | null;
  status: string;
  photo_urls: string[] | null;
  attrs: Record<string, unknown>;
}

export interface PulseData {
  pulse_score: number;
  trend: string;
  summary_ko: string;
  key_findings: string[];
  signals: Record<string, unknown>;
}

export interface TransactionItem {
  address: string | null;
  dong: string | null;
  district: string | null;
  transaction_price: number;
  usage_type: string | null;
  building_area: number | null;
  transaction_date: string;
}

export interface SentimentData {
  avgSentiment: number;
  asOf: string;
  items: Array<{ keyword: string; sentiment_score: number; mention_count: number | null; analysis_date: string }>;
}

export interface AuctionPick {
  caseNumber: string | null;
  court: string | null;
  address: string | null;
  status: string | null;
  auctionDate: string;
  minimumBid: number | null;
  appraisedValue: number | null;
  discountPct?: number;
}

export interface ReportItem {
  institution: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  published_date: string | null;
}

export interface RentalTrendItem {
  region: string;
  quarter: string;
  vacancy_rate: number | null;
  rental_index: number | null;
}

export interface CommercialDistrictItem {
  district_name: string;
  sales_volume_index: number | null;
  footfall_index: number | null;
}

export interface MarketSources {
  pulse: PulseData | null;
  news: NewsItem[];
  transactions: TransactionItem[];
  sentiment: SentimentData | null;
  auctionPicks: AuctionPick[];
  reports: ReportItem[];
  rentalTrend: RentalTrendItem | null;
  commercialDistrict: CommercialDistrictItem | null;
  /** 소스별 가용 여부 (false → 해당 섹션 생략) */
  availability: Record<'pulse' | 'news' | 'transactions' | 'sentiment' | 'auction' | 'reports' | 'rental' | 'commercial', boolean>;
  /** 조회 오류(비치명) — 로그·생성 메타용 */
  errors: string[];
}

interface CoverData {
  marketTemp: MarketTemperature | null;
  coverKeywords: string[];
}

/** 근거 데이터가 너무 부족해 생성을 거부했을 때. 호출부는 저장하지 않는다. */
export class InsufficientSourceDataError extends Error {
  constructor(message = '근거 데이터가 부족하여 매거진을 생성하지 않았습니다 (뉴스·실거래·시장 펄스 모두 없음)') {
    super(message);
    this.name = 'InsufficientSourceDataError';
  }
}

// ── 공통 헬퍼 ──────────────────────────────────────────────────────

const isoDaysAgo = (now: Date, days: number): string => new Date(now.getTime() - days * 86_400_000).toISOString();

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** 원 → '12.3억' (소수 1자리). */
export const formatEok = (won: number): string => `${(won / 1e8).toFixed(1)}억`;

/** 심리지수 라벨 — 주간/일간 단일 임계값 (M2-03: 임계값 통일). */
export const sentimentStatusLabel = (score: number): string =>
  score >= 70 ? '과열' : score >= 55 ? '낙관' : score >= 45 ? '중립' : score >= 30 ? '위축' : '침체';

const toStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ── 데이터 수집 ────────────────────────────────────────────────────

type Db = MagazineDbClient;

const fetchBrokerContext = async (supabase: Db, brokerParam: string): Promise<BrokerContext | null> => {
  const base = supabase
    .from('broker_profiles')
    .select('user_id, slug, specialty_regions, specialty_assets, bio, total_deal_count_self, deal_size_range, magazine_cover_image');
  let query;
  if (isUuid(brokerParam)) query = base.eq('user_id', brokerParam);
  else if (SLUG_RE.test(brokerParam)) query = base.eq('slug', brokerParam);
  else return null;

  const { data: bp, error: bpErr } = await query.maybeSingle();
  if (bpErr) throw new Error(`브로커 조회 실패: ${bpErr.message}`);
  if (!bp) return null;

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, display_name, company, phone, photo_url, tagline')
    .eq('id', bp.user_id)
    .maybeSingle();
  if (profErr) throw new Error(`프로필 조회 실패: ${profErr.message}`);
  if (!profile) return null;

  const { count, error: cntErr } = await supabase
    .from('building_ssot_lite')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', bp.user_id)
    .eq('status', 'public_signal_ready');
  if (cntErr) throw new Error(`활성 매물 수 조회 실패: ${cntErr.message}`);

  return {
    profile,
    broker: {
      ...bp,
      specialty_regions: toStringArray(bp.specialty_regions),
      specialty_assets: toStringArray(bp.specialty_assets),
    },
    activeDealCount: count ?? 0,
  };
};

const fetchActiveDeals = async (supabase: Db, userId: string, errors: string[]): Promise<DealItem[]> => {
  const { data, error } = await supabase
    .from('building_ssot_lite')
    .select('id, raw_address, area_signal, asset_type, price_band, status, layers')
    .eq('owner_id', userId)
    .in('status', ['public_signal_ready', 'active'])
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) {
    errors.push(`building_ssot_lite: ${error.message}`);
    return [];
  }
  return (data ?? []).map((b: Record<string, unknown>) => {
    const layers = (b.layers && typeof b.layers === 'object' ? b.layers : {}) as Record<string, unknown>;
    const photos = (layers.photos && typeof layers.photos === 'object' ? layers.photos : {}) as { urls?: unknown };
    return {
      id: String(b.id),
      address: str(b.raw_address) ?? '',
      area_signal: str(b.area_signal),
      asset_type: str(b.asset_type),
      price: str(b.price_band),
      status: String(b.status ?? ''),
      photo_urls: toStringArray(photos.urls),
      attrs: layers,
    };
  });
};

const fetchPulse = async (
  supabase: Db,
  code: PulseRegionCode | null,
  issueDate: string,
  errors: string[],
): Promise<PulseData | null> => {
  if (!code) return null;
  const { data, error } = await supabase
    .from('cre_pulses')
    .select('pulse_score, trend, summary_ko, key_findings, signals')
    .eq('region', code)
    .eq('period_type', 'weekly')
    .in('period_label', pulsePeriodLabelCandidates(issueDate)) // 표준(ISO) + 과거 적재 형식 호환 (함정 #18)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    errors.push(`cre_pulses: ${error.message}`);
    return null;
  }
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  const score = num(row?.pulse_score);
  if (!row || score === null) return null;
  return {
    pulse_score: score,
    trend: str(row.trend) ?? 'flat',
    summary_ko: sanitizeReaderText(str(row.summary_ko) ?? ''),
    key_findings: toStringArray(row.key_findings).map((s) => sanitizeReaderText(s)).filter(Boolean),
    signals: (row.signals && typeof row.signals === 'object' ? row.signals : {}) as Record<string, unknown>,
  };
};

const fetchNews = async (supabase: Db, now: Date, errors: string[], limit = 10): Promise<NewsItem[]> => {
  const { data, error } = await supabase
    .from('external_news')
    .select('id, title, summary, source, sentiment, importance_score, topic, created_at')
    .gte('created_at', isoDaysAgo(now, NEWS_WINDOW_DAYS))
    .order('importance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    errors.push(`external_news: ${error.message}`);
    return [];
  }
  return (data ?? [])
    .map((n: Record<string, unknown>) => ({
      id: String(n.id),
      title: decodeEntities(str(n.title) ?? '').trim(),
      summary: cleanNewsSummary(str(n.summary)),
      source: str(n.source) ?? '',
      sentiment: str(n.sentiment),
      importance_score: num(n.importance_score),
      topic: str(n.topic),
      created_at: str(n.created_at),
    }))
    .filter((n: NewsItem) => n.title.length > 0);
};

const fetchTransactions = async (
  supabase: Db,
  keywords: string[],
  now: Date,
  errors: string[],
  limit = 10,
): Promise<TransactionItem[]> => {
  // 지역 키워드가 없으면 전국 거래가 섞이므로 조회하지 않는다(섹션 생략).
  if (keywords.length === 0) return [];
  const { data, error } = await supabase
    .from('external_transactions')
    .select('address, dong, district, transaction_price, usage_type, building_area, transaction_date')
    .gte('transaction_date', toKstDate(new Date(now.getTime() - TX_WINDOW_DAYS * 86_400_000)))
    .order('transaction_date', { ascending: false })
    .limit(200);
  if (error) {
    errors.push(`external_transactions: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const matches = rows.filter((r) => {
    const hay = `${r.district ?? ''} ${r.dong ?? ''} ${r.address ?? ''}`;
    return keywords.some((k) => hay.includes(k));
  });
  return matches
    .map((r) => ({
      address: str(r.address),
      dong: str(r.dong),
      district: str(r.district),
      transaction_price: num(r.transaction_price) ?? 0,
      usage_type: str(r.usage_type),
      building_area: num(r.building_area),
      transaction_date: String(r.transaction_date ?? ''),
    }))
    .filter((t) => t.transaction_price > 0 && parseIssueDate(t.transaction_date.slice(0, 10)))
    .slice(0, limit);
};

const fetchSentiment = async (supabase: Db, issueDate: string, errors: string[]): Promise<SentimentData | null> => {
  const { data, error } = await supabase
    .from('social_sentiment')
    // D2-02: created_at 컬럼은 없다 → analysis_date
    .select('keyword, sentiment_score, mention_count, analysis_date')
    .order('analysis_date', { ascending: false })
    .limit(5);
  if (error) {
    errors.push(`social_sentiment: ${error.message}`);
    return null;
  }
  const items = ((data ?? []) as Array<Record<string, unknown>>)
    .map((s) => ({
      keyword: str(s.keyword) ?? '',
      sentiment_score: num(s.sentiment_score),
      mention_count: num(s.mention_count),
      analysis_date: String(s.analysis_date ?? '').slice(0, 10),
    }))
    .filter((s): s is { keyword: string; sentiment_score: number; mention_count: number | null; analysis_date: string } =>
      s.sentiment_score !== null && !!parseIssueDate(s.analysis_date),
    );
  if (items.length === 0) return null;
  const asOf = items.map((s) => s.analysis_date).sort().reverse()[0];
  // 기준일이 너무 오래됐으면 "현재 심리"로 보여주지 않는다.
  if (asOf < addDays(issueDate, -SENTIMENT_MAX_AGE_DAYS)) return null;
  const avg = Math.round(items.reduce((a, s) => a + s.sentiment_score, 0) / items.length);
  return { avgSentiment: avg, asOf, items };
};

const fetchAuctionPicks = async (supabase: Db, issueDate: string, errors: string[], limit = 3): Promise<AuctionPick[]> => {
  // D2-27: 과거 제외(입찰일 ≥ 오늘 KST), 입찰일 오름차순
  const { data, error } = await supabase
    .from('auction_listings')
    .select('case_number, court, address, minimum_bid, appraised_value, status, auction_date')
    .gte('auction_date', issueDate)
    .order('auction_date', { ascending: true })
    .limit(limit);
  if (error) {
    errors.push(`auction_listings: ${error.message}`);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((a) => {
      const minimumBid = num(a.minimum_bid);
      const appraisedValue = num(a.appraised_value);
      const pick: AuctionPick = {
        caseNumber: str(a.case_number),
        court: str(a.court),
        address: str(a.address),
        status: str(a.status),
        auctionDate: String(a.auction_date ?? '').slice(0, 10),
        minimumBid,
        appraisedValue,
      };
      if (minimumBid !== null && appraisedValue !== null && appraisedValue > 0 && minimumBid > 0 && minimumBid <= appraisedValue) {
        pick.discountPct = Math.round((1 - minimumBid / appraisedValue) * 100);
      }
      return pick;
    })
    .filter((p) => parseIssueDate(p.auctionDate) && p.auctionDate >= issueDate);
};

const fetchReports = async (supabase: Db, errors: string[], limit = 3): Promise<ReportItem[]> => {
  const { data, error } = await supabase
    .from('external_reports')
    .select('institution, title, summary, url, published_date')
    .order('published_date', { ascending: false })
    .limit(limit);
  if (error) {
    errors.push(`external_reports: ${error.message}`);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      institution: str(r.institution),
      title: decodeEntities(str(r.title) ?? '').trim(),
      summary: str(r.summary) ? sanitizeReaderText(String(r.summary)) : null,
      url: str(r.url),
      published_date: str(r.published_date),
    }))
    .filter((r) => r.title.length > 0);
};

const fetchRentalTrend = async (supabase: Db, code: PulseRegionCode | null, errors: string[]): Promise<RentalTrendItem | null> => {
  // 권역 코드가 없으면 조회하지 않는다 (이전: region 필터 없이 전국 최신 행을 사용)
  if (!code) return null;
  const { data, error } = await supabase
    .from('rental_trend_data')
    .select('region, quarter, vacancy_rate, rental_index')
    .eq('region', code)
    .order('quarter', { ascending: false })
    .limit(1);
  if (error) {
    errors.push(`rental_trend_data: ${error.message}`);
    return null;
  }
  const r = ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
  if (!r) return null;
  const item: RentalTrendItem = {
    region: String(r.region ?? code),
    quarter: String(r.quarter ?? ''),
    vacancy_rate: num(r.vacancy_rate),
    rental_index: num(r.rental_index),
  };
  return item.vacancy_rate === null && item.rental_index === null ? null : item;
};

const fetchCommercialDistrict = async (
  supabase: Db,
  keywords: string[],
  errors: string[],
): Promise<CommercialDistrictItem | null> => {
  // 이전: 무필터 maybeSingle → 임의 상권. 이제 지역 키워드로 district_name 을 매칭하고, 없으면 생략.
  for (const kw of keywords.slice(0, 3)) {
    const { data, error } = await supabase
      .from('commercial_district')
      .select('district_name, sales_volume_index, footfall_index')
      .ilike('district_name', `%${kw.replace(/[%_]/g, '')}%`)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) {
      errors.push(`commercial_district: ${error.message}`);
      return null;
    }
    const r = ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
    if (r) {
      const item: CommercialDistrictItem = {
        district_name: String(r.district_name ?? kw),
        sales_volume_index: num(r.sales_volume_index),
        footfall_index: num(r.footfall_index),
      };
      if (item.sales_volume_index !== null || item.footfall_index !== null) return item;
    }
  }
  return null;
};

/**
 * 시장 데이터 소스 일괄 수집 (주간 생성기 · 오너 POST 일간 생성 공용).
 * 각 소스는 독립적으로 실패할 수 있으며, 실패/빈 소스는 availability=false 로 표시되어 섹션이 생략된다.
 */
export const fetchMarketSources = async (
  supabase: Db,
  ctx: { regionCode: PulseRegionCode | null; regionKeywords: string[]; issueDate: string; now?: Date },
): Promise<MarketSources> => {
  const now = ctx.now ?? new Date();
  const errors: string[] = [];
  const guard = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const [pulse, news, transactions, sentiment, auctionPicks, reports, rentalTrend, commercialDistrict] = await Promise.all([
    guard('cre_pulses', null as PulseData | null, () => fetchPulse(supabase, ctx.regionCode, ctx.issueDate, errors)),
    guard('external_news', [] as NewsItem[], () => fetchNews(supabase, now, errors)),
    guard('external_transactions', [] as TransactionItem[], () => fetchTransactions(supabase, ctx.regionKeywords, now, errors)),
    guard('social_sentiment', null as SentimentData | null, () => fetchSentiment(supabase, ctx.issueDate, errors)),
    guard('auction_listings', [] as AuctionPick[], () => fetchAuctionPicks(supabase, ctx.issueDate, errors)),
    guard('external_reports', [] as ReportItem[], () => fetchReports(supabase, errors)),
    guard('rental_trend_data', null as RentalTrendItem | null, () => fetchRentalTrend(supabase, ctx.regionCode, errors)),
    guard('commercial_district', null as CommercialDistrictItem | null, () => fetchCommercialDistrict(supabase, ctx.regionKeywords, errors)),
  ]);

  return {
    pulse,
    news,
    transactions,
    sentiment,
    auctionPicks,
    reports,
    rentalTrend,
    commercialDistrict,
    availability: {
      pulse: !!pulse,
      news: news.length > 0,
      transactions: transactions.length > 0,
      sentiment: !!sentiment,
      auction: auctionPicks.length > 0,
      reports: reports.length > 0,
      rental: !!rentalTrend,
      commercial: !!commercialDistrict,
    },
    errors,
  };
};

// ── 커버 데이터 빌드 ───────────────────────────────────────────────

/**
 * 펄스 스코어와 심리 데이터로 시장 온도를 결정하고 커버 키워드를 추출합니다.
 * 근거가 없으면 marketTemp=null (이전: 50점 '관망' 폴백), 키워드는 있는 만큼만 (이전: 더미 3개 보충).
 */
export const buildWeeklyCoverData = (pulseData: PulseData | null, sentimentData: SentimentData | null): CoverData => {
  const score = pulseData?.pulse_score ?? sentimentData?.avgSentiment ?? null;

  const marketTemp: MarketTemperature | null =
    score === null
      ? null
      : score >= 80
        ? '적극 매수'
        : score >= 65
          ? '선별 매수'
          : score >= 45
            ? '관망'
            : score >= 25
              ? '조정 대기'
              : '위기 경계';

  const findings = (pulseData?.key_findings ?? []).filter((f) => f.length > 0 && f.length <= 24);
  const sentimentKeywords = (sentimentData?.items ?? []).map((s) => s.keyword).filter((k) => k.length > 0 && k.length <= 24);
  const coverKeywords = Array.from(new Set([...findings, ...sentimentKeywords])).slice(0, 3);

  return { marketTemp, coverKeywords };
};

// ── LLM 입력(근거 사실) 구성 ────────────────────────────────────────

export interface PromptFacts {
  /** 프롬프트에 그대로 들어가는 사실 줄. QG 의 근거 데이터도 이 줄들이다(단일 진실원). */
  lines: string[];
}

const txLine = (t: TransactionItem): string => {
  const place = [t.district, t.dong].filter(Boolean).join(' ') || '지역 미상';
  const area = t.building_area && t.building_area > 0 ? ` ${Math.round(t.building_area)}㎡` : '';
  return `${place} ${t.usage_type ?? '용도 미상'} ${formatEok(t.transaction_price)}${area} (${t.transaction_date.slice(0, 10)})`;
};

export const buildPromptFacts = (input: {
  regionLabel: string;
  news: NewsItem[];
  transactions: TransactionItem[];
  pulse: PulseData | null;
  sentiment: SentimentData | null;
  rentalTrend: RentalTrendItem | null;
  activeDealCount: number;
}): PromptFacts => {
  const lines: string[] = [];
  lines.push(`권역: ${input.regionLabel}`);
  if (input.pulse) {
    lines.push(`시장 펄스: ${input.pulse.pulse_score}점 (추세 ${input.pulse.trend})`);
    if (input.pulse.summary_ko) lines.push(`펄스 요약: ${input.pulse.summary_ko}`);
  }
  if (input.sentiment) {
    lines.push(`투자 심리 지수: ${input.sentiment.avgSentiment}점 (${sentimentStatusLabel(input.sentiment.avgSentiment)}, 기준일 ${input.sentiment.asOf})`);
  }
  if (input.rentalTrend) {
    const parts = [
      input.rentalTrend.vacancy_rate !== null ? `공실률 ${input.rentalTrend.vacancy_rate}%` : null,
      input.rentalTrend.rental_index !== null ? `임대 지수 ${input.rentalTrend.rental_index}점` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`임대 동향(${input.rentalTrend.quarter}): ${parts.join(', ')}`);
  }
  const news = input.news.slice(0, 6);
  if (news.length) {
    lines.push(`수집 뉴스 ${news.length}건`);
    news.forEach((n) => lines.push(`뉴스[${n.source || '출처 미상'}] ${n.title}${n.summary ? `: ${n.summary}` : ''}`));
  }
  const txs = input.transactions.slice(0, 5);
  if (txs.length) {
    lines.push(`최근 실거래 ${txs.length}건`);
    txs.forEach((t) => lines.push(`실거래 ${txLine(t)}`));
  }
  lines.push(`브로커 활성 매물 ${input.activeDealCount}건`);
  return { lines };
};

// ── LLM 콘텐츠 생성 ───────────────────────────────────────────────

const llmOutputSchema = z.object({
  ai_briefing: zReaderText(40, 2500),
  theme_title: zReaderText(3, 60),
  theme_body_md: zReaderText(40, 2000),
  poll: z
    .object({ question: zReaderText(5, 80), choices: z.array(zReaderText(1, 30)).min(2).max(5) })
    .nullish(),
  matchedDealIds: z.array(z.string()).nullish(),
});
type LlmOutput = z.infer<typeof llmOutputSchema>;

/** 주간 생성기 LLM 호출 1회 (브리핑 + 금주의 테마 + 설문). 이전의 테마 이중 생성(M2-20) 제거. */
const generateLLMContent = async (params: {
  brokerName: string | null;
  company: string | null;
  regionLabel: string;
  assetLabel: string | null;
  cover: CoverData;
  facts: PromptFacts;
  dealDigest: string;
}) => {
  const tempLine = params.cover.marketTemp
    ? `시장 온도: ${MARKET_TEMP_CONFIG[params.cover.marketTemp].emoji} ${params.cover.marketTemp}`
    : '시장 온도: 판단 근거 없음(언급 금지)';
  const who = [params.brokerName, params.company].filter(Boolean).join(' / ');

  const systemPrompt = `당신은 ${who ? `"${who}" 브로커를 위한 ` : ''}주간 CRE 매거진 에디터입니다.
전문 권역: ${params.regionLabel}${params.assetLabel ? `, 전문 자산: ${params.assetLabel}` : ''}

■ 이 매거진은 브로커가 고객(투자자/자산관리자)에게 배포하는 콘텐츠입니다.
■ 독자는 꼬마빌딩·상업용 부동산에 관심 있는 전문 투자자입니다.
■ 아래 "근거 사실"에 있는 내용만 사용하십시오. 사실이 부족하면 해당 부분은 짧게 쓰거나 생략하십시오.

${tempLine}
${params.cover.coverKeywords.length ? `커버 키워드: ${params.cover.coverKeywords.join(', ')}` : ''}

결과를 JSON으로만 반환:
{
  "ai_briefing": "주간 AI 브리핑 본문 (마크다운, 3-5문단, 각 문단 이모지 섹션 헤딩, 400-900자)",
  "theme_title": "금주의 테마 제목 (15-25자)",
  "theme_body_md": "테마 본문 마크다운 (300-700자)",
  "poll": {"question": "독자에게 묻는 20자 내외 질문", "choices": ["선택지1", "선택지2", "선택지3"]},
  "matchedDealIds": ["테마와 관련된 활성 매물 ID (아래 매물 목록에 있는 ID만)"]
}

톤앤매너:
- 전문적이면서도 읽기 쉬운 매거진 문체 (존댓말 "~합니다/~습니다")
- 데이터 근거 팩트 중심, 과장 금지
- 출처 있는 뉴스는 출처 명시
- **굵은 글씨**로 핵심 수치 강조 (근거 사실에 있는 수치만)
- poll 은 시장 전망 설문이며 매수·매도 권유가 아닙니다`;

  const userPrompt = `근거 사실:\n${params.facts.lines.join('\n')}\n\n활성 매물 목록(ID | 지역·자산·가격대):\n${params.dealDigest || '(없음)'}`;

  const { data, response } = await callMagazineJson(
    { label: 'weekly.briefing', systemPrompt, userPrompt, tier: 'terra', temperature: 0.5, maxTokens: 1600 },
    llmOutputSchema,
  );
  return { output: data as LlmOutput, response };
};

// ── 개인화 인서트 (구독자 세그먼트 단위 캐시) ──────────────────────────

interface InsertCacheEntry {
  value: string;
  at: number;
}
const INSERT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const INSERT_CACHE_MAX = 500;
const insertCache = new Map<string, InsertCacheEntry>();

/** 테스트 전용 */
export function __resetInsertCacheForTests(): void {
  insertCache.clear();
}

const insertSchema = z.object({ insight: zReaderText(10, 260) });

const dealsBlock = (deals: Array<{ blindName: string }>): string => {
  const top = deals.slice(0, 3);
  if (top.length === 0) return '';
  // 내부 매칭 등급·점수는 독자에게 노출하지 않는다 (M2-16)
  return `🎯 이번 주 대표님을 위한 맞춤 추천 매물:\n${top.map((d) => `• ${d.blindName}`).join('\n')}`;
};

/**
 * 구독자 관심사(권역, 자산유형, 토픽)에 맞춘 2~3줄 개인화 인서트.
 *
 * - 근거(뉴스)가 없으면 LLM 인서트를 **생략**한다(이전: 테마 제목만으로 생성 → 근거 없는 문장).
 * - 구독자당 LLM 호출 금지: 같은 세그먼트(권역·자산·토픽·뉴스 조합)는 캐시된 1회 결과를 재사용한다 (M2-16).
 * - Mock/실패/수치 불일치 → 인서트 생략(빈 문자열). 일반 문구 폴백 없음.
 * - 취미 등 개인 속성은 프롬프트와 캐시에서 제외한다(세그먼트 캐시 공유 시 노출 방지).
 */
export async function generatePersonalizedInsert(
  interestTags: { regions?: string[]; assetTypes?: string[]; topics?: string[]; hobbies?: string[] },
  editionSummary: { theme_title?: string; ai_briefing?: string },
  recentNews?: Array<{ title: string; source?: string }>,
  subscriberMatchedDeals?: Array<{ blindName: string; grade: string; score: number }>,
): Promise<string> {
  const deals = dealsBlock(subscriberMatchedDeals ?? []);
  const regions = interestTags?.regions ?? [];
  const assets = interestTags?.assetTypes ?? [];
  const topics = interestTags?.topics ?? [];
  if (!interestTags || (regions.length === 0 && topics.length === 0 && assets.length === 0)) return deals;

  const news = (recentNews ?? []).filter((n) => n && typeof n.title === 'string' && n.title.trim().length > 0);
  if (news.length === 0) return deals; // 근거 없음 → LLM 인서트 생략

  const regionKeys = regions.flatMap((r) => {
    const code = normalizePulseRegion(r);
    return deriveRegionKeywords([r], code);
  });
  const matched = news.filter((n) => regionKeys.some((k) => n.title.includes(k))).slice(0, 3);
  const grounding = (matched.length > 0 ? matched : news.slice(0, 3)).map((n) => decodeEntities(n.title).trim());

  const key = [
    editionSummary?.theme_title ?? '',
    [...regions].sort().join(','),
    [...assets].sort().join(','),
    [...topics].sort().join(','),
    grounding.join('|'),
  ].join('#');
  const cached = insertCache.get(key);
  if (cached && Date.now() - cached.at < INSERT_CACHE_TTL_MS) {
    return cached.value ? [cached.value, deals].filter(Boolean).join('\n\n') : deals;
  }

  const regionsStr = regions.join(', ') || '미지정';
  const assetsStr = assets.join(', ') || '미지정';
  const topicsStr = topics.join(', ') || '미지정';

  let insight = '';
  try {
    const { data, response } = await callMagazineJson(
      {
        label: 'weekly.insert',
        tier: 'luna',
        temperature: 0.3,
        maxTokens: 250,
        systemPrompt: `당신은 상업용 부동산 중개사의 고객 안내 비서입니다.
고객 관심 정보: 희망 권역 ${regionsStr} / 관심 자산 ${assetsStr} / 관심 분야 ${topicsStr}
아래 "관련 뉴스 제목"만 근거로, 이번 주 이 고객이 주목할 점을 2~3줄(120자 내외) 존댓말로 요약하십시오.
JSON 으로만 반환: {"insight": "..."}`,
        userPrompt: `관련 뉴스 제목:\n${grounding.map((t) => `- ${t}`).join('\n')}`,
      },
      insertSchema,
    );
    if (!response.isMock) {
      const text = data.insight;
      const qg = runMagazineQualityGate(text, { facts: grounding });
      if (qg.passed) insight = text;
      else log.warn('[generatePersonalizedInsert] QG 불합격 — 인서트 생략', qg.issues.slice(0, 2));
    }
  } catch (err) {
    log.warn('[generatePersonalizedInsert] 생성 실패 — 인서트 생략', err instanceof Error ? err.message : String(err));
  }

  if (insertCache.size >= INSERT_CACHE_MAX) {
    const oldest = insertCache.keys().next().value;
    if (oldest !== undefined) insertCache.delete(oldest);
  }
  // 실패(빈 값)도 TTL 동안 캐시해 구독자 수만큼 재호출하지 않는다(비용 폭증 방지).
  insertCache.set(key, { value: insight, at: Date.now() });

  return [insight, deals].filter(Boolean).join('\n\n');
}

// ── 메인: 주간 매거진 생성 ─────────────────────────────────────────

export interface GenerateWeeklyParams {
  supabase: MagazineDbClient;
  /** 브로커 slug 또는 user uuid */
  brokerId: string;
  editionType?: string;
  /** 기본: isoWeekLabel(issueDate) */
  editionLabel?: string;
  /** 발행 기준일 (KST YYYY-MM-DD). 기본 todayKst(). 테스트/백필용 */
  issueDate?: string;
  /** 기준 시각 (테스트용) */
  now?: Date;
  /**
   * 같은 (broker, type, label) 에디션이 이미 있을 때:
   * 'drafts'(기본) = draft/needs_review 만 갱신, 그 외 상태는 덮어쓰지 않고 오류.
   * 'never' = 항상 오류.
   */
  overwriteExisting?: 'drafts' | 'never';
}

const saveEdition = async (
  supabase: MagazineDbClient,
  row: Record<string, unknown> & { broker_id: string; edition_type: string; edition_label: string },
  overwrite: 'drafts' | 'never',
): Promise<MagazineEdition> => {
  const { data: existing, error: exErr } = await supabase
    .from('magazine_editions')
    .select('id, status')
    .eq('broker_id', row.broker_id)
    .eq('edition_type', row.edition_type)
    .eq('edition_label', row.edition_label)
    .limit(1);
  if (exErr) throw new EditionSaveError(`기존 에디션 조회 실패: ${exErr.message}`, exErr.code ?? null);

  const ex = (existing ?? [])[0] as { id: string; status: string } | undefined;
  if (ex) {
    if (overwrite === 'never' || !['draft', 'needs_review'].includes(ex.status)) {
      throw new EditionSaveError(`이미 '${ex.status}' 상태의 ${row.edition_label} 에디션이 있어 덮어쓰지 않습니다`, 'EDITION_EXISTS');
    }
    const { data, error } = await supabase
      .from('magazine_editions')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', ex.id)
      .select()
      .single();
    if (error) throw new EditionSaveError(`매거진 에디션 저장 실패: ${error.message}`, error.code ?? null);
    return data as MagazineEdition;
  }

  const { data, error } = await supabase.from('magazine_editions').insert(row).select().single();
  if (error) {
    // needs_review CHECK 미적용(23514) 등을 삼키지 않고 그대로 전달한다 (함정 #11).
    throw new EditionSaveError(`매거진 에디션 저장 실패: ${error.message}`, error.code ?? null);
  }
  return data as MagazineEdition;
};

/** 안전한 지역 토큰만 (monthly-transaction-summary 가 `.or()` 문자열 보간을 쓰므로 필터 구문 문자 제거). */
const safeRegionToken = (s: string): string => s.replace(/[^가-힣A-Za-z0-9]/g, '');

const buildMonthlySummary = async (
  supabase: MagazineDbClient,
  keywords: string[],
  now: Date,
): Promise<Record<string, unknown> | null> => {
  const tokens = keywords.map(safeRegionToken).filter((t) => t.length >= 2).slice(0, 2);
  if (tokens.length === 0) return null;
  const ym = previousMonthKst(now);
  try {
    const summaries = await summarizeMonthlyTransactions(supabase as never, ym, tokens);
    const best = [...summaries].sort((a, b) => b.totalCount - a.totalCount)[0];
    if (!best || best.totalCount <= 0) return null;
    const [y, m] = ym.split('-');
    const total = best.totalCount;
    return {
      period: `${y}년 ${Number(m)}월`,
      region: best.region,
      totalCount: total,
      avgPrice: best.avgPriceManwon > 0 ? `${(best.avgPriceManwon / 10000).toFixed(1)}억` : undefined,
      // 전월 거래가 0건이면 변동률은 정의되지 않는다 → 생략 (이전: 0% 로 위장)
      changeRate: best.previousMonthCount > 0 ? best.countChangeRatePct : undefined,
      usageDistribution: Object.entries(best.byUsageType).map(([usage, count]) => ({
        usage,
        count,
        ratio: Math.round((count / total) * 100),
      })),
    };
  } catch (err) {
    log.warn('[WeeklyGenerator] 월간 실거래 집계 실패 — 생략', err instanceof Error ? err.message : String(err));
    return null;
  }
};

/**
 * 브로커의 주간 매거진 에디션을 생성합니다.
 *
 * 1. 브로커·시장 데이터 수집 (실제 컬럼, 소스별 가용성)
 * 2. 근거가 전혀 없으면 InsufficientSourceDataError (저장 안 함)
 * 3. LLM 1회(Mock/실패 → MagazineLlmError, 저장 안 함) + QG(fail-closed)
 * 4. draft(통과) / needs_review(불합격) 로 magazine_editions 에 저장. magazine_issues(공개)에는 쓰지 않는다.
 */
export const generateWeeklyMagazine = async (params: GenerateWeeklyParams): Promise<MagazineEdition> => {
  const { supabase, brokerId } = params;
  const now = params.now ?? new Date();
  const issueDate = params.issueDate ?? todayKst(now);
  if (!parseIssueDate(issueDate)) throw new Error(`잘못된 발행일입니다: ${issueDate}`);
  const label = params.editionLabel ?? isoWeekLabel(issueDate);

  // 1. 브로커 프로필
  const brokerCtx = await fetchBrokerContext(supabase, brokerId);
  if (!brokerCtx) {
    throw new Error(`브로커를 찾을 수 없습니다: ${brokerId}`);
  }

  const regions = brokerCtx.broker.specialty_regions;
  const regionCode = pickPulseRegion(regions);
  const regionKeywords = deriveRegionKeywords(regions, regionCode);
  const regionLabel = regionCode ? PULSE_REGION_LABELS_KO[regionCode] : regions[0] ?? '';

  // 2. 병렬 데이터 수집
  const sourceErrors: string[] = [];
  const [sources, deals] = await Promise.all([
    fetchMarketSources(supabase, { regionCode, regionKeywords, issueDate, now }),
    fetchActiveDeals(supabase, brokerCtx.broker.user_id, sourceErrors),
  ]);
  sourceErrors.push(...sources.errors);
  if (sourceErrors.length) log.warn(`[weekly-generator] 소스 조회 오류 (${brokerId}):`, sourceErrors.slice(0, 5));

  // 근거 최소 요건: 뉴스·실거래·펄스 중 하나 이상
  if (!sources.availability.news && !sources.availability.transactions && !sources.availability.pulse) {
    throw new InsufficientSourceDataError();
  }

  // 3. 커버 / 근거 사실
  const cover = buildWeeklyCoverData(sources.pulse, sources.sentiment);
  const facts = buildPromptFacts({
    regionLabel: regionLabel || '미지정',
    news: sources.news,
    transactions: sources.transactions,
    pulse: sources.pulse,
    sentiment: sources.sentiment,
    rentalTrend: sources.rentalTrend,
    activeDealCount: brokerCtx.activeDealCount,
  });

  // 매물 목록(프롬프트용): 지번은 마스킹해서 LLM 에도 넘기지 않는다
  const dealDigest = deals
    .slice(0, 5)
    .map((d) => `${d.id} | ${maskAddress(d.address)} ${d.asset_type ?? ''} ${d.price ?? ''}`.trim())
    .join('\n');

  // 4. LLM 1회 (+ 세무 클리닉은 주 1회 공용 생성·캐시)
  const { output, response } = await generateLLMContent({
    brokerName: brokerCtx.profile.display_name,
    company: brokerCtx.profile.company,
    regionLabel: regionLabel || '미지정',
    assetLabel: brokerCtx.broker.specialty_assets[0] ?? null,
    cover,
    facts,
    dealDigest,
  });

  const validDealIds = new Set(deals.map((d) => d.id));
  const matchedDealIds = (output.matchedDealIds ?? []).filter((id) => validDealIds.has(id));
  const taxClinic = await generateSharedTaxClinic(label, sources.pulse?.summary_ko ?? null);

  // 5. 품질 게이트 (fail-closed) — 브리핑·테마·설문 전체 텍스트
  const gateText = [output.ai_briefing, output.theme_title, output.theme_body_md, output.poll?.question ?? ''].join('\n');
  const qg = runMagazineQualityGate(gateText, { facts: facts.lines }, {
    sentimentScore: sources.sentiment?.avgSentiment ?? null,
    marketTemp: cover.marketTemp,
  });
  if (!qg.passed) log.warn(`[weekly-magazine] QG 불합격 → needs_review (score: ${qg.score}):`, qg.issues.slice(0, 3));
  const qgSummary: EditionQualityGateSummary = {
    passed: qg.passed,
    status: qg.status,
    score: qg.score,
    totalClaims: qg.totalClaims,
    matchedClaims: qg.matchedClaims,
    failureReasons: qg.failureReasons,
    issues: qg.issues.slice(0, 10),
  };

  // 6. 콘텐츠 구성 (없는 섹션은 키 자체를 만들지 않는다)
  const briefingText = output.ai_briefing;
  const headline =
    briefingText
      .split('\n')
      .find((l) => l.trim().length > 5)
      ?.replace(/^[#*\-\s>]+/, '')
      .trim() ?? `${regionLabel ? `${regionLabel} ` : ''}CRE 주간 브리핑`;
  const editionTitle = `${regionLabel ? `${regionLabel} ` : ''}주간 CRE 매거진 — ${label}`;

  const teaserCards = generateMagazineTeaserCards(deals.map((d) => ({ id: d.id, attrs: d.attrs })));
  const monthlySummary = await buildMonthlySummary(supabase, regionKeywords, now);

  const content: EditionContentV1 = {
    schemaVersion: 1,
    kind: 'weekly',
    issueDate,
    weekLabel: label,
    headline,
    briefing: briefingText,
    ai_briefing: briefingText, // 하위호환
    broker: {
      name: brokerCtx.profile.display_name ?? '',
      slug: brokerCtx.broker.slug ?? brokerId,
      company: brokerCtx.profile.company ?? '',
      phone: brokerCtx.profile.phone ?? '',
      photoUrl: brokerCtx.profile.photo_url,
      tagline: brokerCtx.profile.tagline ?? brokerCtx.broker.bio ?? '',
      specialtyRegions: regions,
      specialtyAssets: brokerCtx.broker.specialty_assets,
      totalDeals: brokerCtx.broker.total_deal_count_self ?? 0,
      activeDeals: brokerCtx.activeDealCount,
    },
    market_temp: cover.marketTemp,
    cover_keywords: cover.coverKeywords,
    cover_image_url: brokerCtx.broker.magazine_cover_image,
    theme_title: output.theme_title,
    theme_body_md: output.theme_body_md,
    theme_asset_types: brokerCtx.broker.specialty_assets,
    featured_deal_ids: matchedDealIds,
    theme_color: DEFAULT_THEME_COLOR,
    generation: {
      model: response.model,
      isMock: response.isMock,
      totalTokens: response.tokens,
      llmCalls: 1,
      generatedAt: now.toISOString(),
      qualityGate: qgSummary,
      sources: { ...sources.availability, taxClinic: !!taxClinic, monthlySummary: !!monthlySummary },
      sourceErrors: sourceErrors.slice(0, 10),
    },
  };

  if (output.poll) content.poll = { question: output.poll.question, choices: output.poll.choices };
  if (sources.news.length) {
    content.topNews = sources.news.slice(0, 6).map((n) => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      source: n.source,
      sentiment: n.sentiment,
      topic: n.topic,
    }));
  }
  if (sources.transactions.length) content.recentTransactions = sources.transactions.slice(0, 5) as unknown as Array<Record<string, unknown>>;
  if (sources.sentiment) {
    content.sentiment = {
      score: sources.sentiment.avgSentiment,
      status: sentimentStatusLabel(sources.sentiment.avgSentiment),
      items: sources.sentiment.items as unknown as Array<Record<string, unknown>>,
      asOf: sources.sentiment.asOf,
    };
  }
  if (deals.length) {
    content.dealHighlights = deals.slice(0, 5).map((d) => ({
      id: d.id,
      address: d.address, // DB 원본 보존 — 공개 응답 직전에 maskAddress 로 마스킹
      areaSignal: d.area_signal,
      assetType: d.asset_type,
      price: d.price,
      photoUrl: d.photo_urls?.[0] ?? null,
    }));
    content.teaserCards = teaserCards;
  }
  if (sources.auctionPicks.length) content.auctionPicks = sources.auctionPicks as unknown as Array<Record<string, unknown>>;
  if (sources.reports.length) content.reports = sources.reports as unknown as Array<Record<string, unknown>>;
  if (sources.rentalTrend) content.rentalTrend = sources.rentalTrend as unknown as Record<string, unknown>;
  if (sources.commercialDistrict) content.commercialDistrict = sources.commercialDistrict as unknown as Record<string, unknown>;
  if (monthlySummary) content.monthlySummary = monthlySummary;
  if (taxClinic) content.tax_clinic = taxClinic;

  // Mock 이 섞였거나(로컬 전용) QG 불합격이면 needs_review. 통과해도 draft — 발행은 브로커가 한다.
  const status: EditionStatus = qg.passed && !response.isMock ? EDITION_STATUS_DRAFT : EDITION_STATUS_NEEDS_REVIEW;

  const editionRow = {
    broker_id: brokerCtx.broker.slug ?? brokerId,
    edition_type: (params.editionType ?? 'weekly') as 'weekly',
    edition_label: label,
    title: editionTitle,
    market_temp: cover.marketTemp,
    cover_keywords: cover.coverKeywords,
    cover_image_url: brokerCtx.broker.magazine_cover_image,
    theme_title: output.theme_title,
    theme_body_md: output.theme_body_md,
    theme_asset_types: brokerCtx.broker.specialty_assets,
    content,
    featured_deal_ids: matchedDealIds,
    target_segments: ['all'],
    status,
    theme_color: DEFAULT_THEME_COLOR,
    version: 1,
  };

  // 7. 저장 — 실패(CHECK 미적용 등)는 삼키지 않고 던진다. 공개 magazine_issues 에는 쓰지 않는다(D2-06).
  return saveEdition(supabase, editionRow, params.overwriteExisting ?? 'drafts');
};
