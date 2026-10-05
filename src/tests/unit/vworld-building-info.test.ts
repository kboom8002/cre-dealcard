/**
 * V-World LT_C_BLDGINFO 대형건물 조회/파싱/점-폴리곤 조인 (오프라인 — fetch 주입, 라이브 호출 없음)
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fetchLargeBuildings,
  findContainingBuilding,
  parseBuildingFeature,
  pointInPolys,
  type LargeBuilding,
} from '@/lib/external/vworld-building-info';

const SQUARE = [[[126.894, 37.537], [126.896, 37.537], [126.896, 37.539], [126.894, 37.539], [126.894, 37.537]]];
const HOLE = [[126.8948, 37.5378], [126.8952, 37.5378], [126.8952, 37.5382], [126.8948, 37.5382], [126.8948, 37.5378]];

function feature(over: Record<string, any> = {}, id = 'LT_C_BLDGINFO.1') {
  return {
    id,
    geometry: { type: 'MultiPolygon', coordinates: [SQUARE] },
    properties: { bld_nm: '테스트타워', dong_nm: '가동', usability: '14000', grnd_flr: '20', totalarea: '45419.5', ...over },
  };
}

function okRes(features: any[], total = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ response: { status: 'OK', page: { total }, result: { featureCollection: { features } } } }),
  } as any;
}

describe('parseBuildingFeature', () => {
  it('대형 비주거 건물 파싱 (연면적/층수/건물명/대표점)', () => {
    const b = parseBuildingFeature(feature())!;
    expect(b.key).toBe('LT_C_BLDGINFO.1');
    expect(b.name).toBe('테스트타워');
    expect(b.gfaSqm).toBeCloseTo(45419.5);
    expect(b.floors).toBe(20);
    expect(b.centroid.lat).toBeCloseTo(37.538, 3);
    expect(b.centroid.lng).toBeCloseTo(126.895, 3);
  });

  it('연면적 미달/주거 용도/지오메트리 없음은 null', () => {
    expect(parseBuildingFeature(feature({ totalarea: '14999' }))).toBeNull();
    expect(parseBuildingFeature(feature({ usability: '02000' }))).toBeNull();
    expect(parseBuildingFeature(feature({ usability: '01000' }))).toBeNull();
    expect(parseBuildingFeature({ ...feature(), geometry: null })).toBeNull();
  });

  it('이름 없는 동(빈 값/무명)은 name=null — 후보가 될 수 없음', () => {
    expect(parseBuildingFeature(feature({ bld_nm: '' }))!.name).toBeNull();
    expect(parseBuildingFeature(feature({ bld_nm: '무명' }))!.name).toBeNull();
  });
});

describe('pointInPolys / findContainingBuilding', () => {
  it('외곽링 안 true, 밖 false, 홀 안 false', () => {
    const polys = [[SQUARE[0], HOLE]] as any;
    expect(pointInPolys(126.8942, 37.5372, polys)).toBe(true);
    expect(pointInPolys(126.9, 37.5372, polys)).toBe(false);
    expect(pointInPolys(126.895, 37.538, polys)).toBe(false);
  });

  it('겹치는 건물은 연면적 큰 쪽 → 동률이면 key 오름차순', () => {
    const mk = (key: string, gfaSqm: number): LargeBuilding => ({
      key, name: key, dongName: null, usability: '14000', floors: 10, gfaSqm,
      centroid: { lat: 37.538, lng: 126.895 }, polys: [SQUARE] as any,
    });
    const hit = findContainingBuilding(37.538, 126.895, [mk('B', 20000), mk('A', 30000), mk('C', 30000)]);
    expect(hit?.key).toBe('A');
    expect(findContainingBuilding(37.0, 126.0, [mk('A', 30000)])).toBeNull();
  });
});

describe('fetchLargeBuildings', () => {
  it('attrFilter(totalarea>=15000)+BOX 요청, key 오름차순 결정적 정렬', async () => {
    const fetchImpl = vi.fn(async () => okRes([feature({}, 'LT_C_BLDGINFO.9'), feature({ bld_nm: '나동' }, 'LT_C_BLDGINFO.2')]));
    const r = await fetchLargeBuildings({ lat: 37.5376702, lng: 126.8947195 }, { fetchImpl: fetchImpl as any, apiKey: 'test-key', sleep: async () => {} });
    expect(r.ok).toBe(true);
    expect(r.buildings.map(b => b.key)).toEqual(['LT_C_BLDGINFO.2', 'LT_C_BLDGINFO.9']);
    const url = decodeURIComponent((fetchImpl.mock.calls[0] as any[])[0] as string);
    expect(url).toContain('data=LT_C_BLDGINFO');
    expect(url).toContain('attrFilter=totalarea:>=:15000');
    expect(url).toContain('BOX(');
  });

  it('5xx 는 재시도 후 성공, 끝까지 실패하면 ok=false (throw 하지 않음)', async () => {
    let n = 0;
    const flaky = vi.fn(async () => (++n < 3 ? ({ ok: false, status: 503, json: async () => ({}) } as any) : okRes([feature()])));
    const sleep = vi.fn(async () => {});
    const ok = await fetchLargeBuildings({ lat: 37.5, lng: 126.9 }, { fetchImpl: flaky as any, apiKey: 'k', sleep });
    expect(ok.ok).toBe(true);
    expect(ok.requests).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const dead = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as any));
    const bad = await fetchLargeBuildings({ lat: 37.5, lng: 126.9 }, { fetchImpl: dead as any, apiKey: 'k', sleep: async () => {} });
    expect(bad.ok).toBe(false);
    expect(bad.buildings).toEqual([]);
    expect(bad.error).toMatch(/500/);
  });

  it('4xx 는 재시도 없이 즉시 실패', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) } as any));
    const r = await fetchLargeBuildings({ lat: 37.5, lng: 126.9 }, { fetchImpl: fetchImpl as any, apiKey: 'k', sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
