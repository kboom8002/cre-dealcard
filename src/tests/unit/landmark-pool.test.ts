/**
 * landmark-pool: 다중 쿼리 병합 결정성 / 재시도 / 부분 실패 비캐시 / V-World 조인 / 픽스처 리베이스 (오프라인 — fetch 주입)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildLandmarkPool,
  buildQueryPlan,
  clearLandmarkPoolMemoryCache,
  extrasFor,
  LANDMARK_POOL_PIPELINE_VERSION,
  poolCacheKey,
  rebasePoolToCenter,
  resolveLandmarkPool,
  type LandmarkPool,
} from '@/lib/external/landmark-pool';
import type { FetchLargeBuildingsResult, LargeBuilding } from '@/lib/external/vworld-building-info';

const CENTER = { lat: 37.5376702, lng: 126.8947195 };
const EMPTY_VW: FetchLargeBuildingsResult = { ok: true, buildings: [], requests: 0 };

function doc(id: string, name: string, dLat: number, dLng: number, group: string, categoryName: string, distance: number) {
  return {
    id, place_name: name,
    y: String(CENTER.lat + dLat), x: String(CENTER.lng + dLng),
    category_group_code: group, category_name: categoryName, distance: String(distance),
  };
}

const STATION = doc('s1', '테스트역 9호선', 0.001, -0.001, 'SW8', '교통,수송 > 지하철,전철 > 수도권9호선', 130);
const PARK = doc('p1', '테스트공원', 0.006, 0.005, '', '여행 > 관광,명소 > 도시근린공원', 800);
const HQ = doc('h1', '테스트홈쇼핑 본사', 0, -0.0016, '', '사무실 > 기업', 150);

/** 쿼리별 응답 — 지연 시간은 delayFor 로 조절해 '완료 순서'를 흔든다 */
function makeFetch(opts: { delayFor?: (label: string) => number; failLabels?: string[]; calls?: string[] } = {}) {
  return vi.fn(async (input: any) => {
    const u = new URL(String(input));
    const label = u.searchParams.get('category_group_code')
      ? `cat:${u.searchParams.get('category_group_code')}`
      : `kw:${u.searchParams.get('query')}`;
    opts.calls?.push(label);
    const wait = opts.delayFor?.(label) ?? 0;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (opts.failLabels?.includes(label)) return { ok: false, status: 400, json: async () => ({}) } as any;
    let documents: any[] = [];
    if (label === 'cat:SW8') documents = [STATION];
    if (label === 'kw:공원') documents = [PARK, STATION];
    if (label === 'kw:본사') documents = [HQ];
    return { ok: true, status: 200, json: async () => ({ documents }) } as any;
  });
}

const strip = (p: LandmarkPool | null) => {
  const c: any = JSON.parse(JSON.stringify(p));
  delete c.fetchedAt;
  return JSON.stringify(c);
};

