/**
 * 분석 집계 순수 함수 (E-04 · T3-13 / T3-14 / T3-19 / T2-23 / T1-UX-4)
 */
import { describe, expect, it } from 'vitest';
import {
  KPI_DEFINITIONS,
  aggregatePageDwell,
  aggregateSections,
  completionRate,
  countUniqueVisitors,
  dailyTrendKst,
  pollHourlyDistribution,
  type AnalyticsRow,
} from '@/domain/magazine/analytics-aggregate';

const row = (over: Partial<AnalyticsRow>): AnalyticsRow => ({
  event_type: 'dwell',
  visitor_id: 'v2_a',
  created_at: '2026-10-05T00:00:00Z',
  metadata: { pv: 'p1' },
  ...over,
});

describe('aggregatePageDwell', () => {
  it('표본이 없으면 0초로 위장하지 않고 null', () => {
    expect(aggregatePageDwell([])).toEqual({ avgSeconds: null, samples: 0 });
    expect(aggregatePageDwell([row({ event_type: 'page_view' })])).toEqual({ avgSeconds: null, samples: 0 });
  });

  it('같은 (방문자, pv) 의 누적 flush 는 최댓값만 — 백그라운드 전환 여러 번에도 과소집계 없음', () => {
    const rows = [
      row({ dwell_seconds: 10 }),
      row({ dwell_seconds: 25 }),
      row({ dwell_seconds: 60 }), // 같은 pv 의 마지막 누적값
      row({ visitor_id: 'v2_b', metadata: { pv: 'p9' }, dwell_seconds: 40 }),
    ];
    expect(aggregatePageDwell(rows)).toEqual({ avgSeconds: 50, samples: 2 }); // (60 + 40) / 2
  });

  it('섹션 dwell·0초·비정상 값은 페이지 체류에서 제외', () => {
    const rows = [
      row({ dwell_seconds: 30, section_id: 'market' }),
      row({ dwell_seconds: 0 }),
      row({ dwell_seconds: 999_999 }),
      row({ dwell_seconds: 20 }),
    ];
    expect(aggregatePageDwell(rows)).toEqual({ avgSeconds: 20, samples: 1 });
  });
});

describe('aggregateSections', () => {
  it('section_view 수와 섹션 dwell(최댓값 평균)을 분리 집계하고 열람수 내림차순', () => {
    const rows = [
      row({ event_type: 'section_view', section_id: 'market' }),
      row({ event_type: 'section_view', section_id: 'market', visitor_id: 'v2_b', metadata: { pv: 'p2' } }),
      row({ event_type: 'section_view', section_id: 'tax' }),
      row({ event_type: 'dwell', section_id: 'market', dwell_seconds: 5 }),
      row({ event_type: 'dwell', section_id: 'market', dwell_seconds: 15 }),
    ];
    const out = aggregateSections(rows);
    expect(out.map((s) => s.sectionId)).toEqual(['market', 'tax']);
    expect(out[0]).toMatchObject({ count: 2, avgDwellSeconds: 15, dwellSamples: 1 });
    expect(out[1]).toMatchObject({ count: 1, avgDwellSeconds: null, dwellSamples: 0 });
  });
});

describe('방문자·완독률', () => {
  it('고유 방문자 = 서로 다른 visitor_id 수', () => {
    expect(countUniqueVisitors([{ visitor_id: 'v2_a' }, { visitor_id: 'v2_a' }, { visitor_id: 'v2_b' }, { visitor_id: null }])).toBe(2);
  });

  it('완독률은 방문자 기준(0~100%) — 이벤트 건수로 나눠 100% 초과하지 않는다', () => {
    const viewers = new Set(['a', 'b', 'c', 'd']);
    expect(completionRate(viewers, new Set(['a', 'b']))).toBe(50);
    // 열람 기록이 없는 방문자의 완독은 분자에서 제외
    expect(completionRate(viewers, new Set(['a', 'zzz']))).toBe(25);
    expect(completionRate(viewers, new Set(['a', 'b', 'c', 'd']))).toBe(100);
  });

  it('열람 0 이면 null (0% 로 위장하지 않음)', () => {
    expect(completionRate(new Set(), new Set())).toBeNull();
  });
});

describe('dailyTrendKst (T3-14)', () => {
  const NOW = new Date('2026-10-06T03:00:00Z'); // KST 10-06 12:00
  it('KST 자정 경계로 버킷팅 — UTC 10-05 16:00 은 KST 10-06', () => {
    const out = dailyTrendKst(
      [
        { created_at: '2026-10-05T14:59:59Z' }, // KST 10-05 23:59:59
        { created_at: '2026-10-05T15:00:00Z' }, // KST 10-06 00:00:00
        { created_at: '2026-10-05T16:00:00Z' }, // KST 10-06 01:00
      ],
      3,
      NOW,
    );
    expect(out).toEqual([
      { date: '10-04', count: 0 },
      { date: '10-05', count: 1 },
      { date: '10-06', count: 2 },
    ]);
  });
});

describe('pollHourlyDistribution (T2-23)', () => {
  it('표본 5 미만 → 숨김(LOW_SAMPLE)', () => {
    const r = pollHourlyDistribution(Array.from({ length: 4 }, () => ({ created_at: '2026-10-05T00:00:00Z' })));
    expect(r).toEqual({ hours: null, hidden: 'LOW_SAMPLE' });
  });

  it('created_at 이 전혀 없으면 NO_TIMESTAMP (가짜 분포 금지)', () => {
    expect(pollHourlyDistribution([{}, { created_at: null }])).toEqual({ hours: null, hidden: 'NO_TIMESTAMP' });
  });

  it('표본 5 이상 → KST 시간대별 24칸, 합계 = 응답 수', () => {
    const r = pollHourlyDistribution([
      { created_at: '2026-10-05T15:30:00Z' }, // KST 0시
      { created_at: '2026-10-05T15:40:00Z' }, // KST 0시
      { created_at: '2026-10-05T03:00:00Z' }, // KST 12시
      { created_at: '2026-10-05T03:10:00Z' },
      { created_at: '2026-10-05T03:20:00Z' },
    ]);
    expect(r.hidden).toBeNull();
    expect(r.hours).toHaveLength(24);
    expect(r.hours![0].count).toBe(2);
    expect(r.hours![12].count).toBe(3);
    expect(r.hours!.reduce((s, h) => s + h.count, 0)).toBe(5);
  });
});

describe('KPI_DEFINITIONS (T1-UX-4)', () => {
  it('6개 KPI 모두 비어 있지 않은 한국어 정의를 가진다', () => {
    const keys = Object.keys(KPI_DEFINITIONS);
    expect(keys).toEqual(['totalViews', 'uniqueVisitors', 'avgDwellSeconds', 'completionRate', 'subscriberCount', 'temperature']);
    for (const k of keys) {
      const text = (KPI_DEFINITIONS as Record<string, string>)[k];
      expect(text).toMatch(/[가-힣]/);
      expect(text.length).toBeGreaterThanOrEqual(20);
    }
  });
});
