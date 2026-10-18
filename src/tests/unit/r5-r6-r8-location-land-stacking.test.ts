/**
 * @file r5-r6-r8-location-land-stacking.test.ts
 * @description Wave 1B (R5 입지 자동 요약 & 다중 호선 병합 / R6 토지이용계획확인원 A27 / R8 스태킹 건물용도 카테고리) 단위 테스트
 *
 * Rule 7: 모든 검증 항목은 Positive / Negative 쌍을 포함합니다.
 */

import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {
  classifyLandUseAttrFields,
  synthesizeLandUseConfirmFromSnapshot,
} from '@/lib/external/land-use-api';
import {
  buildA27LandUsePlan,
  buildBasicLandSlideData,
} from '@/domain/building/mobile-im/pptx/archetypes/a27-land-use-plan';
import { mergeSubwayLinesFromSpots } from '@/domain/building/mobile-im/pptx/location-poi-selector';
import { buildBasicLocationRightData } from '@/domain/building/mobile-im/pptx/location-facts-builder';
import {
  normalizeBuildingUseCategory,
  parseBuildingRegisterFloors,
} from '@/lib/external/building-register-api';

async function extractSlideXmlAndTexts(slideBuilder: (pres: PptxGenJS) => Promise<void> | void) {
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

describe('R6: V-World getLandUseAttr 분류기 및 토지이용계획확인원 합성 (land-use-api)', () => {
  it('POSITIVE: 당산동5가 11-47 (PNU 1156011500100110047) 국계법/타법령 분류 및 교육환경보호구역(저촉) 우선 병합', () => {
    const summary = synthesizeLandUseConfirmFromSnapshot({}, { pnu: '1156011500100110047' });
    expect(summary.nationalLaw).toBe('도시지역, 준공업지역, 도로(접합)');
    expect(summary.otherLaws).toBe(
      '가축사육제한구역<가축분뇨의 관리 및 이용에 관한 법률>, 가로구역별 최고높이 제한지역<건축법>, 대공방어협조구역<군사기지 및 군사시설 보호법>, 과밀억제권역<수도권정비계획법>, (한강)폐기물매립시설 설치제한지역<한강수계 상수원수질개선 및 주민지원 등에 관한 법률>, 교육환경보호구역<교육환경 보호에 관한 법률>(저촉), 토지거래계약에관한허가구역<부동산 거래신고 등에 관한 법률>',
    );
    expect(summary.article9_4).toBeNull();
  });

  it('NEGATIVE: 지정되지않음 필드는 무시하고, 시행령 제9조제4항 미해당 시 null을 반환한다', () => {
    const summary = classifyLandUseAttrFields(
      [
        { prposAreaDstrcCode: 'UQA220', prposAreaDstrcCodeNm: '제2종일반주거지역', cnflcAtNm: '포함' },
        { prposAreaDstrcCode: 'UQA000', prposAreaDstrcCodeNm: '지정되지않음', cnflcAtNm: '포함' },
      ],
      '1111010100100010000',
      '   ',
    );
    expect(summary.nationalLaw).toBe('제2종일반주거지역');
    expect(summary.nationalLaw).not.toContain('지정되지않음');
    expect(summary.otherLaws).toBe('');
    expect(summary.article9_4).toBeNull();
  });
});

describe('R6: A27_LAND_USE_PLAN 토지이용계획확인원 슬라이드 렌더러', () => {
  const sampleEnrichment = {
    buildingRegister: {
      mainPnu: '1156011500100110047',
      platArea: 506.8,
      platPlc: '서울특별시 영등포구 당산동5가 11-47번지',
    },
    landUsePlan: {
      zoningDistrict: '준공업지역',
      roadAccess: '중로각지',
      jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
      lndcgrCodeNm: '대',
      pblntfPclnd: 7480000,
      stdrYear: '2026',
      stdrMt: '01',
    },
    landPriceHistory: {
      latestYear: 2026,
      latestPricePerSqm: 7480000,
    },
  };

  it('POSITIVE: 좌측 토지개요 4행 + 토지이용계획 2행(국계법/타법령) 및 출처가 말줄임 없이 렌더링되고 SAFE_BOTTOM(6.75") 이내에 수납된다', async () => {
    const slideData = buildBasicLandSlideData({
      enrichment: sampleEnrichment,
      ssot: { pnu: '1156011500100110047', land_area_sqm: 506.8, address: '서울 영등포구 영신로 259' },
    });
    const { xml, texts } = await extractSlideXmlAndTexts(async (pres) => {
      await buildA27LandUsePlan({
        pres,
        slideNum: 4,
        docno: 'DOC-IG1',
        grade: 'A',
        provenance: {},
        data: slideData,
      });
    });

    const joined = texts.join(' ');
    expect(joined).toContain('■ 토지개요');
    expect(joined).toContain('■ 토지이용계획');
    expect(joined).toContain('506.8㎡ (153.3평)');
    expect(joined).toContain("7,480,000원/㎡ ('26년 1월 기준)");
    expect(joined).toContain('도시지역, 준공업지역, 도로(접합)');
    expect(joined).toContain('교육환경보호구역<교육환경 보호에 관한 법률>(저촉)');
    expect(joined).toContain('출처: 토지이음 · V-World 국토교통부');
    expect(texts.some((t) => t.includes('…'))).toBe(false);

    // 단일 용도지역(준공업지역 100%)일 때는 용도지역 비율 콜아웃 박스를 렌더링하지 않는다
    expect(joined).not.toContain('총 대지면적');
    // 시행령 제9조제4항 미해당 시 3번째 행을 렌더링하지 않는다
    expect(joined).not.toContain('제9조제4항');

    const EMU = 914400;
    const offs = [...xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map(
      (m) => ({ y: +m[2] / EMU, h: +m[4] / EMU }),
    );
    for (const o of offs.filter((o) => o.y >= 1.4 && o.y < 6.8)) {
      expect(o.y + o.h).toBeLessThanOrEqual(6.75);
    }
  });

  it('NEGATIVE / CONDITIONAL: 복수 용도지역 비율(zoningShares ≥ 2)과 시행령 제9조제4항 값이 있을 때만 해당 요소가 노출된다', async () => {
    const slideData = buildBasicLandSlideData({
      enrichment: sampleEnrichment,
      ssot: { pnu: '1156011500100110047', land_area_sqm: 793 },
      existingLandData: {
        landUseConfirm: {
          pnu: '1156011500100110047',
          nationalLaw: '도시지역, 제2종일반주거지역, 일반상업지역',
          otherLaws: '과밀억제권역<수도권정비계획법>',
          article9_4: '건축선 지정구역(3m 후퇴)',
          nationalItems: [],
          otherItems: [],
          source: 'vworld_api',
        },
        zoningShares: [
          { zone: '일반상업지역', totalAreaSqm: 793, sharePct: 68.5 },
          { zone: '제2종일반주거지역', totalAreaSqm: 793, sharePct: 31.5 },
        ],
      },
    });

    const { texts } = await extractSlideXmlAndTexts(async (pres) => {
      await buildA27LandUsePlan({
        pres,
        slideNum: 4,
        docno: 'DOC-MIX',
        grade: 'A',
        provenance: {},
        data: slideData,
      });
    });

    const joined = texts.join(' ');
    expect(joined).toContain('제9조제4항');
    expect(joined).toContain('건축선 지정구역(3m 후퇴)');
    expect(joined).toContain('일반상업지역: 총 대지면적 793㎡ 중 68.5% 구성');
  });
});

describe('R5: 다중 호선 지하철 병합 및 입지 팩트 빌더 (location-poi-selector & location-facts-builder)', () => {
  const ig1Poi = {
    nearestStation: { name: '당산역', line: '9호선', distanceM: 406, walkMinutes: 5 },
    keySpots: [
      { name: '당산역 9호선', category: 'subway', distanceM: 406 },
      { name: '당산역 2호선', category: 'subway', distanceM: 493 },
      { name: '영등포구청역 2호선', category: 'subway', distanceM: 996 },
      { name: '여의하류IC', category: 'road', distanceM: 509 },
      { name: '롯데마트 맥스 영등포점', category: 'shopping', distanceM: 308 },
      { name: '당산삼성래미안4차아파트 425동', category: 'landmark', distanceM: 186 },
      { name: '당산센트럴아이파크아파트', category: 'landmark', distanceM: 295 },
    ],
    poiCounts: {
      restaurant: 191,
      cafe: 53,
      convenience: 20,
      bank: 18,
    },
  };

  it('POSITIVE: 당산역 9호선(406m) + 당산역 2호선(493m) → 당산역(2·9호선) 도보 5분 (약 406m) 단일 엔트리로 병합', () => {
    const merged = mergeSubwayLinesFromSpots(ig1Poi.nearestStation, ig1Poi.keySpots);
    expect(merged.length).toBeGreaterThanOrEqual(2);
    expect(merged[0]).toMatchObject({
      baseName: '당산역',
      lines: ['2호선', '9호선'],
      distanceM: 406,
      walkMinutes: 5,
      formattedName: '당산역(2·9호선)',
      formattedLabel: '당산역(2·9호선) 도보 5분 (약 406m)',
    });
  });

  it('POSITIVE: 우측 5행(소재지·대중교통·도로·접근성·배후·상권·주요시설)과 입지 요약 콜아웃을 실측 데이터로 생성', () => {
    const right = buildBasicLocationRightData({
      ssot: { address: '서울 영등포구 영신로 259', road_condition: '중로각지' },
      externalPoi: ig1Poi,
      landUsePlan: { roadAccess: '중로각지', jibunAddress: '서울특별시 영등포구 당산동5가 11-47' },
      brokerExtras: { location_note: '당산역 9호선 도보 5분 역세권' },
    });

    const rowMap = new Map(right.rows);
    expect(rowMap.get('대중교통')).toContain('당산역(2·9호선) 도보 5분 (약 406m)');
    expect(rowMap.get('도로·접근성')).toBe('영신로(대로변·중로각지) 접면 · 여의하류IC 약 0.5km');
    expect(rowMap.get('배후·상권')).toContain('당산삼성래미안4차·당산센트럴아이파크 등 주거단지 인접');
    expect(rowMap.get('배후·상권')).toContain('반경 500m 음식점 191·카페 53곳');
    expect(rowMap.get('주요시설')).toContain('롯데마트 맥스 영등포점 도보 4분 (약 308m)');

    // 모호한 상투 문구("주요 상업·업무 권역") 및 "입지 설명 · 중개인입력" 타이틀 미사용 검증
    expect(rowMap.get('배후·상권')).not.toContain('주요 상업·업무 권역');
    expect(right.callout?.title).toBe('입지 요약');
    expect(right.callout?.body).toContain('당산역(2·9호선)');
    expect(right.warnings.some((w) => w.includes('[LOC-MISMATCH]'))).toBe(true);
  });

  it('NEGATIVE: 출구·주차장·선착장 등 비역사 스팟은 지하철 노선 병합에서 제외한다', () => {
    const merged = mergeSubwayLinesFromSpots(null, [
      { name: '당산역 2번출구', category: 'subway', distanceM: 350 },
      { name: '당산역공영주차장', category: 'subway', distanceM: 380 },
    ]);
    expect(merged).toEqual([]);
  });

  it('POSITIVE & NEGATIVE: 배후 공동주택 세대수(당산삼성래미안 1,391세대 등 4,407세대)·간선도로(올림픽대로·국회대로) 반영 및 밧데리아울렛/고가차도진입로 노이즈 제외', () => {
    const right = buildBasicLocationRightData({
      ssot: { address: '서울 영등포구 영신로 259', road_condition: '중로각지' },
      externalPoi: {
        ...ig1Poi,
        candidateSpots: [
          { name: '밧데리아울렛 영등포점', category: 'shopping', distanceM: 120 },
          { name: '영등포로터리고가차도진입로', category: 'road', distanceM: 300 },
          { name: '롯데마트 맥스 영등포점', category: 'shopping', distanceM: 308 },
        ],
      },
      apartmentHouseholds: {
        totalHouseholds: 4407,
        complexCount: 7,
        topComplexes: [
          { name: '당산 삼성 래미안', households: 1391 },
          { name: '당산센트럴아이파크', households: 802 },
        ],
      },
      landUsePlan: { roadAccess: '중로각지', jibunAddress: '서울특별시 영등포구 당산동5가 11-47' },
      brokerExtras: {
        location_note: '당산역(2·9호선) 도보 5분, 배후 아파트 밀집, 국회대로·올림픽대로 접근 용이',
      },
    });

    const rowMap = new Map(right.rows);
    expect(rowMap.get('도로·접근성')).toBe(
      '영신로(대로변·중로각지) 접면 · 올림픽대로·국회대로 진입 용이 · 여의하류IC 약 0.5km',
    );
    expect(rowMap.get('배후·상권')).toContain(
      '당산삼성래미안(1,391세대) 등 반경 1km 아파트 4,407세대 (7개 단지)',
    );
    expect(rowMap.get('주요시설')).toContain('롯데마트 맥스 영등포점');
    expect(rowMap.get('주요시설')).not.toContain('밧데리아울렛');
    expect(right.callout?.body).toContain('올림픽대로·국회대로 진입 용이');
    expect(right.callout?.body).toContain('롯데마트 맥스 영등포점 등 생활편의 인접');
    expect(right.callout?.body).not.toContain('밧데리아울렛');
    expect(right.callout?.body).not.toContain('고가차도진입로');
  });
});

describe('R8: 건축물대장 층별개요 파서 및 건물용도 카테고리 정규화 (building-register-api)', () => {
  it('POSITIVE: getBrFlrOulnInfo 응답을 층별개요로 파싱하고 B1~5F 전 층을 근린생활로 정규화한다', () => {
    const rawItems = [
      { mainAtchGbCd: '0', flrGbCd: '10', flrGbCdNm: '지하', flrNo: 1, flrNoNm: '지하1층', mainPurpsCdNm: '일반음식점', etcPurps: '제2종근린생활시설(일반음식점)', area: 229.97 },
      { mainAtchGbCd: '0', flrGbCd: '20', flrGbCdNm: '지상', flrNo: 1, flrNoNm: '1층', mainPurpsCdNm: '소매점', etcPurps: '제1종근린생활시설(소매점,휴게음식점)', area: 194.28 },
      { mainAtchGbCd: '0', flrGbCd: '20', flrGbCdNm: '지상', flrNo: 2, flrNoNm: '2층', mainPurpsCdNm: '의원', etcPurps: '제1종근린생활시설(의원)', area: 252.09 },
      { mainAtchGbCd: '0', flrGbCd: '20', flrGbCdNm: '지상', flrNo: 4, flrNoNm: '4층', mainPurpsCdNm: '사무소', etcPurps: '제2종근린생활시설(사무실)', area: 252.09 },
      { mainAtchGbCd: '0', flrGbCd: '20', flrGbCdNm: '지상', flrNo: 5, flrNoNm: '5층', mainPurpsCdNm: '학원', etcPurps: '제2종근린생활시설(학원)', area: 252.09 },
    ];
    const floors = parseBuildingRegisterFloors(rawItems);
    expect(floors).toHaveLength(5);
    for (const flr of floors) {
      expect(normalizeBuildingUseCategory(flr.etcPurpose || flr.mainPurpose, '제2종근린생활시설')).toBe('근린생활');
    }
  });

  it('NEGATIVE: 업무시설·교육연구시설·주차장 등은 근린생활로 오분류하지 않고 각 고유 카테고리로 분류한다', () => {
    expect(normalizeBuildingUseCategory('일반업무시설', '업무시설')).toBe('업무');
    expect(normalizeBuildingUseCategory('회계법인', '업무시설')).toBe('업무');
    expect(normalizeBuildingUseCategory('교육연구시설')).toBe('교육');
    expect(normalizeBuildingUseCategory('주차장')).toBe('공용/주차');
    expect(normalizeBuildingUseCategory('종합병원', '의료시설')).toBe('의료');
  });
});