let tmp: string;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));
  for (const k of ['LANDMARK_POOL_CACHE_DIR', 'LANDMARK_POOL_FIXTURE', 'LANDMARK_POOL_OFFLINE', 'OFFLINE_RENDER']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.LANDMARK_POOL_CACHE_DIR = tmp;
  clearLandmarkPoolMemoryCache();
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('쿼리 플랜', () => {
  it('고정 순서 + 포스처별 추가 쿼리군', () => {
    const base = buildQueryPlan([]).map(q => q.label);
    expect(base.slice(0, 6)).toEqual(['cat:SW8', 'cat:PO3', 'cat:HP8', 'cat:MT1', 'cat:AT4', 'cat:CT1']);
    expect(base).toContain('kw:본사');
    expect(base).toContain('kw:공원');
    expect(extrasFor('development', '오피스빌딩')).toEqual(['road']);
    expect(extrasFor('operating', '호텔')).toEqual(['tour']);
    expect(extrasFor('income', '오피스빌딩')).toEqual([]);
    expect(buildQueryPlan(['road']).map(q => q.label)).toEqual(expect.arrayContaining(['kw:나들목', 'kw:IC']));
  });
});

describe('buildLandmarkPool', () => {
  it('병합 결과는 쿼리 완료 순서와 무관 (고정 순서 병합)', async () => {
    const plan = buildQueryPlan([]).map(q => q.label);
    const forward = await buildLandmarkPool(CENTER, {
      kakaoKey: 'k', vworldFetcher: async () => EMPTY_VW,
      fetchImpl: makeFetch({ delayFor: l => plan.indexOf(l) }) as any, sleep: async () => {},
    });
    const reverse = await buildLandmarkPool(CENTER, {
      kakaoKey: 'k', vworldFetcher: async () => EMPTY_VW,
      fetchImpl: makeFetch({ delayFor: l => plan.length - plan.indexOf(l) }) as any, sleep: async () => {},
    });
    expect(forward).not.toBeNull();
    expect(strip(forward)).toBe(strip(reverse));
    // 같은 place id 는 한 번만, 정렬은 거리 asc → 이름 asc
    const names = forward!.candidates.map(c => c.name);
    expect(names.filter(n => n === '테스트역 9호선')).toHaveLength(1);
    const d = forward!.candidates.map(c => c.distanceM);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('Kakao 키가 없으면 null', async () => {
    const saved = [process.env.KAKAO_REST_API_KEY, process.env.NEXT_PUBLIC_KAKAO_APP_KEY];
    delete process.env.KAKAO_REST_API_KEY;
    delete process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
    try {
      expect(await buildLandmarkPool(CENTER, { vworldFetcher: async () => EMPTY_VW, fetchImpl: makeFetch() as any })).toBeNull();
    } finally {
      if (saved[0] !== undefined) process.env.KAKAO_REST_API_KEY = saved[0];
      if (saved[1] !== undefined) process.env.NEXT_PUBLIC_KAKAO_APP_KEY = saved[1];
    }
  });

  it('5xx 는 재시도(300ms×3^n) 후 성공, 4xx 쿼리는 failedQueries 에 기록되고 나머지는 유지', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async (input: any) => {
      const u = new URL(String(input));
      if (u.searchParams.get('category_group_code') === 'SW8' && ++n <= 2) {
        return { ok: false, status: 503, json: async () => ({}) } as any;
      }
      return makeFetch({ failLabels: ['kw:본사'] })(input);
    });
    const pool = await buildLandmarkPool(CENTER, {
      kakaoKey: 'k', vworldFetcher: async () => EMPTY_VW, fetchImpl: fetchImpl as any,
      sleep: async ms => { sleeps.push(ms); },
    });
    expect(pool!.candidates.some(c => c.name === '테스트역 9호선')).toBe(true); // SW8 재시도 성공
    expect(sleeps).toEqual([300, 900]);
    expect(pool!.diagnostics.failedQueries).toEqual(['kw:본사']);
    expect(pool!.candidates.some(c => c.name.includes('본사'))).toBe(false); // 실패한 쿼리 결과는 날조하지 않음
  });

  it('V-World 조인: 건물 폴리곤 안 POI 에 gfaSqm/buildingKey 부여, 이름 있는 대형 건물은 대장 원문 이름으로 후보화', async () => {
    const hqLat = Number(HQ.y);
    const hqLng = Number(HQ.x);
    const sq = (lat: number, lng: number, h = 0.0003) => [[[lng - h, lat - h], [lng + h, lat - h], [lng + h, lat + h], [lng - h, lat + h], [lng - h, lat - h]]] as any;
    const hqBld: LargeBuilding = {
      key: 'LT_C_BLDGINFO.100', name: '테스트센터', dongName: null, usability: '14000', floors: 30, gfaSqm: 45000,
      centroid: { lat: hqLat, lng: hqLng }, polys: [sq(hqLat, hqLng)],
    };
    const lonelyLat = CENTER.lat - 0.002;
    const lonely: LargeBuilding = {
      key: 'LT_C_BLDGINFO.200', name: '외딴타워', dongName: null, usability: '14000', floors: 25, gfaSqm: 38000,
      centroid: { lat: lonelyLat, lng: CENTER.lng }, polys: [sq(lonelyLat, CENTER.lng)],
    };
    const pool = await buildLandmarkPool(CENTER, {
      kakaoKey: 'k', fetchImpl: makeFetch() as any, sleep: async () => {},
      vworldFetcher: async () => ({ ok: true, buildings: [hqBld, lonely], requests: 1 }),
    });
    const hq = pool!.candidates.find(c => c.name === '테스트홈쇼핑 본사')!;
    expect(hq.gfaSqm).toBe(45000);
    expect(hq.buildingKey).toBe('LT_C_BLDGINFO.100');
    const own = pool!.candidates.find(c => c.registerName === '외딴타워')!;
    expect(own).toBeDefined();
    expect(own.name).toBe('외딴타워'); // 이름 날조 없음 — 건축물대장 원문
    expect(own.gfaSqm).toBe(38000);
    expect(pool!.diagnostics.vworld.ok).toBe(true);
    expect(pool!.buildings.map(b => b.key)).toEqual(['LT_C_BLDGINFO.100', 'LT_C_BLDGINFO.200']);
  });
});

describe('resolveLandmarkPool (캐시 정책)', () => {
  const run = (fetchImpl: any, vw: () => Promise<FetchLargeBuildingsResult> = async () => EMPTY_VW) =>
    resolveLandmarkPool(CENTER, { kakaoKey: 'k', fetchImpl, vworldFetcher: vw, sleep: async () => {} });
  const cacheFiles = () => fs.readdirSync(tmp);

  it('완전한 풀은 캐시(메모리+파일)되어 2번째 호출은 네트워크 없음', async () => {
    const f1 = makeFetch();
    const p1 = await run(f1);
    expect(p1).not.toBeNull();
    expect(cacheFiles()).toHaveLength(1);
    expect(cacheFiles()[0]).toContain(LANDMARK_POOL_PIPELINE_VERSION);
    const f2 = makeFetch();
    const p2 = await run(f2);
    expect(f2).not.toHaveBeenCalled();
    expect(strip(p2)).toBe(strip(p1));
    // 메모리 캐시 비운 뒤에도 파일 캐시에서 복원
    clearLandmarkPoolMemoryCache();
    const f3 = makeFetch();
    const p3 = await run(f3);
    expect(f3).not.toHaveBeenCalled();
    expect(strip(p3)).toBe(strip(p1));
  });

  it('쿼리 실패/V-World 실패가 있는 부분 풀은 캐시하지 않는다', async () => {
    const partial = await run(makeFetch({ failLabels: ['kw:공원'] }));
    expect(partial!.diagnostics.failedQueries).toContain('kw:공원');
    expect(cacheFiles()).toHaveLength(0);
    const vwDown = await run(makeFetch(), async () => ({ ok: false, buildings: [], error: 'down', requests: 3 }));
    expect(vwDown!.diagnostics.vworld.ok).toBe(false);
    expect(cacheFiles()).toHaveLength(0);
  });

  it('TTL(30일) 초과 캐시는 무시하고 재조회', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const p1 = await resolveLandmarkPool(CENTER, { kakaoKey: 'k', fetchImpl: makeFetch() as any, vworldFetcher: async () => EMPTY_VW, sleep: async () => {}, now: () => t0 });
    expect(p1).not.toBeNull();
    clearLandmarkPoolMemoryCache();
    const f = makeFetch();
    const later = new Date(t0.getTime() + 31 * 24 * 3600 * 1000);
    await resolveLandmarkPool(CENTER, { kakaoKey: 'k', fetchImpl: f as any, vworldFetcher: async () => EMPTY_VW, sleep: async () => {}, now: () => later });
    expect(f).toHaveBeenCalled();
  });

  it('캐시 키는 중심(5자리)+버전+extras 로 분리된다', () => {
    expect(poolCacheKey(CENTER, [])).not.toBe(poolCacheKey(CENTER, ['road']));
    expect(poolCacheKey(CENTER, ['tour', 'road'])).toBe(poolCacheKey(CENTER, ['road', 'tour']));
  });
});

