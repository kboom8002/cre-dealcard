import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MobileImPptxRenderer, type MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { extractSlideTexts } from '@/assurance/im-harness/golden-test-utils';

/**
 * D4 E2E(인메모리): 중개인 입력 주차/승강기가 실제 PPTX 슬라이드 텍스트에 반영되는지,
 * 건축물대장 값이 우선인지, 둘 다 없으면 '-' 인지 확인한다.
 */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function makeInput(opts: { ssotParking?: number; ssotElevator?: number; broker?: { parking_count?: number; elevator_count?: number } }): MobileImPptxInput {
  const ssot: Record<string, unknown> = {
    address: '서울특별시 강남구 역삼동 736-1', building_name: '역삼 마스터타워',
    asking_price_manwon: 1250000, total_deposit_manwon: 50000, monthly_rent_total_krw: 48000000,
    land_area_sqm: 495.8, total_gross_area_sqm: 1980.5, completion_year: 2019, zoning: '일반상업지역',
    floors: '지하 1층 / 지상 6층', floors_above: 6, floors_below: 1, vacancy_pct: 0, price_band: '125억',
  };
  if (opts.ssotParking != null) ssot.parking_count = opts.ssotParking;
  if (opts.ssotElevator != null) ssot.elevator_count = opts.ssotElevator;
  const body: Record<string, unknown> = {
    heroCard: { askingPriceDisplay: '125.0억 원', capRateBase: 4.6, posture: 'income', landAreaM2: 495.8, totalGrossAreaM2: 1980.5, zoning: '일반상업지역' },
    identity: { investmentPosture: 'income', assetType: 'nbhd_building' },
    photos: [{ url: PNG, category: 'exterior', role: 'cover', isHero: true, caption: '외관' }],
    floor_leases: [{ floor: '1F', tenant: '투썸플레이스', area_pyeong: 55, deposit_manwon: 10000, rent_manwon: 900, is_vacant: false, lease_end: '2029-08-31' }],
    ssot_summary: ssot,
    financials: { capRate: { base: 4.6, normalized: 4.8 }, annualRentKrw: 576000000, purchasePriceKrw: 12500000000 },
    coordinates: { lat: 37.498, lng: 127.028 },
    enrichment: { hasCadastralMap: false },
    preset: 'credeal_basic',
  };
  if (opts.broker) body.broker_physical_inputs = opts.broker;
  return {
    buildingId: `d4-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    preset: 'credeal_basic', posture: 'income', grade: 'B',
    doc: {
      title: '역삼 투자설명서', body,
      sections: [
        { title: '건물 개요', section_type: 'property_overview', markdown: '### 건물 기본 정보\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | 서울특별시 강남구 역삼동 736-1 |' },
        { title: '투자 하이라이트', section_type: 'investment_thesis', markdown: '### 입지\n- 테헤란로 이면 위치' },
      ],
    },
    building: { area_signal: '125억', asset_type: 'nbhd_building', price_band: '125억' },
    broker: { display_name: '김브로커', company_name: 'CREDEAL', phone: '010-1234-5678', specialty: '상업용 빌딩' },
  } as unknown as MobileImPptxInput;
}

/** '주차 / 승강기' 라벨 뒤 값 텍스트 (라벨과 같은 슬라이드 텍스트 안에서 추출) */
async function parkingLine(input: MobileImPptxInput): Promise<string | null> {
  const r = await new MobileImPptxRenderer().render(input);
  const slides = await extractSlideTexts(r.buffer);
  const all = slides.map(s => s.text).join('\n');
  const hits = all.split('\n').filter(l => /주차|승강기/.test(l));
  return hits.length ? hits.join(' | ') : null;
}

describe('D4 중개인 주차/승강기 입력 → Basic IM PPTX', () => {
  beforeAll(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  });
  afterAll(() => { vi.restoreAllMocks(); });

  it('대장 값이 없으면 중개인 입력(37대/3대)이 슬라이드에 나온다', async () => {
    const line = await parkingLine(makeInput({ broker: { parking_count: 37, elevator_count: 3 } }));
    expect(line).not.toBeNull();
    expect(line!).toMatch(/37/);
    expect(line!).toMatch(/3/);
  }, 90_000);

  it('대장 값이 있으면 대장이 우선 (14/1 표시, 중개인 37/3 미표시)', async () => {
    const line = await parkingLine(makeInput({ ssotParking: 14, ssotElevator: 1, broker: { parking_count: 37, elevator_count: 3 } }));
    expect(line).not.toBeNull();
    expect(line!).toMatch(/14/);
    expect(line!).not.toMatch(/37/);
  }, 90_000);

  it('둘 다 없으면 지어내지 않는다 (임의 대수 미표시)', async () => {
    const line = await parkingLine(makeInput({}));
    if (line) expect(line).not.toMatch(/\d+\s*대/);
  }, 90_000);
});
