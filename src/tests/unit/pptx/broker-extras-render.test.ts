/**
 * D4/D8 (Phase C2) — Basic IM PPTX 렌더 스모크 (오프라인)
 *  - 중개인 입력이 없으면 기본 9면 그대로
 *  - 입력이 있으면 해당 면이 추가되고 원문이 그대로 출력됨 (출처 태그 · 미검증 표기 포함)
 *  - 회피/오염 토큰 0건, 면수 ≤ maxSlides
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
} from '@/assurance/im-harness/golden-test-utils';
import { BASIC_IM_BOUNDS } from '@/domain/building/mobile-im/pptx/basic-im-contract';

const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const BROKER_EXTRAS = {
  investment_points: ['테헤란로 이면 코너 입지', '용적률 상향 가능성 검토 대상'],
  closing_line: '현장 방문은 사전 연락 후 가능합니다',
  regulatory_notes: [
    {
      kind: 'dev_restriction',
      title: '개발행위허가제한',
      detail: '제한 구역 내 위치',
      basis: '국토계획법 제63조',
      restricted_acts: '건축물 신축·증축',
      period: '2027-12-31까지',
    },
    { kind: 'district_plan', detail: '지구단위계획 구역 (건폐율 60% 이하)' },
  ],
  market_comps: [
    { kind: 'transaction', location: '인접 필지 A', price_eok: 80, land_price_per_pyeong_manwon: 10000 },
    { kind: 'transaction', location: '인접 필지 B', price_eok: 95, land_price_per_pyeong_manwon: 12000 },
    { kind: 'listing', location: '맞은편 매물', price_eok: 120, land_price_per_pyeong_manwon: 15000, note: '호가' },
  ],
  location_note: '지하철 2호선 역삼역 도보 3분 거리의 업무지구 이면',
  post_acquisition_plan: ['저층부 리모델링 후 임대료 정상화', '공실 층 우량 임차인 유치'],
};

function makeInput(extras?: Record<string, unknown>, photosV2?: any[]): MobileImPptxInput {
  const buildingId = `broker-extras-smoke-${Math.random().toString(36).slice(2, 8)}`;
  const ssot = {
    address: '서울특별시 강남구 역삼동 736-1',
    building_name: '역삼 마스터타워',
    asking_price_manwon: 1250000,
    total_deposit_manwon: 50000,
    monthly_rent_total_krw: 48000000,
    land_area_sqm: 495.8,
    total_gross_area_sqm: 1980.5,
    completion_year: 2019,
    zoning: '일반상업지역',
    floors: '지하 1층 / 지상 6층',
    floors_above: 6,
    floors_below: 1,
    parking_count: 14,
    elevator_count: 1,
    vacancy_pct: 0,
    price_band: '125억',
    building_age_years: 7,
  };
  const floor_leases = [
    { floor: '6F', tenant: '테크스타', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2028-12-31' },
    { floor: '5F', tenant: '인베스트', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-06-30' },
    { floor: '4F', tenant: '글로벌파트너스', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-10-31' },
    { floor: '3F', tenant: '디지털랩', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 800, is_vacant: false, lease_end: '2026-05-31' },
    { floor: '2F', tenant: '메디컬클리닉', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 850, is_vacant: false, lease_end: '2029-01-31' },
    { floor: '1F', tenant: '투썸플레이스', area_pyeong: 55, deposit_manwon: 10000, rent_manwon: 900, is_vacant: false, lease_end: '2029-08-31' },
  ];
  const photos = [
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'cover', isHero: true, caption: '건물 외관 전경', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'exterior', caption: '건물 정면', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'interior', caption: '실내 로비', buildingId },
  ];
  return {
    buildingId,
    preset: 'credeal_basic',
    posture: 'income',
    grade: 'B',
    doc: {
      title: `${ssot.address} 투자설명서`,
      body: {
        heroCard: {
          askingPriceDisplay: '125.0억 원',
          capRateBase: 4.6,
          noiBaseBil: 0.576,
          equityRequiredBil: 12.0,
          leveragedYieldPct: 6.4,
          posture: 'income',
          landAreaM2: ssot.land_area_sqm,
          totalGrossAreaM2: ssot.total_gross_area_sqm,
          zoning: ssot.zoning,
          keyInvestmentPoint: '강남 중심업무지구 초역세권 안정적 현금흐름 창출 자산',
        },
        identity: { investmentPosture: 'income', assetType: 'nbhd_building' },
        photos,
        ...(photosV2 ? { photos_v2: [...photos, ...photosV2] } : {}),
        floor_leases,
        ssot_summary: ssot,
        financials: {
          capRate: { base: 4.6, normalized: 4.8 },
          leveragedYield: 6.4,
          annualRentKrw: 576000000,
          purchasePriceKrw: 12500000000,
        },
        coordinates: { lat: 37.498, lng: 127.028 },
        enrichment: {
          hasCadastralMap: false,
          macroTransitImage: TINY_PNG_DATA_URI,
          locationPoi: { keySpots: ['역삼역 도보 3분', '테헤란로 업무축 인접'] },
        },
        preset: 'credeal_basic',
        keyInvestmentPoint: '강남 중심업무지구 초역세권 안정적 현금흐름 창출 자산',
        ...(extras ? { broker_extras: extras } : {}),
      },
      sections: [
        { title: '투자 하이라이트', section_type: 'investment_thesis', markdown: '### 우수한 입지 및 임대 안정성\n- 테헤란로 이면 위치\n- 전층 우량 임차인 임대 완료' },
        { title: '임대차 현황', section_type: 'lease_status', markdown: '### 층별 임대차 현황\n| 층 | 임차인 | 면적(평) | 보증금(만) | 월세(만) | 계약종료 |\n|:---|:---|---:|---:|---:|:---|\n| 1F | 스타벅스 | 50 | 10,000 | 800 | 2028-12-31 |' },
      ],
    },
  } as unknown as MobileImPptxInput;
}

describe('Basic IM — 중개인 제공 정보 렌더 스모크', () => {
  const renderer = new MobileImPptxRenderer();

  beforeAll(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404, statusText: 'Not Found' }));
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('입력 없음 → 중개인 면 없음 (기본 구성)', async () => {
    const result = await renderer.render(makeInput());
    expect(result.slideCount).toBe(9);
    const texts = (await extractSlideTexts(result.buffer)).map(s => s.text).join(' ');
    // 종료 면의 출처 범례('● 중개인입력')는 기존 요소 — 신규 면 고유 문구만 검사
    expect(texts).not.toContain('중개인 제공 · 미검증');
    expect(texts).not.toContain('투자 포인트·제안');
    expect(texts).not.toContain('인근 시세 비교');
    expect(texts).not.toContain('매입 후 전략');
  }, 60_000);

  it('투자 포인트·규제·시세 + 입지/전략 입력 → 3면 추가, 원문·출처·산식 표기', async () => {
    const base = await renderer.render(makeInput());
    const result = await renderer.render(makeInput(BROKER_EXTRAS));
    expect(result.slideCount).toBe(base.slideCount + 3);
    expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

    const slides = await extractSlideTexts(result.buffer);
    const full = slides.map(s => s.text).join(' ');

    // 원문 그대로
    for (const s of [
      '테헤란로 이면 코너 입지', '용적률 상향 가능성 검토 대상',
      '국토계획법 제63조', '건축물 신축·증축', '2027-12-31까지',
      '지구단위계획 구역', '인접 필지 A', '맞은편 매물',
      '지하철 2호선 역삼역 도보 3분', '저층부 리모델링 후 임대료 정상화',
    ]) {
      expect(full).toContain(s);
    }
    // 출처 / 미검증 / 산식 각주
    expect(full).toContain('중개인');
    expect(full).toContain('미검증');
    expect(full).toContain('매매가 ÷ 대지평수');
    expect(full).toContain('괴리율');
    expect(full).toContain('매입 후 전략');
    // 결정론 통계: 실거래 평균 11,000 (10,000·12,000), 본건 1,250,000 ÷ 150.0평
    expect(full).toContain('11,000');

    // 결함/회피/오염 토큰 0건
    for (const s of slides) {
      expect(s.xml).not.toContain('>NaN<');
      expect(s.xml).not.toContain('>undefined<');
      expect(s.xml).not.toContain('[object Object]');
    }
    await assertZeroPoisonTokens(result.buffer);
    await assertZeroEvasivePhrases(result.buffer);
  }, 90_000);

  it('도면 이미지 입력 → 규제·계획 + 도면 면 (오프라인 data URI)', async () => {
    const result = await renderer.render(makeInput(
      { regulatory_notes: BROKER_EXTRAS.regulatory_notes },
      [{ url: TINY_PNG_DATA_URI, category: 'district_plan_map', caption: '지구단위계획도' }],
    ));
    expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    const full = (await extractSlideTexts(result.buffer)).map(s => s.text).join(' ');
    expect(full).toContain('국토계획법 제63조');
    expect(full).toContain('지구단위계획·도면');
    await assertZeroPoisonTokens(result.buffer);
    await assertZeroEvasivePhrases(result.buffer);
  }, 90_000);
});
