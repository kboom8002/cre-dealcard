/**
 * @file land-pdf-and-zoning-share.test.ts
 * @description Priority 2B (토지이용계획확인원 PDF 파서, 복수 용도지역 폴리곤 교차 비율, K-apt 배후 세대수, A27 슬라이드 연동) 단위 테스트
 *
 * Rule 7: 모든 검증 항목은 Positive / Negative 쌍을 포함합니다.
 */

import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {
  parseLandUseConfirmPdfText,
  parseLandUseConfirmPdfBuffer,
} from '@/lib/external/land-use-pdf-parser';
import {
  polygonArea2D,
  intersectPolygons2D,
  computeZoningSharesFromPolygons,
  fetchParcelZoningShares,
} from '@/lib/external/zoning-share-wfs';
import { fetchNearbyApartmentHouseholds } from '@/lib/external/kapt-api';
import {
  buildA27LandUsePlan,
  buildBasicLandSlideData,
} from '@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan';

async function extractSlideXmlAndTexts(
  slideBuilder: (pres: PptxGenJS) => Promise<void> | void,
) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  await slideBuilder(pres);
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const texts = (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) =>
    t
      .replace(/<\/?a:t>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
  );
  return { xml, texts };
}

describe('1. 토지이용계획확인원 PDF 텍스트 파서 (land-use-pdf-parser)', () => {
  it('POSITIVE: 토지이음 확인원 원문에서 소재지·지목·면적·공시지가·3행 법령 항목 및 혼재 용도지역 비율을 정확히 추출한다', () => {
    const rawPdfText = `
토지이용계획확인서
발급번호 : 2026-0415-001928
소재지 서울특별시 영등포구 당산동5가 지번 11-47
지목 대 면적 600.0㎡
개별공시지가(원/㎡) 7,480,000원/㎡ (2026/01)

지역·지구등 지정여부
「국토의 계획 및 이용에 관한 법률」 지역·지구등
도시지역, 제3종일반주거지역, 일반상업지역, 지구단위계획구역, 도로(접함)

다른 법령 등에 따른 지역·지구등
가축사육제한구역<가축분뇨의 관리 및 이용에 관한 법률>, 대공방어협조구역<군사기지 및 군사시설 보호법>, 과밀억제권역<수도권정비계획법>

「토지이용규제 기본법 시행령」 제9조제4항 각 호에 해당되는 사항
건축선 지정구역(도로경계선으로부터 3m 후퇴), 가로구역별 최고높이 제한지역(45m 이하)

비고 : 본 필지는 제3종일반주거지역 420㎡, 일반상업지역 180㎡로 구성됨.
`;

    const parsed = parseLandUseConfirmPdfText(rawPdfText);
    expect(parsed.jibunAddress).toBe('서울특별시 영등포구 당산동5가 11-47');
    expect(parsed.jimok).toBe('대');
    expect(parsed.areaSqm).toBe(600);
    expect(parsed.officialLandPricePerSqm).toBe(7480000);
    expect(parsed.officialLandPriceBaseLabel).toBe("'26년 1월 기준");

    expect(parsed.nationalPlanItems).toEqual([
      '도시지역',
      '제3종일반주거지역',
      '일반상업지역',
      '지구단위계획구역',
      '도로(접함)',
    ]);
    expect(parsed.otherLawItems).toEqual([
      '가축사육제한구역<가축분뇨의 관리 및 이용에 관한 법률>',
      '대공방어협조구역<군사기지 및 군사시설 보호법>',
      '과밀억제권역<수도권정비계획법>',
    ]);
    expect(parsed.implementationRuleItems).toEqual([
      '건축선 지정구역(도로경계선으로부터 3m 후퇴)',
      '가로구역별 최고높이 제한지역(45m 이하)',
    ]);
    expect(parsed.zoningShares).toEqual([
      { zoneName: '제3종일반주거지역', areaSqm: 420, ratioPct: 70 },
      { zoneName: '일반상업지역', areaSqm: 180, ratioPct: 30 },
    ]);
  });

  it('NEGATIVE: 제9조제4항이 "해당없음" 또는 "-"이고 단일 용도지역인 경우 implementationRuleItems는 빈 배열이고 zoningShares는 undefined이다', async () => {
    const rawPdfText = `
토지이용계획확인원
소재지 : 서울특별시 영등포구 당산동5가 11-47
지목 : 대
면적 : 506.8 ㎡
개별공시지가 : 7,480,000원 ('26년 1월 기준)
「국토의 계획 및 이용에 관한 법률」에 따른 지역·지구등 : 도시지역, 준공업지역, 도로(접합)
다른 법령 등에 따른 지역·지구등 : 해당없음
「토지이용규제 기본법 시행령」 제9조제4항 각 호에 해당되는 사항 : 해당없음
`;

    const parsed = parseLandUseConfirmPdfText(rawPdfText);
    expect(parsed.areaSqm).toBe(506.8);
    expect(parsed.officialLandPricePerSqm).toBe(7480000);
    expect(parsed.officialLandPriceBaseLabel).toBe("'26년 1월 기준");
    expect(parsed.nationalPlanItems).toEqual(['도시지역', '준공업지역', '도로(접합)']);
    expect(parsed.otherLawItems).toEqual([]);
    expect(parsed.implementationRuleItems).toEqual([]);
    expect(parsed.zoningShares).toBeUndefined();

    const emptyBufResult = await parseLandUseConfirmPdfBuffer(Buffer.alloc(0));
    expect(emptyBufResult.implementationRuleItems).toEqual([]);
  });
});

