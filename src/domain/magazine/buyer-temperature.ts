/**
 * @module buyer-temperature
 * @description 매거진 독자·구독자의 매수 온도 판별기 — **analytics 와 subscribers 라우트가 이 모듈 하나를 공통 사용**한다 (T3-ANL-1).
 *
 * 모델 (docs 는 이 코드와 일치해야 한다):
 *   composite = round(engagement × 0.4 + crossChannel × 0.6)            (0~100)
 *   engagement   = computeEngagementScore(정규화한 interest_profile)       — 관심사·읽은 수·최근성 (subscriber-profile.ts)
 *   crossChannel = Σ min(이벤트 점수 × 횟수, 상한)  → 최대 100            — 실제 열람 이벤트 (아래 EVENT_RULES)
 *   티어: ≥80 🔥 적극검토 · ≥60 📈 관심 · ≥40 ⏸️ 관망 · ≥20 ❄️ 냉각 · 그 외 ⚪ 미확인
 *   보정:
 *     - 행동 하한: 최근 14일 내 IM 요청·전화 클릭이 있으면 최소 📈 관심(60). 프로필이 비어 있어도 강한 행동은 놓치지 않는다.
 *       (🔥 는 프로필(권역·자산·예산 등)과 행동이 **둘 다** 있어야 도달 — 티어 설명과 일치)
 *     - 6개월 미열람 냉각: 마지막 열람(이벤트 또는 profile.lastEngagedAt)이 183일을 넘었거나, 한 번도 열람하지 않았는데
 *       구독한 지 183일이 넘었으면 점수와 무관하게 ❄️ 냉각 (T2-23b).
 *
 * 이벤트 어휘 (magazine_analytics_events):
 *   page_view · section_view · dwell(section_id 없음=페이지 체류, 있음=섹션 체류) · scroll_depth(100)
 *   click + target_param ∈ CLICK_TARGETS (im_request / phone_click / listing_click / poll_vote / calc_simulate …)
 *   레거시 click 행은 target_url 에 'im-lite' / 'tel:' 포함 여부로 분류한다.
 */
import { computeEngagementScore, type InterestProfile } from './subscriber-profile';
import { CLICK_TARGETS, canonicalClickTarget } from '@/lib/magazine/visitor-id';

export type BuyerTemperature = '🔥 적극검토' | '📈 관심' | '⏸️ 관망' | '❄️ 냉각' | '⚪ 미확인';

export interface TemperatureTierConfig {
  label: BuyerTemperature;
  color: string;
  badgeBg: string;
  minScore: number;
  description: string;
}

export const TEMPERATURE_TIERS: TemperatureTierConfig[] = [
  {
    label: '🔥 적극검토',
    color: '#ef4444',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    minScore: 80,
    description: '관심 권역·자산이 명확하고 최근 14일 내 IM 요청·매물 클릭 등 고관여 행동을 보인 독자',
  },
  {
    label: '📈 관심',
    color: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    minScore: 60,
    description: '정기적으로 매거진을 열람하거나 IM 요청·전화 클릭 등 강한 행동을 보인 독자',
  },
  {
    label: '⏸️ 관망',
    color: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    minScore: 40,
    description: '매거진을 가끔 열어보며 매수 타이밍을 저울질 중인 독자',
  },
  {
    label: '❄️ 냉각',
    color: '#94a3b8',
    badgeBg: 'rgba(148, 163, 184, 0.12)',
    minScore: 20,
    description: '열람 빈도가 낮거나, 6개월 이상 열람 기록이 없는 구독자',
  },
  {
    label: '⚪ 미확인',
    color: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.1)',
    minScore: 0,
    description: '관심사 프로필이나 열람 데이터가 아직 충분치 않은 신규 구독자',
  },
];

const COOL_TIER = TEMPERATURE_TIERS[3];
const INTEREST_TIER = TEMPERATURE_TIERS[1];

export const ENGAGEMENT_WEIGHT = 0.4;
export const CROSS_CHANNEL_WEIGHT = 0.6;
/** 6개월 미열람 냉각 기준(일) */
export const COOLING_DAYS = 183;
/** 크로스채널 점수 산정 창(일) */
export const CROSS_CHANNEL_WINDOW_DAYS = 30;
/** 행동 하한(IM·전화) 유효 기간(일) */
export const INTENT_FLOOR_DAYS = 14;

