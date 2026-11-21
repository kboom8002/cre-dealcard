/**
 * @file vworld-wms-cadastral.ts
 * @description V-World WMS GetMap API를 통한 지적도(연속지적도) 이미지 취득
 *
 * D45: 배경 레이어(V-World Base 타일) 합성으로 고품질 지적도 제공
 * G-08: V-World WFS/Data API로 대상 필지 폴리곤을 가져와 골드 하이라이트 오버레이
 * 레이어: lp_pa_cbnd_bonbun (본번) + lp_pa_cbnd_bubun (부번)
 * 좌표계: EPSG:3857 (Web Mercator)
 *
 * 필지 맞춤 축척: 대상 필지(다필지 합집합) 폴리곤이 이미지 면적의 15% 이상(목표 20%)을 차지하고
 * 모든 필지가 여백 안쪽에 들어오도록 뷰포트를 폴리곤에서 직접 산출 (cadastral-viewport.ts).
 * 폴리곤을 얻지 못한 경우에만 기존 반경(radiusM) 기반 뷰포트로 폴백.
 *
 * Rule 66: SVG 오버레이에는 텍스트를 넣지 않는다 (단일 마커만). '본건' 라벨은 PPTX 네이티브 텍스트로
 * 렌더링하며, 마커 위치(0..1)는 결과 객체와 PNG tEXt 청크(map-overlay-meta.ts)에 함께 기록한다.
 */

import { getVWorldApiKey, getVWorldReferer, getVWorldDomain } from './vworld-config';
import { computeParcelViewport, ringsCentroid } from './cadastral-viewport';
import { embedMapMarkerMeta } from './map-overlay-meta';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('vworld-wms-cadastral');


let sharp: typeof import('sharp') | null = null;
try { sharp = require('sharp'); } catch { /* sharp 미설치 환경 무시 */ }

export interface CadastralMapResult {
  buffer: Buffer;
  base64: string; // 'image/png;base64,...'
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] (WGS84)
  _source: 'vworld_wms';
  /** 본건 마커 위치 (이미지 정규화 좌표 0..1) — PPTX 네이티브 '본건' 라벨 배치용 (PNG tEXt에도 기록) */
  marker?: { x: number; y: number } | null;
  /** 대상 필지 폴리곤 면적 / 이미지 면적 (폴리곤 취득 시에만) */
  parcelCoverage?: number | null;
  /** 뷰포트 산출 방식 */
  viewportMode?: 'parcel_fit' | 'radius';
  /** 필지 폴리곤 경계 오버레이 포함 여부 */
  hasPolygon?: boolean;
  /** 공간 BOX 폴백 등으로 보정된 실제 PNU (19자리) */
  resolvedPnu?: string | null;
}

/** EPSG:3857 원점 반경 */
const MERC_ORIGIN = 20037508.34;

interface Bbox3857 { minX: number; minY: number; maxX: number; maxY: number }

/**
 * G-08: V-World Data API로 대상 PNU의 필지 폴리곤(GeoJSON)을 가져옵니다.
 * 실패 시 null 반환 (graceful fallback).
 */
