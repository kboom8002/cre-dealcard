/**
 * 핫리드 서버 선별 (tier 임계 · limit 상한 · 점수 0 제외) + analytics 응답 메타
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, type FakeCall } from './authz-fake-db';
import {
  HOT_LEAD_DEFAULT_LIMIT,
  HOT_LEAD_MAX_LIMIT,
  hotLeadThresholdMeta,
  isHotLead,
  parseHotLeadLimit,
  parseHotLeadTier,
  selectHotLeads,
  type HotLeadCandidate,
} from '@/lib/magazine/hot-lead-filter';

const UA = '11111111-1111-4111-8111-111111111111';
const SUB_HOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_LOW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUB_ZERO1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUB_ZERO2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const h = vi.hoisted(() => ({ db: null as unknown as { client: unknown; calls: unknown[] } }));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => ({
      ctx: { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] },
      error: null,
    }),
  };
});

import { GET as analyticsGET } from '@/app/api/broker/magazine/analytics/route';

const now = () => new Date().toISOString();
const mkSub = (id: string, name: string, profile: Record<string, unknown>) => ({
  id, broker_id: 'broker-a', status: 'active', segment: 'investor', channel: 'kakao',
  subscriber_name: name, subscriber_phone: '01000000000', subscriber_email: null,
  subscribed_at: now(), interest_profile: profile,
});
const SUBS = [
  mkSub(SUB_HOT, '핫', { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩', '상가'], readArticleCount: 4, lastEngagedAt: now() }),
  mkSub(SUB_LOW, '저반응', {}),
  mkSub(SUB_ZERO1, '무반응1', {}),
  mkSub(SUB_ZERO2, '무반응2', {}),
];

const ev = (sid: string, type: string, extra: Record<string, unknown> = {}) => ({
  event_type: type, created_at: now(), visitor_id: 'v2_' + 'a'.repeat(40), metadata: { subscriber_id: sid }, ...extra,
});
const EVENTS = [
  ...[1, 2, 3].map(() => ev(SUB_HOT, 'page_view')),
  ...[1, 2].map(() => ev(SUB_HOT, 'click', { target_param: 'listing_click' })),
  ev(SUB_HOT, 'click', { target_param: 'im_request' }),
  ev(SUB_LOW, 'page_view'), // 5점 → 복합 3점 (⚪ 미확인이지만 점수 > 0)
];

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'magazine_subscribers':
        return { data: filterRows(SUBS, call), count: SUBS.length };
      case 'magazine_editions':
        return { data: [{ id: 'ed-a', broker_id: 'broker-a', status: 'published', created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T00:00:00Z' }] };
      case 'magazine_analytics_events':
        return { data: EVENTS };
      default:
        return { data: null };
    }
  }) as never;
}

const get = async (qs = '') =>
  analyticsGET(new NextRequest(`https://credeal.net/api/broker/magazine/analytics${qs}`));

beforeEach(() => setupDb());

describe('hot-lead-filter 순수 함수', () => {
  const lead = (buyerTemperature: string, score: number, lastActiveAt: string | null = null): HotLeadCandidate => ({
    buyerTemperature, score, lastActiveAt,
  });

  it('tier 파싱: 기본 warm, 대소문자 무시, 알 수 없는 값은 null', () => {
    expect(parseHotLeadTier(null)).toBe('warm');
    expect(parseHotLeadTier('')).toBe('warm');
    expect(parseHotLeadTier('HOT')).toBe('hot');
    expect(parseHotLeadTier('all')).toBe('all');
    expect(parseHotLeadTier('cold')).toBeNull();
  });

  it('limit 파싱: 기본 10, 상한 100, 비정상 값은 기본값', () => {
    expect(parseHotLeadLimit(null)).toBe(HOT_LEAD_DEFAULT_LIMIT);
    expect(parseHotLeadLimit('5')).toBe(5);
    expect(parseHotLeadLimit('9999')).toBe(HOT_LEAD_MAX_LIMIT);
    expect(parseHotLeadLimit('0')).toBe(HOT_LEAD_DEFAULT_LIMIT);
    expect(parseHotLeadLimit('-3')).toBe(HOT_LEAD_DEFAULT_LIMIT);
    expect(parseHotLeadLimit('2.5')).toBe(HOT_LEAD_DEFAULT_LIMIT);
    expect(parseHotLeadLimit('abc')).toBe(HOT_LEAD_DEFAULT_LIMIT);
  });

  it('isHotLead: hot=🔥만, warm=🔥+📈, all=점수>0 (냉각·점수0·미확인 0점 제외)', () => {
    const fire = lead('🔥 적극검토', 85);
    const interest = lead('📈 관심', 62);
    const intentFloor = lead('📈 관심', 12); // 행동 하한으로 상향된 구독자도 티어 기준으로 포함
    const watching = lead('⏸️ 관망', 45);
    const cooling = lead('❄️ 냉각', 0);
    const unknown0 = lead('⚪ 미확인', 0);
    const unknown3 = lead('⚪ 미확인', 3);

    expect([fire, interest, intentFloor, watching, cooling, unknown0, unknown3].map((l) => isHotLead(l, 'hot')))
      .toEqual([true, false, false, false, false, false, false]);
    expect([fire, interest, intentFloor, watching, cooling, unknown0, unknown3].map((l) => isHotLead(l, 'warm')))
      .toEqual([true, true, true, false, false, false, false]);
    expect([fire, interest, intentFloor, watching, cooling, unknown0, unknown3].map((l) => isHotLead(l, 'all')))
      .toEqual([true, true, true, true, false, false, true]);
  });

  it('selectHotLeads: 점수 → 최근 활동 순 정렬, limit 적용, matched 는 자르기 전 수', () => {
    const leads = [
      lead('📈 관심', 70, '2026-10-01T00:00:00Z'),
      lead('🔥 적극검토', 90, '2026-09-01T00:00:00Z'),
      lead('📈 관심', 70, '2026-10-05T00:00:00Z'),
      lead('❄️ 냉각', 0),
    ];
    const r = selectHotLeads(leads, 'warm', 2);
    expect(r.matched).toBe(3);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0].score).toBe(90);
    expect(r.leads[1].lastActiveAt).toBe('2026-10-05T00:00:00Z'); // 동점은 최근 활동 우선
  });

  it('임계 메타: 기준 점수·라벨·설명을 담는다', () => {
    expect(hotLeadThresholdMeta('warm')).toMatchObject({ tier: 'warm', minScore: 60, tierLabels: ['🔥 적극검토', '📈 관심'] });
    expect(hotLeadThresholdMeta('hot')).toMatchObject({ tier: 'hot', minScore: 80, tierLabels: ['🔥 적극검토'] });
    expect(hotLeadThresholdMeta('all')).toMatchObject({ tier: 'all', minScore: 1, tierLabels: null });
  });
});

describe('GET /api/broker/magazine/analytics — 핫리드 tier', () => {
  it('기본(warm): 🔥 이상만 반환하고 점수 없는 구독자는 제외, 메타 포함', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.hotLeads.map((l: { id: string }) => l.id)).toEqual([SUB_HOT]);
    expect(a.hotLeads.every((l: { score: number }) => l.score > 0)).toBe(true);
    expect(a.hotLeadThreshold).toMatchObject({ tier: 'warm', minScore: 60 });
    expect(a.totalSubscribers).toBe(SUBS.length);
    expect(a.hotLeadQuery).toMatchObject({ tier: 'warm', limit: 10, matched: 1, returned: 1, evaluated: SUBS.length });
    // 기존 키는 그대로
    expect(a.temperatureDistribution['🔥 적극검토']).toBe(1);
    expect(a.temperatureDistribution['⚪ 미확인']).toBe(3);
  });

  it('tier=hot: 🔥 만', async () => {
    const a = await (await get('?tier=hot')).json();
    expect(a.hotLeads.map((l: { id: string }) => l.id)).toEqual([SUB_HOT]);
    expect(a.hotLeadThreshold.tier).toBe('hot');
  });

  it('tier=all: 점수 > 0 전체(점수 0 구독자는 여전히 제외), 점수순', async () => {
    const a = await (await get('?tier=all')).json();
    expect(a.hotLeads.map((l: { id: string }) => l.id)).toEqual([SUB_HOT, SUB_LOW]);
    expect(a.hotLeadQuery.matched).toBe(2);
  });

  it('limit: 반환 수만 자르고 matched 는 전체 일치 수', async () => {
    const a = await (await get('?tier=all&limit=1')).json();
    expect(a.hotLeads).toHaveLength(1);
    expect(a.hotLeadQuery).toMatchObject({ limit: 1, matched: 2, returned: 1 });
  });

  it('알 수 없는 tier 는 400 (조용히 기본값으로 바꾸지 않는다)', async () => {
    const res = await get('?tier=cold');
    expect(res.status).toBe(400);
  });
});