const DAY_MS = 86_400_000;

// ── 이벤트 점수표 ────────────────────────────────────────────────────
export type EventKind =
  | 'page_view'
  | 'section_view'
  | 'dwell_page'
  | 'scroll_complete'
  | 'poll_vote'
  | 'calc_simulate'
  | 'listing_click'
  | 'im_request'
  | 'phone_click'
  | 'inquiry';

/**
 * points: 1회 점수 · cap: 해당 종류 합산 상한. (튜토리얼 표: 열람 +5 / 설문 +15 / 매물 클릭 +20)
 * inquiry(카톡·연락·세무 문의·투표 후 상담 클릭): 20점·상한 20 — 문의 의사는 있으나 전화(25)·IM(30)보다 약하고,
 * 행동 하한(intent floor)은 IM·전화에만 적용한다.
 */
export const EVENT_RULES: Record<EventKind, { points: number; cap: number }> = {
  page_view: { points: 5, cap: 30 },
  section_view: { points: 1, cap: 10 },
  dwell_page: { points: 5, cap: 10 }, // 페이지 체류 30초 이상
  scroll_complete: { points: 5, cap: 5 },
  poll_vote: { points: 15, cap: 15 },
  calc_simulate: { points: 10, cap: 10 },
  listing_click: { points: 20, cap: 40 },
  im_request: { points: 30, cap: 30 },
  phone_click: { points: 25, cap: 25 },
  inquiry: { points: 20, cap: 20 },
};

/** 기록은 하되 점수는 주지 않는 클릭 타깃(명시적 0점): 공유·전달·추천 링크 복사·아코디언·일반 CTA */
export const ZERO_SCORE_CLICK_TARGETS: readonly string[] = [
  CLICK_TARGETS.SHARE,
  CLICK_TARGETS.REFERRAL_COPY,
  CLICK_TARGETS.ACCORDION,
  CLICK_TARGETS.CTA,
];

export const PAGE_DWELL_QUALIFY_SECONDS = 30;

export interface TemperatureEvent {
  event_type: string;
  created_at: string;
  section_id?: string | null;
  target_url?: string | null;
  target_param?: string | null;
  dwell_seconds?: number | null;
  scroll_pct?: number | null;
}

/** 이벤트 1건 → 점수 종류. 점수와 무관한 이벤트는 null. */
export function classifyEvent(ev: TemperatureEvent): EventKind | null {
  switch (ev.event_type) {
    case 'page_view':
      return 'page_view';
    case 'section_view':
      return 'section_view';
    case 'dwell':
      return !ev.section_id && typeof ev.dwell_seconds === 'number' && ev.dwell_seconds >= PAGE_DWELL_QUALIFY_SECONDS
        ? 'dwell_page'
        : null;
    case 'scroll_depth':
      return ev.scroll_pct === 100 ? 'scroll_complete' : null;
    case 'click': {
      const param = canonicalClickTarget((ev.target_param ?? '').trim().toLowerCase());
      const url = (ev.target_url ?? '').toLowerCase();
      if (param === CLICK_TARGETS.IM_REQUEST || url.includes('im-lite')) return 'im_request';
      if (param === CLICK_TARGETS.PHONE_CLICK || url.startsWith('tel:')) return 'phone_click';
      if (param === CLICK_TARGETS.LISTING_CLICK) return 'listing_click';
      if (param === CLICK_TARGETS.POLL_VOTE) return 'poll_vote';
      if (param === CLICK_TARGETS.CALC_SIMULATE) return 'calc_simulate';
      if (param === CLICK_TARGETS.INQUIRY) return 'inquiry';
      return null; // share·referral_copy·accordion·cta·미지의 타깃 = 0점
    }
    default:
      return null;
  }
}

export type EventCounts = Record<EventKind, number>;

export function emptyCounts(): EventCounts {
  return {
    page_view: 0,
    section_view: 0,
    dwell_page: 0,
    scroll_complete: 0,
    poll_vote: 0,
    calc_simulate: 0,
    listing_click: 0,
    im_request: 0,
    phone_click: 0,
    inquiry: 0,
  };
}

