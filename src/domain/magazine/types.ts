/**
 * Weekly Magazine Domain Types
 *
 * 브로커 주간 매거진 에디션 도메인 타입 정의.
 * pulse/oiticle-types.ts 패턴을 따름.
 */

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

export const MARKET_TEMP_CONFIG: Record<MarketTemperature, MarketTempConfig> = {
  '적극 매수': {
    emoji: '🔥',
    color: '#ef4444',
    description: '강한 매수 신호 — 거래량 급증, 매물 소진 빠름',
  },
  '선별 매수': {
    emoji: '📈',
    color: '#f59e0b',
    description: '선별적 기회 존재 — 입지·가격 따져 진입 가능',
  },
  '관망': {
    emoji: '⏸️',
    color: '#6b7280',
    description: '관망 국면 — 뚜렷한 방향 없이 거래 위축',
  },
  '조정 대기': {
    emoji: '📉',
    color: '#3b82f6',
    description: '조정 진행 중 — 급매 나올 수 있으나 하락 리스크 상존',
  },
  '위기 경계': {
    emoji: '🚨',
    color: '#dc2626',
    description: '시장 위기 경계 — 금리·경기 악재 집중, 신규 투자 보류 권고',
  },
};

// ── 에디션 상태 ────────────────────────────────────────────────────
export type EditionStatus =
  | 'draft'
  | 'editing'
  | 'review'
  | 'needs_review'
  | 'scheduled'
  | 'published'
  | 'archived';

// ── 에디션 유형 ────────────────────────────────────────────────────
export type EditionType = 'daily' | 'weekly' | 'monthly' | 'special';

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
 * 주어진 날짜에서 'W28-2026' 형식의 주간 라벨을 반환합니다.
 * ISO 8601 주 번호를 사용합니다.
 */
export function getWeekLabel(date: Date = new Date()): string {
  // ISO 8601 주차 계산
  const target = new Date(date.getTime());
  target.setHours(0, 0, 0, 0);
  // 목요일 기준으로 주차를 결정 (ISO 표준)
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const yearStart = new Date(target.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 +
      yearStart.getDay() +
      1) /
      7,
  );
  const year = target.getFullYear();
  return `W${String(weekNumber).padStart(2, '0')}-${year}`;
}

// ── 헬퍼: 에디션 URL 생성 ──────────────────────────────────────────
/**
 * 브로커 매거진 에디션의 공개 URL 경로를 반환합니다.
 */
export function getEditionUrl(brokerId: string, editionLabel: string): string {
  return `/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(editionLabel)}`;
}
