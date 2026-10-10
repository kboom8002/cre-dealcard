/**
 * D4/D8 (Phase C2) — 중개인 제공 정보(broker_extras) 렌더 측 단위 테스트
 *  - 결정론 통계 (평균/괴리율/본건 환산)
 *  - dataMap 빌더 (원문 그대로, 값 없는 항목 생략)
 *  - DataAvailability 플래그 → 시퀀서 슬롯 삽입/순서/상한/보호
 *  - 갤러리 제외 카테고리 (위치도·지구단위계획도·도면)
 */
import { describe, it, expect } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { BASIC_IM_BOUNDS, BASIC_IM_BROKER_SLIDE_KEYS } from '@/domain/building/mobile-im/pptx/basic-im-contract';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import {
  readBrokerExtras,
  extractBrokerImages,
  deriveBrokerAvailability,
  subjectLandPricePerPyeongManwon,
  computeCompsStats,
  formatGapPct,
  buildBrokerExtrasDataMap,
  buildBrokerCompsData,
  buildBrokerRegulationData,
  applyBrokerLocation,
  applyBrokerRentRollPlan,
  BROKER_SOURCE_TAG,
  COMPS_FOOTNOTE,
} from '@/domain/building/mobile-im/pptx/broker-extras-slides';

const BASE_DA = { hasRentRoll: true, hasStackingPlan: true, hasPhotos: true, hasCadastralMap: true };

function seqKeys(
  da: Record<string, unknown>,
  posture: 'income' | 'owner_occupied' | 'development' = 'income',
): string[] {
  return buildDeckSequence({
    posture,
    preset: 'credeal_basic',
    grade: 'B',
    dataAvailability: { ...BASE_DA, ...da },
  } as any).map(s => s.dataKey);
}

describe('Basic 시퀀서 — 중개인 제공 면 삽입', () => {
  it('입력 없음 → 기본 9면 불변', () => {
    const keys = seqKeys({});
    expect(keys).toEqual([
      'cover', 'summary', 'building', 'location', 'land', 'rentRoll', 'yieldFormula', 'gallery', 'closing',
    ]);
    for (const k of BASIC_IM_BROKER_SLIDE_KEYS) expect(keys).not.toContain(k);
  });

  it('투자 포인트: 요약 바로 뒤', () => {
    const keys = seqKeys({ hasBrokerPoints: true });
    expect(keys.indexOf('brokerPoints')).toBe(keys.indexOf('summary') + 1);
    expect(keys.length).toBe(10);
  });

  it('규제·계획: 토지 바로 뒤 / 시세 비교: 수익률 바로 뒤', () => {
    const keys = seqKeys({ hasBrokerRegulation: true, hasBrokerRegulationNotes: true, hasBrokerComps: true });
    expect(keys.indexOf('brokerRegulation')).toBe(keys.indexOf('land') + 1);
    expect(keys.indexOf('brokerComps')).toBe(keys.indexOf('yieldFormula') + 1);
    expect(keys).not.toContain('brokerRegulationImages');
    expect(keys.length).toBe(11);
  });

  it('도면만 있으면 도면 면만, 둘 다 있으면 규제 → 도면 순서', () => {
    const imgOnly = seqKeys({ hasBrokerRegulation: true, hasBrokerRegulationNotes: false, hasBrokerRegulationImages: true });
    expect(imgOnly).toContain('brokerRegulationImages');
    expect(imgOnly).not.toContain('brokerRegulation');

    const both = seqKeys({ hasBrokerRegulation: true, hasBrokerRegulationNotes: true, hasBrokerRegulationImages: true });
    expect(both.indexOf('brokerRegulation')).toBe(both.indexOf('land') + 1);
    expect(both.indexOf('brokerRegulationImages')).toBe(both.indexOf('land') + 2);
  });

  it('네 면 모두 + 지적도 + 갤러리 2장 → 최대 13면, 중개인 면·필수 면 보존', () => {
    const specs = [
      { dataKey: 'gallery', kicker: 'Gallery', title: '건물 사진' },
      { dataKey: 'gallery2', kicker: 'Gallery', title: '건물 사진 2' },
    ];
    const seq = buildDeckSequence({
      posture: 'income',
      preset: 'credeal_basic',
      grade: 'B',
      gallerySpecs: specs,
      dataAvailability: {
        ...BASE_DA,
        hasBrokerPoints: true,
        hasBrokerRegulation: true,
        hasBrokerRegulationNotes: true,
        hasBrokerRegulationImages: true,
        hasBrokerComps: true,
      },
    } as any);
    const keys = seq.map(s => s.dataKey);
    expect(BASIC_IM_BOUNDS.maxSlides).toBe(13);
    expect(keys.length).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    for (const k of ['cover', 'summary', 'brokerPoints', 'building', 'location', 'land', 'brokerRegulation',
      'brokerRegulationImages', 'rentRoll', 'yieldFormula', 'brokerComps', 'closing']) {
      expect(keys).toContain(k);
    }
    // 갤러리가 먼저 절삭되고 closing 이 마지막 유지
    expect(keys[keys.length - 1]).toBe('closing');
  });

  it('비-income 포스처: 수익률 면이 없으므로 시세 비교는 토지(규제) 뒤', () => {
    const keys = seqKeys({ hasBrokerComps: true }, 'owner_occupied');
    expect(keys).not.toContain('yieldFormula');
    expect(keys.indexOf('brokerComps')).toBe(keys.indexOf('land') + 1);
  });
});