describe('픽스처 / 오프라인', () => {
  const fixture: LandmarkPool = {
    version: LANDMARK_POOL_PIPELINE_VERSION,
    center: CENTER,
    fetchedAt: '2026-10-05T00:00:00.000Z',
    extras: [],
    candidates: [
      { name: '가나역 9호선', lat: CENTER.lat + 0.001, lng: CENTER.lng, distanceM: 111, category: 'subway' },
    ],
    buildings: [],
    diagnostics: { queries: 0, failedQueries: [], rawCount: 1, vworld: { ok: true, buildings: 0, joinedPois: 0 } },
  };

  it('주입 픽스처는 네트워크/캐시 없이 반환 (같은 중심이면 원문 거리 유지)', async () => {
    const f = makeFetch();
    const p = await resolveLandmarkPool(CENTER, { fixture, fetchImpl: f as any, kakaoKey: 'k' });
    expect(f).not.toHaveBeenCalled();
    expect(p!.candidates[0].distanceM).toBe(111);
    expect(fs.readdirSync(tmp)).toHaveLength(0);
  });

  it('중심이 25m 이상 다르면 후보 거리를 실좌표(haversine)로 재계산', () => {
    const moved = { lat: CENTER.lat + 0.002, lng: CENTER.lng };
    const rebased = rebasePoolToCenter(fixture, moved);
    expect(rebased.candidates[0].distanceM).toBe(Math.round(0.001 * 111195)); // 위도 0.001° ≈ 111m
    expect(rebased.center).toEqual(moved);
    // 25m 미만 이동은 원문 그대로
    expect(rebasePoolToCenter(fixture, { lat: CENTER.lat + 0.00005, lng: CENTER.lng })).toBe(fixture);
  });

  it('LANDMARK_POOL_OFFLINE=1 / OFFLINE_RENDER=1 이면 라이브/캐시 없이 null', async () => {
    const f = makeFetch();
    process.env.LANDMARK_POOL_OFFLINE = '1';
    expect(await resolveLandmarkPool(CENTER, { fetchImpl: f as any, kakaoKey: 'k' })).toBeNull();
    delete process.env.LANDMARK_POOL_OFFLINE;
    process.env.OFFLINE_RENDER = '1';
    expect(await resolveLandmarkPool(CENTER, { fetchImpl: f as any, kakaoKey: 'k' })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('LANDMARK_POOL_FIXTURE 환경변수 경로의 픽스처 사용', async () => {
    const file = path.join(tmp, 'fx.json');
    fs.writeFileSync(file, JSON.stringify(fixture));
    process.env.LANDMARK_POOL_FIXTURE = file;
    const f = makeFetch();
    const p = await resolveLandmarkPool(CENTER, { fetchImpl: f as any, kakaoKey: 'k' });
    expect(p!.candidates[0].name).toBe('가나역 9호선');
    expect(f).not.toHaveBeenCalled();
  });
});
