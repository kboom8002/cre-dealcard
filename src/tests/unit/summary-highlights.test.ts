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
    // 2026-10-10: 렌트롤 금액이 있으면 렌트롤 임대중 행 합이 SSOT (A24 합계 행과 동일 모집단).
    //   이 픽스처 행 합 = 715 + 400×10 = 4,715만 / 7,600 + 4,000×10 = 4억 7,600만 (ssot 5,147/53,700 은 폴백 전용)
    expect(r.points[1]).toContain('4,715만 원');
    expect(r.points[1]).toContain('4억 7,600만 원');
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

  it('R3: synthesizes 3 value-oriented investment points (tenant quality, price vs comps, upside) and folds station into lead on ig1', () => {
    const ig1Body = {
      ssot_summary: {
        asking_price_manwon: 1_150_000,
        land_area_sqm: 506.8,
        total_gross_area_sqm: 1479.82,
        completion_year: 2002,
        zoning: '준공업지역',
        floors_above: 5,
        floors_below: 1,
        parcel_count: 2,
        road_condition: '광대세각',
      },
      floor_leases: [
        { floor: 'B1', tenant_type: '자가(스튜디오)', deposit_manwon: 0, rent_manwon: 0, note: '자가사용 · 보증 5,000만 / 월 458만 전환 가능' },
        { floor: '1F', tenant_type: '고은약국', deposit_manwon: 5000, rent_manwon: 183, note: '장기 임차' },
        { floor: '1F', tenant_type: '커피전문점(할리스)', deposit_manwon: 5000, rent_manwon: 325 },
        { floor: '1F', tenant_type: '부동산중개사무소', deposit_manwon: 2000, rent_manwon: 110 },
        { floor: '2F~3F', tenant_type: '로뎀나무내과(검진센터)', deposit_manwon: 10000, rent_manwon: 883, note: '임대 11년 경과' },
        { floor: '4F', tenant_type: '로뎀나무내과(내시경센터)', deposit_manwon: 5000, rent_manwon: 165 },
        { floor: '4F', tenant_type: '자가(사무실)', deposit_manwon: 0, rent_manwon: 0, note: '자가사용 · 보증 3,000만 / 월 144만 전환 가능' },
        { floor: '5F', tenant_type: '세무법인', deposit_manwon: 2000, rent_manwon: 280 },
      ],
      broker_extras: {
        investment_points: [
          'B1·4F 자가사용분 임대 전환 시 월 임대료 2,548만원(연 3억 576만원), 수익률 3.1%로 상승 여력',
        ],
        post_acquisition_plan:
          '지하1층 스튜디오(152.5평) 임대 전환 시 보증 5,000만 / 월 458만 추가 가능. 4층 자가사용분(48평) 임대 전환 시 보증 3,000만 / 월 144만 추가 가능.',
        market_comps: [
          { kind: 'listing', location: '당산동4가', land_price_per_pyeong_manwon: 13900 },
          { kind: 'listing', location: '당산동5가', land_price_per_pyeong_manwon: 15200 },
          { kind: 'listing', location: '당산동6가', land_price_per_pyeong_manwon: 8900 },
          { kind: 'listing', location: '당산동5가', land_price_per_pyeong_manwon: 16200 },
        ],
      },
      enrichment: {
        locationPoi: {
          nearestStation: { name: '당산역 2호선', walkMinutes: 5, distanceM: 406 },
          candidateSpots: [
            { name: '당산역 2호선', category: 'subway', distanceM: 406, walkMinutes: 5 },
            { name: '당산역 9호선', category: 'subway', distanceM: 468, walkMinutes: 6 },
          ],
        },
        landPriceHistory: {
          cagrPct: 5.8,
          history: Array.from({ length: 10 }, (_, i) => ({ year: String(2016 + i), pricePerSqm: 1 })),
        },
      },
    };

    const facts = extractSummaryFacts({
      posture: 'income',
      body: ig1Body,
      building: { asset_type: '근생빌딩' },
      enrichment: ig1Body.enrichment,
    });
    const r = buildSummaryHighlights(facts);

    expect(r.lead).toBe('당산역(2·9호선) 도보 5분, 준공업지역의 2002년 준공 지하 1층·지상 5층 임대수익형 근생빌딩입니다.');
    expect(r.points).toHaveLength(3);
    // Point 1: Medical tenant quality & 11-year tenure
    expect(r.points[0]).toContain('로뎀나무내과·고은약국');
    expect(r.points[0]).toContain('63%(1,231만 원)');
    expect(r.points[0]).toContain('11년째 유지');
    // Point 2: Price vs comps discount + land CAGR
    expect(r.points[1]).toContain('7,501만 원');
    expect(r.points[1]).toContain('1억 3,550만 원');
    expect(r.points[1]).toContain('45%');
    expect(r.points[1]).toContain('5.8%');
    // Point 3: Post-acquisition conversion upside (2.08% -> 2.75%, +0.67%p)
    expect(r.points[2]).toContain('2.75%');
    expect(r.points[2]).toContain('2.08%');
    expect(r.points[2]).toContain('+0.67%p');

    // Conflicting broker point (3.1%) must be excluded and recorded in warnings
    expect(r.points.join(' ')).not.toContain('3.1%');
    expect(r.warnings?.some(w => w.includes('[HIGHLIGHT-CONFLICT]') && w.includes('3.1%'))).toBe(true);
    expect(r.hasBrokerInput).toBe(true);

    for (const p of r.points) {
      expect(p.length).toBeLessThanOrEqual(90);
      expect(p).not.toContain('…');
      expect(p).not.toMatch(/유력|보장|확실|확정|최고/);
    }
  });
});
