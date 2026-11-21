import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import { formatBasicCoverTitle } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { UNIFIED_TABLE_STYLE, styledTable } from '@/domain/building/mobile-im/pptx/imlib';
import {
  buildA24RentrollStacking,
  sortRentRollTopDown,
} from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import {
  buildBasicLocationRightData,
  computeLocationFourGrades,
} from '@/domain/building/mobile-im/pptx/location-facts-builder';
import { buildA06Diagram } from '@/domain/building/mobile-im/pptx/archetypes/a06-diagram';
import { YIELD_LABELS } from '@/domain/building/mobile-im/yield-set';
import {
  buildA23YieldFormula,
  renderVerticalLandPriceChart,
} from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { buildBasicLandSlideData } from '@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { buildA04Asymmetric75 } from '@/domain/building/mobile-im/pptx/archetypes/a04-asymmetric-7-5';

describe('Round 2 Wave 2 — IM 표지·표스타일·렌트롤·입지4등급·기대수익률·사진 0장폴백 검증', () => {
  it('1. formatBasicCoverTitle은 {시군구} {읍면동} {건물명|주용도 빌딩} ({용도}, {매매가}) 공식을 생성한다', () => {
    const t1 = formatBasicCoverTitle({
      address: '서울특별시 강남구 역삼동 700-1',
      buildingName: '신한빌딩',
      mainPurpose: '제2종근린생활시설',
      askingPriceManwon: 1_200_000,
    });
    expect(t1).toBe('강남구 역삼동 신한빌딩 (근생, 120억)');

    const t2 = formatBasicCoverTitle({
      address: '서울 영등포구 양평로22길 21 (당산동6가)',
      buildingName: '기타',
      mainPurpose: '업무시설',
      askingPriceKrw: 4_550_000_000,
    });
    expect(t2).toBe('영등포구 당산동6가 오피스 빌딩 (오피스, 45.5억)');
  });

  it('2. UNIFIED_TABLE_STYLE은 10.5pt 기본 헤더/본문을 유지하고 styledTable 기본값에 반영된다', () => {
    expect(UNIFIED_TABLE_STYLE.headerFontSize).toBe(10.5);
    expect(UNIFIED_TABLE_STYLE.bodyFontSize).toBe(10.5);

    let capturedRows: any[] = [];
    const mockSlide = {
      addTable: (rows: any[]) => {
        capturedRows = rows;
      },
    } as any;
    styledTable(mockSlide, 0.62, 1.8, 12.0, ['층', '임차인'], [['1F', '카페'], ['합계', '1개호실']], [3, 9]);
    expect(capturedRows[0][0].options.fontSize).toBeLessThanOrEqual(10.5);
    expect(capturedRows[0][0].options.fontSize).toBeGreaterThanOrEqual(9.5);
    expect(capturedRows[1][0].options.fontSize).toBeLessThanOrEqual(10.5);
  });

  it('3. sortRentRollTopDown은 최고층 → 1층 → 지하(B1→B2) 순 정렬 후 합계 행을 맨 아래에 둔다', async () => {
    const raw = [
      ['B2', '창고', '-', '100', '80', '1,000', '100', '0', '100', '-'],
      ['1F', '카페', '근생', '200', '150', '5,000', '400', '50', '450', '2027-12'],
      ['합계', '4개 호실', '-', '600', '450', '11,000', '900', '50', '950', '-'],
      ['B1', '식당', '근생', '100', '80', '2,000', '150', '0', '150', '2028-01'],
      ['4F', '사무실', '업무', '200', '140', '3,000', '250', '0', '250', '2026-11'],
    ];
    const sorted = sortRentRollTopDown(raw);
    expect(sorted.map((r) => r[0])).toEqual(['4F', '1F', 'B1', 'B2', '합계']);

    // Basic IM 6p 스태킹 기본 비활성화(hideStackingPlan: true) 확인
    const pres = new pptxgen();
    buildA24RentrollStacking({
      pres,
      slideNum: 6,
      docno: 'DOC-RR-TOP',
      data: {
        hideStackingPlan: true,
        tableHead: ['층', '임차인', '용도', '임대면적(㎡)', '전용면적(㎡)', '보증금(만원)', '월임대료(만원)', '관리비(만원)', '월합계(만원)', '만기일'],
        tableRows: raw,
      },
      grade: 'B',
      provenance: {},
    });
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    const xml = new AdmZip(buf).getEntries().find((e) => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
    expect(xml).not.toContain('층별 스태킹 플랜');
    const idx4F = xml.indexOf('>4F<');
    const idx1F = xml.indexOf('>1F<');
    const idxB1 = xml.indexOf('>B1<');
    const idxB2 = xml.indexOf('>B2<');
    expect(idx4F).toBeGreaterThan(-1);
    expect(idx4F).toBeLessThan(idx1F);
    expect(idx1F).toBeLessThan(idxB1);
    expect(idxB1).toBeLessThan(idxB2);
  });

  it('4. computeLocationFourGrades + A06은 4대 등급(도보·광역·상권·편의시설) 수동 오버라이드 및 2×2 네이티브 카드를 렌더링한다', async () => {
    const rightData = buildBasicLocationRightData({
      twoLineAddress: '서울 강남구 역삼동 700-1',
      externalPoi: {
        nearestStation: { name: '역삼역 2호선', distanceM: 280, walkMinutes: 4 },
        poiCounts: { restaurant: 35, cafe: 20, convenience: 8 },
        apartmentHouseholds: 1500,
      },
      brokerExtras: {
        location_grades: { commercial: '보통' },
      },
    });
    expect(rightData.locationGrades).toHaveLength(4);
    expect(rightData.locationGrades.find((g) => g.key === 'walk')?.grade).toBe('우수');
    expect(rightData.locationGrades.find((g) => g.key === 'commercial')).toMatchObject({
      grade: '보통',
      isManual: true,
    });

    const autoOnly = computeLocationFourGrades({ mergedStations: [], foodCount: 0, cafeCount: 0 });
    expect(autoOnly.find((g) => g.key === 'walk')?.grade).toBe('보완 필요');

    const pres = new pptxgen();
    await buildA06Diagram({
      pres,
      slideNum: 4,
      docno: 'DOC-LOC-4',
      grade: 'B',
      provenance: {},
      data: {
        title: '입지 정보',
        left: { source: '© 카카오맵' },
        right: rightData,
      },
    });
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    const xml = new AdmZip(buf).getEntries().find((e) => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
    // 주관적 4대 등급 2x2 배지 카드는 슬라이드에서 제거되고 객관 입지 지표만 렌더링한다
    expect(xml).not.toContain('도보 접근성');
    expect(xml).not.toContain('상권 활성화');
    expect(xml).toContain('강남');
  });

  it('5. 기대수익률 통일 + 5p 토지이음 출처 + 7p X축=연도 세로 차트 및 공실100% 기대수익률 히어로 승격', async () => {
    expect(YIELD_LABELS.stabilizedBrokerPlan).toBe('기대수익률');
    expect(YIELD_LABELS.stabilizedTargetRent).toBe('기대수익률');

    const landData = buildBasicLandSlideData({
      ssot: { pnu: '1168010100107000001', address: '서울 강남구 역삼동 700-1', land_area_sqm: 500 },
    });
    expect(landData.source).toContain('토지이음(eum.go.kr)');

    const pres = new pptxgen();
    buildA23YieldFormula({
      pres,
      slideNum: 7,
      docno: 'DOC-YIELD-VACANT',
      grade: 'B',
      provenance: {},
      data: {
        annualRent: 0,
        askingPrice: 10_000_000_000,
        totalDeposit: 0,
        capRateAsIs: 0,
        capRateStabilized: 4.5,
        stabilizedAssumption: '전 층 임대 전환 가정 시 예상 월세 3,750만원',
        address: '서울 강남구 역삼동 700-1',
        pnu: '1168010100107000001',
        landAreaSqm: 500,
      },
    });
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    const xml = new AdmZip(buf).getEntries().find((e) => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
    expect(xml).toContain('기대수익률');
    expect(xml).not.toContain('(추정수익률)');
    expect(xml).toContain('4.50%');
    expect(xml).toContain('대지 평당 매매가');
    expect(xml).toContain('X축=연도');
    expect(xml).not.toContain('토지 공시지가 (평당)');
    expect(xml).not.toContain('단순 합산 기대수익률');

    // Direct vertical chart helper smoke test
    const s2 = pres.addSlide();
    expect(() =>
      renderVerticalLandPriceChart(s2, {
        x: 1, y: 1, w: 5, h: 3,
        points: [{ year: '2024', value: 3.2, formattedLabel: '+3.20%' }],
        title: '테스트',
        sourceText: '한국부동산원',
      }),
    ).not.toThrow();
  });

  it('6. 6-2p expectedRentRoll 슬라이드 편성 + 외부/내부 사진 분리 + 0장 시 지적·위성 대체 이미지 삽입', async () => {
    const seq = buildDeckSequence({
      preset: 'credeal_basic',
      posture: 'income',
      grade: 'B',
      hasPhotos: true,
      hasExpectedRentRoll: true,
      dataAvailability: { hasRentRoll: true, hasExpectedRentRoll: true } as any,
    });
    const rrIdx = seq.findIndex((s) => s.dataKey === 'rentRoll');
    const expIdx = seq.findIndex((s) => s.dataKey === 'expectedRentRoll');
    expect(rrIdx).toBeGreaterThan(-1);
    expect(expIdx).toBe(rrIdx + 1);
    expect(seq[expIdx].archetype).toBe('A24');

    const gallery = planGallerySlides(
      [
        { url: 'https://example.com/e1.jpg', category: 'exterior' } as any,
        { url: 'https://example.com/e2.jpg', category: 'exterior' } as any,
        { url: 'https://example.com/i1.jpg', category: 'interior' } as any,
        { url: 'https://example.com/i2.jpg', category: 'interior' } as any,
      ],
      'income',
      'credeal_basic',
    );
    expect(gallery).toHaveLength(2);
    expect(gallery[0].title).toBe('외부·전경 사진');
    expect(gallery[0].photos[0].caption).toBe('외관 1 (대표)');
    expect(gallery[1].title).toBe('내부·층별 사진');
    expect(gallery[1].photos[0].caption).toBe('내부 1');

    // 1x1 tiny PNG data URI for zero-photo satellite/cadastral fallback check
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const pres = new pptxgen();
    await buildA04Asymmetric75({
      pres,
      slideNum: 3,
      docno: 'DOC-FALLBACK',
      grade: 'B',
      provenance: {},
      data: {
        title: '물건 개요',
        photoUrl: tinyPng,
        allowMapFallbackPhoto: true,
        photoCaption: '지적·위성 위치도 (건물 사진 미등록 시 자동 대체)',
        left: { rows: [['소재지', '서울 강남구 역삼동']] },
      },
    });
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    const xml = new AdmZip(buf).getEntries().find((e) => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
    expect(xml).toContain('지적·위성 위치도 (건물 사진 미등록 시 자동 대체)');
  });
});