const toMs = (iso: string | null | undefined): number => {
  if (!iso) return NaN;
  return new Date(iso).getTime();
};

export interface CrossChannelResult {
  /** 0~100 */
  score: number;
  /** 최근 30일 창 안의 종류별 횟수 */
  counts: EventCounts;
  /** 창 안의 마지막 활동 시각 (없으면 null) */
  lastActivityAt: string | null;
  /** 창 안의 마지막 page_view 시각 */
  lastViewedAt: string | null;
  /** 최근 14일 내 IM 요청·전화 클릭 존재 */
  hasRecentIntent: boolean;
}

/** 실제 이벤트로 크로스채널 점수(0~100)를 계산한다. 최근 30일 밖 이벤트는 점수에서 제외. */
export function computeCrossChannelScore(events: TemperatureEvent[] | null | undefined, now: number = Date.now()): CrossChannelResult {
  const counts = emptyCounts();
  let lastActivity = NaN;
  let lastView = NaN;
  let recentIntent = false;
  const windowStart = now - CROSS_CHANNEL_WINDOW_DAYS * DAY_MS;
  const intentStart = now - INTENT_FLOOR_DAYS * DAY_MS;

  for (const ev of events ?? []) {
    const t = toMs(ev.created_at);
    if (!Number.isFinite(t) || t > now + 60_000) continue;
    if (t < windowStart) continue;
    const kind = classifyEvent(ev);
    if (!Number.isFinite(lastActivity) || t > lastActivity) lastActivity = t;
    if (ev.event_type === 'page_view' && (!Number.isFinite(lastView) || t > lastView)) lastView = t;
    if (!kind) continue;
    counts[kind] += 1;
    if ((kind === 'im_request' || kind === 'phone_click') && t >= intentStart) recentIntent = true;
  }

  let total = 0;
  for (const kind of Object.keys(EVENT_RULES) as EventKind[]) {
    const rule = EVENT_RULES[kind];
    total += Math.min(rule.points * counts[kind], rule.cap);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    counts,
    lastActivityAt: Number.isFinite(lastActivity) ? new Date(lastActivity).toISOString() : null,
    lastViewedAt: Number.isFinite(lastView) ? new Date(lastView).toISOString() : null,
    hasRecentIntent: recentIntent,
  };
}

// ── interest_profile 정규화 (점수 키 불일치 수정) ─────────────────────
/**
 * DB interest_profile 은 `{ tags: { regions, assetTypes } }`(구독 API·에디터) 와
 * `{ regions, assetTypes }`(자동 프로파일) 두 형태가 공존한다.
 * computeEngagementScore 는 최상위 키만 읽어서 `tags` 형태의 관심사가 점수에 반영되지 않던 문제(T3-06)를 여기서 흡수한다.
 */
export function normalizeProfileForScore(raw: unknown): Partial<InterestProfile> {
  if (!raw || typeof raw !== 'object') return {};
  const p = raw as Record<string, unknown>;
  const tags = p.tags && typeof p.tags === 'object' ? (p.tags as Record<string, unknown>) : {};
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
  const regions = strArr(p.regions).length ? strArr(p.regions) : strArr(tags.regions);
  const assetTypes = strArr(p.assetTypes).length ? strArr(p.assetTypes) : strArr(tags.assetTypes);
  const out: Partial<InterestProfile> = { regions, assetTypes };
  if (typeof p.readArticleCount === 'number') out.readArticleCount = p.readArticleCount;
  if (typeof p.lastEngagedAt === 'string') out.lastEngagedAt = p.lastEngagedAt;
  return out;
}

// ── 온도 계산 ────────────────────────────────────────────────────────
export interface TemperatureInput {
  /** interest_profile (원본 DB JSON 또는 InterestProfile) */
  profile?: unknown;
  /** 이 구독자에게 귀속된 이벤트 (서버가 소유 검증 후 전달). 183일까지 넘겨도 되며 점수는 최근 30일만 쓴다 */
  events?: TemperatureEvent[] | null;
  subscribedAt?: string | null;
  now?: number;
}

export type TemperatureReason = 'score' | 'intent_floor' | 'stale_cooling';

