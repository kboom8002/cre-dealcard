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
    const referer = getVWorldReferer();
    // PNU 부번이 0000이면 본번 필지 → BONBUN 레이어 우선
    const isBonbun = pnu.length >= 19 && pnu.slice(15) === '0000';
    const primaryLayer = isBonbun ? 'LP_PA_CBND_BONBUN' : 'LP_PA_CBND_BUBUN';
    const fallbackLayer = isBonbun ? 'LP_PA_CBND_BUBUN' : 'LP_PA_CBND_BONBUN';

    const buildUrl = (layer: string) => `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
      `&data=${layer}&key=${apiKey}&domain=${encodeURIComponent(getVWorldDomain())}` +
      `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
      `&attrFilter=pnu:=:${pnu}`;

    let res = await fetch(buildUrl(primaryLayer), {
      headers: { 'Referer': referer },
      signal: AbortSignal.timeout(8_000),
    });
    
    let json = res.ok ? await res.json() : null;
    let features = json?.response?.result?.featureCollection?.features;

    if (!features || features.length === 0) {
      res = await fetch(buildUrl(fallbackLayer), {
        headers: { 'Referer': referer },
        signal: AbortSignal.timeout(8_000),
      });
      json = res.ok ? await res.json() : null;
      features = json?.response?.result?.featureCollection?.features;
    }

    if (!res.ok) {
      log.warn(`[vworld-wfs] Data API 오류 (${res.status})`);
      return null;
    }

    if (!features || features.length === 0) {
      log.warn(`[vworld-wfs] PNU ${pnu}에 해당하는 필지 없음`);
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

/**
 * G-08: 필지 폴리곤 좌표(EPSG:3857)를 이미지 픽셀 좌표로 변환 후 SVG 오버레이 생성.
 * 고대비 적색 테두리 + 반투명 적색 채움 + 본건 단일 마커 (텍스트 없음 — Rule 66).
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
      polygonPaths.push(`<polygon points="${points}" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round" />`);
      // 2. 고대비 적색 테두리 + 반투명 적색 채우기 (Rule 64: #EF4444 계열 굵은 경계선)
      polygonPaths.push(`<polygon points="${points}" fill="rgba(220, 38, 38, 0.20)" stroke="#DC2626" stroke-width="4" stroke-linejoin="round" />`);
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
 * V-World Base 타일(배경 지도)을 가져옵니다.
 * 지적도 WMS 결과(투명 PNG)를 이 배경 위에 합성하여 고품질 지적도를 만듭니다.
 *
 * 임의 EPSG:3857 bbox를 정확히 덮도록 필요한 타일 범위를 계산해 합성 후 크롭합니다.
 * (기존 3×3 고정 그리드는 반경이 클 때 그리드를 벗어나 WMS 레이어와 어긋나는 문제가 있었음)
 * 줌: bbox를 30타일 이내로 덮는 최고 레벨(최대 19) — 실패 시 한 단계 낮춰 1회 재시도.
 */
async function fetchBaseMapTile(
  bbox: Bbox3857,
  w: number, h: number,
): Promise<Buffer | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey || !sharp) return null;

  const TILE_SIZE = 256;
  const MAX_TILES = 30;
  const worldPx = (x: number, y: number, z: number) => {
    const size = TILE_SIZE * Math.pow(2, z);
    return {
      px: ((x + MERC_ORIGIN) / (2 * MERC_ORIGIN)) * size,
      py: ((MERC_ORIGIN - y) / (2 * MERC_ORIGIN)) * size,
    };
  };
  const planFor = (z: number) => {
    const p0 = worldPx(bbox.minX, bbox.maxY, z);
    const p1 = worldPx(bbox.maxX, bbox.minY, z);
    const tx0 = Math.floor(p0.px / TILE_SIZE);
    const ty0 = Math.floor(p0.py / TILE_SIZE);
    const tx1 = Math.floor((p1.px - 1e-6) / TILE_SIZE);
    const ty1 = Math.floor((p1.py - 1e-6) / TILE_SIZE);
    const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
    return { z, p0, p1, tx0, ty0, tx1, ty1, count, spanPx: p1.px - p0.px };
  };

  let zStart = 19;
  while (zStart > 12) {
    const p = planFor(zStart);
    if (p.count <= MAX_TILES && p.spanPx <= w * 3) break;
    zStart--;
  }

  for (const z of [zStart, zStart - 1]) {
    try {
      const plan = planFor(z);
      const tileRequests: { tx: number; ty: number }[] = [];
      for (let ty = plan.ty0; ty <= plan.ty1; ty++) {
        for (let tx = plan.tx0; tx <= plan.tx1; tx++) tileRequests.push({ tx, ty });
      }

      // 타일 병렬 취득 (HP-14)
      const tileResults = await Promise.all(
        tileRequests.map(async ({ tx, ty }) => {
          const url = `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/Base/${z}/${ty}/${tx}.png`;
          try {
            const res = await fetch(url, {
              headers: { 'Referer': getVWorldReferer() },
              signal: AbortSignal.timeout(6_000),
            });
            if (res.ok) {
              const ab = await res.arrayBuffer();
              return { left: (tx - plan.tx0) * TILE_SIZE, top: (ty - plan.ty0) * TILE_SIZE, buf: Buffer.from(ab) };
            }
          } catch { /* 개별 타일 실패 무시 */ }
          return null;
        })
      );
      const tiles: Array<{ left: number; top: number; buf: Buffer }> = [];
      for (const t of tileResults) {
        if (t) tiles.push(t);
      }
      if (tiles.length < Math.ceil(tileRequests.length / 2)) {
        log.warn(`[vworld-wms] Base 타일 z=${z} 취득 부족 (${tiles.length}/${tileRequests.length}) — 하위 줌 재시도`);
        continue;
      }

      const gridW = (plan.tx1 - plan.tx0 + 1) * TILE_SIZE;
      const gridH = (plan.ty1 - plan.ty0 + 1) * TILE_SIZE;
      const grid = await sharp!({
        create: { width: gridW, height: gridH, channels: 4, background: { r: 248, g: 245, b: 235, alpha: 1 } },
      }).composite(tiles.map(t => ({ input: t.buf, left: Math.round(t.left), top: Math.round(t.top) }))).png().toBuffer();

      // bbox 영역 정밀 크롭 (Rule 61: 정수 좌표)
      const left = Math.max(0, Math.min(gridW - 1, Math.round(plan.p0.px - plan.tx0 * TILE_SIZE)));
      const top = Math.max(0, Math.min(gridH - 1, Math.round(plan.p0.py - plan.ty0 * TILE_SIZE)));
      const width = Math.max(1, Math.min(gridW - left, Math.round(plan.p1.px - plan.p0.px)));
      const height = Math.max(1, Math.min(gridH - top, Math.round(plan.p1.py - plan.p0.py)));

      const result = await sharp!(grid)
        .extract({ left, top, width, height })
        .resize({ width: w, height: h, fit: 'fill' })
        .png()
        .toBuffer() as Buffer;

      log.info(`[vworld-wms] ✅ WMTS Base 타일 합성 완료 (z=${z}, ${tiles.length}타일, ${result.length} bytes)`);
      return result;
    } catch (err) {
      log.warn({ err: err }, `[vworld-wms] WMTS Base tile fetch failed (z=${z}):`);
    }
  }
  return null;
}

