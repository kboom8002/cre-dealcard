/**
 * Weekly Magazine Domain Types
 *
 * 브로커 주간 매거진 에디션 도메인 타입 정의.
 * pulse/oiticle-types.ts 패턴을 따름.
 */

import { isoWeekLabel, toKstDate } from '@/lib/magazine/kst';

// ── DB 클라이언트 인터페이스 (Rule 12: 도메인 계층 Supabase 직접 의존 제거) ──
export interface MagazineDbClient {
  from(table: string): any;
  storage?: any;
}

// ── 시장 온도 ──────────────────────────────────────────────────────
export type MarketTemperature =
  | '적극 매수'
  | '선별 매수'
  | '관망'
  | '조정 대기'
  | '위기 경계';

export interface MarketTempConfig {
  emoji: string;
  color: string;
  description: string;
}

// 이모지는 에디터(`lib/magazine/editor-labels.ts EDITOR_MARKET_TEMP_ICON`)·뷰어(`view-helpers MARKET_TEMP_VIEW`)와 동일한
// 색 사각형 세트 — 구독자 매수 온도(🔥📈⏸️❄️⚪, buyer-temperature.ts)와 겹치지 않는다 (U2-24, 테스트로 보장).
export const MARKET_TEMP_CONFIG: Record<MarketTemperature, MarketTempConfig> = {
  '적극 매수': {
    emoji: '🟩',
    color: '#ef4444',
    description: '강한 매수 신호 — 거래량 급증, 매물 소진 빠름',
  },
  '선별 매수': {
    emoji: '🟨',
    color: '#f59e0b',
    description: '선별적 기회 존재 — 입지·가격 따져 진입 가능',
  },
  '관망': {
    emoji: '🟦',
    color: '#6b7280',
    description: '관망 국면 — 뚜렷한 방향 없이 거래 위축',
  },
  '조정 대기': {
    emoji: '🟧',
    color: '#3b82f6',
    description: '조정 진행 중 — 급매 나올 수 있으나 하락 리스크 상존',
  },
  '위기 경계': {
    emoji: '🟥',
    color: '#dc2626',
    description: '시장 위기 경계 — 금리·경기 악재 집중, 신규 투자 보류 권고',
  },
};

// ── 에디션 상태 ────────────────────────────────────────────────────
export const EDITION_STATUSES = [
  'draft',
  'editing',
  'review',
  'needs_review',
  'scheduled',
  'published',
  'archived',
] as const;

export type EditionStatus = (typeof EDITION_STATUSES)[number];

/** 품질 게이트 불합격 상태값. DB CHECK(magazine_editions.status)에 마이그레이션 000002 적용 후에만 저장 가능(함정 #11). */
export const EDITION_STATUS_NEEDS_REVIEW = 'needs_review' as const satisfies EditionStatus;
export const EDITION_STATUS_DRAFT = 'draft' as const satisfies EditionStatus;
export const EDITION_STATUS_PUBLISHED = 'published' as const satisfies EditionStatus;

/**
 * 에디션 저장 실패. `needsMigration=true` 면 CHECK/컬럼 마이그레이션 미적용 가능성이 높다
 * (23514 check_violation, 42703 undefined_column, 42P01/PGRST205 undefined_table).
 * 호출부는 이를 삼키지 말고 상위(에디터 UI/cron 로그)로 그대로 전달해야 한다.
 */
export class EditionSaveError extends Error {
  readonly code: string | null;
  readonly needsMigration: boolean;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'EditionSaveError';
    this.code = code;
    this.needsMigration = code !== null && ['23514', '42703', '42P01', 'PGRST205'].includes(code);
  }
}

// ── 에디션 유형 ────────────────────────────────────────────────────
export type EditionType = 'daily' | 'weekly' | 'monthly' | 'special';


// ── 매거진 이미지 포맷 ───────────────────────────────────────────────
export type MagazineImageFormat = 'story' | 'card' | 'og';

