import { describe, it, expect } from 'vitest';
import {
  buildSummaryHighlights,
  extractSummaryFacts,
  isBoilerplateHighlight,
  isNearDuplicate,
  parseStation,
  formatManwonKo,
} from '@/domain/building/mobile-im/pptx/summary-highlights';

const p5Body = {
  ssot_summary: {
    zoning: '준공업지역',
    road_condition: '광대세각',
    completion_year: 2018,
    floors_above: 10,
    floors_below: 1,
    land_area_sqm: 518.7,
    total_gross_area_sqm: 2490.88,
    parcel_count: 3,
    monthly_rent_total_krw: 51_470_000,
    total_deposit_manwon: 53_700,
  },
  floor_leases: [
    { floor: 'B1', tenant_type: '(공실)', is_vacant: true, deposit_manwon: 0, rent_manwon: 0 },
    { floor: '1F', tenant_type: '카페(스타벅스)', deposit_manwon: 7600, rent_manwon: 715 },
    ...Array.from({ length: 10 }, (_, i) => ({ floor: `${i + 2}F`, tenant_type: '오피스', deposit_manwon: 4000, rent_manwon: 400 })),
  ],
  enrichment: {
    landPriceHistory: { cagrPct: 4.9, history: Array.from({ length: 10 }, (_, i) => ({ year: String(2017 + i), pricePerSqm: 1 })) },
  },
};
const p5Enrichment = {
  locationPoi: { nearestStation: { name: '선유도역 9호선', walkMinutes: 2, distanceM: 135 } },
  landPriceHistory: p5Body.enrichment.landPriceHistory,
};

describe('summary-highlights', () => {
  it('detects template boilerplate from premium-template-engine', () => {
    expect(isBoilerplateHighlight('자산 가치 완충 여력 확보: 양평 소재 오피스빌딩으로, 핵심 입지 및 교통 인프라 기반의 자산 가치가 형성되어 있습니다.')).toBe(true);
    expect(isBoilerplateHighlight('안정적 월 현금흐름: 현행 임대차 현황 및 공실률 기반 순영업소득(NOI) 구조가 확인됩니다.')).toBe(true);
    expect(isBoilerplateHighlight('가치 상승 및 출구 전략: 현행 공법 여력을 활용한 가치개선(Value-add) 기회와 더불어 향후 권역 지가 상승에 따른 시세차익 실현이 유력합니다.')).toBe(true);
    expect(isBoilerplateHighlight('역세권 입지 — 선유도역(9호선) 도보 2분 거리에 위치합니다.')).toBe(false);
  });

  it('parses station name and line', () => {
    expect(parseStation('선유도역 9호선')).toEqual({ name: '선유도역', line: '9호선' });
    expect(parseStation('선유도역(9호선)')).toEqual({ name: '선유도역', line: '9호선' });
    expect(parseStation('강남역')).toEqual({ name: '강남역', line: undefined });
    expect(parseStation('')).toEqual({});
  });

  it('formats manwon in Korean units', () => {
    expect(formatManwonKo(53_700)).toBe('5억 3,700만 원');
    expect(formatManwonKo(5_147)).toBe('5,147만 원');
    expect(formatManwonKo(20_000)).toBe('2억 원');
    expect(formatManwonKo(0)).toBe('');
  });

  it('builds 3 data-anchored, non-duplicate income points for p5 (no ellipsis, no boilerplate)', () => {
    const facts = extractSummaryFacts({ posture: 'income', body: p5Body, building: { area_signal: '양평', asset_type: '오피스빌딩' }, enrichment: p5Enrichment });
    const r = buildSummaryHighlights(facts, ['자산 가치 완충 여력 확보: 양평 소재 오피스빌딩으로, 핵심 입지 및 교통 인프라 기반의 자산 가치가 형성되어 있습니다.']);
    expect(r.points).toHaveLength(3);
    expect(r.points[0]).toContain('선유도역(9호선) 도보 2분(약 135m)');
    expect(r.points[0]).toContain('광대세각');
    expect(r.points[1]).toContain('12개 호실 중 11개 임차 중(공실 B1)');
    expect(r.points[1]).toContain('5,147만 원');
    expect(r.points[1]).toContain('5억 3,700만 원');
    expect(r.points[2]).toContain('3필지 통합 대지 518.7㎡');
    expect(r.points[2]).toContain('연평균 4.9%');
    for (const p of r.points) {
      expect(p).not.toContain('...');
      expect(p).not.toMatch(/유력|보장|확실/);
      expect(isNearDuplicate(p, r.lead)).toBe(false);
    }
    expect(r.lead).toBe('양평 준공업지역에 위치한 2018년 준공, 지하 1층·지상 10층 규모의 임대수익형 오피스빌딩입니다.');
    expect(r.shortHighlights).toHaveLength(3);
    expect(r.shortHighlights[0]).toBe('선유도역(9호선) 도보 2분 역세권 · 광대세각 접면');
    expect(r.shortHighlights[1]).toContain('임차 11/12개 호실');
  });

  it('never fabricates: missing data → fewer points, filled only by non-boilerplate AI points', () => {
    const r = buildSummaryHighlights({ posture: 'income' }, [
      '안정적 월 현금흐름: 현행 임대차 현황 및 공실률 기반 순영업소득(NOI) 구조가 확인됩니다.',
      '임차인 구성 — 1층 근린생활시설 임차 중',
    ]);
    expect(r.points).toEqual(['임차인 구성 — 1층 근린생활시설 임차 중']);
    expect(r.lead).toBe('');
    expect(r.shortHighlights).toEqual([]);
  });

  it('owner_occupied excludes lease facts and uses space point', () => {
    const facts = extractSummaryFacts({ posture: 'owner_occupied', body: p5Body, building: { asset_type: '오피스빌딩' }, enrichment: p5Enrichment });
    expect(facts.lease).toBeUndefined();
    const r = buildSummaryHighlights(facts);
    expect(r.points.some(p => p.startsWith('사옥 공간'))).toBe(true);
    expect(r.points.some(p => p.includes('호실'))).toBe(false);
  });

  it('fallback station data (_isFallback) is ignored', () => {
    const facts = extractSummaryFacts({ posture: 'income', body: {}, enrichment: { locationPoi: { _isFallback: true, nearestStation: { name: '가짜역', walkMinutes: 3 } } } });
    expect(facts.stationName).toBeUndefined();
  });
});
