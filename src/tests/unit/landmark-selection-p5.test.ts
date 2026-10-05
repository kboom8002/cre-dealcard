/**
 * P5(양평동 income) 실조회 풀 픽스처 기반 오프라인 랜드마크 선별 + 뷰 정책 테스트
 * - 픽스처: docs/golden-test-data/p5-yangpyeong-income/poi-pool.json (라이브 캡처 원문, 수정 금지)
 * - LLM/네트워크 미사용
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  bearingDeg,
  classifyPoi,
  directionKo,
  formatOffViewLabel,
  haversineM,
  selectLocationPois,
  type PoiCandidate,
} from '@/domain/building/mobile-im/pptx/location-poi-selector';
import {
  ANCHOR_LANDMARK_MAX_M,
  EDGE_INSET_PX,
  MIN_LOCATION_ZOOM,
  TARGET_PIN,
  POI_MARKER_R,
  chooseLocationZoom,
  edgeAnchorPoint,
  placeEdgeMarkers,
} from '@/domain/building/mobile-im/pptx/utils/location-map-overlay';
import type { LandmarkPool } from '@/lib/external/landmark-pool';

const FIXTURE = path.resolve(process.cwd(), 'docs/golden-test-data/p5-yangpyeong-income/poi-pool.json');
let pool: LandmarkPool;
beforeAll(() => {
  pool = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
});

const select = (cands: PoiCandidate[] = pool.candidates, posture = 'income', assetType = '오피스빌딩') =>
  selectLocationPois(cands, { posture, assetType, center: pool.center });

// 2단계 뷰 정책에서 노이즈로 취급되는 이름 (주차장/모텔/통신판매 등) — 선별 결과에 나오면 안 됨
const NOISE = /주차장|모텔|통신판매|편의점|부동산|세탁|미용|약국|학원|카페|식당|GS25|CU$/;

describe('P5 픽스처 선별 (income/오피스빌딩)', () => {
  it('픽스처 무결성: 라이브 캡처 풀(147건, 쿼리 실패 0, V-World 정상)', () => {
    expect(pool.version).toBe('lp-v1');
    expect(pool.candidates.length).toBeGreaterThan(100);
    expect(pool.diagnostics.failedQueries).toEqual([]);
    expect(pool.diagnostics.vworld.ok).toBe(true);
    expect(pool.center.lat).toBeCloseTo(37.5376702, 6);
  });

  it('주요 랜드마크 3종을 모두 선별: 롯데 본사(HQ) + 선유도공원 + 지하철역(1번)', () => {
    const sel = select();
    expect(sel.length).toBeGreaterThanOrEqual(4);
    expect(sel.length).toBeLessThanOrEqual(5);
    expect(sel[0].kind).toBe('station');
    expect(sel[0].name).toMatch(/선유도역/);
    expect(sel.some(s => /롯데홈쇼핑|롯데웰푸드/.test(s.name))).toBe(true);
    expect(sel.some(s => /선유도공원|양화한강공원/.test(s.name))).toBe(true);
    expect(sel.map(s => s.index)).toEqual(sel.map((_, i) => i + 1));
  });

  it('앵커 테넌트: 같은 건물 다중 롯데 입주사 중 최다 POI 보유 브랜드(롯데홈쇼핑)가 대표', () => {
    const hq = select().find(s => s.poiClass === 'corporate_hq')!;
    expect(hq.name).toContain('롯데홈쇼핑');
    expect(hq.gfaSqm).toBeGreaterThanOrEqual(15000);
  });

  it('노이즈(주차장/모텔/통신판매 등)는 선별되지 않고 같은 건물(buildingKey) 중복도 없음', () => {
    const sel = select();
    for (const s of sel) expect(s.name).not.toMatch(NOISE);
    const keys = sel
      .map(s => pool.candidates.find(c => c.name === s.name && c.lat === s.lat && c.lng === s.lng)?.buildingKey)
      .filter((k): k is string => !!k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('속성: 선별된 이름은 전부 풀 원문에 존재하고 거리는 풀의 distanceM 그대로 (날조/재계산 없음, Rule 34)', () => {
    for (const posture of ['income', 'trading', 'owner_occupied', 'development', 'operating']) {
      for (const s of select(pool.candidates, posture)) {
        const src = pool.candidates.find(c => c.name === s.name && c.lat === s.lat && c.lng === s.lng);
        expect(src, `${posture}: ${s.name}`).toBeDefined();
        expect(s.distanceM).toBe(src!.distanceM);
      }
    }
  });

  it('방위/거리 필드: direction 은 실제 방위각의 8방위, 라벨 거리는 풀 거리', () => {
    for (const s of select()) {
      const b = bearingDeg(pool.center.lat, pool.center.lng, s.lat, s.lng);
      expect(s.direction).toBe(directionKo(b));
      expect(s.bearingDeg).toBeCloseTo(b, 0);
    }
  });

  it('결정성: 입력 순서를 섞어도(5가지 셔플) 결과가 동일', () => {
    const base = JSON.stringify(select());
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let t = 0; t < 5; t++) {
      const shuffled = [...pool.candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(JSON.stringify(select(shuffled))).toBe(base);
    }
    expect(JSON.stringify(select())).toBe(base);
  });

  it('다양성: 클래스당 1개 우선 (같은 클래스가 상위를 독점하지 않음)', () => {
    const classes = select().map(s => s.poiClass);
    const counts = classes.reduce<Record<string, number>>((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(3);
  });
});

describe('방위/거리 유틸', () => {
  it('bearingDeg: 정북/동/남/서', () => {
    expect(bearingDeg(37, 127, 38, 127)).toBeCloseTo(0, 3);
    expect(bearingDeg(37, 127, 37, 128)).toBeGreaterThan(89);
    expect(bearingDeg(37, 127, 37, 128)).toBeLessThan(91);
    expect(bearingDeg(37, 127, 36, 127)).toBeCloseTo(180, 3);
    expect(bearingDeg(37, 127, 37, 126)).toBeGreaterThan(269);
    expect(bearingDeg(37, 127, 37, 126)).toBeLessThan(271);
  });

  it('directionKo: 8방위 경계 (22.5°는 북동, 337.5°는 북)', () => {
    expect(directionKo(0)).toBe('북');
    expect(directionKo(22.4)).toBe('북');
    expect(directionKo(22.5)).toBe('북동');
    expect(directionKo(45)).toBe('북동');
    expect(directionKo(90)).toBe('동');
    expect(directionKo(135)).toBe('남동');
    expect(directionKo(180)).toBe('남');
    expect(directionKo(225)).toBe('남서');
    expect(directionKo(270)).toBe('서');
    expect(directionKo(315)).toBe('북서');
    expect(directionKo(337.4)).toBe('북서');
    expect(directionKo(337.5)).toBe('북');
    expect(directionKo(359.9)).toBe('북');
    expect(directionKo(-10)).toBe('북');
    expect(directionKo(370)).toBe('북');
  });

  it('formatOffViewLabel: "이름 방위 N.Nkm"', () => {
    expect(formatOffViewLabel('선유도공원', '북동', 806)).toBe('선유도공원 북동 0.8km');
    expect(formatOffViewLabel('당산역(2·9호선)', '남동', 767)).toBe('당산역(2·9호선) 남동 0.8km');
  });

  it('haversine: 위도 0.001° ≈ 111m', () => {
    expect(Math.round(haversineM(37, 127, 37.001, 127))).toBeGreaterThanOrEqual(110);
    expect(Math.round(haversineM(37, 127, 37.001, 127))).toBeLessThanOrEqual(112);
  });
});

describe('뷰 정책: 줌', () => {
  const W = 1120;
  const H = 900;
  it('extraTargets 없으면 기존 동작 (요청 배율 유지)', () => {
    expect(chooseLocationZoom(1.5, W, H)).toBe(1.5);
    expect(chooseLocationZoom(1.5, W, H, null, 48, [])).toBe(1.5);
  });

  it('앵커가 1.0 이상 배율에서 뷰에 들어오면 그 배율까지만 낮춘다', () => {
    const z = chooseLocationZoom(1.5, W, H, null, 48, [{ dxM: 400, dyM: 0 }]);
    expect(z).toBeCloseTo((W / 2 - 48) / 400, 5); // 1.28
    expect(z).toBeLessThan(1.5);
    expect(z).toBeGreaterThanOrEqual(MIN_LOCATION_ZOOM);
  });

  it('1.0 으로도 못 들어오는 앵커는 줌 결정에서 무시 (가장자리 마커로 표시)', () => {
    expect(chooseLocationZoom(1.5, W, H, null, 48, [{ dxM: 450, dyM: 668 }])).toBe(1.5); // 선유도공원 실제 변위
    expect(chooseLocationZoom(1.5, W, H, null, 48, [{ dxM: 900, dyM: 0 }])).toBe(1.5);
  });

  it('하한 1.0 보장 (역이 아주 멀어도 1.0 아래로 내려가지 않음)', () => {
    expect(chooseLocationZoom(1.5, W, H, { dxM: 2000, dyM: 0 }, 48, [{ dxM: 520, dyM: 0 }])).toBe(MIN_LOCATION_ZOOM);
  });

  it('앵커 최대 거리 상수 = 1km', () => {
    expect(ANCHOR_LANDMARK_MAX_M).toBe(1000);
  });
});

describe('뷰 정책: 가장자리 마커', () => {
  const view = { x0: 0, y0: 0, x1: 1120, y1: 900 };
  const target = { cx: 560, cy: 450 };

  it('edgeAnchorPoint: 방향선이 안쪽 여유 적용 프레임과 만나는 정수 좌표', () => {
    const east = edgeAnchorPoint(view, target, 0);
    expect(east).toEqual({ px: 1120 - EDGE_INSET_PX, py: 450 });
    const north = edgeAnchorPoint(view, target, -Math.PI / 2);
    expect(north.py).toBe(EDGE_INSET_PX);
    expect(north.px).toBe(560);
    for (const a of [0.3, 1.1, 2.5, -0.7, -2.2]) {
      const p = edgeAnchorPoint(view, target, a);
      expect(Number.isInteger(p.px) && Number.isInteger(p.py)).toBe(true); // Rule 61
      expect(p.px).toBeGreaterThanOrEqual(EDGE_INSET_PX);
      expect(p.px).toBeLessThanOrEqual(1120 - EDGE_INSET_PX);
      expect(p.py).toBeGreaterThanOrEqual(EDGE_INSET_PX);
      expect(p.py).toBeLessThanOrEqual(900 - EDGE_INSET_PX);
    }
  });

  it('placeEdgeMarkers: 같은 방향 다수 + 기존 마커와 겹치지 않음 (둘레 슬라이드), 번호순 결정적', () => {
    const occupied = [{ px: 1092, py: 450 }];
    const reqs = [{ index: 3, angle: 0 }, { index: 2, angle: 0 }, { index: 4, angle: 0.01 }];
    const out = placeEdgeMarkers(reqs, view, target, occupied);
    const pts = [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    expect(out.size).toBe(3);
    const all = [...occupied, ...pts];
    const minGap = POI_MARKER_R * 2;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(all[i].px - all[j].px, all[i].py - all[j].py)).toBeGreaterThanOrEqual(minGap);
      }
    }
    // 입력 순서와 무관
    const out2 = placeEdgeMarkers([...reqs].reverse(), view, target, occupied);
    expect([...out2.entries()].sort((a, b) => a[0] - b[0])).toEqual([...out.entries()].sort((a, b) => a[0] - b[0]));
  });
});

describe('뷰 정책: 지도 합성 (Kakao 스태틱맵 응답 목킹, sharp 실사용)', () => {
  it('뷰 밖 랜드마크는 가장자리 마커+방향 범례, 마커 번호=범례 번호, 마커 간/본건 핀 겹침 없음', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 1120, height: 900, channels: 3, background: '#e5e7eb' } }).png().toBuffer();
    const prevKey = process.env.KAKAO_REST_API_KEY;
    process.env.KAKAO_REST_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) })));
    try {
      const { generateStaticMapPlaceholder } = await import('@/domain/building/mobile-im/pptx/utils/image-optimizer');
      const res: any = await generateStaticMapPlaceholder('서울 영등포구 양평동', 1120, 900, pool.center, [], {
        posture: 'income', assetType: '오피스빌딩', candidates: pool.candidates,
      });
      const meta = res.overlayMeta;
      expect(meta).toBeDefined();
      const sel = select();
      // 선별은 줌/뷰와 무관 — 지도에 쓰인 POI = 직접 선별 결과
      expect(meta.pois.map((p: any) => p.poi.name)).toEqual(sel.map(s => s.name));
      // 마커 번호 = 범례 번호(=poi.index) 이고 1..N 연속
      expect(meta.pois.map((p: any) => p.index)).toEqual(meta.pois.map((_: any, i: number) => i + 1));
      for (const p of meta.pois) expect(p.index).toBe(p.poi.index);
      // 뷰 밖: 선유도공원(북동 ~0.8km), 당산역(남동 ~0.8km) → offView + 방위·km 라벨
      const park = meta.pois.find((p: any) => /선유도공원/.test(p.poi.name));
      expect(park.poi.offView).toBe(true);
      expect(park.poi.label).toMatch(/^선유도공원 북동 0\.8km$/);
      const dang = meta.pois.find((p: any) => /당산역/.test(p.poi.name));
      expect(dang.poi.offView).toBe(true);
      expect(dang.poi.label).toMatch(/당산역\(2·9호선\) 남동 0\.8km$/);
      // 뷰 안 POI 는 기존 도보 N분 라벨
      const inside = meta.pois.filter((p: any) => !p.poi.offView);
      expect(inside.length).toBeGreaterThanOrEqual(2);
      for (const p of inside) expect(p.poi.label).toMatch(/도보 \d+분$/);
      // 모든 마커가 프레임 안, 서로 겹치지 않음, 본건 핀(머리~끝)과 겹치지 않음
      const W = 1120;
      const H = 900;
      const pts = meta.pois.map((p: any) => ({ x: p.x * W, y: p.y * H }));
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(POI_MARKER_R);
        expect(p.x).toBeLessThanOrEqual(W - POI_MARKER_R);
        expect(p.y).toBeGreaterThanOrEqual(POI_MARKER_R);
        expect(p.y).toBeLessThanOrEqual(H - POI_MARKER_R);
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y), `${i + 1}↔${j + 1}`).toBeGreaterThanOrEqual(POI_MARKER_R * 2);
        }
      }
      const tx = meta.target.x * W;
      const ty = meta.target.y * H;
      for (const p of pts) {
        const inPin = Math.abs(p.x - tx) < 34 && p.y > ty - TARGET_PIN.tipY - POI_MARKER_R && p.y < ty + POI_MARKER_R + 4;
        expect(inPin).toBe(false);
      }
    } finally {
      vi.unstubAllGlobals();
      if (prevKey === undefined) delete process.env.KAKAO_REST_API_KEY;
      else process.env.KAKAO_REST_API_KEY = prevKey;
    }
  });
});

describe('분류 회귀: 풀의 HQ/대형건물 후보', () => {
  it('HQ·대형건물 후보는 연면적 신호(gfaSqm)가 있는 후보에서만 분류된다', () => {
    const hq = pool.candidates.filter(c => classifyPoi(c) === 'corporate_hq');
    expect(hq.length).toBeGreaterThan(0);
    for (const c of hq) expect(c.gfaSqm ?? 0).toBeGreaterThanOrEqual(15000);
    const major = pool.candidates.filter(c => classifyPoi(c) === 'major_building');
    for (const c of major) expect(c.gfaSqm ?? 0).toBeGreaterThanOrEqual(20000);
  });
});