describe('computeCompsStats / 본건 환산', () => {
  it('실거래·매물 평균은 값 있는 행만, 괴리율은 실거래 평균 기준 소수 1자리', () => {
    const stats = computeCompsStats([
      { kind: 'transaction', location: 'A', land_price_per_pyeong_manwon: 10000 },
      { kind: 'transaction', location: 'B', land_price_per_pyeong_manwon: 12000 },
      { kind: 'transaction', location: 'C', price_eok: 30 }, // 토지평당가 없음 → 평균 제외
      { kind: 'listing', location: 'D', land_price_per_pyeong_manwon: 15000 },
    ], 13200);
    expect(stats.transactionAvg).toBe(11000);
    expect(stats.transactionCount).toBe(2);
    expect(stats.listingAvg).toBe(15000);
    expect(stats.listingCount).toBe(1);
    expect(stats.gapPct).toBe(20); // (13200-11000)/11000 = 20.0%
    expect(formatGapPct(stats.gapPct!)).toBe('+20.0%');
  });

  it('음수 괴리율 표기, 실거래 평균 없으면 괴리율 없음', () => {
    const neg = computeCompsStats([{ kind: 'transaction', location: 'A', land_price_per_pyeong_manwon: 10000 }], 9000);
    expect(neg.gapPct).toBe(-10);
    expect(formatGapPct(neg.gapPct!)).toBe('-10.0%');

    const none = computeCompsStats([{ kind: 'listing', location: 'A', land_price_per_pyeong_manwon: 10000 }], 9000);
    expect(none.transactionAvg).toBeUndefined();
    expect(none.gapPct).toBeUndefined();
  });

  it('본건 환산 = 매매가 ÷ 대지평수 (물건 개요 토지평당가와 같은 산식)', () => {
    // 대지 330.58㎡ ≒ 100평, 매매가 1,250,000만원 → 12,500만원/평
    const v = subjectLandPricePerPyeongManwon({ asking_price_manwon: 1250000, land_area_sqm: 330.5785 });
    expect(v).toBe(12500);
    expect(subjectLandPricePerPyeongManwon({ asking_price_manwon: 1250000, land_area_pyeong: 125 })).toBe(10000);
    expect(subjectLandPricePerPyeongManwon({ land_area_sqm: 300 })).toBeUndefined();
    expect(subjectLandPricePerPyeongManwon({ asking_price_manwon: 1000 })).toBeUndefined();
  });
});

