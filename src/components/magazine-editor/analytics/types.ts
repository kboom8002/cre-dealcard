/** 성과 탭 공용 타입 — /api/broker/magazine/analytics 응답 (키는 추가만 가능, 변경 금지: E2 구독자 상세 모달이 같은 응답을 읽는다) */

/** 핫리드 선별 기준 — 서버 `?tier=` 값과 동일 */
export type HotLeadTier = 'hot' | 'warm' | 'all';

export interface SectionStat {
  sectionId: string;
  label: string;
  count: number;
  avgDwellSeconds: number;
  dwellSamples?: number;
}

export interface TemperatureConfig {
  label: string;
  color: string;
  badgeBg: string;
  minScore: number;
  description: string;
}

export interface HotLead {
  id: string;
  subscriber_name: string;
  subscriber_phone: string;
  subscriber_email: string | null;
  segment: string;
  channel: string;
  interest_tags?: {
    regions?: string[];
    assetTypes?: string[];
    topics?: string[];
    hobbies?: string[];
  };
  buyerTemperature: string;
  temperatureConfig?: TemperatureConfig;
  temperatureReason?: 'score' | 'intent_floor' | 'stale_cooling';
  score: number;
  totalViews: number;
  lastActiveAt: string | null;
  recentSections: string[];
}

export interface KpiNotice {
  code: 'TRACKING_DISABLED' | 'NO_PUBLISHED_EDITION' | 'NO_V2_EVENTS';
  message: string;
}

export interface PollResults {
  question: string;
  choices: string[];
  total: number;
  counts: Record<number, number>;
  hourly?: Array<{ hour: number; count: number }> | null;
  hourlyHidden?: 'LOW_SAMPLE' | 'NO_TIMESTAMP' | null;
}

export interface AnalyticsData {
  subscriberCount: number;
  lastDistribution: {
    date: string | null;
    sentCount: number;
    failedCount: number;
    totalCount: number;
  } | null;
  viewStats: {
    totalViews: number;
    uniqueVisitors: number;
    avgDwellSeconds: number;
    dwellSamples?: number;
    completionRate: number;
    completionBase?: number;
    truncated?: boolean;
  };
  kpiDefinitions?: Record<string, string>;
  kpiNotice?: KpiNotice | null;
  dataQuality?: { legacyExcluded: boolean; since: string; note: string };
  sectionStats?: SectionStat[];
  temperatureDistribution?: Record<string, number>;
  hotLeads?: HotLead[];
  hotLeadThreshold?: { tier: HotLeadTier; minScore: number; tierLabels: string[] | null; rule: string };
  totalSubscribers?: number;
  hotLeadQuery?: { tier: HotLeadTier; limit: number; matched: number; returned: number; evaluated: number };
  dailyTrend?: { date: string; count: number }[];
  editions?: Array<{ id: string; broker_id: string; edition_label?: string; title?: string; market_temp?: string | null; view_count?: number | null; published_at?: string | null; created_at?: string }>;
  latestPollResults?: PollResults | null;
  pollUnavailable?: 'NOT_MIGRATED' | null;
}

export interface SubscriberDetail {
  subscriber: {
    id: string;
    subscriber_name: string;
    subscriber_phone: string;
    subscriber_email: string | null;
    segment?: string | null;
    channel?: string | null;
    status?: string | null;
  };
  analytics: {
    totalViews: number;
    avgDwellSeconds: number;
    avgDwellSamples?: number;
    lastActivityAt: string | null;
    viewedSections: string[];
    sections?: Array<{ sectionId: string; label: string; count: number; avgDwellSeconds: number | null }>;
    recentEvents: Array<{
      id: string;
      event_type: string;
      section_id: string | null;
      dwell_seconds: number | null;
      scroll_pct?: number | null;
      target_url?: string | null;
      target_param?: string | null;
      created_at: string;
    }>;
    temperature?: { label: string; score: number; reason: string; engagementScore: number; crossChannelScore: number };
  };
}
