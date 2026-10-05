/**
 * 건축물대장 조회 보완 (이슈 3) — 오프라인 테스트.
 * 응답 픽스처는 2026-10 p5(양평동4가 117, 선유테라피스타워) 실 API 응답에서 캡처한 값이다.
 * 선택 라이브 검증: LIVE_EXTERNAL=1 (read-only 공공데이터 조회, LLM 호출 없음)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchBuildingRegister, fetchBuildingAttachedLots } from '@/lib/external/building-register-api';
import { normalizeBuildingRegister } from '@/lib/external/building-register-normalize';
import { resolveMainLotPnu } from '@/lib/external/main-lot-resolver';
import { resolveOverviewSpecs } from '@/domain/building/mobile-im/pptx/spec-resolver';
import { extractSummaryFacts } from '@/domain/building/mobile-im/pptx/summary-highlights';

const PNU_MAIN = '1156012800101170000'; // 117
const PNU_ATCH_134 = '1156012800101340000'; // 134-0
const PNU_ATCH_125 = '1156012800101250002'; // 125-2

/** 실측 표제부 (117) — 필요한 필드만 */
const TITLE_117 = {
  rnum: 1, platPlc: '서울특별시 영등포구 양평동4가 117번지', sigunguCd: '11560', bjdongCd: '12800', platGbCd: '0', bun: '0117', ji: '0000',
  mainAtchGbCd: '0', mainAtchGbCdNm: '주건축물', bldNm: '선유테라피스타워',
  platArea: 518.7, archArea: 302.94, bcRat: 58.4, totArea: 2490.88, vlRat: 398.8,
  strctCdNm: '철근콘크리트구조', mainPurpsCdNm: '업무시설',
  grndFlrCnt: 10, ugrndFlrCnt: 1, rideUseElvtCnt: 1, emgenUseElvtCnt: 0,
  indrMechUtcnt: 22, oudrMechUtcnt: 0, indrAutoUtcnt: 0, oudrAutoUtcnt: 1, useAprDay: '20180912',
};
const ATCH_117 = [
  { atchSigunguCd: '11560', atchBjdongCd: '12800', atchPlatGbCd: '0', atchBun: '0125', atchJi: '0002' },
  { atchSigunguCd: '11560', atchBjdongCd: '12800', atchPlatGbCd: '0', atchBun: '0134', atchJi: '0000' },
];

const envelope = (items: unknown[]) => ({
  response: { header: { resultCode: '00' }, body: { items: items.length ? { item: items.length === 1 ? items[0] : items } : '', totalCount: items.length } },
});