// ── 브로커 현장 노트 (5필드) ──────────────────────────────────────
export interface BrokerFieldNote {
  question: string;        // 이번 주 시장을 한 문장으로?
  buyerReaction: string;   // 매수자 반응
  sellerReaction: string;  // 매도자 반응
  marketJudgment: string;  // 본인의 시장 판단
  comment: string;         // 독자에게 한마디
}

// ── 섹션 ID ────────────────────────────────────────────────────────
export type WeeklyMagazineSectionId =
  | 'cover'
  | 'ai_briefing'
  | 'field_note'
  | 'theme_of_week'
  | 'featured_deals'
  | 'broker_profile';

export type ExtraSectionId =
  | 'market_data'
  | 'news_curation'
  | 'auction_picks'
  | 'reports'
  | 'sentiment_index';

export interface SectionDef {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// ── MVP 기본 섹션 ──────────────────────────────────────────────────
export const WEEKLY_SECTIONS_MVP: readonly SectionDef[] = [
  {
    id: 'cover',
    label: '커버',
    icon: '📰',
    description: '시장 온도·키워드·브로커 메시지',
  },
  {
    id: 'ai_briefing',
    label: 'AI 브리핑',
    icon: '🤖',
    description: '주간 시장 AI 분석 요약',
  },
  {
    id: 'field_note',
    label: '현장 노트',
    icon: '📝',
    description: '브로커 직접 작성 시장 코멘트 (5필드)',
  },
  {
    id: 'theme_of_week',
    label: '금주의 테마',
    icon: '🎯',
    description: '트렌드 기반 심층 분석 테마',
  },
  {
    id: 'featured_deals',
    label: '주목 매물',
    icon: '🏢',
    description: '브로커 추천 핵심 매물 하이라이트',
  },
  {
    id: 'broker_profile',
    label: '브로커 프로필',
    icon: '👤',
    description: '전문 중개인 소개 및 연락처',
  },
] as const;

// ── 확장 섹션 ──────────────────────────────────────────────────────
export const EXTRA_SECTIONS: readonly SectionDef[] = [
  {
    id: 'market_data',
    label: '시장 데이터',
    icon: '📊',
    description: '실거래·임대·공실률 데이터 차트',
  },
  {
    id: 'news_curation',
    label: '뉴스 큐레이션',
    icon: '📋',
    description: '주간 핵심 CRE 뉴스 큐레이션',
  },
  {
    id: 'auction_picks',
    label: '경매 픽',
    icon: '🔨',
    description: '주목할 경매 물건 추천',
  },
  {
    id: 'reports',
    label: '리포트',
    icon: '📄',
    description: '기관 리서치 리포트 요약',
  },
  {
    id: 'sentiment_index',
    label: '심리 지수',
    icon: '🌡️',
    description: '투자 심리 및 소셜 센티먼트 분석',
  },
] as const;

// ── 매거진 에디션 (DB 스키마 대응) ─────────────────────────────────
export interface MagazineEdition {
  id: string;
  broker_id: string;
  edition_type: EditionType;
  edition_label: string;
  title: string;

  // 커버
  market_temp: MarketTemperature | null;
  cover_keywords: string[];
  cover_image_url: string | null;

  // 브로커 5필드
  field_note: BrokerFieldNote | Record<string, never>;

  // 테마
  theme_title: string | null;
  theme_body_md: string | null;
  theme_asset_types: string[];

  // 콘텐츠
  content: Record<string, unknown>;
  oiticle_ids: string[];
  featured_deal_ids: string[];

  // 타겟
  target_segments: string[];

  // 상태
  status: EditionStatus;
  scheduled_at: string | null;
  published_at: string | null;

  // 성과
  view_count: number;
  share_count: number;

