/**
 * 온도 모델 단일화 (E-04 · T3-06 / T3-ANL-1 / T2-23a·b)
 * 경계값·행동 하한·6개월 냉각·실제 이벤트로의 🔥/📈 도달성을 고정한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COOLING_DAYS,
  EVENT_RULES,
  classifyEvent,
  computeBuyerTemperature,
  computeCrossChannelScore,
  emptyTemperatureDistribution,
  getBuyerTemperature,
  normalizeProfileForScore,
  type TemperatureEvent,
} from '@/domain/magazine/buyer-temperature';

const NOW = Date.parse('2026-10-06T03:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const ev = (event_type: string, days: number, extra: Partial<TemperatureEvent> = {}): TemperatureEvent => ({
  event_type,
  created_at: ago(days),
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('티어 경계값 (getBuyerTemperature)', () => {
  // engagement=0 → composite = round(0.6 × cross)
  it.each([
    [100, '📈 관심'], // 60
    [99, '⏸️ 관망'], // 59.4 → 59
    [66, '⏸️ 관망'], // 39.6 → 40
    [65, '❄️ 냉각'], // 39
    [33, '❄️ 냉각'], // 19.8 → 20
    [32, '⚪ 미확인'], // 19.2 → 19
    [0, '⚪ 미확인'],
  ])('engagement 0 · cross %i → %s', (cross, label) => {
    expect(getBuyerTemperature(0, cross).label).toBe(label);
  });

  it.each([
    [67, '🔥 적극검토'], // 40 + 40.2 = 80
    [65, '📈 관심'], // 40 + 39 = 79
  ])('engagement 100 · cross %i → %s', (cross, label) => {
    expect(getBuyerTemperature(100, cross).label).toBe(label);
  });

  it('범위를 벗어난 cross 는 0~100 으로 고정', () => {
    expect(getBuyerTemperature(0, 9999).label).toBe('📈 관심');
    expect(getBuyerTemperature(0, -50).label).toBe('⚪ 미확인');
  });

  it('하위호환: 프로필 객체를 넘겨도 tags 중첩 형태를 반영', () => {
    const nested = getBuyerTemperature({ tags: { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩', '상가'] } } as never, 100);
    // engagement 30 → 12 + 60 = 72 → 📈
    expect(nested.label).toBe('📈 관심');
  });
});

describe('interest_profile 키 불일치 흡수 (T3-06)', () => {
  it('{tags:{...}} 와 최상위 {...} 는 같은 점수', () => {
    const nested = computeBuyerTemperature({ profile: { tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] } }, now: NOW });
    const flat = computeBuyerTemperature({ profile: { regions: ['강남'], assetTypes: ['꼬마빌딩'] }, now: NOW });
    expect(nested.engagement).toBe(15); // 자산 10 + 권역 5
    expect(nested.engagement).toBe(flat.engagement);
    expect(normalizeProfileForScore({ tags: { regions: ['a'] } }).regions).toEqual(['a']);
  });

  it('프로필이 null/비객체여도 throw 없이 0', () => {
    expect(computeBuyerTemperature({ profile: null, now: NOW }).engagement).toBe(0);
    expect(computeBuyerTemperature({ profile: 'x', now: NOW }).engagement).toBe(0);
  });
});

describe('실제 이벤트로 🔥/📈 도달 가능 (T2-23a)', () => {
  const strongProfile = { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩', '상가'], readArticleCount: 4, lastEngagedAt: ago(1) };

  it('프로필 + 열람 3회 + 매물 클릭 2회 + IM 요청 → 🔥 적극검토 (점수 ≥ 80)', () => {
    const r = computeBuyerTemperature({
      profile: strongProfile,
      events: [
        ev('page_view', 1), ev('page_view', 2), ev('page_view', 3),
        ev('click', 1, { target_param: 'listing_click' }),
        ev('click', 2, { target_param: 'listing_click' }),
        ev('click', 1, { target_param: 'im_request' }),
      ],
      subscribedAt: ago(60),
      now: NOW,
    });
    expect(r.engagement).toBe(80);
    expect(r.crossChannelScore).toBe(85);
    expect(r.composite).toBe(83);
    expect(r.tier.label).toBe('🔥 적극검토');
    expect(r.reason).toBe('score');
    expect(r.counts.listing_click).toBe(2);
  });

  it('같은 프로필 + 매물 클릭 1회만 → 📈 관심 (🔥 미만)', () => {
    const r = computeBuyerTemperature({
      profile: strongProfile,
      events: [ev('page_view', 1), ev('page_view', 2), ev('page_view', 3), ev('click', 1, { target_param: 'listing_click' }), ev('click', 1, { target_param: 'im_request' })],
      now: NOW,
    });
    expect(r.composite).toBe(71);
    expect(r.tier.label).toBe('📈 관심');
  });

  it('프로필이 비어 있으면 강한 행동만으로는 🔥 에 도달하지 못한다 (최대 📈)', () => {
    const r = computeBuyerTemperature({
      profile: {},
      events: [
        ev('page_view', 1), ev('page_view', 1), ev('page_view', 1), ev('page_view', 1), ev('page_view', 1), ev('page_view', 1),
        ev('click', 1, { target_param: 'listing_click' }), ev('click', 1, { target_param: 'listing_click' }),
        ev('click', 1, { target_param: 'im_request' }), ev('click', 1, { target_param: 'phone_click' }),
        ev('dwell', 1, { dwell_seconds: 90 }), ev('scroll_depth', 1, { scroll_pct: 100 }),
      ],
      now: NOW,
    });
    expect(r.crossChannelScore).toBe(100);
    expect(r.composite).toBe(60);
    expect(r.tier.label).toBe('📈 관심');
  });

  it('이벤트 점수표: 열람 +5 / 설문 +15 / 매물 클릭 +20 (튜토리얼 표와 동일)', () => {
    expect(EVENT_RULES.page_view.points).toBe(5);
    expect(EVENT_RULES.poll_vote.points).toBe(15);
    expect(EVENT_RULES.listing_click.points).toBe(20);
  });

  it('종류별 상한(cap)이 합산을 제한한다 — 열람 20회여도 30점', () => {
    const events = Array.from({ length: 20 }, () => ev('page_view', 1));
    expect(computeCrossChannelScore(events, NOW).score).toBe(30);
  });
});

describe('행동 하한 (IM·전화, 최근 14일)', () => {
  it('프로필 없이 IM 요청만 있어도 📈 관심 (intent_floor)', () => {
    const r = computeBuyerTemperature({ profile: {}, events: [ev('click', 2, { target_param: 'im_request' })], subscribedAt: ago(5), now: NOW });
    expect(r.composite).toBe(18); // 점수만으로는 ⚪
    expect(r.tier.label).toBe('📈 관심');
    expect(r.reason).toBe('intent_floor');
  });

  it('레거시 click 행(target_url)도 분류: im-lite / tel:', () => {
    expect(classifyEvent(ev('click', 0, { target_url: '/im-lite/abc' }))).toBe('im_request');
    expect(classifyEvent(ev('click', 0, { target_url: 'tel:010' }))).toBe('phone_click');
    expect(classifyEvent(ev('click', 0, { target_url: 'https://x.kr' }))).toBeNull();
  });

  it('전화 클릭 13일 전 → 하한 적용, 15일 전 → 미적용(점수만)', () => {
    const within = computeBuyerTemperature({ profile: {}, events: [ev('click', 13, { target_param: 'phone_click' })], now: NOW });
    expect(within.reason).toBe('intent_floor');
    const outside = computeBuyerTemperature({ profile: {}, events: [ev('click', 15, { target_param: 'phone_click' })], now: NOW });
    expect(outside.reason).toBe('score');
    expect(outside.tier.label).toBe('⚪ 미확인'); // composite 15
  });
});

describe('6개월 미열람 냉각 (T2-23b)', () => {
  it(`마지막 열람이 ${COOLING_DAYS}일 이내면 냉각 아님, 초과하면 ❄️ (경계)`, () => {
    const justInside = computeBuyerTemperature({ profile: {}, events: [ev('page_view', COOLING_DAYS)], subscribedAt: ago(400), now: NOW });
    expect(justInside.reason).toBe('score');
    const outside = computeBuyerTemperature({
      profile: {},
      events: [{ event_type: 'page_view', created_at: new Date(NOW - COOLING_DAYS * DAY - 1000).toISOString() }],
      subscribedAt: ago(400),
      now: NOW,
    });
    expect(outside.tier.label).toBe('❄️ 냉각');
    expect(outside.reason).toBe('stale_cooling');
  });

  it('한 번도 열람하지 않고 구독 후 183일 초과 → ❄️, 100일이면 ⚪ 미확인', () => {
    const old = computeBuyerTemperature({ profile: {}, events: [], subscribedAt: ago(200), now: NOW });
    expect(old.tier.label).toBe('❄️ 냉각');
    const fresh = computeBuyerTemperature({ profile: {}, events: [], subscribedAt: ago(100), now: NOW });
    expect(fresh.tier.label).toBe('⚪ 미확인');
  });

  it('profile.lastEngagedAt 도 마지막 열람으로 인정', () => {
    const r = computeBuyerTemperature({ profile: { lastEngagedAt: ago(10) }, events: [], subscribedAt: ago(400), now: NOW });
    expect(r.reason).not.toBe('stale_cooling');
    expect(r.lastEngagedAt).toBe(ago(10));
  });

  it('오래전 열람이라도 최근 IM 요청이 있으면 냉각하지 않는다', () => {
    const r = computeBuyerTemperature({
      profile: {},
      events: [ev('page_view', 250), ev('click', 1, { target_param: 'im_request' })],
      now: NOW,
    });
    expect(r.tier.label).toBe('📈 관심');
    expect(r.reason).toBe('intent_floor');
  });
});

describe('analytics·subscribers 공통 입력 → 같은 결과 (T3-ANL-1)', () => {
  it('같은 입력에 대해 항상 동일 (순수 함수, 이벤트 순서 무관)', () => {
    const events = [ev('page_view', 1), ev('click', 2, { target_param: 'listing_click' }), ev('section_view', 1, { section_id: 'market' })];
    const a = computeBuyerTemperature({ profile: { regions: ['강남'] }, events, subscribedAt: ago(30), now: NOW });
    const b = computeBuyerTemperature({ profile: { regions: ['강남'] }, events: [...events].reverse(), subscribedAt: ago(30), now: NOW });
    expect(a).toEqual(b);
    expect(a.crossChannelScore).toBe(5 + 20 + 1);
  });

  it('분포 초기값은 5개 티어 모두 0', () => {
    expect(Object.keys(emptyTemperatureDistribution())).toHaveLength(5);
  });
});