/** getBrTitleInfo/getBrAtchJibunInfo 를 bun-ji 로 분기하는 가짜 fetch (실 API 동작 재현: 117만 응답, 134/125-2 는 0건) */
function installFetch(titleByBunJi: Record<string, unknown[]> = { '0117-0000': [TITLE_117] }, atchByBunJi: Record<string, unknown[]> = { '0117-0000': ATCH_117 }) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: any) => {
    const url = String(input);
    const op = /\/(getBr\w+)\?/.exec(url)?.[1] ?? '';
    const bun = /[?&]bun=(\d+)/.exec(url)?.[1] ?? '';
    const ji = /[?&]ji=(\d+)/.exec(url)?.[1] ?? '';
    calls.push(`${op}:${bun}-${ji}`);
    const table = op === 'getBrTitleInfo' ? titleByBunJi : op === 'getBrAtchJibunInfo' ? atchByBunJi : {};
    return new Response(JSON.stringify(envelope(table[`${bun}-${ji}`] ?? [])), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

const REAL_DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY; // LIVE_EXTERNAL=1 용 (오프라인 테스트는 'test-key' 사용)
beforeEach(() => { process.env.DATA_GO_KR_API_KEY = 'test-key'; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchBuildingRegister — 표제부 매핑', () => {
  it('archArea/층수/건폐율/용적률/승강기/주차를 반환 (실측 117)', async () => {
    installFetch();
    const br = await fetchBuildingRegister('11560', '12800', '0117', '0000', undefined, '0');
    expect(br).toMatchObject({
      totalArea: 2490.88, platArea: 518.7, archArea: 302.94,
      floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8,
      useAprDay: '20180912', mainPurpose: '업무시설', structure: '철근콘크리트구조', buildingName: '선유테라피스타워',
      elevatorCount: 1, passengerElevatorCount: 1, parkingCount: 23, selfParkingCount: 1, mechanicalParkingCount: 22,
    });
    expect(br).not.toHaveProperty('emergencyElevatorCount'); // 0 → 키 없음
  });

  it('archArea 가 0/NaN/없음이면 키 자체가 없다 (0 을 사실처럼 내보내지 않음)', async () => {
    for (const bad of [0, '0', '', 'abc', undefined]) {
      installFetch({ '0117-0000': [{ ...TITLE_117, archArea: bad, rideUseElvtCnt: 0, indrMechUtcnt: 0, oudrAutoUtcnt: 0 }] });
      const br = await fetchBuildingRegister('11560', '12800', '0117', '0000', undefined, '0');
      expect(br).not.toBeNull();
      expect(br).not.toHaveProperty('archArea');
      expect(br).not.toHaveProperty('elevatorCount');
      expect(br).not.toHaveProperty('parkingCount');
    }
  });

  it('다동 필지: 주건축물 중 비주거·연면적 최대 동을 선택', async () => {
    const attach = { ...TITLE_117, mainAtchGbCd: '1', mainAtchGbCdNm: '부속건축물', totArea: 9999, archArea: 1 };
    const apt = { ...TITLE_117, mainPurpsCdNm: '공동주택', totArea: 5000, archArea: 2 };
    const small = { ...TITLE_117, mainPurpsCdNm: '근린생활시설', totArea: 800, archArea: 3 };
    installFetch({ '0117-0000': [attach, apt, TITLE_117, small] });
    const br = await fetchBuildingRegister('11560', '12800', '0117', '0000', undefined, '0');
    expect(br?.totalArea).toBe(2490.88); // 부속(9999)·주거(5000) 제외, 비주거 최대
    expect(br?.archArea).toBe(302.94);
  });

  it('표제부 0건 → null (부속지번 134)', async () => {
    installFetch();
    expect(await fetchBuildingRegister('11560', '12800', '0134', '0000', undefined, '0')).toBeNull();
  });
});

describe('fetchBuildingAttachedLots', () => {
  it('대표지번(117)의 부속지번을 19자리 PNU 로 반환, 부속지번으로 역조회하면 []', async () => {
    installFetch();
    expect(await fetchBuildingAttachedLots('11560', '12800', '0117', '0000', '0')).toEqual([PNU_ATCH_125, PNU_ATCH_134]);
    expect(await fetchBuildingAttachedLots('11560', '12800', '0134', '0000', '0')).toEqual([]);
  });
});

describe('normalizeBuildingRegister — 별칭 흡수', () => {
  it('래퍼 canonical 형태는 그대로', () => {
    const n = normalizeBuildingRegister({ totalArea: 2490.88, platArea: 518.7, archArea: 302.94, floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, useAprDay: '20180912', mainPurpose: '업무시설', structure: 'RC', buildingName: 'X' });
    expect(n).toEqual({ totalArea: 2490.88, platArea: 518.7, archArea: 302.94, floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, useAprDay: '20180912', mainPurpose: '업무시설', structure: 'RC', buildingName: 'X' });
  });
  it('원시 API 키(grndFlrCnt/ugrndFlrCnt/totArea/…)', () => {
    const n = normalizeBuildingRegister({ grndFlrCnt: '10', ugrndFlrCnt: 1, totArea: '2,490.88', bcRat: '58.4', vlRat: 398.8, useAprDay: '20180912', mainPurpsCdNm: '업무시설', strctCdNm: 'RC', bldNm: 'Y', rideUseElvtCnt: 1, emgenUseElvtCnt: 1, indrAutoUtcnt: 2, oudrAutoUtcnt: 1, indrMechUtcnt: 3 });
    expect(n).toMatchObject({ floorsAbove: 10, floorsBelow: 1, totalArea: 2490.88, bcRat: 58.4, vlRat: 398.8, useAprDay: '20180912', mainPurpose: '업무시설', structure: 'RC', buildingName: 'Y', elevatorCount: 2, parkingCount: 6 });
  });
  it('렌더러/요약/핸들러 별칭(groundFloors/undergroundFloors/bcrPct/farPct/approvalDate)', () => {
    const n = normalizeBuildingRegister({ groundFloors: 7, undergroundFloors: 2, bcrPct: 49.5, farPct: 248, approvalDate: '20010203' });
    expect(n).toEqual({ floorsAbove: 7, floorsBelow: 2, bcRat: 49.5, vlRat: 248, useAprDay: '20010203' });
  });
  it('canonical 이 있으면 별칭보다 우선', () => {
    expect(normalizeBuildingRegister({ floorsAbove: 10, grndFlrCnt: 3, groundFloors: 4 }).floorsAbove).toBe(10);
  });
  it('0/NaN/빈 문자열/미기재 플레이스홀더/null 입력은 undefined(키 없음)', () => {
    expect(normalizeBuildingRegister({ totalArea: 0, platArea: NaN, archArea: '0', floorsAbove: 0, floorsBelow: 0, bcRat: '', vlRat: null, useAprDay: '', mainPurpose: '[용도 미기재]', structure: '[구조 미기재]', buildingName: ' ' })).toEqual({});
    expect(normalizeBuildingRegister(null)).toEqual({});
    expect(normalizeBuildingRegister(undefined)).toEqual({});
    expect(normalizeBuildingRegister('x')).toEqual({});
  });
});

describe('소비처가 별칭 체계와 무관하게 같은 값을 읽는다', () => {
  const canonical = { floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, useAprDay: '20180912', archArea: 302.94, totalArea: 2490.88, platArea: 518.7, mainPurpose: '업무시설', structure: 'RC' };
  const aliased = { grndFlrCnt: 10, ugrndFlrCnt: 1, bcrPct: 58.4, farPct: 398.8, approvalDate: '20180912', archArea: 302.94, totArea: 2490.88, platArea: 518.7, mainPurpsCdNm: '업무시설', strctCdNm: 'RC' };
  it('resolveOverviewSpecs: 지상10/지하1/58.4/398.8/2018.09.12/건축면적 302.94', () => {
    for (const reg of [canonical, aliased]) {
      const s = resolveOverviewSpecs({ buildingRegister: reg }, {}, {}, undefined, { nowYear: 2026 });
      expect(s).toMatchObject({ floorsAbove: 10, floorsBelow: 1, bcrNow: 58.4, farNow: 398.8, useAprDay: '2018.09.12', archArea: 302.94, mainPurpose: '업무시설', structure: 'RC' });
    }
  });
  it('resolveOverviewSpecs: 대장이 지하 0층이면 ssot 값으로 덮지 않는다', () => {
    const s = resolveOverviewSpecs({ buildingRegister: { ...canonical, floorsBelow: 0 } }, { floors_below: 3 }, {}, undefined, {});
    expect(s.floorsBelow).toBeUndefined();
    // 대장 키가 아예 없으면 ssot 폴백
    expect(resolveOverviewSpecs({ buildingRegister: {} }, { floors_below: 3 }, {}, undefined, {}).floorsBelow).toBe(3);
  });
  it('extractSummaryFacts: 층수/연면적/대지/용적률/준공연도', () => {
    for (const reg of [canonical, aliased]) {
      const f = extractSummaryFacts({ body: { enrichment: { buildingRegister: reg } }, posture: 'income' } as any);
      expect(f).toMatchObject({ floorsAbove: 10, floorsBelow: 1, gfaSqm: 2490.88, landSqm: 518.7, farPct: 398.8, completionYear: 2018 });
    }
  });
});

describe('resolveMainLotPnu — 대표지번 해석 (실 API 동작 재현)', () => {
  const addressToPnu = vi.fn(async (_a: string) => PNU_MAIN as string | null);
  beforeEach(() => addressToPnu.mockClear());

  const orders: [string, string[]][] = [
    ['117 먼저', [PNU_MAIN, PNU_ATCH_134, PNU_ATCH_125]],
    ['134 먼저', [PNU_ATCH_134, PNU_MAIN, PNU_ATCH_125]],
    ['125-2 먼저, 117 마지막', [PNU_ATCH_125, PNU_ATCH_134, PNU_MAIN]],
  ];
  for (const [label, order] of orders) {
    it(`입력 순서 무관: ${label} → 117 대장`, async () => {
      installFetch();
      const r = await resolveMainLotPnu(order, undefined, { addressToPnu });
      expect(r?.mainPnu).toBe(PNU_MAIN);
      expect(r?.source).toBe('register_title');
      expect(r?.orderedPnus[0]).toBe(PNU_MAIN);
      expect([...(r?.orderedPnus ?? [])].sort()).toEqual([...order].sort());
      expect(r?.register.totalArea).toBe(2490.88);
      expect(r?.register.archArea).toBe(302.94);
      expect(r?.attachedLots.sort()).toEqual([PNU_ATCH_125, PNU_ATCH_134].sort());
      expect(r?.attachedInInput.sort()).toEqual(order.filter((p) => p !== PNU_MAIN).sort());
      expect(addressToPnu).not.toHaveBeenCalled(); // 표제부로 찾았으면 주소 폴백 불필요
    });
  }

  it('동시 조회는 최대 3건', async () => {
    let inflight = 0; let peak = 0;
    const fetchRegister = vi.fn(async () => { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 5)); inflight--; return null; });
    const many = Array.from({ length: 9 }, (_, i) => `115601280010${String(100 + i).padStart(3, '0')}0000`);
    await resolveMainLotPnu(many, undefined, { fetchRegister: fetchRegister as any, fetchAttachedLots: async () => [], addressToPnu: async () => null });
    expect(fetchRegister).toHaveBeenCalledTimes(9);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('전 필지 0건 + 도로명주소 폴백으로 대표지번 발견 (road_address)', async () => {
    installFetch();
    const r = await resolveMainLotPnu([PNU_ATCH_134, PNU_ATCH_125], '서울 영등포구 양평로 116-1 외 2필지', { addressToPnu });
    expect(addressToPnu).toHaveBeenCalledWith('서울 영등포구 양평로 116-1');
    expect(r?.mainPnu).toBe(PNU_MAIN);
    expect(r?.source).toBe('road_address');
    expect(r?.orderedPnus).toEqual([PNU_MAIN, PNU_ATCH_134, PNU_ATCH_125]);
  });

  it('전 필지 0건 + 폴백도 실패 → null (날조 금지)', async () => {
    installFetch({}, {});
    expect(await resolveMainLotPnu([PNU_ATCH_134, PNU_ATCH_125], undefined, { addressToPnu })).toBeNull();
    expect(await resolveMainLotPnu([PNU_ATCH_134], '서울 영등포구 양평로 116-1', { addressToPnu: async () => null })).toBeNull();
    expect(await resolveMainLotPnu([PNU_ATCH_134], '서울 영등포구 양평로 116-1', { addressToPnu: async () => { throw new Error('boom'); } })).toBeNull();
    expect(await resolveMainLotPnu([], undefined)).toBeNull();
  });

  it('API 오류(throw)는 해당 필지만 건너뛰고 다음 필지로 진행', async () => {
    const fetchRegister = vi.fn(async (_s: string, _b: string, bun: string) => {
      if (bun === '0134') throw new Error('socket');
      return bun === '0117' ? ({ totalArea: 1, platArea: 1 } as any) : null;
    });
    const r = await resolveMainLotPnu([PNU_ATCH_134, PNU_MAIN], undefined, { fetchRegister: fetchRegister as any, fetchAttachedLots: async () => [], addressToPnu: async () => null });
    expect(r?.mainPnu).toBe(PNU_MAIN);
  });
});

// ─── 선택 라이브 검증 (read-only) ───
describe.skipIf(!process.env.LIVE_EXTERNAL)('LIVE: p5 대표지번 (공공데이터 실조회)', () => {
  it('어떤 순서로 넣어도 117 대장', async () => {
    vi.unstubAllGlobals();
    process.env.DATA_GO_KR_API_KEY = REAL_DATA_GO_KR_KEY || '';
    for (const order of [[PNU_MAIN, PNU_ATCH_134, PNU_ATCH_125], [PNU_ATCH_134, PNU_MAIN, PNU_ATCH_125], [PNU_ATCH_125, PNU_ATCH_134, PNU_MAIN]]) {
      const r = await resolveMainLotPnu(order, undefined, { addressToPnu: async () => null });
      expect(r?.mainPnu).toBe(PNU_MAIN);
      expect(r?.register).toMatchObject({ floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, archArea: 302.94 });
    }
  }, 60_000);

  it('도로명주소 폴백(카카오 주소검색): 부속지번만 넣어도 양평로 116-1 → 지번 117 → 대표지번', async () => {
    vi.unstubAllGlobals();
    process.env.DATA_GO_KR_API_KEY = REAL_DATA_GO_KR_KEY || '';
    const prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production'; // searchAddress 는 test 환경에서 [] 를 반환하므로 라이브 검증 동안만 해제
    try {
      const r = await resolveMainLotPnu([PNU_ATCH_134, PNU_ATCH_125], '서울 영등포구 양평로 116-1');
      expect(r?.mainPnu).toBe(PNU_MAIN);
      expect(r?.source).toBe('road_address');
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  }, 60_000);
});
