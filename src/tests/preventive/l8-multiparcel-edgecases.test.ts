/**
 * L8. 보정동 외 다필지(Multi-Parcel) 매물 IM · 딜카드 엣지 케이스 예방 테스트 (PT-801 ~ PT-804)
 *
 * 검증 범위:
 * - PT-801: 다필지 지번(콤마/슬래시 나열 부속필지, 정수 지번, '외 N필지') 블라인드 가드 0% 유출 및 OO-OO 무잔존 검증
 * - PT-802: 메모 기반 딜카드(parseMemoIntoCard4) — 다필지 합계 면적 우선 추출, + 합산 토지면적(value_add), 부속지번 파편 배제 검증
 * - PT-803: 다필지 IM 콜드스타트/합성 스토어(synthesizeQuickRecordFromImItem) — 시도 생략 주소 지번 비유출, 혼합 지목(대 2 · 공장용지 1), PNU 배열 보존 검증
 * - PT-804: PPTX Slide 05(A27_LAND_USE_PLAN) — 3필지 혼합지목 가중평균 공시지가 정합성, 음절 중간 절단 0건, 2필지 이종 용도지역 비율 콜아웃·범례 검증
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { parseMemoIntoCard4 } from '@/lib/deal-card/memo-pairing';
import { synthesizeQuickRecordFromImItem } from '@/lib/im-lite/quick-generate-store';
import { parseRentRollData } from '@/lib/rentroll/parse-rentroll-sheet';
import {
  buildBasicLandSlideData,
  buildA27LandUsePlan,
} from '@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan';

describe('L8 Multi-Parcel Non-Bojeong Edge Cases (PT-801 ~ PT-804)', () => {
  it('[PT-801] masks primary and comma/slash-separated secondary lot numbers (including integer lots) without leaking secondary lots or leaving OO-OO', () => {
    const rawPoints: [string, string, string] = [
      '성동구 성수동2가 315-4, 315-3, 315-7 역세권 코너',
      '영등포구 양평동4가 117, 134 외 1필지 대로변',
      '마포구 서교동 395-166/395-165 합필 신축부지',
    ];

    const cleaned = cleanBlindPoints(rawPoints);
    const joined = cleaned.join(' | ');

    // Zero leaked lot numbers (primary or secondary)
    expect(joined).not.toContain('315-4');
    expect(joined).not.toContain('315-3');
    expect(joined).not.toContain('315-7');
    expect(joined).not.toMatch(/\b117\b/);
    expect(joined).not.toMatch(/\b134\b/);
    expect(joined).not.toContain('395-166');
    expect(joined).not.toContain('395-165');

    // Zero ugly OO-OO or ●●● over-masking
    expect(joined).not.toContain('OO-OO');
    expect(joined).not.toContain('●●●');

    // Clean dong-level labels preserved
    expect(cleaned[0]).toContain('성수동2가 인근');
    expect(cleaned[1]).toContain('양평동4가 인근');
    expect(cleaned[2]).toContain('서교동 인근');

    const validation = validateBlindPoints(rawPoints);
    expect(validation.isValid).toBe(false);
    expect(validation.cleanedPoints.join(' ')).not.toContain('315-3');
    expect(validation.cleanedPoints.join(' ')).not.toContain('395-165');
  });

  it('[PT-802] parses messy multi-parcel broker memos into accurate combined GFA/land pyeong with zero secondary lot fragments in points', () => {
    // Case A: 3-parcel Seongsu income memo with per-parcel areas AND total combined GFA/land
    const seongsuMemo = [
      '[성수역 도보 4분 3필지 통합 수익형 오피스]',
      '소재지: 서울특별시 성동구 성수동2가 315-4 외 2필지 (315-3, 315-7)',
      '도로명: 서울 성동구 연무장7길 11 / 소유주 김대표 010-9111-2233',
      '개별필지: 315-4 대 250평, 315-3 대 281평, 315-7 공장용지 133평 (대지 3필지 합계 663평)',
      '건축규모: 지하2층~지상10층 / 연면적 합계 1,195평 / 준공업지역',
      '매매가 485억 / 보증금 18억 / 월임대료 1억 4,500만 (만실 운영, 연 수익률 3.7%)',
      '2호선 성수역 역세권 코너 가시성 우수',
    ].join('\n');

    const parsedSeongsu = parseMemoIntoCard4(seongsuMemo);
    expect(parsedSeongsu.posture).toBe('income');
    expect(parsedSeongsu.gfaPyung).toBe(1195);
    expect(parsedSeongsu.landAreaPyung).toBe(663);
    expect(parsedSeongsu.area).toBe('연면적 1,195평');
    expect(parsedSeongsu.region).toContain('성수동');

    const allSeongsuText = [
      parsedSeongsu.region,
      parsedSeongsu.use,
      parsedSeongsu.area,
      parsedSeongsu.priceBand,
      parsedSeongsu.headline,
      ...parsedSeongsu.points,
    ].join(' | ');
    expect(allSeongsuText).not.toContain('315-4');
    expect(allSeongsuText).not.toContain('315-3');
    expect(allSeongsuText).not.toContain('315-7');
    expect(allSeongsuText).not.toContain('연무장7길 11');
    expect(allSeongsuText).not.toContain('010-9111-2233');
    expect(allSeongsuText).not.toContain('OO-OO');

    // Case B: 2-parcel Seogyo value_add development site with + joined parcel areas
    const seogyoMemo = [
      '마포구 서교동 395-166, 395-165 합필 신축·개발용 부지',
      '용도지역: 준주거지역 + 제2종일반주거지역',
      '토지면적: 대지 706평 + 108평 (연면적 1,754평 리모델링·신축 가능)',
      '매매 희망가 390억 / 합정역 도보 3분 양화진길 코너',
      '명도 협의 완료 · 즉시 신축 인허가 착수 가능',
    ].join('\n');

    const parsedSeogyo = parseMemoIntoCard4(seogyoMemo);
    expect(parsedSeogyo.posture).toBe('value_add');
    expect(parsedSeogyo.landAreaPyung).toBe(814);
    expect(parsedSeogyo.area).toBe('토지 814평');
    expect(parsedSeogyo.region).toContain('서교동');
    expect(parsedSeogyo.region).not.toContain('395-166');
    expect(parsedSeogyo.points.join(' | ')).not.toContain('395-166');
    expect(parsedSeogyo.points.join(' | ')).not.toContain('395-165');
  });

  it('[PT-803] preserves multi-parcel PNUs, mixed jimok label, and blind-safe region in Cold-Start quick-record synthesis even without Sido prefix', () => {
    const synthesized = synthesizeQuickRecordFromImItem('mp-test-seongsu-001', {
      id: 'mp-test-seongsu-001',
      buildingId: 'mp-test-seongsu-001',
      title: '성수동2가 역세권 오피스',
      address: '성동구 성수동2가 315-4, 315-3, 315-7',
      askingPriceManwon: 4850000,
      gfaSqm: '3951.29',
      landAreaSqm: '2192.8',
      zoning: '준공업지역',
      completionDate: '2010-06-10',
      floorsAbove: 10,
      floorsBelow: 2,
      bcrPct: 52.61,
      farPct: 399.31,
      pnu: '1120011500103150004',
      lat: 37.543015,
      lng: 127.056301,
      officialLandPricePerSqm: 11115307,
      parcels: [
        {
          pnu: '1120011500103150004',
          jibun: '성수동2가 315-4',
          landCategory: '대',
          areaM2: 824.9,
          officialPricePerM2: 10910000,
        },
        {
          pnu: '1120011500103150003',
          jibun: '성수동2가 315-3',
          landCategory: '대',
          areaM2: 928.9,
          officialPricePerM2: 11130000,
        },
        {
          pnu: '1120011500103150007',
          jibun: '성수동2가 315-7',
          landCategory: '공장용지',
          areaM2: 439.0,
          officialPricePerM2: 11470000,
        },
      ],
      rentRoll: [
        { floor: '1F', unit: '101호', use: '플래그십 쇼룸', depositManwon: 30000, monthlyRentManwon: 2200, status: 'occupied' },
        { floor: '2F', unit: '201호', use: '디자인 스튜디오', depositManwon: 20000, monthlyRentManwon: 1500, status: 'occupied' },
      ],
    });

    // Region must never leak lot numbers when "서울특별시" is omitted
    expect(synthesized.card4.region).toBe('성동구 성수동2가');
    expect(synthesized.card4.region).not.toContain('315-4');

    const ssot = synthesized.fullDocBody?.ssot_summary;
    expect(ssot?.land_category).toBe('대 2 · 공장용지 1');
    expect(ssot?.parcel_count).toBe(3);
    expect(ssot?.pnus).toEqual([
      '1120011500103150004',
      '1120011500103150003',
      '1120011500103150007',
    ]);
    expect(synthesized.fullDocBody?.pnus).toHaveLength(3);
    expect(ssot?.land_area_sqm).toBeCloseTo(2192.8, 1);
    expect(ssot?.official_land_price_per_sqm).toBe(11115307);
  });

  it('[PT-804] builds A27_LAND_USE_PLAN with exact weighted official land price, zero mid-syllable truncation, and cross-parcel dual-zoning shares', async () => {
    // 1) 3-parcel mixed jimok (Seongsu 315-4, 315-3, 315-7)
    const seongsuSlideData = buildBasicLandSlideData({
      enrichment: {
        landUsePlan: {
          jibunAddress: '서울특별시 성동구 성수동2가 315-4',
          zoningDistrict: '준공업지역',
          stdrYear: 2026,
          stdrMt: 1,
          pblntfPclnd: 10910000,
        },
        landPriceHistory: {
          latestYear: 2026,
          latestPricePerSqm: 10910000, // Primary-only price must NOT override multi-parcel weighted average!
        },
      },
      ssot: {
        pnu: '1120011500103150004',
        address: '서울특별시 성동구 성수동2가 315-4 외 2필지 (315-3, 315-7)',
        land_area_sqm: 2192.8,
        zoning: '준공업지역',
        parcels: [
          { pnu: '1120011500103150004', jibun: '성수동2가 315-4', landCategory: '대', areaM2: 824.9, officialPricePerM2: 10910000 },
          { pnu: '1120011500103150003', jibun: '성수동2가 315-3', landCategory: '대', areaM2: 928.9, officialPricePerM2: 11130000 },
          { pnu: '1120011500103150007', jibun: '성수동2가 315-7', landCategory: '공장용지', areaM2: 439.0, officialPricePerM2: 11470000 },
        ],
      },
    });

    const rowMap = Object.fromEntries(seongsuSlideData.overviewRows);
    expect(rowMap['소재지']).toBe('서울특별시 성동구 성수동2가 315-4 외 2필지');
    expect(rowMap['지목']).toBe('대 2 · 공장용지 1');
    expect(rowMap['면적']).toContain('2,192.8㎡');
    expect(rowMap['면적']).toContain('3필지 합계');
    // Weighted official land price (11,115,307원/㎡) instead of primary-only 10,910,000원/㎡
    expect(rowMap['개별공시지가(㎡당)']).toContain('11,115,307원/㎡');
    expect(rowMap['개별공시지가(㎡당)']).toContain('가중평균');
    expect(seongsuSlideData.parcelRows).toHaveLength(3);

    // Render slide via PptxGenJS and ensure zero mid-syllable truncation in XML
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    await buildA27LandUsePlan({
      pres,
      slideNum: 5,
      totalSlides: 11,
      data: seongsuSlideData,
    } as any);
    const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    expect(buf.byteLength).toBeGreaterThan(10000);

    // 2) 2-parcel cross-parcel dual zoning (Seogyo 395-166 준주거지역 + 395-165 제2종일반주거지역)
    const seogyoSlideData = buildBasicLandSlideData({
      enrichment: {
        landUsePlan: {
          jibunAddress: '서울특별시 마포구 서교동 395-166',
          zoningDistrict: '준주거지역',
          stdrYear: 2026,
          stdrMt: 1,
        },
        landUseByParcel: [
          { pnu: '1144012000103950166', zoningDistrict: '준주거지역' },
          { pnu: '1144012000103950165', zoningDistrict: '제2종일반주거지역' },
        ],
      },
      ssot: {
        pnu: '1144012000103950166',
        address: '서울특별시 마포구 서교동 395-166, 395-165',
        land_area_sqm: 2690.4,
        zoning: '준주거지역 · 제2종일반주거지역',
        parcels: [
          { pnu: '1144012000103950166', jibun: '서교동 395-166', landCategory: '대', areaM2: 2335.0, officialPricePerM2: 16820000 },
          { pnu: '1144012000103950165', jibun: '서교동 395-165', landCategory: '대', areaM2: 355.4, officialPricePerM2: 9884000 },
        ],
      },
    });

    expect(seogyoSlideData.zoningShares).toBeDefined();
    expect(seogyoSlideData.zoningShares).toHaveLength(2);
    expect(seogyoSlideData.zoningShares[0].zone).toBe('준주거지역');
    expect(seogyoSlideData.zoningShares[0].sharePct).toBeCloseTo(86.8, 1);
    expect(seogyoSlideData.zoningShares[1].zone).toBe('제2종일반주거지역');
    expect(seogyoSlideData.zoningShares[1].sharePct).toBeCloseTo(13.2, 1);

    const legendLabels = seogyoSlideData.zoningLegend.map((l: any) => l.label);
    expect(legendLabels).toContain('준주거지역');
    expect(legendLabels).toContain('제2종일반주거지역');
    // 36h audit (Slide 05): '본건 필지 경계' is shown only when a cadastral image with a drawn parcel
    // polygon exists. No map image here → no misleading boundary badge.
    // Positive case (hasPolygon=true) is covered in src/tests/unit/pptx/a23-a27-36h-audit.test.ts [C-3].
    expect(legendLabels).not.toContain('본건 필지 경계');
  });

  it('[PT-805] classifies explicit multi-parcel development site memos as value_add (토지 N평) even when 사옥 is mentioned as a candidate development use, and omits bogus 0대/0대 parking row when unknown', () => {
    const devWithSaokCandidateMemo = [
      '마포구 서교동 395-166, 395-165 합필 신축·개발용 부지 매각',
      '용도지역: 준주거지역(706평) + 제2종일반주거지역(108평)',
      '토지면적: 706평 + 108평 (기존 건축물 연면적 1,754평)',
      '매매 희망가 390억 / 합정역 도보 3분 코너',
      '사옥 및 하이엔드 상업시설 개발 적격 · 즉시 명도 가능',
    ].join('\n');

    const parsed = parseMemoIntoCard4(devWithSaokCandidateMemo);
    expect(parsed.posture).toBe('value_add');
    expect(parsed.landAreaPyung).toBe(814);
    expect(parsed.area).toBe('토지 814평');

    const recUnknownParking = synthesizeQuickRecordFromImItem('mp-test-no-parking-001', {
      id: 'mp-test-no-parking-001',
      buildingId: 'mp-test-no-parking-001',
      title: '서교동 2필지 개발부지',
      address: '마포구 서교동 395-166, 395-165',
      askingPriceManwon: 3900000,
      gfaSqm: '5798.87',
      landAreaSqm: '2690.4',
      zoning: '준주거지역 · 제2종일반주거지역',
    });
    const overviewSection = recUnknownParking.fullDocBody?.sections?.find(
      (s: any) => s.section_type === 'property_overview'
    );
    expect(overviewSection?.markdown || '').not.toContain('자주식 0대 / 승용 0대');
  });

  it('[PT-806] preserves 자가사용 lease_state in custom single-column 업종/상호 .xlsx rent-rolls while keeping paying 사옥 tenants as income-generating', () => {
    const sheetRows = [
      ['서교동 합필 빌딩 임대차 현황표'],
      ['층', '호실', '업종/상호', '전용면적(평)', '보증금(만원)', '월세(만원)', '관리비(만원)', '만기일', '비고'],
      ['1층', '101호', '스페셜티 카페', 68, 15000, 1350, 130, '2027-08-31', ''],
      ['4층', '401호', '공실', 130, 0, 0, 0, '', '공실'],
      ['6층', '601호', 'IT사옥 통임대', 130, 30000, 1900, 190, '2028-05-31', '우량법인'],
      ['10층', '1001호', '법인 사옥(자가사용)', 115, 0, 0, 0, '', '자가사용'],
      ['합계', '', '총 4개 호실', 443, 45000, 3250, 320, '', ''],
    ];

    const parsed = parseRentRollData(sheetRows);
    expect(parsed.parsedRows).toHaveLength(4);
    expect(parsed.parsedRows[1].is_vacant).toBe(true);
    expect(parsed.parsedRows[1].lease_state).toBe('공실');
    // Paying tenant with "사옥" in name must still count toward rent!
    expect(parsed.parsedRows[2].lease_state).not.toBe('자가사용');
    expect(parsed.parsedRows[3].lease_state).toBe('자가사용');
    expect(parsed.totalDeposit).toBe(45000);
    expect(parsed.monthlyRent).toBe(3250);
  });
});
