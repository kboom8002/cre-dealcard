/**
 * @file zoning-share-wfs.ts
 * @description 복수 용도지역 혼재 필지의 용도지역별 면적·비율 산출기 (R6)
 *
 * - 순수 2D 기하 헬퍼 (`polygonArea2D`, `intersectPolygons2D`, `computeZoningSharesFromPolygons`)
 * - V-World Data API (`LP_PA_CBND_BUBUN`/`BONBUN` + `LT_C_UQ111`) 연동 `fetchParcelZoningShares`
 */

import { getVWorldApiKey, getVWorldReferer, getVWorldDomain } from './vworld-config';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('zoning-share-wfs');

export interface ZoningShareResult {
  zoneName: string;
  areaSqm: number;
  ratioPct: number;
}

function normalizeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (!Array.isArray(ring)) return [];
  const pts = ring.filter(
    (p): p is [number, number] =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );
  if (pts.length >= 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12) {
      return pts.slice(0, -1);
    }
  }
  return pts;
}

function signedPolygonArea2D(ring: Array<[number, number]>): number {
  const pts = normalizeRing(ring);
  const n = pts.length;
  if (n < 3) return 0;
  const [ox, oy] = pts[0];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x1 = pts[i][0] - ox;
    const y1 = pts[i][1] - oy;
    const j = (i + 1) % n;
    const x2 = pts[j][0] - ox;
    const y2 = pts[j][1] - oy;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Shoelace 공식 기반 2D 폴리곤 면적 (절대값).
 * 첫 정점 기준 로컬 원점 평행이동으로 대구경 좌표(EPSG:3857 등)의 부동소수점 손실을 방지합니다.
 */
export function polygonArea2D(ring: Array<[number, number]>): number {
  return Math.abs(signedPolygonArea2D(ring));
}

function isConvexPolygon(ring: Array<[number, number]>): boolean {
  const pts = normalizeRing(ring);
  const n = pts.length;
  if (n < 3) return false;
  if (n === 3) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-12) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}

function computeLineIntersection(
  p1: [number, number],
  p2: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] {
  const dx1 = p2[0] - p1[0];
  const dy1 = p2[1] - p1[1];
  const dx2 = b[0] - a[0];
  const dy2 = b[1] - a[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-14) {
    return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  }
  const t = ((a[0] - p1[0]) * dy2 - (a[1] - p1[1]) * dx2) / denom;
  const clampedT = Math.max(0, Math.min(1, t));
  return [p1[0] + clampedT * dx1, p1[1] + clampedT * dy1];
}

function sutherlandHodgmanClip(
  subjectRing: Array<[number, number]>,
  convexClipRing: Array<[number, number]>,
): Array<[number, number]> {
  let output = normalizeRing(subjectRing);
  const clip = normalizeRing(convexClipRing);
  if (output.length < 3 || clip.length < 3) return [];

  // clip 폴리곤을 반시계방향(CCW, signedArea > 0)으로 정렬
  const clipArea = signedPolygonArea2D(clip);
  if (Math.abs(clipArea) < 1e-14) return [];
  const ccwClip = clipArea < 0 ? [...clip].reverse() : clip;

  const isInside = (p: [number, number], a: [number, number], b: [number, number]): boolean => {
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return cross >= -1e-10;
  };

  for (let i = 0; i < ccwClip.length; i++) {
    const a = ccwClip[i];
    const b = ccwClip[(i + 1) % ccwClip.length];
    const input = output;
    output = [];
    if (input.length === 0) break;

    for (let j = 0; j < input.length; j++) {
      const curr = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const currIn = isInside(curr, a, b);
      const prevIn = isInside(prev, a, b);

      if (currIn) {
        if (!prevIn) {
          output.push(computeLineIntersection(prev, curr, a, b));
        }
        output.push(curr);
      } else if (prevIn) {
        output.push(computeLineIntersection(prev, curr, a, b));
      }
    }
  }

  return output.length >= 3 ? output : [];
}