describe('2. 복수 용도지역 2D 폴리곤 교차 및 지분율 산출기 (zoning-share-wfs)', () => {
  const parcelRect: Array<[number, number]> = [
    [0, 0],
    [100, 0],
    [100, 10],
    [0, 10],
  ];

  it('POSITIVE: 70% / 30%로 분할된 2개 용도지역 폴리곤 교차 시 제2종일반주거지역 70.0% (700㎡) / 제3종일반주거지역 30.0% (300㎡)를 정확히 산출한다', () => {
    expect(polygonArea2D(parcelRect)).toBe(1000);

    const zoneA: Array<[number, number]> = [
      [-10, -5],
      [70, -5],
      [70, 15],
      [-10, 15],
    ];
    const zoneB: Array<[number, number]> = [
      [70, -5],
      [120, -5],
      [120, 15],
      [70, 15],
    ];

    const clippedA = intersectPolygons2D(parcelRect, zoneA);
    expect(polygonArea2D(clippedA)).toBeCloseTo(700, 3);

    const shares = computeZoningSharesFromPolygons(parcelRect, [
      { zoneName: '제2종일반주거지역', ring: zoneA },
      { zoneName: '제3종일반주거지역', ring: zoneB },
    ]);

    expect(shares).toEqual([
      { zoneName: '제2종일반주거지역', areaSqm: 700, ratioPct: 70 },
      { zoneName: '제3종일반주거지역', areaSqm: 300, ratioPct: 30 },
    ]);
  });

  it('NEGATIVE / SINGLE-ZONE: 단일 용도지역이 필지 전체를 덮는 경우 100% 1건만 반환하고, fetchParcelZoningShares는 단일 용도지역에서 외부 호출 없이 []를 반환한다', async () => {
    const fullZone: Array<[number, number]> = [
      [-20, -20],
      [120, -20],
      [120, 40],
      [-20, 40],
    ];
    const singleShares = computeZoningSharesFromPolygons(parcelRect, [
      { zoneName: '준공업지역', ring: fullZone },
      { zoneName: '도시지역', ring: fullZone },
    ]);
    expect(singleShares).toEqual([
      { zoneName: '준공업지역', areaSqm: 1000, ratioPct: 100 },
    ]);

    // knownZones에 특정 용도지역이 1개뿐이면 네트워크 호출 없이 즉시 [] 반환
    const skipped = await fetchParcelZoningShares('1156011500100110047', [
      '도시지역',
      '준공업지역',
    ]);
    expect(skipped).toEqual([]);
  });
});