export interface TemperatureResult {
  tier: TemperatureTierConfig;
  /** 최종 판정에 쓴 복합 점수 (0~100). 모든 화면의 `score` 는 이 값 */
  composite: number;
  engagement: number;
  crossChannelScore: number;
  reason: TemperatureReason;
  counts: EventCounts;
  /** 마지막 열람(이벤트 page_view 또는 profile.lastEngagedAt) — 없으면 null */
  lastEngagedAt: string | null;
  lastActivityAt: string | null;
}

function tierForScore(score: number): TemperatureTierConfig {
  for (const tier of TEMPERATURE_TIERS) {
    if (score >= tier.minScore) return tier;
  }
  return TEMPERATURE_TIERS[TEMPERATURE_TIERS.length - 1];
}

export function computeBuyerTemperature(input: TemperatureInput): TemperatureResult {
  const now = input.now ?? Date.now();
  const profile = normalizeProfileForScore(input.profile);
  const engagement = computeEngagementScore(profile);
  const cross = computeCrossChannelScore(input.events, now);

  const composite = Math.round(engagement * ENGAGEMENT_WEIGHT + cross.score * CROSS_CHANNEL_WEIGHT);
  let tier = tierForScore(composite);
  let reason: TemperatureReason = 'score';

  // 마지막 열람 시각: 이벤트(전 구간) → profile.lastEngagedAt
  let lastViewMs = NaN;
  for (const ev of input.events ?? []) {
    if (ev.event_type !== 'page_view') continue;
    const t = toMs(ev.created_at);
    if (Number.isFinite(t) && t <= now + 60_000 && (!Number.isFinite(lastViewMs) || t > lastViewMs)) lastViewMs = t;
  }
  const profEngaged = toMs(profile.lastEngagedAt);
  const lastEngagedMs = Math.max(
    Number.isFinite(lastViewMs) ? lastViewMs : -Infinity,
    Number.isFinite(profEngaged) ? profEngaged : -Infinity,
  );
  const hasEngagement = Number.isFinite(lastEngagedMs) && lastEngagedMs > -Infinity;

  // 행동 하한 (최근 IM·전화)
  if (cross.hasRecentIntent && composite < INTEREST_TIER.minScore) {
    tier = INTEREST_TIER;
    reason = 'intent_floor';
  }

  // 6개월 미열람 냉각
  const subscribedMs = toMs(input.subscribedAt);
  const coolingMs = COOLING_DAYS * DAY_MS;
  const staleSinceEngagement = hasEngagement && now - lastEngagedMs > coolingMs;
  const neverEngagedLongSubscribed = !hasEngagement && Number.isFinite(subscribedMs) && now - subscribedMs > coolingMs;
  if ((staleSinceEngagement || neverEngagedLongSubscribed) && !cross.hasRecentIntent) {
    tier = COOL_TIER;
    reason = 'stale_cooling';
  }

  return {
    tier,
    composite,
    engagement,
    crossChannelScore: cross.score,
    reason,
    counts: cross.counts,
    lastEngagedAt: hasEngagement ? new Date(lastEngagedMs).toISOString() : null,
    lastActivityAt: cross.lastActivityAt,
  };
}

/**
 * 하위 호환: 이벤트 없이 프로필(또는 이미 계산된 참여도 점수) + 크로스채널 점수만으로 판정.
 * special 라우트 등 기존 호출부용. 새 코드는 computeBuyerTemperature 를 쓴다.
 */
export function getBuyerTemperature(
  profileOrEngagement: InterestProfile | number | null | undefined,
  crossChannelScore: number = 0,
): TemperatureTierConfig {
  const engagement =
    typeof profileOrEngagement === 'number'
      ? profileOrEngagement
      : profileOrEngagement
        ? computeEngagementScore(normalizeProfileForScore(profileOrEngagement))
        : 0;
  const composite = Math.round(
    engagement * ENGAGEMENT_WEIGHT + Math.max(0, Math.min(crossChannelScore, 100)) * CROSS_CHANNEL_WEIGHT,
  );
  return tierForScore(composite);
}

/** 온도 분포 집계용 초기값 */
export function emptyTemperatureDistribution(): Record<BuyerTemperature, number> {
  return { '🔥 적극검토': 0, '📈 관심': 0, '⏸️ 관망': 0, '❄️ 냉각': 0, '⚪ 미확인': 0 };
}