describe('dataMap 빌더 — 원문 그대로 / 입력 없으면 생략', () => {
  const body = {
    ssot_summary: { asking_price_manwon: 1250000, land_area_sqm: 330.5785 },
    broker_extras: {
      investment_points: ['  역세권 이면 코너  ', '', '용적률 상향 여지'],
      closing_line: '현장 방문 가능',
      regulatory_notes: [
        { kind: 'dev_restriction', title: '개발행위허가제한', detail: '지정 구역 내', basis: '국토계획법 제63조', restricted_acts: '건축물 신축', period: '2027-12-31까지' },
        { kind: 'district_plan', detail: '지구단위계획 구역' },
        { kind: 'other', detail: '' },
      ],
      market_comps: [
        { kind: 'transaction', location: '인접 필지', price_eok: 80, land_price_per_pyeong_manwon: 10000 },
        { kind: 'listing', location: '', price_eok: 5 },
      ],
      location_note: '지하철 2호선 도보 3분',
      post_acquisition_plan: ['리모델링', '임대료 정상화'],
    },
  };

  it('readBrokerExtras: 공백·빈 항목 정리, 빈 입력은 null', () => {
    const e = readBrokerExtras(body)!;
    expect(e.investment_points).toEqual(['역세권 이면 코너', '용적률 상향 여지']);
    expect(e.regulatory_notes).toHaveLength(2);
    expect(e.market_comps).toHaveLength(1);
    expect(readBrokerExtras({})).toBeNull();
    expect(readBrokerExtras({ broker_extras: {} })).toBeNull();
    expect(readBrokerExtras({ broker_extras: [] })).toBeNull();
  });

  it('투자 포인트·규제 카드: 원문 보존, 개발행위허가제한은 warn + 근거/제한행위/기한', () => {
    const map = buildBrokerExtrasDataMap(body, { ssot: body.ssot_summary, body: body as any });
    expect(Object.keys(map).sort()).toEqual(['brokerComps', 'brokerPoints', 'brokerRegulation']);
    expect(map.brokerPoints.points).toEqual(['역세권 이면 코너', '용적률 상향 여지']);
    expect(map.brokerPoints.closingLine).toBe('현장 방문 가능');
    expect(map.brokerPoints.sourceTag).toBe(BROKER_SOURCE_TAG);

    const cards = map.brokerRegulation.cards;
    expect(cards[0].tone).toBe('warn');
    expect(cards[0].lines).toEqual([
      { label: '근거', value: '국토계획법 제63조' },
      { label: '제한행위', value: '건축물 신축' },
      { label: '기한', value: '2027-12-31까지' },
    ]);
    expect(cards[1].tone).toBe('info');
    expect(cards[1].lines).toEqual([]);
    expect(buildBrokerRegulationData({})).toBeNull();
  });

  it('시세 비교: 표·요약 카드·각주 (괴리율 산식 포함)', () => {
    const extras = readBrokerExtras(body)!;
    const comps = buildBrokerCompsData(extras, { ssot: body.ssot_summary, body: body as any })!;
    // 비고가 하나도 없으면 '-'만 있는 비고 열을 만들지 않는다
    expect(comps.tableHead).toEqual(['구분', '소재지', '가격(억)', '토지평당가(만원)']);
    expect(comps.tableRows[0]).toEqual(['실거래', '인접 필지', '80', '10,000']);
    const withNote = buildBrokerCompsData(
      { market_comps: [...extras.market_comps!, { kind: 'listing', location: '대로변', price_eok: 90, note: '호가' }] },
      { ssot: body.ssot_summary, body: body as any },
    )!;
    expect(withNote.tableHead).toEqual(['구분', '소재지', '가격(억)', '토지평당가(만원)', '비고']);
    expect(withNote.tableRows[0]).toEqual(['실거래', '인접 필지', '80', '10,000', '-']);
    expect(withNote.tableRows[1][4]).toBe('호가');
    const labels = comps.summaryCards.map((c: any) => c.label);
    expect(labels).toEqual(['실거래 평균', '본건 환산', '괴리율']);
    expect(comps.summaryCards.find((c: any) => c.label === '괴리율').value).toBe('+25.0%');
    expect(comps.footnotes[0]).toBe(COMPS_FOOTNOTE);
    expect(comps.footnotes.length).toBe(2);
  });

  it('입력 없는 body → 빈 dataMap', () => {
    expect(buildBrokerExtrasDataMap({})).toEqual({});
  });

  it('applyBrokerLocation: location_note → callout 대체, 위치도 → brokerMapImage', () => {
    const extras = readBrokerExtras(body)!;
    const loc: Record<string, any> = { right: { rows: [1, 2, 3, 4, 5, 6, 7].map(i => [`k${i}`, `v${i}`]), callout: { title: '입지 종합 분석' } } };
    applyBrokerLocation(loc, extras, [{ url: 'https://x/map.png', category: 'location_map' }]);
    expect(loc.brokerMapImage).toBe('https://x/map.png');
    expect(loc.right.callout.body).toBe('지하철 2호선 도보 3분');
    expect(loc.right.callout.title).toContain('중개인입력');
    expect(loc.right.rows).toHaveLength(5);
    // location 이 없으면 no-op
    expect(() => applyBrokerLocation(undefined, extras, [])).not.toThrow();
  });

  it('applyBrokerRentRollPlan: 매입 후 전략 전달, 입력 없으면 변경 없음', () => {
    const extras = readBrokerExtras(body)!;
    const rr: Record<string, any> = {};
    applyBrokerRentRollPlan(rr, extras);
    expect(rr.brokerPostAcquisitionPlan).toEqual(['리모델링', '임대료 정상화']);
    const rr2: Record<string, any> = {};
    applyBrokerRentRollPlan(rr2, null);
    expect(rr2.brokerPostAcquisitionPlan).toBeUndefined();
  });
});

