/**
 * analytics 대시보드 ↔ subscribers 목록: 같은 구독자·같은 이벤트 → 같은 온도 (T3-ANL-1)
 * + analytics 응답의 KPI/품질 키, DB 오류 → 500 (빈 값 위장 금지)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const SUB_HOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  eventsError: false,
}));

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
import { GET as subscribersGET } from '@/app/api/broker/magazine/subscribers/route';

const now = () => new Date().toISOString();
const SUBS: Array<Record<string, unknown>> = [
  {
    id: SUB_HOT, broker_id: 'broker-a', status: 'active', segment: 'investor', channel: 'kakao',
    subscriber_name: '핫고객', subscriber_phone: '01011112222', subscriber_email: null,
    subscribed_at: '2026-08-01T00:00:00Z',
    interest_profile: { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩', '상가'], readArticleCount: 4, lastEngagedAt: now() },
  },
  {
    id: SUB_NEW, broker_id: 'broker-a', status: 'active', segment: 'investor', channel: 'email',
    subscriber_name: '신규', subscriber_phone: '01033334444', subscriber_email: 'n@a.com',
    subscribed_at: new Date().toISOString(),
    interest_profile: {},
  },
];

const hotEvents = () => [
  ...[1, 2, 3].map(() => ({ event_type: 'page_view', created_at: now(), visitor_id: 'v2_' + 'a'.repeat(40), metadata: { subscriber_id: SUB_HOT } })),
  ...[1, 2].map(() => ({ event_type: 'click', target_param: 'listing_click', created_at: now(), visitor_id: 'v2_' + 'a'.repeat(40), metadata: { subscriber_id: SUB_HOT } })),
  { event_type: 'click', target_param: 'im_request', created_at: now(), visitor_id: 'v2_' + 'a'.repeat(40), metadata: { subscriber_id: SUB_HOT } },
];

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'magazine_subscribers':
        return { data: filterRows(SUBS, call), count: SUBS.length };
      case 'magazine_editions':
        return { data: [{ id: 'ed-a', broker_id: 'broker-a', status: 'published', created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T00:00:00Z' }] };
      case 'magazine_analytics_events':
        if (h.eventsError) return { error: { message: 'boom: secret detail' } };
        return { data: hotEvents() };
      default:
        return { data: null };
    }
  }) as never;
}

const req = (url: string) => new NextRequest(`https://credeal.net${url}`);

beforeEach(() => {
  h.eventsError = false;
  setupDb();
});

describe('온도 단일화 (T3-ANL-1)', () => {
  it('analytics hotLeads 와 subscribers 목록의 온도·점수가 구독자별로 동일하고 🔥 에 도달한다', async () => {
    const a = await (await analyticsGET(req('/api/broker/magazine/analytics'))).json();
    const s = await (await subscribersGET(req('/api/broker/magazine/subscribers'))).json();

    const aHot = a.hotLeads.find((l: { id: string }) => l.id === SUB_HOT);
    const sHot = s.subscribers.find((x: { id: string }) => x.id === SUB_HOT);
    expect(aHot.buyerTemperature).toBe('🔥 적극검토');
    expect(sHot.buyerTemperature).toBe(aHot.buyerTemperature);
    expect(sHot.temperatureScore).toBe(aHot.score);
    expect(aHot.score).toBeGreaterThanOrEqual(80);

    const aNew = a.hotLeads.find((l: { id: string }) => l.id === SUB_NEW);
    const sNew = s.subscribers.find((x: { id: string }) => x.id === SUB_NEW);
    expect(sNew.buyerTemperature).toBe(aNew.buyerTemperature);
    expect(aNew.buyerTemperature).toBe('⚪ 미확인');

    // 분포도 같은 판정
    expect(a.temperatureDistribution['🔥 적극검토']).toBe(1);
    expect(a.temperatureDistribution['⚪ 미확인']).toBe(1);
    expect(s.temperatureDegraded).toBe(false);
  });

  it('subscribers: 열람 이벤트 조회 실패 시 프로필만으로 계산하되 temperatureDegraded=true 로 알린다', async () => {
    h.eventsError = true;
    const res = await subscribersGET(req('/api/broker/magazine/subscribers'));
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.temperatureDegraded).toBe(true);
    const hot = s.subscribers.find((x: { id: string }) => x.id === SUB_HOT);
    expect(hot.buyerTemperature).not.toBe('🔥 적극검토');
  });
});

describe('analytics 대시보드 응답', () => {
  it('KPI 정의·데이터 품질·집계 키가 포함되고 열람이 실제 이벤트에서 계산된다', async () => {
    const a = await (await analyticsGET(req('/api/broker/magazine/analytics'))).json();
    expect(a.viewStats.totalViews).toBe(3);
    expect(a.viewStats.uniqueVisitors).toBe(1);
    expect(a.viewStats.dwellSamples).toBe(0); // 체류 이벤트 없음 → 0초가 아니라 "표본 없음"
    expect(Object.keys(a.kpiDefinitions)).toEqual(
      expect.arrayContaining(['totalViews', 'uniqueVisitors', 'avgDwellSeconds', 'completionRate', 'subscriberCount', 'temperature']),
    );
    expect(a.dataQuality.legacyExcluded).toBe(true);
    expect(a.kpiNotice).toBeNull();
  });

  it('이벤트 조회 DB 오류 → 500 (빈 대시보드로 위장하지 않음), 내부 오류 문구 비노출', async () => {
    h.eventsError = true;
    const res = await analyticsGET(req('/api/broker/magazine/analytics'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret detail');
  });
});