function pointInPolygon2D(pt: [number, number], ring: Array<[number, number]>): boolean {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringBbox(ring: Array<[number, number]>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Sutherland-Hodgman 2D 폴리곤 교차.
 * subject 또는 clip 중 하나라도 볼록(convex)이면 교환법칙을 이용해 정확히 클리핑합니다.
 */
export function intersectPolygons2D(
  subject: Array<[number, number]>,
  clip: Array<[number, number]>,
): Array<[number, number]> {
  const subj = normalizeRing(subject);
  const clp = normalizeRing(clip);
  if (subj.length < 3 || clp.length < 3) return [];

  const b1 = ringBbox(subj);
  const b2 = ringBbox(clp);
  if (b1.maxX <= b2.minX || b2.maxX <= b1.minX || b1.maxY <= b2.minY || b2.maxY <= b1.minY) {
    return [];
  }

  if (isConvexPolygon(clp)) {
    return sutherlandHodgmanClip(subj, clp);
  }
  if (isConvexPolygon(subj)) {
    return sutherlandHodgmanClip(clp, subj);
  }
  return sutherlandHodgmanClip(subj, clp);
}

export const clipPolygonByConvexOrBbox = intersectPolygons2D;

function computeIntersectionArea2D(
  subject: Array<[number, number]>,
  clip: Array<[number, number]>,
): number {
  const subj = normalizeRing(subject);
  const clp = normalizeRing(clip);
  if (subj.length < 3 || clp.length < 3) return 0;

  const b1 = ringBbox(subj);
  const b2 = ringBbox(clp);
  const minX = Math.max(b1.minX, b2.minX);
  const minY = Math.max(b1.minY, b2.minY);
  const maxX = Math.min(b1.maxX, b2.maxX);
  const maxY = Math.min(b1.maxY, b2.maxY);
  if (maxX <= minX || maxY <= minY) return 0;

  // 둘 중 하나라도 볼록 폴리곤이면 Sutherland-Hodgman 해석적 면적이 정확함
  if (isConvexPolygon(clp) || isConvexPolygon(subj)) {
    const poly = intersectPolygons2D(subj, clp);
    return polygonArea2D(poly);
  }

  // 두 폴리곤 모두 오목(non-convex)인 경우 고해상도 격자 샘플링으로 0.1% 이내 정밀 산출
  const GRID = 140;
  const dx = (maxX - minX) / GRID;
  const dy = (maxY - minY) / GRID;
  let hits = 0;
  for (let ix = 0; ix < GRID; ix++) {
    const x = minX + (ix + 0.5) * dx;
    for (let iy = 0; iy < GRID; iy++) {
      const y = minY + (iy + 0.5) * dy;
      if (pointInPolygon2D([x, y], subj) && pointInPolygon2D([x, y], clp)) {
        hits++;
      }
    }
  }
  return (hits / (GRID * GRID)) * (maxX - minX) * (maxY - minY);
}

function isKoreanWgs84Ring(ring: Array<[number, number]>): boolean {
  if (ring.length < 3) return false;
  const b = ringBbox(ring);
  return (
    b.minX >= 124 &&
    b.maxX <= 132 &&
    b.minY >= 32 &&
    b.maxY <= 39 &&
    b.maxX - b.minX < 0.05 &&
    b.maxY - b.minY < 0.05
  );
}

/**
 * 대상 필지 폴리곤과 용도지역 폴리곤 배열의 교차 면적 및 구성비(%)를 산출합니다.
 */
export function computeZoningSharesFromPolygons(
  parcelRing: Array<[number, number]>,
  zonePolygons: Array<{ zoneName: string; ring: Array<[number, number]> }>,
): Array<{ zoneName: string; areaSqm: number; ratioPct: number }> {
  const normParcel = normalizeRing(parcelRing);
  if (normParcel.length < 3 || !Array.isArray(zonePolygons) || zonePolygons.length === 0) {
    return [];
  }

  // 한국 WGS84 경위도 좌표인 경우 로컬 미터 평면으로 투영 후 면적(㎡) 산출
  const useWgs84Projection = isKoreanWgs84Ring(normParcel);
  const [originLng, originLat] = normParcel[0];
  const metersPerDegLng = 111319.49 * Math.cos((originLat * Math.PI) / 180);
  const metersPerDegLat = 110946.25;

  const projectRing = (r: Array<[number, number]>): Array<[number, number]> => {
    if (!useWgs84Projection) return r;
    return r.map(([lng, lat]) => [
      (lng - originLng) * metersPerDegLng,
      (lat - originLat) * metersPerDegLat,
    ]);
  };

  const projectedParcel = projectRing(normParcel);
  const parcelArea = polygonArea2D(projectedParcel);
  if (parcelArea <= 1e-6) return [];

  const areaByZone = new Map<string, number>();
  for (const zp of zonePolygons) {
    const zoneName = String(zp?.zoneName || '')
      .replace(/\((?:포함|저촉|접합|접함)\)$/g, '')
      .trim();
    if (!zoneName || zoneName === '도시지역') continue;
    const normZoneRing = normalizeRing(zp.ring);
    if (normZoneRing.length < 3) continue;

    const projectedZone = projectRing(normZoneRing);
    const interArea = computeIntersectionArea2D(projectedParcel, projectedZone);
    if (interArea > 1e-4) {
      areaByZone.set(zoneName, (areaByZone.get(zoneName) || 0) + interArea);
    }
  }

  if (areaByZone.size === 0) return [];

  const totalIntersectedArea = Array.from(areaByZone.values()).reduce((a, b) => a + b, 0);
  if (totalIntersectedArea <= 1e-6) return [];

  const results: ZoningShareResult[] = Array.from(areaByZone.entries())
    .map(([zoneName, area]) => ({
      zoneName,
      areaSqm: Number(area.toFixed(1)),
      ratioPct: Number(((area / totalIntersectedArea) * 100).toFixed(1)),
    }))
    .filter((item) => item.ratioPct > 0)
    .sort((a, b) => b.ratioPct - a.ratioPct);

  return results;
}

function extractFirstRingFromGeoJson(feature: any): Array<[number, number]> | null {
  const geom = feature?.geometry;
  if (!geom) return null;
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
    return geom.coordinates[0];
  }
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0]?.[0])) {
    return geom.coordinates[0][0];
  }
  return null;
}