  // 메타
  theme_color: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// ── 매거진 분석 이벤트 ─────────────────────────────────────────────
export type AnalyticsEventType =
  | 'page_view'
  | 'section_view'
  | 'click'
  | 'scroll_depth'
  | 'dwell';

export interface MagazineAnalyticsEvent {
  id: string;
  edition_id: string;
  visitor_id: string;
  event_type: AnalyticsEventType;
  section_id: string | null;
  target_url: string | null;
  dwell_seconds: number | null;
  scroll_pct: number | null;
  metadata: Record<string, unknown>;
  target_param: string | null;
  created_at: string;
}

// ── 헬퍼: ISO 주차 라벨 생성 ───────────────────────────────────────
/**
 * 주어진 순간의 KST 기준 'W28-2026' 형식 ISO 8601 주차 라벨을 반환합니다.
 * 자체 계산을 제거하고 `@/lib/magazine/kst` 단일 구현으로 위임합니다 (D2-18).
 */
export function getWeekLabel(date: Date = new Date()): string {
  return isoWeekLabel(toKstDate(date));
}

// ── 헬퍼: 에디션 URL 생성 ──────────────────────────────────────────
/**
 * 브로커 매거진 에디션의 공개 URL 경로를 반환합니다.
 */
export function getEditionUrl(brokerId: string, editionLabel: string): string {
  return `/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(editionLabel)}`;
}

// ── 에디션 콘텐츠 단일 계약 (EditionContentV1, D2-19 / E-01) ───────────
// zod 스키마: ./edition-content.schema.ts — 생성기 3종(weekly/special/daily)의 출력을 점진적으로 이 계약으로 통일한다.
// 현재는 weekly 가 기준이며, 뷰어가 읽는 기존 키(briefing, headline, tax_clinic, recentTransactions …)를 그대로 유지한다.

export type EditionContentKind = 'weekly' | 'special' | 'daily';

export interface EditionContentBroker {
  name: string;
  slug: string;
  company: string;
  phone: string;
  photoUrl: string | null;
  tagline: string;
  specialtyRegions: string[];
  specialtyAssets: string[];
  totalDeals: number;
  activeDeals: number;
}

export interface EditionQualityGateSummary {
  passed: boolean;
  status: 'draft' | 'needs_review';
  score: number;
  totalClaims: number;
  matchedClaims: number;
  failureReasons: string[];
  issues: string[];
}

export interface EditionGenerationMeta {
  /** 사용된 LLM 모델 슬러그(호출이 여러 개면 마지막) — 없으면 null */
  model: string | null;
  /** Mock 응답이 섞였는지. true 면 발행 금지(로컬 개발 전용) */
  isMock: boolean;
  totalTokens: number;
  llmCalls: number;
  generatedAt: string;
  qualityGate: EditionQualityGateSummary | null;
  /** 소스별 가용 여부 — false 인 소스의 섹션은 콘텐츠에서 생략된다 */
  sources: Record<string, boolean>;
  sourceErrors: string[];
}

export interface EditionContentV1 {
  schemaVersion: 1;
  kind: EditionContentKind;
  /** 발행 기준일 (KST, YYYY-MM-DD) */
  issueDate: string;
  weekLabel?: string;
  headline: string;
  briefing: string;
  /** 하위호환 별칭 (briefing 과 동일) */
  ai_briefing: string;
  broker: EditionContentBroker;
  market_temp: MarketTemperature | null;
  cover_keywords: string[];
  cover_image_url: string | null;
  theme_title: string;
  theme_body_md: string;
  theme_asset_types: string[];
  featured_deal_ids: string[];
  theme_color: string;
  poll?: { question: string; choices: string[] };
  topNews?: Array<Record<string, unknown>>;
  recentTransactions?: Array<Record<string, unknown>>;
  sentiment?: { score: number; status: string; items: Array<Record<string, unknown>>; asOf: string };
  dealHighlights?: Array<Record<string, unknown>>;
  teaserCards?: unknown[];
  auctionPicks?: Array<Record<string, unknown>>;
  reports?: Array<Record<string, unknown>>;
  rentalTrend?: Record<string, unknown>;
  commercialDistrict?: Record<string, unknown>;
  monthlySummary?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** 세무 클리닉 — 근거·면책이 있을 때만 존재. 없으면 키 자체가 없다(섹션 생략). */
  tax_clinic?: import('./tax-clinic-generator').TaxClinicScenario;
  generation: EditionGenerationMeta;
}

