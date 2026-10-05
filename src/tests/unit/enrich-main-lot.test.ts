/**
 * enrichBuildingDataByPNU / Core — 대표지번 해석·면적 이중합산 방지·provenance 기록 (오프라인, 외부 API 목킹)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PNU_MAIN = '1156012800101170000';
const PNU_134 = '1156012800101340000';
const PNU_125 = '1156012800101250002';

const REG_117 = {
  totalArea: 2490.88, platArea: 518.7, archArea: 302.94, useAprDay: '20180912', mainPurpose: '업무시설', structure: '철근콘크리트구조',
  floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, buildingName: '선유테라피스타워', elevatorCount: 1, parkingCount: 23,
};

const h = vi.hoisted(() => ({
  cacheRow: null as any,
  registerCalls: [] as string[],
  inserted: [] as any[],
}));

vi.mock('@/lib/external/building-register-api', () => ({
  fetchBuildingRegister: vi.fn(async (_s: string, _b: string, bun: string, ji: string) => {
    h.registerCalls.push(`${bun}-${ji}`);
    return bun === '0117' ? { ...REG_117 } : null;
  }),
  fetchBuildingRecap: vi.fn(async () => null),
  fetchBuildingAttachedLots: vi.fn(async (_s: string, _b: string, bun: string) => (bun === '0117' ? [PNU_125, PNU_134] : [])),
}));
vi.mock('@/lib/external/land-price-api', () => ({ fetchLandPrice: vi.fn(async () => ({ landArea: 100, pricePerSqm: 1 })) }));
vi.mock('@/lib/external/land-use-api', () => ({ fetchLandUsePlan: vi.fn(async () => null) }));
vi.mock('@/lib/external/real-transaction-api', () => ({ fetchComparableTransactions: vi.fn(async () => []) }));
vi.mock('@/lib/external/kakao-map-api', () => ({ fetchLocationPoi: vi.fn(async () => null) }));
vi.mock('@/lib/external/registry-api', () => ({ fetchRegistryData: vi.fn(async () => null) }));
vi.mock('@/lib/external/kakao-static-map', () => ({ buildKakaoStaticMapUrl: vi.fn(() => 'https://static.map/x') }));
vi.mock('@/lib/external/semas-commercial-api', () => ({ fetchCommercialDistrictFull: vi.fn(async () => null) }));
vi.mock('@/lib/external/vworld-wms-cadastral', () => ({ fetchCadastralMapImage: vi.fn(async () => null) }));
vi.mock('@/domain/verification/address-resolver', () => ({
  geocodeAddress: vi.fn(async () => ({ lat: 37.5377, lng: 126.8947 })),
  searchAddress: vi.fn(async () => []),
  FALLBACK_DONG_MAP: {},
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.cacheRow }) }) }),
      insert: async (rows: any[]) => { h.inserted.push(...rows); return {}; },
      update: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import { enrichBuildingDataByPNU, enrichBuildingDataCore } from '@/lib/external/enrich-by-pnu';
import { resolveMainLotPnu } from '@/lib/external/main-lot-resolver';

beforeEach(() => { h.cacheRow = null; h.registerCalls.length = 0; h.inserted.length = 0; });

describe('enrichBuildingDataByPNU — 대표지번', () => {
  for (const [label, input] of [
    ['117 먼저', `${PNU_MAIN},${PNU_134},${PNU_125}`],
    ['134 먼저', `${PNU_134},${PNU_MAIN},${PNU_125}`],
    ['125-2 먼저', `${PNU_125} ${PNU_134} ${PNU_MAIN}`],
  ] as const) {
    it(`${label}: 117 대장이 buildingRegister 가 되고 건축면적/층수/건폐율/용적률/대표지번이 담긴다`, async () => {
      const r = await enrichBuildingDataByPNU(input, '서울 영등포구 양평로 116-1', 'ssot-1');
      expect(r?.resolvedAddress.pnu).toBe(PNU_MAIN);
      expect(r?.resolvedAddress.allPnus?.[0]).toBe(PNU_MAIN);
      const br: any = r?.buildingRegister;
      expect(br).toMatchObject({ totalArea: 2490.88, archArea: 302.94, floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, mainPnu: PNU_MAIN });
      expect([...br.attachedLots].sort()).toEqual([PNU_125, PNU_134].sort());
      // 캐시(=doc.enrichment.buildingRegister 로 저장될 객체)에도 동일하게 실린다
      expect(h.inserted[0].building_register).toMatchObject({ archArea: 302.94, mainPnu: PNU_MAIN });
    });
  }

  it('대지면적 이중합산 방지: 대장 platArea(518.7)에 보조필지 면적을 더하지 않는다 (이전: 783.5 류)', async () => {
    const r = await enrichBuildingDataByPNU(`${PNU_134},${PNU_MAIN},${PNU_125}`, '주소', 'ssot-2');
    expect((r?.buildingRegister as any).platArea).toBe(518.7);
    // 보조필지 개별 면적은 secondaryParcels 로 노출 (대표 117 제외 2건)
    expect(r?.secondaryParcels?.map((s) => s.pnu).sort()).toEqual([PNU_125, PNU_134].sort());
  });

  it('Core 직접 호출: 대장 platArea 가 이미 있으면 가산 금지, 없으면(0) 기존 동작 유지', async () => {
    const base = { sigunguCd: '11560', bjdongCd: '12800', bun: '0117', ji: '0000', legalDongCode: '1156012800', roadAddress: 'a', jibunAddress: 'a', lat: null, lng: null, buildingMgtNo: '', pnu: PNU_MAIN, allPnus: [PNU_MAIN, PNU_134, PNU_125] };
    const withArea = await enrichBuildingDataCore(base as any, 'a', 's', undefined, undefined, null);
    expect((withArea.buildingRegister as any).platArea).toBe(518.7);

    const { fetchBuildingRegister } = await import('@/lib/external/building-register-api');
    (fetchBuildingRegister as any).mockImplementationOnce(async () => ({ ...REG_117, platArea: 0 }));
    const noArea = await enrichBuildingDataCore(base as any, 'a', 's', undefined, undefined, null);
    expect((noArea.buildingRegister as any).platArea).toBe(200); // 보조 2필지(각 100) — 대장 값이 없을 때만 가산
  });

  it('이미 해석 단계에서 조회한 대장은 재조회하지 않는다', async () => {
    await enrichBuildingDataByPNU(`${PNU_134},${PNU_MAIN}`, '주소', 'ssot-3');
    // 해석 단계 117 1회 + 134 1회 + (secondary 134 의 register 조회 1회) — core 가 117 을 다시 조회하지 않음
    expect(h.registerCalls.filter((c) => c === '0117-0000')).toHaveLength(1);
  });

  it('모든 필지 0건·주소 폴백 불가 → 입력 첫 필지로 기존 동작 유지 (buildingRegister null, mainPnu 없음)', async () => {
    const r = await enrichBuildingDataByPNU(`${PNU_134},${PNU_125}`, '주소', 'ssot-4');
    expect(r?.resolvedAddress.pnu).toBe(PNU_134);
    expect(r?.buildingRegister).toBeNull();
  });

  it('과거 조회 실패로 빈 대장({})이 캐시돼 있으면 TTL 안에서도 대장을 재조회한다', async () => {
    h.cacheRow = {
      updated_at: new Date().toISOString(), latitude: 37.5, longitude: 126.9, pnu: PNU_134,
      building_register: {}, official_land_price: { landArea: 1 }, land_use_plan: {}, comparable_transactions: [], location_poi: {}, registry_data: {}, commercial_district: {},
    };
    const r = await enrichBuildingDataByPNU(`${PNU_134},${PNU_MAIN}`, '주소', 'ssot-5');
    expect((r?.buildingRegister as any)?.totalArea).toBe(2490.88);
    expect(r?.resolvedAddress.pnu).toBe(PNU_MAIN);
  });

  it('정상 대장이 캐시돼 있으면 그대로 캐시 히트 (대장 재조회 없음)', async () => {
    h.cacheRow = {
      updated_at: new Date().toISOString(), latitude: 37.5, longitude: 126.9, pnu: PNU_MAIN,
      building_register: { ...REG_117, mainPnu: PNU_MAIN }, official_land_price: {}, land_use_plan: {}, comparable_transactions: [], location_poi: {}, registry_data: {}, commercial_district: {},
    };
    const r = await enrichBuildingDataByPNU(PNU_MAIN, '주소', 'ssot-6');
    expect((r?.buildingRegister as any)?.archArea).toBe(302.94);
    expect(h.registerCalls).toHaveLength(0);
  });
});

describe('resolveMainLotPnu (enrich-by-pnu re-export 와 동일)', () => {
  it('export 되어 있다', async () => {
    const mod = await import('@/lib/external/enrich-by-pnu');
    expect(mod.resolveMainLotPnu).toBe(resolveMainLotPnu);
  });
});