describe('extractBrokerImages / deriveBrokerAvailability', () => {
  const photos_v2 = [
    { url: 'https://x/ext.jpg', category: 'exterior' },
    { url: 'https://x/map.png', category: 'location_map', caption: '입지도' },
    { url: 'https://x/dp.png', category: 'district_plan_map' },
    { url: 'https://x/fp.png', category: 'floor_plan', excluded: true },
    { url: 'https://x/fp2.wdp', category: 'floor_plan' },
    { url: 'https://x/fp3.png', category: 'floor_plan' },
  ];

  it('도면·지도 카테고리만, excluded/.wdp 제외', () => {
    const imgs = extractBrokerImages({ photos_v2 });
    expect(imgs.map(i => i.url)).toEqual(['https://x/map.png', 'https://x/dp.png', 'https://x/fp3.png']);
    expect(imgs[0].caption).toBe('입지도');
  });

  it('플래그 도출', () => {
    expect(deriveBrokerAvailability({})).toEqual({
      hasBrokerPoints: false, hasBrokerRegulation: false, hasBrokerRegulationNotes: false,
      hasBrokerRegulationImages: false, hasBrokerComps: false,
    });
    const a = deriveBrokerAvailability({ photos_v2, broker_extras: { investment_points: ['a'] } });
    expect(a.hasBrokerPoints).toBe(true);
    expect(a.hasBrokerRegulation).toBe(true);
    expect(a.hasBrokerRegulationImages).toBe(true);
    expect(a.hasBrokerRegulationNotes).toBe(false);
    // 위치도만 있으면 규제 면은 열리지 않음
    const mapOnly = deriveBrokerAvailability({ photos_v2: [photos_v2[1]] });
    expect(mapOnly.hasBrokerRegulation).toBe(false);
  });
});

describe('갤러리 제외 — 위치도·지구단위계획도·도면은 갤러리/대표 사진에 노출되지 않음', () => {
  it('planGallerySlides 에서 제외', () => {
    const ext = { url: 'https://x/ext.jpg', category: 'exterior', role: 'cover', isHero: true };
    const photos = resolvePhotos({
      photos_v2: [
        ext,
        { url: 'https://x/map.png', category: 'location_map' },
        { url: 'https://x/dp.png', category: 'district_plan_map' },
        { url: 'https://x/fp.png', category: 'floor_plan' },
      ],
    } as any);
    const specs = planGallerySlides(photos, 'income', 'credeal_basic');
    expect(specs.flatMap(s => s.photos.map(p => p.url))).toEqual([ext.url]);
  });
});