/**
 * V-World Data API(`LP_PA_CBND_BUBUN`/`BONBUN` + `LT_C_UQ111`)를 호출하여
 * 복수 용도지역에 걸친 필지의 용도지역별 면적·구성비를 조회합니다.
 *
 * - `VWORLD_API_KEY` 미설정 또는 단일 용도지역(`knownZones` 내 특정 용도지역 < 2개)이면 즉시 `[]` 반환
 * - 4초 타임아웃 및 네트워크 오류 시 `[]` 반환 (graceful degradation)
 */
export async function fetchParcelZoningShares(
  pnu: string,
  knownZones?: string[],
): Promise<Array<{ zoneName: string; areaSqm?: number; ratioPct: number }>> {
  const cleanPnu = String(pnu || '').trim();
  if (cleanPnu.length !== 19) return [];

  const apiKey = getVWorldApiKey();
  if (!apiKey) return [];

  if (Array.isArray(knownZones)) {
    const specificZones = Array.from(
      new Set(
        knownZones
          .map((z) =>
            String(z || '')
              .replace(/\((?:포함|저촉|접합|접함)\)$/g, '')
              .trim(),
          )
          .filter((z) => /지역$/.test(z) && z !== '도시지역'),
      ),
    );
    if (specificZones.length < 2) {
      return [];
    }
  }

  const referer = getVWorldReferer();
  const domain = encodeURIComponent(getVWorldDomain());
  const isBonbun = cleanPnu.slice(15) === '0000';
  const primaryLayer = isBonbun ? 'LP_PA_CBND_BONBUN' : 'LP_PA_CBND_BUBUN';
  const fallbackLayer = isBonbun ? 'LP_PA_CBND_BUBUN' : 'LP_PA_CBND_BONBUN';

  const buildParcelUrl = (layer: string) =>
    `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
    `&data=${layer}&key=${apiKey}&domain=${domain}` +
    `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
    `&attrFilter=pnu:=:${cleanPnu}`;

  try {
    let parcelRes = await fetch(buildParcelUrl(primaryLayer), {
      headers: { Referer: referer },
      signal: AbortSignal.timeout(4_000),
    });
    let parcelJson = parcelRes.ok ? await parcelRes.json() : null;
    let parcelFeatures = parcelJson?.response?.result?.featureCollection?.features;

    if (!Array.isArray(parcelFeatures) || parcelFeatures.length === 0) {
      parcelRes = await fetch(buildParcelUrl(fallbackLayer), {
        headers: { Referer: referer },
        signal: AbortSignal.timeout(4_000),
      });
      parcelJson = parcelRes.ok ? await parcelRes.json() : null;
      parcelFeatures = parcelJson?.response?.result?.featureCollection?.features;
    }

    if (!Array.isArray(parcelFeatures) || parcelFeatures.length === 0) {
      return [];
    }

    const parcelRing = extractFirstRingFromGeoJson(parcelFeatures[0]);
    if (!parcelRing || parcelRing.length < 3) return [];

    const bbox = ringBbox(parcelRing);
    const pad = 0.0002;
    const geomFilter = `BOX(${(bbox.minX - pad).toFixed(6)},${(bbox.minY - pad).toFixed(6)},${(bbox.maxX + pad).toFixed(6)},${(bbox.maxY + pad).toFixed(6)})`;

    const uqUrl =
      `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
      `&data=LT_C_UQ111&key=${apiKey}&domain=${domain}` +
      `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
      `&geomFilter=${encodeURIComponent(geomFilter)}&size=50`;

    const uqRes = await fetch(uqUrl, {
      headers: { Referer: referer },
      signal: AbortSignal.timeout(4_000),
    });
    if (!uqRes.ok) return [];

    const uqJson = await uqRes.json();
    const uqFeatures = uqJson?.response?.result?.featureCollection?.features;
    if (!Array.isArray(uqFeatures) || uqFeatures.length === 0) return [];

    const zonePolygons: Array<{ zoneName: string; ring: Array<[number, number]> }> = [];
    for (const f of uqFeatures) {
      const props = f?.properties || {};
      const zoneName = String(
        props.uname || props.dgm_nm || props.prposAreaDstrcCodeNm || props.uq_nm || '',
      ).trim();
      if (!zoneName || zoneName === '도시지역') continue;

      const geom = f?.geometry;
      if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
        zonePolygons.push({ zoneName, ring: geom.coordinates[0] });
      } else if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly?.[0])) {
            zonePolygons.push({ zoneName, ring: poly[0] });
          }
        }
      }
    }

    const shares = computeZoningSharesFromPolygons(parcelRing, zonePolygons);
    return shares.length >= 2 ? shares : [];
  } catch (err) {
    log.warn({ err }, `[zoning-share-wfs] PNU ${cleanPnu} 용도지역 폴리곤 교차 조회 실패 (graceful skip)`);
    return [];
  }
}