async function fetchParcelPolygon(
  pnu: string,
  apiKey: string,
): Promise<Array<[number, number][]> | null> {
  try {
    const primaryDomain = getVWorldDomain();
    const altDomain = primaryDomain.startsWith('www.')
      ? primaryDomain.slice(4)
      : `www.${primaryDomain}`;
    const domainCandidates = [
      { domain: primaryDomain, referer: getVWorldReferer() },
      { domain: altDomain, referer: `https://${altDomain}/` },
    ];
    // PNU 부번이 0000이면 본번 필지 → BONBUN 레이어 우선
    const isBonbun = pnu.length >= 19 && pnu.slice(15) === '0000';
    const layerOrder = isBonbun
      ? ['LP_PA_CBND_BONBUN', 'LP_PA_CBND_BUBUN']
      : ['LP_PA_CBND_BUBUN', 'LP_PA_CBND_BONBUN'];

    let features: any[] | undefined;
    let lastStatus = 0;

    outer: for (const cand of domainCandidates) {
      for (const layer of layerOrder) {
        const url =
          `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
          `&data=${layer}&key=${apiKey}&domain=${encodeURIComponent(cand.domain)}` +
          `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
          `&attrFilter=pnu:=:${pnu}`;
        const res = await fetch(url, {
          headers: { Referer: cand.referer },
          signal: AbortSignal.timeout(6_000),
        });
        lastStatus = res.status;
        if (!res.ok) continue;
        const json = await res.json().catch(() => null);
        const found = json?.response?.result?.featureCollection?.features;
        if (Array.isArray(found) && found.length > 0) {
          features = found;
          break outer;
        }
      }
    }

    if (!features || features.length === 0) {
      log.warn(`[vworld-wfs] PNU ${pnu} 필지 조회 없음 (status=${lastStatus})`);
      return null;
    }

    // GeoJSON 좌표 추출 (Polygon 또는 MultiPolygon)
    const rings: Array<[number, number][]> = [];
    for (const feature of features) {
      const geom = feature.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') {
        if (Array.isArray(geom.coordinates?.[0]) && geom.coordinates[0].length >= 3) {
          rings.push(geom.coordinates[0]);
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly?.[0]) && poly[0].length >= 3) {
            rings.push(poly[0]);
          }
        }
      }
    }
    log.info(`[vworld-wfs] ✅ PNU ${pnu} 폴리곤 취득 (${rings.length}개 링, ${rings.reduce((s, r) => s + r.length, 0)}개 정점)`);
    return rings.length > 0 ? rings : null;
  } catch (err) {
    log.warn({ err: err }, '[vworld-wfs] 필지 폴리곤 취득 실패:');
    return null;
  }
}

/** EPSG:3857 좌표 → 이미지 픽셀 좌표 */
function toPixel(x: number, y: number, bbox: Bbox3857, imgW: number, imgH: number): { px: number; py: number } {
  return {
    px: ((x - bbox.minX) / (bbox.maxX - bbox.minX)) * imgW,
    py: ((bbox.maxY - y) / (bbox.maxY - bbox.minY)) * imgH, // y축 반전
  };
}

function extractFeatureRingsWgs84(feature: any): Array<[number, number][]> {
  const rings: Array<[number, number][]> = [];
  const geom = feature?.geometry;
  if (!geom) return rings;
  if (geom.type === 'Polygon') {
    if (Array.isArray(geom.coordinates?.[0]) && geom.coordinates[0].length >= 3) {
      rings.push(geom.coordinates[0]);
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (Array.isArray(poly?.[0]) && poly[0].length >= 3) {
        rings.push(poly[0]);
      }
    }
  }
  return rings;
}