describe('3. K-apt 배후 공동주택 세대수 API 안전 폴백 및 A27 복수 용도지역 렌더링', () => {
  it('NEGATIVE: API 키 미설정 또는 법정동코드 누락 시 세대수를 허위 생성하지 않고 0세대(source: none)를 반환한다', async () => {
    const prevKey1 = process.env.DATA_GO_KR_API_KEY;
    const prevKey2 = process.env.PUBLIC_DATA_API_KEY;
    delete process.env.DATA_GO_KR_API_KEY;
    delete process.env.PUBLIC_DATA_API_KEY;
    try {
      const res = await fetchNearbyApartmentHouseholds({
        lat: 37.534,
        lng: 126.902,
        sigunguCd: '11560',
        bjdongCd: '11500',
      });
      expect(res).toEqual({
        totalHouseholds: 0,
        complexCount: 0,
        topComplexes: [],
        source: 'none',
      });
    } finally {
      if (prevKey1 !== undefined) process.env.DATA_GO_KR_API_KEY = prevKey1;
      if (prevKey2 !== undefined) process.env.PUBLIC_DATA_API_KEY = prevKey2;
    }
  });

  it('POSITIVE: enrichment.landUsePlan.zoningShares 폴백 및 제9조제4항 3행이 A27 슬라이드에 SAFE_BOTTOM(6.75") 이내로 렌더링된다', async () => {
    const slideData = buildBasicLandSlideData({
      enrichment: {
        landUsePlan: {
          zoningDistrict: '제2종일반주거지역',
          zoningOverlap: ['제3종일반주거지역'],
          jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
          lndcgrCodeNm: '대',
          landArea: 1000,
          pblntfPclnd: 7480000,
          stdrYear: '2026',
          stdrMt: '01',
          zoningShares: [
            { zoneName: '제2종일반주거지역', areaSqm: 700, ratioPct: 70.0 },
            { zoneName: '제3종일반주거지역', areaSqm: 300, ratioPct: 30.0 },
          ],
        },
      },
      ssot: {
        pnu: '1156011500100110047',
        land_area_sqm: 1000,
      },
      body: {
        landUseConfirm: {
          implementationRuleItems: ['건축선 지정구역(3m 후퇴)'],
        },
      },
    });

    const { xml, texts } = await extractSlideXmlAndTexts(async (pres) => {
      await buildA27LandUsePlan({
        pres,
        slideNum: 4,
        docno: 'DOC-P2B',
        grade: 'A',
        provenance: {},
        data: slideData,
      });
    });

    const joined = texts.join(' ');
    // 1) 시행령 제9조제4항 3번째 행 렌더링 확인
    expect(joined).toContain('제9조제4항');
    expect(joined).toContain('건축선 지정구역(3m 후퇴)');

    // 2) 복수 용도지역 비율 콜아웃 박스 렌더링 확인
    expect(joined).toContain('총 대지면적 1,000㎡ 중 70.0% 구성');
    expect(joined).toContain('제2종일반주거지역 70.0% / 제3종일반주거지역 30.0%');

    // 3) 다중 용도지역 범례 아이템 포함 확인
    expect(slideData.zoningLegend.map((l: any) => l.label)).toEqual([
      '제2종일반주거지역',
      '제3종일반주거지역',
      '본건 필지 경계',
    ]);

    // 4) SAFE_BOTTOM (6.75") 준수 확인
    const EMU = 914400;
    const offs = [
      ...xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g),
    ].map((m) => ({ y: +m[2] / EMU, h: +m[4] / EMU }));
    for (const o of offs.filter((o) => o.y >= 1.4 && o.y < 6.8)) {
      expect(o.y + o.h).toBeLessThanOrEqual(6.75);
    }
  });
});