/**
 * V-World WMS GetMap으로 지적도 이미지를 취득합니다.
 * D45: 배경 타일 위에 지적도 선화를 합성하여 고품질 결과를 생성합니다.
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

    // ── 뷰포트 산출: 1순위 필지 맞춤 (합집합 ≥15% 점유, 전 필지 여백 내 포함, 중앙 정렬) ──
    const viewport = rings3857.length > 0
      ? computeParcelViewport(rings3857, w, h, {
          targetCoverage: 0.2,
          marginRatio: 0.1,
          minViewWidthM: 24,
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

    // ── WMS GetMap 요청 (지적도 투명 PNG) — bbox 반올림 금지 (1단위≈0.8m → 고배율에서 수십 px 오차) ──
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: '1.3.0',
      LAYERS: 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
      STYLES: ',',  // 기본 스타일 = 필지별 색상 채움 + 경계선 (D45: _line은 선화만)
      CRS: 'EPSG:3857',
      BBOX: [bboxEpsg3857.minX, bboxEpsg3857.minY, bboxEpsg3857.maxX, bboxEpsg3857.maxY].map(v => v.toFixed(2)).join(','),
      WIDTH: String(w),
      HEIGHT: String(h),
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE',
      KEY: apiKey,
      DOMAIN: getVWorldDomain(),
    });

    const url = `https://api.vworld.kr/req/wms?${params.toString()}`;
    const referer = getVWorldReferer();

    // WMS + 배경 타일 병렬 취득
    const [res, baseTile] = await Promise.all([
      fetch(url, {
        headers: { 'Referer': referer },
        signal: AbortSignal.timeout(10_000),
      }),
      sharp ? fetchBaseMapTile(bboxEpsg3857, w, h).catch(() => null) : Promise.resolve(null),
    ]);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn({ text, url, params: Object.fromEntries(params) }, `[vworld-wms] WMS 응답 오류 (${res.status}):`);
      return null;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('image')) {
      const text = await res.text().catch(() => '');
      log.warn({ text, url, params: Object.fromEntries(params) }, '[vworld-wms] WMS 에러 응답:');
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const cadastralBuffer = Buffer.from(arrayBuffer);

    // ── 본건 마커 위치: 필지 합집합 면적 가중 중심, 폴리곤이 없으면 실제 좌표 ──
    const centroid = rings3857.length > 0 ? ringsCentroid(rings3857) : null;
    const markerPx = centroid
      ? toPixel(centroid.x, centroid.y, bboxEpsg3857, w, h)
      : toPixel(center.x, center.y, bboxEpsg3857, w, h);
    const markerInside = markerPx.px >= 0 && markerPx.px <= w && markerPx.py >= 0 && markerPx.py <= h;
    const marker = markerInside
      ? { x: Number((markerPx.px / w).toFixed(4)), y: Number((markerPx.py / h).toFixed(4)) }
      : null;

    // ── D45: 배경 Base 타일 합성 ──
    let finalBuffer: any = cadastralBuffer;

    if (sharp) {
      // 합성 레이어: 지적도 WMS + (선택) 필지 폴리곤 하이라이트 + 단일 마커
      const compositeLayers: Array<{ input: Buffer; blend: string }> = [
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

      if (baseTile) {
        // Base 타일 위에 투명 지적도 + 폴리곤 합성
        finalBuffer = await sharp(baseTile)
          .resize({ width: w, height: h, fit: 'fill' })
          .composite(compositeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
        log.info(`[vworld-wms] ✅ 지적도 + Base 배경 합성 완료 (${finalBuffer.length} bytes, ${w}×${h})`);
      } else {
        // 배경 없으면 연한 크림색 배경 합성
        const bgBuffer = await sharp({
          create: { width: w, height: h, channels: 4, background: { r: 248, g: 245, b: 235, alpha: 1 } },
        }).png().toBuffer();

        finalBuffer = await sharp(bgBuffer)
          .composite(compositeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
        log.info(`[vworld-wms] ✅ 지적도 + 크림 배경 합성 (${finalBuffer.length} bytes, ${w}×${h})`);
      }
    } else {
      log.info(`[vworld-wms] ✅ 지적도 이미지 취득 성공 (sharp 미사용, ${cadastralBuffer.length} bytes, ${w}×${h})`);
    }

    // 마커 위치를 PNG tEXt 청크에 기록 (DB 영속화된 base64에서도 네이티브 '본건' 라벨 배치 가능)
    const hasOverlayMarker = Boolean(sharp && marker);
    if (hasOverlayMarker && Buffer.isBuffer(finalBuffer)) {
      finalBuffer = embedMapMarkerMeta(finalBuffer, { v: 1, target: marker!, imgW: w, imgH: h });
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
    };
  } catch (err) {
    log.warn({ err: err }, '[vworld-wms] 지적도 이미지 취득 실패:');
    return null;
  }
}