function pointInRing2D(px: number, py: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const NON_BUILDING_JIBUN_SUFFIX_RE = /(도|천|구|제|철|수)$/;

/**
 * PNU 기반 필지 조회가 누락/오류(폐지 지번·도로 필지 등)일 때,
 * 좌표 반경 BOX 공간 질의로 대지/건축물 필지 폴리곤과 실제 PNU를 역추적합니다.
 */
export async function fetchParcelPolygonByBox(
  lat: number,
  lng: number,
  apiKey: string,
  radiusM = 20,
): Promise<{ rings: Array<[number, number][]>; resolvedPnu: string | null } | null> {
  try {
    const dLat = radiusM / 111320;
    const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
    const minLng = (lng - dLng).toFixed(6);
    const minLat = (lat - dLat).toFixed(6);
    const maxLng = (lng + dLng).toFixed(6);
    const maxLat = (lat + dLat).toFixed(6);

    const primaryDomain = getVWorldDomain();
    const domainCandidates = [
      { domain: primaryDomain, referer: getVWorldReferer() },
      {
        domain: primaryDomain.startsWith('www.') ? primaryDomain.slice(4) : `www.${primaryDomain}`,
        referer: `https://${primaryDomain.startsWith('www.') ? primaryDomain.slice(4) : `www.${primaryDomain}`}/`,
      },
    ];

    const collectedFeatures: any[] = [];
    for (const cand of domainCandidates) {
      for (const layer of ['LP_PA_CBND_BUBUN', 'LP_PA_CBND_BONBUN']) {
        const url =
          `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
          `&data=${layer}&key=${apiKey}&domain=${encodeURIComponent(cand.domain)}` +
          `&format=json&geometry=true&attribute=true&crs=EPSG:4326&size=15` +
          `&geomFilter=BOX(${minLng},${minLat},${maxLng},${maxLat})`;
        const res = await fetch(url, {
          headers: { Referer: cand.referer },
          signal: AbortSignal.timeout(6_000),
        }).catch(() => null);
        if (!res || !res.ok) continue;
        const json = await res.json().catch(() => null);
        const found = json?.response?.result?.featureCollection?.features;
        if (Array.isArray(found) && found.length > 0) {
          collectedFeatures.push(...found);
          break;
        }
      }
      if (collectedFeatures.length > 0) break;
    }

    if (collectedFeatures.length === 0) return null;

    // 도로('도')·하천('천') 등 비대지 지목 필지 제외
    const candidates = collectedFeatures.filter((f) => {
      const jibun = String(f?.properties?.jibun || '').trim();
      return !jibun || !NON_BUILDING_JIBUN_SUFFIX_RE.test(jibun);
    });
    const pool = candidates.length > 0 ? candidates : collectedFeatures;

    const targetMerc = toEpsg3857(lat, lng);
    let best: { rings: Array<[number, number][]>; resolvedPnu: string | null; dist: number; contains: boolean } | null = null;

    for (const feat of pool) {
      const wgsRings = extractFeatureRingsWgs84(feat);
      if (wgsRings.length === 0) continue;
      const contains = wgsRings.some((r) => pointInRing2D(lng, lat, r));
      const mercRings = wgsRings.map((r) =>
        r
          .filter((pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
          .map(([pLng, pLat]) => {
            const p = toEpsg3857(pLat, pLng);
            return [p.x, p.y] as [number, number];
          }),
      );
      const centroid = ringsCentroid(mercRings);
      const dist = centroid ? Math.hypot(centroid.x - targetMerc.x, centroid.y - targetMerc.y) : Number.POSITIVE_INFINITY;
      const featPnu = typeof feat?.properties?.pnu === 'string' && /^\d{19}$/.test(feat.properties.pnu.trim())
        ? feat.properties.pnu.trim()
        : null;

      if (!best) {
        best = { rings: wgsRings, resolvedPnu: featPnu, dist, contains };
        continue;
      }
      if (contains && !best.contains) {
        best = { rings: wgsRings, resolvedPnu: featPnu, dist, contains };
      } else if (contains === best.contains && dist < best.dist) {
        best = { rings: wgsRings, resolvedPnu: featPnu, dist, contains };
      }
    }

    if (!best || (!best.contains && best.dist > 60)) return null;
    log.info(`[vworld-wfs] ✅ BOX 공간 폴백 필지 취득 (resolvedPnu=${best.resolvedPnu || 'N/A'}, dist=${best.dist.toFixed(1)}m, contains=${best.contains})`);
    return { rings: best.rings, resolvedPnu: best.resolvedPnu };
  } catch (err) {
    log.warn({ err }, '[vworld-wfs] BOX 공간 폴백 조회 실패:');
    return null;
  }
}

/**
 * G-08: 필지 폴리곤 좌표(EPSG:3857)를 이미지 픽셀 좌표로 변환 후 SVG 오버레이 생성.
 * 고대비 적색 테두리(#EF4444) + 외곽 백색 헤일로 + 반투명 적색 채움 + 본건 단일 마커 (텍스트 없음 — Rule 66).
 */
function buildPolygonSvgOverlay(
  rings3857: Array<Array<[number, number]>>,
  bboxEpsg3857: Bbox3857,
  imgW: number, imgH: number,
  marker: { px: number; py: number },
): Buffer | null {
  try {
    log.info(`[vworld-wfs] SVG 오버레이 생성: ${rings3857.length}개 링, bbox=(${bboxEpsg3857.minX.toFixed(0)},${bboxEpsg3857.minY.toFixed(0)})-(${bboxEpsg3857.maxX.toFixed(0)},${bboxEpsg3857.maxY.toFixed(0)}), img=${imgW}×${imgH}`);
    const polygonPaths: string[] = [];

    for (const ring of rings3857) {
      const points = ring.map(([x, y]) => {
        const { px, py } = toPixel(x, y, bboxEpsg3857, imgW, imgH);
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      }).join(' ');

      // 1. 외곽 흰색 테두리 (가시성 확보용)
      polygonPaths.push(`<polygon points="${points}" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round" />`);
      // 2. 고대비 적색 테두리 + 반투명 적색 채우기 (Rule 64: #EF4444 계열 굵은 경계선)
      polygonPaths.push(`<polygon points="${points}" fill="rgba(239, 68, 68, 0.20)" stroke="#EF4444" stroke-width="5.5" stroke-linejoin="round" />`);
    }

    // 3. 본건 단일 마커 (핀/별/텍스트 박스 이중 표시 제거) — 라벨은 PPTX 네이티브 '본건'
    const cx = Number(marker.px.toFixed(1));
    const cy = Number(marker.py.toFixed(1));
    polygonPaths.push(
      `<circle cx="${cx}" cy="${cy}" r="11" fill="#DC2626" stroke="#FFFFFF" stroke-width="3" />` +
      `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#FFFFFF" />`,
    );

    const svg = `<svg width="${imgW}" height="${imgH}" viewBox="0 0 ${imgW} ${imgH}" xmlns="http://www.w3.org/2000/svg">${polygonPaths.join('')}</svg>`;
    return Buffer.from(svg);
  } catch (err) {
    log.warn({ err: err }, '[vworld-wfs] SVG 오버레이 생성 실패:');
    return null;
  }
}

/**
 * WGS84 좌표를 EPSG:3857 (Web Mercator)로 변환합니다.
 */
function toEpsg3857(lat: number, lng: number): { x: number; y: number } {
  const x = lng * MERC_ORIGIN / 180;
  const latRad = lat * Math.PI / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI * MERC_ORIGIN;
  return { x, y };
}

/** EPSG:3857 → WGS84 */
function fromEpsg3857(x: number, y: number): { lat: number; lng: number } {
  const lng = (x / MERC_ORIGIN) * 180;
  const lat = (2 * Math.atan(Math.exp((y / MERC_ORIGIN) * Math.PI)) - Math.PI / 2) * 180 / Math.PI;
  return { lat, lng };
}

/**
 * V-World WMS GetMap으로 지적도 이미지를 취득합니다.
 * 토지이음 스타일 배경(크림 + 용도지역 lt_c_uq111) 위에 지적도 선화(lp_pa_cbnd_bonbun/bubun)를 합성합니다.
 *
 * @param lat - 건물 위도 (WGS84)
 * @param lng - 건물 경도 (WGS84)
 * @param w - 이미지 너비 (px), 기본 800
 * @param h - 이미지 높이 (px), 기본 600
 * @param radiusM - 폴백 표시 범위 (미터), 기본 150 — 필지 폴리곤을 얻으면 폴리곤 맞춤 축척이 우선
 * @param targetPnu - G-08: 하이라이트할 대상 필지 PNU (19자리). 생략 시 하이라이트 없음.
 * @param additionalPnus - 다필지 매물의 추가 PNU 목록 (선택)
 */
export async function fetchCadastralMapImage(
  lat: number,
  lng: number,
  w = 800,
  h = 600,
  radiusM = 150,
  targetPnu?: string,
  additionalPnus?: string[],
): Promise<CadastralMapResult | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey) {
    log.warn('[vworld-wms] VWORLD_API_KEY 미설정 — 지적도 생략');
    return null;
  }
  if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)
      || lat < 33 || lat > 43 || lng < 124 || lng > 132) {
    log.warn({ latlng: { lat, lng } }, '[vworld-wms] Invalid coordinates, skipping cadastral map:');
    return null;
  }

  try {
    const allPnus = [targetPnu, ...(additionalPnus || [])].filter((p): p is string => Boolean(p && p.trim()));
    const center = toEpsg3857(lat, lng);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const meterToUnit = 1 / cosLat; // 지상 1m → EPSG:3857 단위 (한국 위도 33~38°에서 충분히 정밀)

    // ── G-08: 대상 필지 폴리곤 선취득 (뷰포트 산출에 사용, 다필지 지원) ──
    const rings3857: Array<Array<[number, number]>> = [];
    let resolvedPnu: string | null = null;
    if (allPnus.length > 0) {
      const results = await Promise.allSettled(
        allPnus.map(pnu => fetchParcelPolygon(pnu, apiKey))
      );
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const pnu = allPnus[i];
        if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
          for (const ring of result.value) {
            rings3857.push(ring
              .filter(pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
              .map(([pLng, pLat]) => {
                const p = toEpsg3857(pLat, pLng);
                return [p.x, p.y] as [number, number];
              }));
          }
          log.info(`[vworld-wfs] ✅ PNU ${pnu} 필지 폴리곤 취득 (${result.value.length}개 링)`);
        } else {
          log.warn(`[vworld-wfs] PNU ${pnu} 필지 폴리곤 조회 결과 없음`);
        }
      }
    }

    // G-08 Self-Healing: PNU 조회 실패(폐지 지번/오매핑 PNU) 또는 취득 폴리곤이 실좌표에서 >250m 이탈 시 BOX 공간 폴백
    const initialCentroid = rings3857.length > 0 ? ringsCentroid(rings3857) : null;
    const isCentroidOutlier = Boolean(
      initialCentroid && Math.hypot(initialCentroid.x - center.x, initialCentroid.y - center.y) > 250 * meterToUnit
    );
    if (rings3857.length === 0 || isCentroidOutlier) {
      if (isCentroidOutlier) {
        log.warn('[vworld-wfs] PNU 폴리곤 중심이 입력 좌표와 250m 이상 괴리 — BOX 공간 폴백 시도');
      }
      const boxFallback = await fetchParcelPolygonByBox(lat, lng, apiKey, 20);
      if (boxFallback && boxFallback.rings.length > 0) {
        rings3857.length = 0;
        for (const ring of boxFallback.rings) {
          rings3857.push(
            ring
              .filter(pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
              .map(([pLng, pLat]) => {
                const p = toEpsg3857(pLat, pLng);
                return [p.x, p.y] as [number, number];
              }),
          );
        }
        resolvedPnu = boxFallback.resolvedPnu;
      }
    }

    // ── 뷰포트 산출: 1순위 필지 맞춤 (합집합 ≥15% 점유, 전 필지 여백 내 포함, 중앙 정렬) ──
    const viewport = rings3857.length > 0
      ? computeParcelViewport(rings3857, w, h, {
          targetCoverage: 0.06,
          marginRatio: 0.12,
          minViewWidthM: 100,
          unitsPerMeter: meterToUnit,
        })
      : null;

    let bboxEpsg3857: Bbox3857;
    let viewportMode: CadastralMapResult['viewportMode'];
    if (viewport) {
      bboxEpsg3857 = { minX: viewport.minX, minY: viewport.minY, maxX: viewport.maxX, maxY: viewport.maxY };
      viewportMode = 'parcel_fit';
      log.info(`[vworld-wms] 필지 맞춤 뷰포트: ${(viewport.viewW / meterToUnit).toFixed(1)}m × ${(viewport.viewH / meterToUnit).toFixed(1)}m, 필지 점유율 ${(viewport.coverage * 100).toFixed(1)}% (bbox ${(viewport.bboxCoverage * 100).toFixed(1)}%, ${viewport.limitedBy})`);
    } else {
      // 폴백: 반경 기반 (다필지 매물일 경우 인접 필지가 프레임 내에 모두 노출되도록 반경 자동 보정)
      const effectiveRadiusM = allPnus.length > 1 ? Math.max(radiusM, 280) : radiusM;
      const aspect = w / h;  // image aspect ratio (e.g., 4:3)
      const dy = effectiveRadiusM * meterToUnit;
      const dx = dy * aspect;  // scale X by aspect ratio to match image dimensions
      bboxEpsg3857 = { minX: center.x - dx, minY: center.y - dy, maxX: center.x + dx, maxY: center.y + dy };
      viewportMode = 'radius';
      log.info(`[vworld-wms] 반경 폴백 뷰포트: r=${effectiveRadiusM}m`);
    }

    // WGS84 bbox (메타데이터용)
    const sw = fromEpsg3857(bboxEpsg3857.minX, bboxEpsg3857.minY);
    const ne = fromEpsg3857(bboxEpsg3857.maxX, bboxEpsg3857.maxY);
    const bboxWgs84: [number, number, number, number] = [sw.lng, sw.lat, ne.lng, ne.lat];

    const primaryDomain = getVWorldDomain();
    const altDomain = primaryDomain.startsWith('www.')
      ? primaryDomain.replace(/^www\./, '')
      : `www.${primaryDomain}`;
    const candidateAuths = [
      { domain: primaryDomain, referer: getVWorldReferer() },
      { domain: altDomain, referer: `https://${altDomain}` },
    ];

    const fetchWmsOnce = async (
      domainVal: string,
      refererVal: string,
      layers = 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
      styles = ',',
    ) => {
      const p = new URLSearchParams({
        SERVICE: 'WMS',
        REQUEST: 'GetMap',
        VERSION: '1.3.0',
        LAYERS: layers,
        STYLES: styles,
        CRS: 'EPSG:3857',
        BBOX: [bboxEpsg3857.minX, bboxEpsg3857.minY, bboxEpsg3857.maxX, bboxEpsg3857.maxY]
          .map((v) => v.toFixed(2))
          .join(','),
        WIDTH: String(w),
        HEIGHT: String(h),
        FORMAT: 'image/png',
        TRANSPARENT: 'TRUE',
        KEY: apiKey,
        DOMAIN: domainVal,
      });
      const reqUrl = `https://api.vworld.kr/req/wms?${p.toString()}`;
      const r = await fetch(reqUrl, {
        headers: { Referer: refererVal },
        signal: AbortSignal.timeout(10_000),
      });
      const ct = r.headers.get('content-type') ?? '';
      return { res: r, contentType: ct, url: reqUrl, params: p };
    };

    const isPngBuffer = (buf: Buffer | null): buf is Buffer =>
      Boolean(buf && buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);

    // 지적도 + 토지이음 용도지역(lt_c_uq111) WMS 병렬 취득 (Base 타일 대신 클린 크림 배경 + 용도지역·지구 채색 + 지적선)
    const [firstAttempt, zoningAttempt] = await Promise.all([
      fetchWmsOnce(candidateAuths[0].domain, candidateAuths[0].referer).catch(() => null),
      sharp
        ? fetchWmsOnce(candidateAuths[0].domain, candidateAuths[0].referer, 'lt_c_uq111', '').catch(() => null)
        : Promise.resolve(null),
    ]);

    let wmsAttempt = firstAttempt;
    if (!wmsAttempt || !wmsAttempt.res.ok || !wmsAttempt.contentType.includes('image')) {
      wmsAttempt = await fetchWmsOnce(candidateAuths[1].domain, candidateAuths[1].referer).catch(
        () => wmsAttempt,
      );
    }

    if (!wmsAttempt || !wmsAttempt.res.ok) {
      const text = wmsAttempt ? await wmsAttempt.res.text().catch(() => '') : 'network_error';
      log.warn(
        { text, url: wmsAttempt?.url },
        `[vworld-wms] WMS 응답 오류 (${wmsAttempt?.res.status ?? 'ERR'}):`,
      );
      return null;
    }

    if (!wmsAttempt.contentType.includes('image')) {
      const text = await wmsAttempt.res.text().catch(() => '');
      log.warn({ text, url: wmsAttempt.url }, '[vworld-wms] WMS 에러 응답:');
      return null;
    }

    const arrayBuffer = await wmsAttempt.res.arrayBuffer();
    const cadastralBuffer = Buffer.from(arrayBuffer);

    let zoningBuffer: Buffer | null = null;
    if (zoningAttempt && zoningAttempt.res.ok && zoningAttempt.contentType.includes('image')) {
      try {
        const zBuf = Buffer.from(await zoningAttempt.res.arrayBuffer());
        if (isPngBuffer(zBuf)) zoningBuffer = zBuf;
      } catch {
        zoningBuffer = null;
      }
    }

    // ── 본건 마커 위치: 필지 합집합 면적 가중 중심, 폴리곤이 없으면 실제 좌표 ──
    const centroid = rings3857.length > 0 ? ringsCentroid(rings3857) : null;
    const markerPx = centroid
      ? toPixel(centroid.x, centroid.y, bboxEpsg3857, w, h)
      : toPixel(center.x, center.y, bboxEpsg3857, w, h);
    const markerInside = markerPx.px >= 0 && markerPx.px <= w && markerPx.py >= 0 && markerPx.py <= h;
    const marker = markerInside
      ? { x: Number((markerPx.px / w).toFixed(4)), y: Number((markerPx.py / h).toFixed(4)) }
      : null;

    // ── 토지이음 스타일 합성: 크림 배경 + (선택) 용도지역 + 지적도 + 폴리곤 마커 ──
    let finalBuffer: any = cadastralBuffer;

    if (sharp) {
      const compositeLayers: Array<{ input: Buffer; blend: string }> = [
        ...(zoningBuffer ? [{ input: zoningBuffer, blend: 'over' }] : []),
        { input: cadastralBuffer, blend: 'over' },
      ];

      // G-08: 대상 필지 폴리곤 하이라이트 오버레이 (다필지 지원)
      // 폴리곤 미취득 시 가짜 경계선을 그리지 않는다 (Rule 34 — 실좌표 단일 마커만 표시)
      if (marker) {
        if (rings3857.length === 0) {
          log.info(`[vworld-wfs] WFS 폴리곤 없음 — 중심 좌표(${lat}, ${lng}) 단일 마커만 표시`);
        }
        const svgBuf = buildPolygonSvgOverlay(rings3857, bboxEpsg3857, w, h, markerPx);
        if (svgBuf) {
          compositeLayers.push({ input: svgBuf, blend: 'over' });
          log.info(`[vworld-wfs] ✅ 총 ${rings3857.length}개 필지 링 오버레이 추가 (${allPnus.length}필지)`);
        }
      }

      const bgBuffer = await sharp({
        create: { width: w, height: h, channels: 4, background: { r: 248, g: 245, b: 235, alpha: 1 } },
      }).png().toBuffer();

      try {
        finalBuffer = await sharp(bgBuffer)
          .composite(compositeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
      } catch {
        // 용도지역 레이어 합성 오류 시 지적도 + 폴리곤만 안전 합성
        const safeLayers = compositeLayers.filter((l) => l.input !== zoningBuffer);
        finalBuffer = await sharp(bgBuffer)
          .composite(safeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
      }
      log.info(`[vworld-wms] ✅ 지적도 + 토지이음 배경 합성 완료 (${finalBuffer.length} bytes, ${w}×${h}, zoning=${Boolean(zoningBuffer)})`);
    } else {
      log.info(`[vworld-wms] ✅ 지적도 이미지 취득 성공 (sharp 미사용, ${cadastralBuffer.length} bytes, ${w}×${h})`);
    }

    // 마커 위치 및 폴리곤 포함 여부를 PNG tEXt 청크에 기록
    const hasPolygon = rings3857.length > 0;
    const hasOverlayMarker = Boolean(sharp && marker);
    if (hasOverlayMarker && Buffer.isBuffer(finalBuffer)) {
      finalBuffer = embedMapMarkerMeta(finalBuffer, { v: 1, target: marker!, imgW: w, imgH: h, hasPolygon });
    }

    return {
      buffer: finalBuffer,
      base64: `data:image/png;base64,${finalBuffer.toString('base64')}`,
      width: w,
      height: h,
      bbox: bboxWgs84,
      _source: 'vworld_wms',
      marker: hasOverlayMarker ? marker : null,
      parcelCoverage: viewport ? Number(viewport.coverage.toFixed(4)) : null,
      viewportMode,
      hasPolygon,
      resolvedPnu,
    };
  } catch (err) {
    log.warn({ err: err }, '[vworld-wms] 지적도 이미지 취득 실패:');
    return null;
  }
}

